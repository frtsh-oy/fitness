// Выбор «Что есть дома»: читается из localStorage один раз, любой мусор и любой
// отказ хранилища дают выбор по умолчанию, а не падение.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GEAR_KEY, createGearProfile } from '../gear-profile.js';
import { DEFAULT_OWNED } from '../gear.js';

// Поддельный localStorage: хранит строки, считает обращения и по запросу бросает
// на чтении или записи (приватный режим Safari бросает на setItem, урезанный
// WebView — уже на getItem).
function fakeLocal(initial = {}, { failGet = false, failSet = false } = {}) {
  const data = new Map(Object.entries(initial));
  const calls = { get: 0, set: 0 };
  return {
    data,
    calls,
    getItem(key) {
      calls.get += 1;
      if (failGet) throw new Error('getItem недоступен');
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      calls.set += 1;
      if (failSet) throw new Error('setItem недоступен');
      data.set(key, String(value));
    },
  };
}

test('ключ хранилища — gear-owned', () => {
  assert.equal(GEAR_KEY, 'gear-owned');
});

test('ничего не выбрано — по умолчанию длинная резинка и мини-петля, и в хранилище при чтении ничего не пишется', () => {
  const local = fakeLocal();
  const profile = createGearProfile(local);
  assert.deepEqual(profile.get(), ['band_long', 'loop_short']);
  assert.deepEqual(profile.get(), DEFAULT_OWNED);
  assert.equal(local.calls.set, 0, 'по умолчанию не становится выбранным');
});

test('get отдаёт копию: правка результата не меняет выбор, а DEFAULT_OWNED остаётся нетронутым', () => {
  const profile = createGearProfile(fakeLocal());
  const first = profile.get();
  assert.notEqual(first, DEFAULT_OWNED, 'не сам замороженный массив из gear.js');
  first.push('dumbbells');
  assert.deepEqual(profile.get(), ['band_long', 'loop_short']);
  assert.notEqual(profile.get(), profile.get());
  assert.deepEqual(DEFAULT_OWNED, ['band_long', 'loop_short']);
});

test('без хранилища (null) — тоже по умолчанию, выбор живёт в памяти', () => {
  const profile = createGearProfile();
  assert.deepEqual(profile.get(), ['band_long', 'loop_short']);
  profile.set(['kettlebell']);
  assert.deepEqual(profile.get(), ['kettlebell']);
  assert.deepEqual(createGearProfile(null).get(), ['band_long', 'loop_short'], 'другому профилю выбор не достаётся');
});

test('сохранённое читается в порядке словаря, без повторов', () => {
  const local = fakeLocal({ [GEAR_KEY]: JSON.stringify(['kettlebell', 'band_long', 'kettlebell', 'dumbbells']) });
  assert.deepEqual(createGearProfile(local).get(), ['band_long', 'dumbbells', 'kettlebell']);
});

test('пустой массив — законный выбор «ничего нет», а не отсутствие значения', () => {
  const profile = createGearProfile(fakeLocal({ [GEAR_KEY]: '[]' }));
  assert.deepEqual(profile.get(), []);
});

test('чужие id, «none» и не строки в сохранённом отбрасываются; остальное остаётся', () => {
  const stored = ['none', 'constructor', '__proto__', 'toString', 'dumbbells', 5, null, {}, ['kettlebell'], 'kettlebell'];
  const profile = createGearProfile(fakeLocal({ [GEAR_KEY]: JSON.stringify(stored) }));
  assert.deepEqual(profile.get(), ['dumbbells', 'kettlebell']);
});

test('только чужие id — «ничего нет», а не умолчание: массив есть, значит, выбор был', () => {
  const profile = createGearProfile(fakeLocal({ [GEAR_KEY]: JSON.stringify(['none', 'rope']) }));
  assert.deepEqual(profile.get(), []);
});

test('мусор в хранилище — выбор по умолчанию', () => {
  for (const raw of ['', 'не json', '{"band_long":true}', '"dumbbells"', '42', 'null', 'true', '[', 'undefined']) {
    const profile = createGearProfile(fakeLocal({ [GEAR_KEY]: raw }));
    assert.deepEqual(profile.get(), ['band_long', 'loop_short'], `«${raw}»`);
  }
});

test('localStorage бросает на getItem — выбор по умолчанию, set всё равно запоминает в памяти', () => {
  const local = fakeLocal({ [GEAR_KEY]: JSON.stringify(['kettlebell']) }, { failGet: true });
  const profile = createGearProfile(local);
  assert.deepEqual(profile.get(), ['band_long', 'loop_short']);
  assert.doesNotThrow(() => profile.set(['dumbbells']));
  assert.deepEqual(profile.get(), ['dumbbells']);
});

test('localStorage бросает на setItem — выбор живёт в памяти и не падает', () => {
  const local = fakeLocal({}, { failSet: true });
  const profile = createGearProfile(local);
  assert.doesNotThrow(() => profile.set(['dumbbells', 'band_long']));
  assert.equal(local.calls.set, 1, 'запись пробовали');
  assert.deepEqual(profile.get(), ['band_long', 'dumbbells']);
  assert.equal(local.data.has(GEAR_KEY), false);
});

test('set([]) — «ничего нет»: get даёт пустой массив, а новый профиль на том же хранилище его тоже читает', () => {
  const local = fakeLocal();
  const profile = createGearProfile(local);
  profile.set([]);
  assert.deepEqual(profile.get(), []);
  assert.equal(local.data.get(GEAR_KEY), '[]');
  assert.deepEqual(createGearProfile(local).get(), [], 'после перезапуска пусто, а не по умолчанию');
});

test('set приводит к порядку словаря и без повторов, пишет JSON и переживает перезапуск', () => {
  const local = fakeLocal();
  const profile = createGearProfile(local);
  profile.set(['kettlebell', 'band_long', 'band_long', 'none', 'rope', 'dumbbells']);
  assert.deepEqual(profile.get(), ['band_long', 'dumbbells', 'kettlebell']);
  assert.equal(local.data.get(GEAR_KEY), JSON.stringify(['band_long', 'dumbbells', 'kettlebell']));
  assert.deepEqual(createGearProfile(local).get(), ['band_long', 'dumbbells', 'kettlebell']);
});

test('set не держит переданный массив: правка после вызова выбор не меняет', () => {
  const profile = createGearProfile(fakeLocal());
  const ids = ['dumbbells'];
  profile.set(ids);
  ids.push('kettlebell');
  assert.deepEqual(profile.get(), ['dumbbells']);
});

test('хранилище читается один раз: дальше правду говорит память', () => {
  const local = fakeLocal({ [GEAR_KEY]: JSON.stringify(['dumbbells']) });
  const profile = createGearProfile(local);
  profile.get();
  profile.get();
  assert.equal(local.calls.get, 1);
  // Чужая запись после первого чтения выбор этого профиля не меняет.
  local.data.set(GEAR_KEY, JSON.stringify(['kettlebell']));
  assert.deepEqual(profile.get(), ['dumbbells']);
});

test('set до первого get хранилище не читает', () => {
  const local = fakeLocal({ [GEAR_KEY]: JSON.stringify(['dumbbells']) });
  const profile = createGearProfile(local);
  profile.set(['kettlebell']);
  assert.deepEqual(profile.get(), ['kettlebell']);
  assert.equal(local.calls.get, 0);
});

test('set не массива — ошибка вызова, а не молчаливое «ничего нет»', () => {
  const profile = createGearProfile(fakeLocal());
  assert.throws(() => profile.set('dumbbells'), TypeError);
  assert.throws(() => profile.set(undefined), TypeError);
  assert.deepEqual(profile.get(), ['band_long', 'loop_short'], 'выбор после ошибки прежний');
});
