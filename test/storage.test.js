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

const today = () => '2026-09-14';

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
