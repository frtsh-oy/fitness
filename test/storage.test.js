import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, storageKey } from '../storage.js';

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

test('НАХОДКА 2B: удачная досылка снимает признак, дальше приоритет снова у облака', async () => {
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
  await createStorage({ cloud, local, today }).save('legs-mwf', new Set(['squat']));
  assert.equal(local.getItem(PENDING), '1', 'признак не поставлен');

  cloudUp = true;
  const reopened = createStorage({ cloud, local, today });
  assert.deepEqual([...(await reopened.load('legs-mwf'))], ['squat']);
  assert.equal(store.get(KEY), '["squat"]', 'досылка не ушла в облако');
  assert.equal(local.getItem(PENDING), null, 'признак не снят после удачной досылки');

  // Признака больше нет: сброс с другого устройства теперь виден как сброс
  store.set(KEY, '[]');
  assert.deepEqual([...(await createStorage({ cloud, local, today }).load('legs-mwf'))], []);
});

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
  // Вторая отметка уходит в облако успешно. localStorage при успехе не пишется,
  // значит там осталась старая копия из одной отметки — признак обязан сняться,
  // иначе следующее чтение отдаст её вместо свежей облачной.
  await s.save('legs-mwf', new Set(['squat', 'lunge']));
  assert.equal(local.getItem(PENDING), null, 'признак не снят после удачной записи');
  assert.deepEqual([...(await createStorage({ cloud, local, today }).load('legs-mwf'))].sort(), ['lunge', 'squat']);
});

test('НАХОДКА 2H: признак без локального значения не затирает облако пустой досылкой', async () => {
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
  assert.deepEqual(pushed, [], 'пустая досылка ушла в облако');
  assert.equal(store.get(KEY), '["с-другого-устройства"]', 'облачные данные затёрты пустотой');
});
