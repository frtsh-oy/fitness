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
