// CloudStorage принимает ключи только из A-Z a-z 0-9 _ - (1–128 символов).
// Скрипт Telegram ключ сам не проверяет: отказ приходит ошибкой в колбэке, а
// callCloud ошибки гасит. Поэтому проверять тут нужно не «не упало», а какие
// именно ключи облако получило: отказ «по правилам» иначе прошёл бы молча.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, storageKey } from '../storage.js';
import { createMyWorkouts, newWorkoutId, recordKey } from '../my-workouts.js';
import { serializeCompact } from '../builder/compact.js';
import { CLOUD_KEY } from '../kv.js';
import { WORKOUTS } from '../workouts/index.js';

function fakeLocal() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

// Облако, которое запоминает каждый ключ, переданный ему аргументом: getItem,
// getItems, setItem, removeItem и removeItems. getKeys ключей не принимает, и
// записывать там нечего. Ключи, лежавшие в облаке заранее (initial), в запись
// попадают только тогда, когда приложение само отдаёт их обратно — например, в
// removeItems при чистке или в getItems при чтении списка. Тесты ниже опираются
// на это: устаревшая отметка в initial нужна, чтобы prune сделал хотя бы одно
// обращение с ключом, а чужая тренировка — чтобы list её прочитал.
function recordingCloud(initial = {}) {
  const store = new Map(Object.entries(initial));
  const keys = [];
  return {
    keys,
    getItem: (k, cb) => { keys.push(k); cb(null, store.get(k) ?? ''); },
    getItems: (list, cb) => {
      keys.push(...list);
      cb(null, Object.fromEntries(list.filter(k => store.has(k)).map(k => [k, store.get(k)])));
    },
    setItem: (k, v, cb) => { keys.push(k); store.set(k, v); cb(null, true); },
    removeItem: (k, cb) => { keys.push(k); store.delete(k); cb(null, true); },
    removeItems: (list, cb) => { keys.push(...list); for (const k of list) store.delete(k); cb(null, true); },
    getKeys: cb => cb(null, [...store.keys()]),
  };
}

test('ключ отметок проходит правило CloudStorage для каждой тренировки реестра', () => {
  for (const id of Object.keys(WORKOUTS)) assert.match(storageKey(id, '2026-10-19'), CLOUD_KEY);
});

test('id тренировок реестра — латиница, цифры и дефис, до 40 символов', () => {
  for (const id of Object.keys(WORKOUTS)) assert.match(id, /^[A-Za-z0-9-]{1,40}$/);
});

test('save, load, clear и prune отдают облаку только разрешённые ключи', async () => {
  const cloud = recordingCloud({ 'm_legs-mwf_2026-09-01': '[]' });
  const s = createStorage({ cloud, local: fakeLocal(), today: () => '2026-09-14' });
  await s.save('legs-mwf', new Set(['start-pelvic-tilt-1']));
  await s.load('legs-mwf'); await s.clear('legs-mwf'); await s.prune();
  assert.ok(cloud.keys.length >= 4, 'облаку не отдали ни одного ключа — тест ничего не проверяет');
  for (const key of cloud.keys) assert.match(key, CLOUD_KEY);
});

test('save, list и remove своих тренировок отдают облаку только разрешённые ключи', async () => {
  const compact = t => ({
    v: 1, name: 'Моя тренировка', days: [1, 3, 5], level: null, zones: [],
    warmup: ['pelvic-tilt'], circuit: ['chinese-squat'], strength: ['rdl'], focus: [],
    cooldown: ['breathing'], t,
  });
  const sample = t => serializeCompact(compact(t));
  // В облаке уже лежат тренировка с другого устройства, тренировка, удаление
  // которой отсюда не дошло, и отметка — трогать её свои тренировки не вправе.
  const cloud = recordingCloud({ 'u_my-other': sample(1), 'u_my-gone': sample(2), 'm_legs-mwf_2026-09-01': '[]' });
  const local = fakeLocal();
  // Недосланная тренировка и недосланное удаление: у обоих ключей на устройстве
  // лежат служебные признаки, и list обращается к облаку именно с этими ключами —
  // тут и видно, не просочится ли признак в запрос.
  local.setItem('u_my-unsent', sample(3));
  local.setItem('u_my-unsent:pending', '1');
  local.setItem('u_my-gone:deleted', '1');

  const store = createMyWorkouts({ cloud, local });
  const id = newWorkoutId();
  await store.save(id, compact(4));
  await store.list();
  await store.remove(id);

  // Все пути до облака прошли: сохранение, чтение, досылка и повтор удаления
  for (const key of [recordKey(id), 'u_my-other', 'u_my-unsent', 'u_my-gone']) {
    assert.ok(cloud.keys.includes(key), `облаку не отдали ${key} — путь не проверен`);
  }
  for (const key of cloud.keys) {
    assert.match(key, CLOUD_KEY);
    assert.ok(!/:(pending|deleted)$/.test(key), `служебный признак ${key} ушёл в облако`);
    assert.ok(key.startsWith('u_'), `${key}: свои тренировки трогают только свои записи`);
  }
});
