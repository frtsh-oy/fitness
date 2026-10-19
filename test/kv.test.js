import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKv, CLOUD_KEY } from '../kv.js';

// localStorage с перечислением ключей, как у настоящего: length и key(i).
function fakeLocal(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

// localStorage, который бросает на любой операции: Safari private mode,
// урезанный WebView, переполненная квота.
function throwingLocal() {
  const fail = () => { throw new Error('приватный режим'); };
  return {
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    key: fail,
    get length() { return fail(); },
  };
}

test('правило ключа CloudStorage: 1–128 символов из латиницы, цифр, подчёркивания и дефиса', () => {
  for (const ok of ['a', 'm_legs-mwf_2026-10-19', 'u_my-abc', 'A_Z-09', 'x'.repeat(128)]) {
    assert.match(ok, CLOUD_KEY, `${ok} должен проходить`);
  }
  for (const bad of ['', 'w:legs-mwf:2026-10-19', 'a b', 'ключ', 'a.b', 'a/b', 'x'.repeat(129)]) {
    assert.doesNotMatch(bad, CLOUD_KEY, `${JSON.stringify(bad)} не должен проходить`);
  }
});

test('hasCloud отвечает, есть ли облако', () => {
  assert.equal(createKv({ cloud: {} }).hasCloud, true);
  assert.equal(createKv().hasCloud, false);
  assert.equal(createKv({ cloud: null, local: fakeLocal() }).hasCloud, false);
});

test('localGet отдаёт значение, а при отсутствии ключа, хранилища и исключении — пустую строку', () => {
  const kv = createKv({ local: fakeLocal({ a: '1', empty: '' }) });
  assert.equal(kv.localGet('a'), '1');
  assert.equal(kv.localGet('empty'), '');
  assert.equal(kv.localGet('нет-такого'), '');
  assert.equal(createKv().localGet('a'), '');
  assert.equal(createKv({ local: throwingLocal() }).localGet('a'), '');
});

test('localSet отвечает, удалась ли запись: true, а при исключении и без хранилища — false', () => {
  const local = fakeLocal();
  assert.equal(createKv({ local }).localSet('a', '1'), true);
  assert.equal(local.getItem('a'), '1');

  assert.equal(createKv({ local: throwingLocal() }).localSet('a', '1'), false);
  // Хранилища нет вовсе — писать некуда, и «удалось» здесь было бы неправдой
  assert.equal(createKv().localSet('a', '1'), false);
});

test('localRemove стирает ключ и не падает на бросающем хранилище', () => {
  const local = fakeLocal({ a: '1', b: '2' });
  createKv({ local }).localRemove('a');
  assert.deepEqual([...local._map.keys()], ['b']);

  assert.doesNotThrow(() => createKv({ local: throwingLocal() }).localRemove('a'));
  assert.doesNotThrow(() => createKv().localRemove('a'));
});

test('localKeys перечисляет ключи через length и key(i)', () => {
  const kv = createKv({ local: fakeLocal({ 'm_legs-mwf_2026-09-14': '[]', section: 'today', 'u_my-abc': '{}' }) });
  assert.deepEqual(kv.localKeys(), ['m_legs-mwf_2026-09-14', 'section', 'u_my-abc']);
});

test('localKeys отдаёт снимок: удаление ключей по ходу обхода его не сдвигает', () => {
  const local = fakeLocal({ a: '1', b: '2', c: '3' });
  const kv = createKv({ local });
  // Ровно так prune и работает: перечислил, потом стёр всё найденное. Если бы
  // список читался лениво по индексу, удаление первого ключа сдвинуло бы второй.
  for (const key of kv.localKeys()) kv.localRemove(key);
  assert.equal(local.length, 0);
});

test('localKeys отдаёт пустой список при бросающем хранилище, без хранилища и на пустом', () => {
  assert.deepEqual(createKv({ local: throwingLocal() }).localKeys(), []);
  assert.deepEqual(createKv().localKeys(), []);
  assert.deepEqual(createKv({ local: fakeLocal() }).localKeys(), []);
});

test('localKeys при исключении посреди обхода не отдаёт половину списка', () => {
  const local = fakeLocal({ a: '1', b: '2', c: '3' });
  const key = local.key;
  local.key = i => { if (i === 1) throw new Error('сбой на втором ключе'); return key(i); };
  // Половина списка хуже пустого: prune решил бы, что остальное чужое.
  assert.deepEqual(createKv({ local }).localKeys(), []);
});

test('callCloud: удачный колбэк даёт ok и значение', async () => {
  const cloud = { getItem: (k, cb) => cb(null, `значение-${k}`) };
  assert.deepEqual(await createKv({ cloud }).callCloud('getItem', ['a']), { ok: true, value: 'значение-a' });
});

test('callCloud: пустой ответ приводится к пустой строке, а ответ-массив проходит как есть', async () => {
  const kv = createKv({
    cloud: {
      getItem: (k, cb) => cb(null, null),
      getKeys: cb => cb(null, ['m_a_2026-09-14', 'u_b']),
    },
  });
  assert.deepEqual(await kv.callCloud('getItem', ['a']), { ok: true, value: '' });
  assert.deepEqual(await kv.callCloud('getKeys', []), { ok: true, value: ['m_a_2026-09-14', 'u_b'] });
});

test('callCloud: аргументы доходят до облака, колбэк идёт последним', async () => {
  const seen = [];
  const cloud = { removeItems: (...args) => { seen.push(args); args.at(-1)(null, true); } };
  const result = await createKv({ cloud }).callCloud('removeItems', [['a', 'b']]);
  assert.deepEqual(result, { ok: true, value: true });
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0][0], ['a', 'b']);
  assert.equal(typeof seen[0][1], 'function');
  assert.equal(seen[0].length, 2);
});

test('callCloud: ошибка в колбэке — отказ, а пришедшее вместе с ней значение отбрасывается', async () => {
  const cloud = { getItem: (k, cb) => cb(new Error('нет сети'), '["обрезанное"]') };
  assert.deepEqual(await createKv({ cloud }).callCloud('getItem', ['a']), { ok: false, value: '' });
});

test('callCloud: синхронное исключение — отказ', async () => {
  const cloud = { getItem: () => { throw new Error('бум'); } };
  assert.deepEqual(await createKv({ cloud }).callCloud('getItem', ['a']), { ok: false, value: '' });
});

test('callCloud: метода у облака нет — отказ, а не падение', async () => {
  assert.deepEqual(await createKv({ cloud: {} }).callCloud('getKeys', []), { ok: false, value: '' });
  assert.deepEqual(await createKv().callCloud('getKeys', []), { ok: false, value: '' });
});

test('callCloud: колбэк не вызван — по таймауту отказ', async () => {
  const cloud = { getItem: () => { /* никогда не ответит */ } };
  const kv = createKv({ cloud, cloudTimeout: 10 });
  const start = Date.now();
  assert.deepEqual(await kv.callCloud('getItem', ['a']), { ok: false, value: '' });
  assert.ok(Date.now() - start < 100, 'таймаут cloudTimeout не сработал');
});

test('callCloud: опоздавший и повторный ответ не меняют уже принятый исход', async () => {
  let late = null;
  const cloud = { getItem: (k, cb) => { late = cb; } };
  const kv = createKv({ cloud, cloudTimeout: 10 });
  assert.deepEqual(await kv.callCloud('getItem', ['a']), { ok: false, value: '' });
  assert.doesNotThrow(() => { late(null, 'опоздал'); late(null, 'и ещё раз'); });
});
