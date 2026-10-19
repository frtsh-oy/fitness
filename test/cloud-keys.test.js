// CloudStorage принимает ключи только из A-Z a-z 0-9 _ - (1–128 символов).
// Скрипт Telegram ключ сам не проверяет: отказ приходит ошибкой в колбэке, а
// callCloud ошибки гасит. Поэтому проверять тут нужно не «не упало», а какие
// именно ключи облако получило: отказ «по правилам» иначе прошёл бы молча.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, storageKey } from '../storage.js';
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

// Облако, которое запоминает каждый ключ, который ему отдали приложение, —
// во всех пяти методах, где ключ вообще бывает. Ключи, которые облако знало
// заранее (initial), в запись не попадают: их не приложение придумало.
function recordingCloud(initial = {}) {
  const store = new Map(Object.entries(initial));
  const keys = [];
  return {
    keys,
    getItem: (k, cb) => { keys.push(k); cb(null, store.get(k) ?? ''); },
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
