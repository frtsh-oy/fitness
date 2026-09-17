import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, storageKey, currentDay } from '../storage.js';

function fakeLocal() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map,
  };
}

// localStorage, который бросает на любой операции: Safari private mode,
// урезанный WebView, переполненная квота.
function throwingLocal() {
  return {
    getItem: () => { throw new Error('приватный режим'); },
    setItem: () => { throw new Error('приватный режим'); },
    removeItem: () => { throw new Error('приватный режим'); },
  };
}

const today = () => '2026-09-14';

const KEY = 'w:legs-mwf:2026-09-14';
// Признак «локальная копия не подтверждена облаком» — ключ производный от
// основного, поэтому сбрасывается по дате вместе с отметками.
const PENDING = `${KEY}:pending`;

// Промис, который реджектится вместо того чтобы висеть вечно: так «load завис»
// виден как падение теста, а не как зависший прогон.
function withDeadline(promise, ms = 300) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`операция не завершилась за ${ms}ms`)), ms)),
  ]);
}

test('ключ включает id тренировки и дату', () => {
  assert.equal(storageKey('legs-mwf', '2026-09-14'), 'w:legs-mwf:2026-09-14');
});

test('пустое хранилище отдаёт пустое множество', async () => {
  const s = createStorage({ local: fakeLocal(), today });
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('сохранённые отметки читаются обратно', async () => {
  const local = fakeLocal();
  const s = createStorage({ local, today });
  await s.save('legs-mwf', new Set(['start-0-1', 'legs1-1-2']));
  const marks = await s.load('legs-mwf');
  assert.deepEqual([...marks].sort(), ['legs1-1-2', 'start-0-1']);
});

test('clear стирает отметки текущего дня', async () => {
  const local = fakeLocal();
  const s = createStorage({ local, today });
  await s.save('legs-mwf', new Set(['a']));
  await s.clear('legs-mwf');
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('отметки за вчера сегодня не читаются', async () => {
  const local = fakeLocal();
  await createStorage({ local, today: () => '2026-09-13' }).save('legs-mwf', new Set(['a']));
  const marks = await createStorage({ local, today }).load('legs-mwf');
  assert.deepEqual([...marks], []);
});

test('битое значение в хранилище не роняет загрузку', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', 'не json');
  const marks = await createStorage({ local, today }).load('legs-mwf');
  assert.deepEqual([...marks], []);
});

test('CloudStorage используется когда доступен', async () => {
  const store = new Map();
  const cloud = {
    setItem: (k, v, cb) => { store.set(k, v); cb?.(null, true); },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb?.(null, true); },
  };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  await s.save('legs-mwf', new Set(['x']));
  assert.ok(store.has('w:legs-mwf:2026-09-14'), 'запись не ушла в CloudStorage');
  assert.deepEqual([...(await s.load('legs-mwf'))], ['x']);
});

test('ошибка CloudStorage не роняет загрузку', async () => {
  const cloud = { getItem: (k, cb) => cb(new Error('нет сети')), setItem: (k, v, cb) => cb?.(null, true) };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('НАХОДКА A: синхронное исключение CloudStorage не роняет загрузку', async () => {
  const cloud = { getItem: () => { throw new Error('бум'); } };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  const marks = await s.load('legs-mwf');
  assert.deepEqual([...marks], []);
});

test('НАХОДКА B: таймаут CloudStorage при долгом getItem возвращает пустое множество', async () => {
  const cloud = { getItem: (k, cb) => { /* никогда не вызовет cb */ } };
  const s = createStorage({ cloud, local: fakeLocal(), today, cloudTimeout: 10 });
  const start = Date.now();
  const marks = await s.load('legs-mwf');
  const elapsed = Date.now() - start;
  assert.deepEqual([...marks], []);
  assert.ok(elapsed < 100, `таймаут не сработал, ждали ${elapsed}ms`);
});

test('НАХОДКА C: save и clear для одного ключа сериализуются в порядке вызова', async () => {
  const completions = [];
  const cloud = {
    setItem: (k, v, cb) => {
      // Медленная операция: завершится позже
      setTimeout(() => { completions.push('set'); cb(null, true); }, 20);
    },
    removeItem: (k, cb) => {
      // Быстрая операция: завершится раньше, но должна подождать set
      setTimeout(() => { completions.push('remove'); cb(null, true); }, 5);
    },
    getItem: (k, cb) => cb(null, ''),
  };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  // Не ждём save, сразу вызываем clear — проверяем что они сериализуются несмотря ни на что
  s.save('legs-mwf', new Set(['a']));
  s.clear('legs-mwf');
  // Ждём чтобы обе операции завершились
  await new Promise(r => setTimeout(r, 50));
  // remove должна завершиться только после set, несмотря на быстрый колбэк
  assert.deepEqual(completions, ['set', 'remove']);
});

test('НАХОДКА D: ошибка CloudStorage отбрасывает недоверчивые данные', async () => {
  const cloud = {
    getItem: (k, cb) => cb(new Error('нет сети'), '["недоверчивые-данные"]'),
    setItem: (k, v, cb) => cb?.(null, true),
  };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  // При ошибке getItem значение отбрасывается — оно может быть обрезанным или чужим
  // Лучше показать пустое множество, чем неверный прогресс
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('НАХОДКА E: clear работает с CloudStorage и удаляет ключ', async () => {
  const store = new Map();
  const cloud = {
    setItem: (k, v, cb) => { store.set(k, v); cb?.(null, true); },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb?.(null, true); },
  };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  await s.save('legs-mwf', new Set(['x']));
  assert.ok(store.has('w:legs-mwf:2026-09-14'), 'данные не записались');
  await s.clear('legs-mwf');
  assert.ok(!store.has('w:legs-mwf:2026-09-14'), 'ключ не удалён из CloudStorage');
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

// Раунд 4: Fallback на localStorage при отказе облака

test('ПРАВИЛО 1A: ошибка getItem → читаем из localStorage', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', '["локальная-отметка"]');
  const cloud = { getItem: (k, cb) => cb(new Error('нет сети')) };
  const s = createStorage({ cloud, local, today });
  // При ошибке облака берём из localStorage
  assert.deepEqual([...(await s.load('legs-mwf'))], ['локальная-отметка']);
});

test('ПРАВИЛО 1B: синхронный throw getItem → читаем из localStorage', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', '["локальная-отметка"]');
  const cloud = { getItem: () => { throw new Error('бум'); } };
  const s = createStorage({ cloud, local, today });
  // При синхронном throw берём из localStorage
  assert.deepEqual([...(await s.load('legs-mwf'))], ['локальная-отметка']);
});

test('ПРАВИЛО 1C: таймаут getItem → читаем из localStorage', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', '["локальная-отметка"]');
  const cloud = { getItem: () => { /* никогда не вызовет cb */ } };
  const s = createStorage({ cloud, local, today, cloudTimeout: 10 });
  // При таймауте берём из localStorage
  assert.deepEqual([...(await s.load('legs-mwf'))], ['локальная-отметка']);
});

test('ПРАВИЛО 1D: пустой успешный ответ облака не подменяется localStorage', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', '["устаревшая-отметка"]');
  const cloud = { getItem: (k, cb) => cb(null, '') }; // Успешный пустой ответ
  const s = createStorage({ cloud, local, today });
  // Успешный ответ берём как есть, даже если пусто (не подменяем локальными)
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('ПРАВИЛО 2A: ошибка setItem → пишем в localStorage', async () => {
  const local = fakeLocal();
  const cloud = {
    setItem: (k, v, cb) => cb(new Error('квота превышена')),
    getItem: (k, cb) => cb(new Error('нет сети')), // getItem тоже отказал
  };
  const s = createStorage({ cloud, local, today });
  await s.save('legs-mwf', new Set(['отметка']));
  // При ошибке облака должны сохранить в localStorage, и при загрузке она прочитается
  assert.deepEqual([...(await s.load('legs-mwf'))], ['отметка']);
});

test('ПРАВИЛО 2B: синхронный throw setItem → пишем в localStorage', async () => {
  const local = fakeLocal();
  const cloud = {
    setItem: () => { throw new Error('бум'); },
    getItem: (k, cb) => cb(new Error('бум')), // getItem тоже отказал
  };
  const s = createStorage({ cloud, local, today });
  await s.save('legs-mwf', new Set(['отметка']));
  // При синхронном throw должны сохранить в localStorage
  assert.deepEqual([...(await s.load('legs-mwf'))], ['отметка']);
});

test('ПРАВИЛО 2C: таймаут setItem → пишем в localStorage', async () => {
  const local = fakeLocal();
  const cloud = {
    setItem: () => { /* никогда не вызовет cb */ },
    getItem: (k, cb) => { /* тоже никогда не вызовет cb */ },
  };
  const s = createStorage({ cloud, local, today, cloudTimeout: 10 });
  await s.save('legs-mwf', new Set(['отметка']));
  // При таймауте должны сохранить в localStorage
  assert.deepEqual([...(await s.load('legs-mwf'))], ['отметка']);
});

test('ПРАВИЛО 3A: ошибка removeItem → чистим localStorage', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', '["отметка"]');
  const cloud = {
    removeItem: (k, cb) => cb(new Error('нет сети')),
    getItem: (k, cb) => cb(new Error('нет сети')), // getItem тоже отказал
  };
  const s = createStorage({ cloud, local, today });
  await s.clear('legs-mwf');
  // После clear с ошибкой облака должны очистить localStorage, чтобы getItem вернул пустое
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('ПРАВИЛО 3B: синхронный throw removeItem → чистим localStorage', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', '["отметка"]');
  const cloud = {
    removeItem: () => { throw new Error('бум'); },
    getItem: (k, cb) => cb(new Error('бум')), // getItem тоже отказал
  };
  const s = createStorage({ cloud, local, today });
  await s.clear('legs-mwf');
  // При синхронном throw должны очистить localStorage
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('ПРАВИЛО 3C: таймаут removeItem → чистим localStorage', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', '["отметка"]');
  const cloud = {
    removeItem: () => { /* никогда не вызовет cb */ },
    getItem: (k, cb) => { /* тоже никогда не вызовет cb */ },
  };
  const s = createStorage({ cloud, local, today, cloudTimeout: 10 });
  await s.clear('legs-mwf');
  // При таймауте должны очистить localStorage, иначе при getItem с таймаутом вернулась старая отметка
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

// Раунд 5, НАХОДКА 1: облако отказало + localStorage бросает.
// Раньше три вызова local.getItem в read() не были обёрнуты ничем: путь через
// таймаут ронял необработанное исключение прямо в окружение и вешал load(),
// два других реджектили промис.

test('НАХОДКА 1A: ошибка колбэка облака + бросающий localStorage не роняет load', async () => {
  const cloud = { getItem: (k, cb) => cb(new Error('нет сети')) };
  const s = createStorage({ cloud, local: throwingLocal(), today });
  const marks = await withDeadline(s.load('legs-mwf'));
  assert.deepEqual([...marks], []);
});

test('НАХОДКА 1B: синхронное исключение облака + бросающий localStorage не роняет load', async () => {
  const cloud = { getItem: () => { throw new Error('бум'); } };
  const s = createStorage({ cloud, local: throwingLocal(), today });
  const marks = await withDeadline(s.load('legs-mwf'));
  assert.deepEqual([...marks], []);
});

test('НАХОДКА 1C: таймаут облака + бросающий localStorage не роняет и не вешает load', async () => {
  const cloud = { getItem: () => { /* никогда не вызовет cb */ } };
  const s = createStorage({ cloud, local: throwingLocal(), today, cloudTimeout: 10 });
  // Исключение внутри setTimeout не перехватывается промисом: без try/catch
  // оно роняет окружение, а load() не разрешается никогда.
  const marks = await withDeadline(s.load('legs-mwf'));
  assert.deepEqual([...marks], []);
});

test('НАХОДКА 1D: отказ записи в облако + бросающий localStorage не роняет save', async () => {
  const cloud = { setItem: (k, v, cb) => cb(new Error('нет сети')) };
  const s = createStorage({ cloud, local: throwingLocal(), today });
  await withDeadline(s.save('legs-mwf', new Set(['squat'])));
});

test('НАХОДКА 1E: бросающий localStorage без облака не роняет ни одну операцию', async () => {
  const s = createStorage({ local: throwingLocal(), today });
  await withDeadline(s.save('legs-mwf', new Set(['squat'])));
  await withDeadline(s.clear('legs-mwf'));
  assert.deepEqual([...(await withDeadline(s.load('legs-mwf')))], []);
});

// Раунд 5, НАХОДКА 2: расхождение локальной и облачной копии.
// Признак «локальная копия не подтверждена облаком» отличает «облако честно
// пустое» от «облако устарело после нашей неудачной записи».

test('НАХОДКА 2A: отметка переживает неудачную запись, даже если облако потом отвечает устаревшим значением', async () => {
  const local = fakeLocal();
  const cloud = {
    // Запись стабильно отказывает — временный сбой сети
    setItem: (k, v, cb) => cb(new Error('нет сети')),
    // А чтение отвечает успешно, но устаревшим (пустым) значением
    getItem: (k, cb) => cb(null, '[]'),
    removeItem: (k, cb) => cb(null, true),
  };
  await createStorage({ cloud, local, today }).save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(KEY), '["squat"]', 'отметка не легла в localStorage');

  // Повторное открытие мини-аппы: новый адаптер поверх того же localStorage.
  // Галочка, поставленная секунду назад, не имеет права пропасть.
  const reopened = createStorage({ cloud, local, today });
  assert.deepEqual([...(await reopened.load('legs-mwf'))], ['squat']);
  assert.equal(local.getItem(PENDING), '1', 'признак неподтверждённой записи не поставлен');
});

// Раунд 6 заменил этот тест: досылка из read() убрана как last-write-wins
// заведомо несвежим источником, набор доносит первое же успешное save.
// См. РАУНД 6 C.

test('НАХОДКА 2C: без признака пустой успешный ответ облака отдаётся пустым, даже если в localStorage есть отметки', async () => {
  const local = fakeLocal();
  local.setItem(KEY, '["сброшено-на-другом-устройстве"]');
  const cloud = { getItem: (k, cb) => cb(null, '') };
  const s = createStorage({ cloud, local, today });
  // Признака нет — значит локальная копия ничем не лучше облачной,
  // а пустой ответ облака это законный сброс с другого устройства.
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('НАХОДКА 2D: clear снимает признак — после сброса облако снова главнее', async () => {
  const local = fakeLocal();
  const cloud = {
    setItem: (k, v, cb) => cb(new Error('нет сети')),
    getItem: (k, cb) => cb(null, '[]'),
    removeItem: (k, cb) => cb(null, true),
  };
  const s = createStorage({ cloud, local, today });
  await s.save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(PENDING), '1', 'признак не поставлен');
  await s.clear('legs-mwf');
  assert.equal(local.getItem(KEY), null, 'clear не вычистил localStorage');
  assert.equal(local.getItem(PENDING), null, 'clear не снял признак');
  assert.deepEqual([...(await createStorage({ cloud, local, today }).load('legs-mwf'))], []);
});

test('НАХОДКА 2E: вчерашний признак не влияет на сегодня', async () => {
  const local = fakeLocal();
  const cloud = {
    setItem: (k, v, cb) => cb(new Error('нет сети')),
    getItem: (k, cb) => cb(null, '["облачная-отметка"]'),
  };
  await createStorage({ cloud, local, today: () => '2026-09-13' }).save('legs-mwf', new Set(['вчера']));
  // Признак вчерашнего дня лежит под ключом w:legs-mwf:2026-09-13:pending
  // и до сегодняшнего чтения не дотягивается
  const marks = await createStorage({ cloud, local, today }).load('legs-mwf');
  assert.deepEqual([...marks], ['облачная-отметка']);
});

test('НАХОДКА 2F: признак не мешает работать без облака', async () => {
  const local = fakeLocal();
  const s = createStorage({ local, today });
  await s.save('legs-mwf', new Set(['squat']));
  assert.deepEqual([...(await s.load('legs-mwf'))], ['squat']);
});

test('НАХОДКА 2G: удачная запись после неудачной снимает признак и не даёт устаревшей локальной копии победить', async () => {
  const local = fakeLocal();
  const store = new Map();
  let cloudUp = false;
  const cloud = {
    setItem: (k, v, cb) => {
      if (!cloudUp) { cb(new Error('нет сети')); return; }
      store.set(k, v);
      cb(null, true);
    },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb(null, true); },
  };
  const s = createStorage({ cloud, local, today });

  // Первая отметка не доехала до облака: легла в localStorage под признаком
  await s.save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(PENDING), '1', 'признак не поставлен');

  cloudUp = true;
  // Вторая отметка уходит в облако успешно. Локальная копия и облако сошлись —
  // признак обязан сняться, иначе следующее чтение навсегда предпочтёт кэш
  // облаку и перестанет замечать сброс с другого устройства.
  await s.save('legs-mwf', new Set(['squat', 'lunge']));
  assert.equal(local.getItem(PENDING), null, 'признак не снят после удачной записи');
  assert.deepEqual([...(await createStorage({ cloud, local, today }).load('legs-mwf'))].sort(), ['lunge', 'squat']);
});

test('НАХОДКА 2H: признак без локального значения не перекрывает облако', async () => {
  const local = fakeLocal();
  // Признак лёг, а сама отметка — нет: localStorage принял короткое значение
  // и отказал на длинном (переполненная квота)
  local.setItem(PENDING, '1');
  const store = new Map([[KEY, '["с-другого-устройства"]']]);
  const pushed = [];
  const cloud = {
    setItem: (k, v, cb) => { pushed.push(v); store.set(k, v); cb(null, true); },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb(null, true); },
  };
  const s = createStorage({ cloud, local, today });
  // Защищать нечего — признак ничего не значит, читаем облако обычным порядком
  assert.deepEqual([...(await s.load('legs-mwf'))], ['с-другого-устройства']);
  assert.deepEqual(pushed, [], 'чтение записало в облако');
  assert.equal(store.get(KEY), '["с-другого-устройства"]', 'облачные данные затёрты');
});

// Раунд 6: досылка из read() убрана. Признак остаётся и по-прежнему отдаёт
// локальное значение вместо облачного, но чтение больше ничего не пишет.

test('РАУНД 6 A: чтение не встаёт в очередь записей — load при стоящем признаке не ждёт ни одного таймаута', async () => {
  const local = fakeLocal();
  // Мёртвое облако: ни одна операция никогда не вызовет колбэк
  const cloud = { setItem: () => {}, getItem: () => {}, removeItem: () => {} };
  const s = createStorage({ cloud, local, today, cloudTimeout: 60 });

  await s.save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(PENDING), '1', 'признак не поставлен');

  // Пользователь быстро тапает ещё дважды — обе записи висят в очереди ключа,
  // но в localStorage уже легли: он сквозной кэш и пишется синхронно.
  s.save('legs-mwf', new Set(['squat', 'lunge']));
  s.save('legs-mwf', new Set(['squat', 'lunge', 'plank']));

  const start = Date.now();
  const marks = await s.load('legs-mwf');
  const elapsed = Date.now() - start;

  assert.deepEqual([...marks], ['squat', 'lunge', 'plank'], 'чтение отдало не последний набор');
  assert.ok(elapsed < 40, `load ждал ${elapsed}ms — чтение снова встало в очередь записей`);
});

test('РАУНД 6 B: чтение на устройстве с признаком не откатывает облако к своему состоянию', async () => {
  const local = fakeLocal();   // localStorage устройства A
  const store = new Map();     // общий CloudStorage обоих устройств
  let cloudUp = false;
  const writes = [];
  const cloud = {
    setItem: (k, v, cb) => {
      writes.push(v);
      if (!cloudUp) { cb(new Error('нет сети')); return; }
      store.set(k, v);
      cb(null, true);
    },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb(null, true); },
  };

  // Устройство A в офлайне отмечает присед
  await createStorage({ cloud, local, today }).save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(PENDING), '1', 'признак не поставлен');

  // Пока A офлайн, устройство B успешно пишет в общее облако более полный набор
  store.set(KEY, '["squat","lunge","plank"]');

  // У A восстановилась сеть, пользователь просто открывает тренировку
  cloudUp = true;
  writes.length = 0;
  const reopened = createStorage({ cloud, local, today });
  assert.deepEqual([...(await reopened.load('legs-mwf'))], ['squat'], 'A не увидел свою отметку');

  // Открытие тренировки не имеет права ничего писать в облако
  assert.deepEqual(writes, [], 'чтение записало в облако');
  assert.equal(store.get(KEY), '["squat","lunge","plank"]', 'облако откатилось к состоянию A — прогресс с B потерян');
});

test('РАУНД 6 C: после восстановления связи первое же успешное save доносит набор в облако и снимает признак', async () => {
  const local = fakeLocal();
  const store = new Map();
  let cloudUp = false;
  const cloud = {
    setItem: (k, v, cb) => {
      if (!cloudUp) { cb(new Error('нет сети')); return; }
      store.set(k, v);
      cb(null, true);
    },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb(null, true); },
  };
  const s = createStorage({ cloud, local, today });

  await s.save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(PENDING), '1', 'признак не поставлен');
  assert.equal(store.has(KEY), false, 'отказавшая запись всё-таки попала в облако');

  // Связь вернулась. Приложение сохраняет ВЕСЬ текущий набор, а не разницу,
  // поэтому офлайновая отметка доезжает штатной записью, без всякой досылки.
  cloudUp = true;
  await s.save('legs-mwf', new Set(['squat', 'lunge']));
  assert.equal(store.get(KEY), '["squat","lunge"]', 'набор не донесён в облако');
  assert.equal(local.getItem(PENDING), null, 'признак не снят');

  // Признака больше нет — приоритет снова у облака, сброс с другого устройства виден
  store.set(KEY, '[]');
  assert.deepEqual([...(await createStorage({ cloud, local, today }).load('legs-mwf'))], []);
});

test('РАУНД 6 D: опоздавший и повторный ответ облака не меняют уже отданный результат', async () => {
  const local = fakeLocal();
  local.setItem(KEY, '["локальная-отметка"]');
  let late = null;
  const cloud = { getItem: (k, cb) => { late = cb; } };  // колбэк придёт позже таймаута
  const s = createStorage({ cloud, local, today, cloudTimeout: 10 });

  assert.deepEqual([...(await s.load('legs-mwf'))], ['локальная-отметка']);

  // Облако очнулось и отвечает после таймаута, да ещё и дважды, да ещё и другим
  // значением. Первый исход уже принят — повторные не должны ни бросить, ни подменить.
  assert.doesNotThrow(() => {
    late(null, '["опоздавшая"]');
    late(null, '["и-ещё-раз"]');
  });
  assert.deepEqual([...(await s.load('legs-mwf'))], ['локальная-отметка']);
});

// ФИНАЛЬНОЕ РЕВЬЮ, пункт 2: день считается по местному времени, а не по UTC.
// Западнее Гринвича UTC-дата переворачивается посреди вечера, и отметки
// обнуляются прямо во время тренировки.

test('день по умолчанию берётся по местному времени, а не по UTC', async t => {
  const realTZ = process.env.TZ;
  const RealDate = Date;
  // 2026-09-15 00:30 UTC — это 2026-09-14, 20:30 в Нью-Йорке: вечер, разгар
  // тренировки. По UTC день уже сменился, по местному времени — ещё нет.
  const fixed = RealDate.UTC(2026, 8, 15, 0, 30);
  process.env.TZ = 'America/New_York';
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [fixed])); }
  };
  t.after(() => {
    globalThis.Date = RealDate;
    if (realTZ === undefined) delete process.env.TZ; else process.env.TZ = realTZ;
  });

  assert.equal(currentDay(), '2026-09-14');
  assert.equal(new RealDate(fixed).toISOString().slice(0, 10), '2026-09-15',
    'фикстура бесполезна: UTC-дата совпала с местной, переворот дня не воспроизводится');

  const local = fakeLocal();
  await createStorage({ local }).save('legs-mwf', new Set(['вечерняя-отметка']));
  assert.deepEqual([...local._map.keys()], ['w:legs-mwf:2026-09-14']);
});

// ФИНАЛЬНОЕ РЕВЬЮ, пункт 1: localStorage — сквозной кэш, а не запасной выход.
// Пока запись шла только в ветку отказа облака, локальная копия при работающем
// облаке оставалась пустой, и один открытый без сети день стирал предыдущую
// работу целиком.

test('СКВОЗНОЙ КЭШ: обрыв связи при открытии не теряет день, сохранённый в облако', async () => {
  const local = fakeLocal();
  const store = new Map();
  const online = {
    setItem: (k, v, cb) => { store.set(k, v); cb(null, true); },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb(null, true); },
  };

  // Обычная тренировка при работающем облаке: двадцать отметок, все записи удачны
  const marked = Array.from({ length: 20 }, (_, i) => `mark-${i}`);
  const s = createStorage({ cloud: online, local, today });
  for (let i = 0; i < marked.length; i += 1) await s.save('legs-mwf', new Set(marked.slice(0, i + 1)));
  assert.equal(local.getItem(PENDING), null, 'после удачных записей признак не снят');

  // На следующем открытии сети нет: getItem отказывает
  const offline = { ...online, getItem: (k, cb) => cb(new Error('нет сети')) };
  const reopened = createStorage({ cloud: offline, local, today });
  assert.deepEqual([...(await reopened.load('legs-mwf'))], marked,
    'localStorage не был сквозным кэшем — день пропал с экрана');
});

test('СКВОЗНОЙ КЭШ: запись в localStorage синхронна — выгрузка страницы сразу после отметки её не теряет', () => {
  const local = fakeLocal();
  // Облако принимает вызов и не отвечает никогда: страницу закрыли раньше ответа
  const cloud = { setItem: () => {}, getItem: () => {}, removeItem: () => {} };
  const s = createStorage({ cloud, local, today });

  s.save('legs-mwf', new Set(['squat']));   // намеренно без await: страницы уже нет

  assert.equal(local.getItem(KEY), '["squat"]', 'отметка не легла в localStorage синхронно');
  assert.equal(local.getItem(PENDING), '1', 'запись без ответа облака не помечена неподтверждённой');
});

test('СКВОЗНОЙ КЭШ: неподтверждённая запись переживает закрытие приложения', async () => {
  const local = fakeLocal();
  const store = new Map([[KEY, '["старое-из-облака"]']]);
  // Запись уходит в облако, но ответа на неё уже никто не дождётся
  const cloud = {
    setItem: () => {},
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb(null, true); },
  };
  createStorage({ cloud, local, today, cloudTimeout: 10 }).save('legs-mwf', new Set(['squat']));

  // Приложение открыли заново: облако отвечает успешно, но устаревшим значением
  const reopened = createStorage({ cloud, local, today, cloudTimeout: 10 });
  assert.deepEqual([...(await reopened.load('legs-mwf'))], ['squat']);
});

test('СКВОЗНОЙ КЭШ: удачная запись поверх кэша не мешает увидеть сброс с другого устройства', async () => {
  const local = fakeLocal();
  const store = new Map();
  const cloud = {
    setItem: (k, v, cb) => { store.set(k, v); cb(null, true); },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb(null, true); },
  };
  await createStorage({ cloud, local, today }).save('legs-mwf', new Set(['squat', 'lunge']));
  assert.equal(local.getItem(KEY), '["squat","lunge"]', 'кэш не заполнился при удачной записи');

  // Другое устройство сбросило отметки: в общем облаке пусто
  store.delete(KEY);

  // Локальная копия есть, но она подтверждена — а значит не новее облака.
  // Сброс обязан доехать, иначе отметки воскресают из кэша сами собой.
  assert.deepEqual([...(await createStorage({ cloud, local, today }).load('legs-mwf'))], []);
});

test('СКВОЗНОЙ КЭШ: признак не снимается, пока в очереди стоит более свежая запись', async () => {
  const local = fakeLocal();
  const answered = [];
  const cloud = {
    // Первая запись подтверждается, вторая уходит в никуда
    setItem: (k, v, cb) => {
      answered.push(v);
      if (answered.length === 1) cb(null, true);
    },
    getItem: (k, cb) => cb(null, '["только-первая"]'),
    removeItem: (k, cb) => cb(null, true),
  };
  const s = createStorage({ cloud, local, today, cloudTimeout: 20 });

  const first = s.save('legs-mwf', new Set(['squat']));
  s.save('legs-mwf', new Set(['squat', 'lunge']));   // второй тап, пока первый ещё в пути
  await first;

  assert.equal(local.getItem(KEY), '["squat","lunge"]');
  assert.equal(local.getItem(PENDING), '1',
    'признак снят по подтверждению первой записи, хотя вторая облаком не подтверждена');
  assert.deepEqual([...(await s.load('legs-mwf'))], ['squat', 'lunge'],
    'чтение отдало облачное значение вместо более свежего локального');
});

test('СКВОЗНОЙ КЭШ: сброс стирает локальную копию сразу, не дожидаясь ответа облака', async () => {
  const local = fakeLocal();
  const cloud = {
    setItem: (k, v, cb) => cb(null, true),
    getItem: (k, cb) => cb(null, '["в-облаке"]'),
    removeItem: () => { /* никогда не ответит: сеть умерла на самом сбросе */ },
  };
  const s = createStorage({ cloud, local, today, cloudTimeout: 20 });
  await s.save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(KEY), '["squat"]', 'кэш не заполнился');

  s.clear('legs-mwf');   // намеренно без await: приложение закрывают сразу после сброса

  assert.equal(local.getItem(KEY), null, 'сброшенный день остался в кэше и воскреснет при следующем открытии');
  assert.equal(local.getItem(PENDING), null, 'признак пережил сброс');
});
