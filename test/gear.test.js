import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GEAR, GEAR_IDS, NO_GEAR, NO_GEAR_LABEL, DEFAULT_OWNED, gearLabel, gearText, fitsGear, fitLibrary, unownedGear,
} from '../gear.js';

// Записи свои и крохотные: fitsGear читает только gear, а состав настоящей
// библиотеки меняется с каждой правкой таблицы.
const needing = (key, ...gear) => ({ key, gear });

test('словарь: пять видов в порядке экрана и «без инвентаря» отдельно', () => {
  assert.deepEqual(GEAR, [
    ['band_long', 'длинная резинка'],
    ['loop_short', 'мини-петля'],
    ['band_handles', 'резинка с ручками'],
    ['dumbbells', 'гантели'],
    ['kettlebell', 'гиря'],
  ]);
  assert.equal(NO_GEAR, 'none');
  assert.equal(NO_GEAR_LABEL, 'без инвентаря');
  // «Без инвентаря» человек не отмечает, поэтому его нет в GEAR, но у
  // упражнения оно законное значение.
  assert.deepEqual(GEAR_IDS, ['band_long', 'loop_short', 'band_handles', 'dumbbells', 'kettlebell', 'none']);
});

test('id и подписи не повторяются, подписи строчные', () => {
  const labels = [...GEAR.map(([, label]) => label), NO_GEAR_LABEL];
  assert.equal(new Set(GEAR_IDS).size, GEAR_IDS.length);
  assert.equal(new Set(labels).size, labels.length);
  for (const label of labels) assert.equal(label, label.toLowerCase(), label);
});

test('по умолчанию отмечены длинная резинка и мини-петля, и оба вида есть в словаре', () => {
  assert.deepEqual(DEFAULT_OWNED, ['band_long', 'loop_short']);
  for (const id of DEFAULT_OWNED) assert.ok(GEAR.some(([known]) => known === id), id);
});

test('словарь не изменить на ходу: ни виды, ни выбор по умолчанию', () => {
  assert.throws(() => GEAR.push(['barbell', 'штанга']), TypeError);
  assert.throws(() => { GEAR[0][1] = 'другое'; }, TypeError);
  assert.throws(() => GEAR_IDS.push('barbell'), TypeError);
  assert.throws(() => DEFAULT_OWNED.push('dumbbells'), TypeError);
});

test('gearLabel: подпись вида и «без инвентаря»', () => {
  assert.equal(gearLabel('band_long'), 'длинная резинка');
  assert.equal(gearLabel('kettlebell'), 'гиря');
  assert.equal(gearLabel(NO_GEAR), 'без инвентаря');
});

test('gearLabel бросает на неизвестном id, в том числе на унаследованном свойстве', () => {
  assert.throws(() => gearLabel('barbell'), /barbell/);
  assert.throws(() => gearLabel('constructor'), /constructor/);
  assert.throws(() => gearLabel(undefined), /undefined/);
});

test('gearText: подписи через запятую в порядке записи у упражнения', () => {
  assert.equal(gearText(needing('a', 'none')), 'без инвентаря');
  assert.equal(gearText(needing('a', 'band_long')), 'длинная резинка');
  assert.equal(gearText(needing('a', 'dumbbells', 'band_long')), 'гантели, длинная резинка');
  assert.throws(() => gearText(needing('a', 'barbell')), /barbell/);
});

test('fitsGear: «без инвентаря» подходит всегда, даже когда отмечено пусто', () => {
  assert.equal(fitsGear(needing('a', NO_GEAR), []), true);
  assert.equal(fitsGear(needing('a', NO_GEAR), ['dumbbells']), true);
});

test('fitsGear: вид инвентаря подходит, только если он отмечен', () => {
  assert.equal(fitsGear(needing('a', 'dumbbells'), ['dumbbells']), true);
  assert.equal(fitsGear(needing('a', 'dumbbells'), ['band_long', 'loop_short']), false);
  assert.equal(fitsGear(needing('a', 'dumbbells'), []), false);
});

test('fitsGear: два вида нужны оба, одного из двух мало', () => {
  const both = needing('a', 'band_long', 'dumbbells');
  assert.equal(fitsGear(both, ['band_long', 'dumbbells']), true);
  assert.equal(fitsGear(both, ['dumbbells', 'band_long', 'kettlebell']), true, 'лишнее отмеченное не мешает');
  assert.equal(fitsGear(both, ['band_long']), false);
  assert.equal(fitsGear(both, ['dumbbells']), false);
  assert.equal(fitsGear(both, []), false);
});

test('fitsGear: упражнению без единой записи в gear ничего не нужно', () => {
  assert.equal(fitsGear(needing('a'), []), true);
});

test('fitLibrary оставляет подходящие, порядок сохраняет и исходный список не трогает', () => {
  const library = [
    needing('rows', 'band_long'), needing('curl', 'dumbbells'), needing('plank', NO_GEAR),
    needing('swing', 'kettlebell'), needing('thruster', 'band_long', 'dumbbells'),
  ];
  const before = [...library];
  const keys = owned => fitLibrary(library, owned).map(e => e.key);
  assert.deepEqual(keys(DEFAULT_OWNED), ['rows', 'plank']);
  assert.deepEqual(keys(GEAR.map(([id]) => id)), ['rows', 'curl', 'plank', 'swing', 'thruster']);
  assert.deepEqual(keys(['band_long', 'dumbbells']), ['rows', 'curl', 'plank', 'thruster']);
  assert.deepEqual(keys([]), ['plank']);
  assert.deepEqual(library, before);
});

test('unownedGear: нужное и не отмеченное, в порядке словаря, без повторов и без «без инвентаря»', () => {
  const entries = [needing('a', 'kettlebell', 'band_long'), needing('b', 'dumbbells'), needing('c', NO_GEAR), needing('d', 'kettlebell')];
  assert.deepEqual(unownedGear(entries, []), ['band_long', 'dumbbells', 'kettlebell'], 'порядок словаря, а не упражнений');
  assert.deepEqual(unownedGear(entries, ['band_long']), ['dumbbells', 'kettlebell'], 'отмеченное не называется');
  assert.deepEqual(unownedGear(entries, ['band_long', 'dumbbells', 'kettlebell']), []);
  assert.deepEqual(unownedGear([needing('c', NO_GEAR)], []), [], '«без инвентаря» всегда у человека');
  assert.deepEqual(unownedGear([], []), []);
});
