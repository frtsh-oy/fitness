import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setsByGroup, setsByRegion, exerciseEntries, PALETTE_STEPS } from '../volume.js';
import legs from '../workouts/legs-mwf.js';

test('силовой объём по группам совпадает с разметкой', () => {
  const s = setsByGroup(legs, 'strength');
  assert.equal(s.get('glutes'), 6);
  assert.equal(s.get('hamstrings'), 3);
  assert.equal(s.get('lower_back'), 3);
  assert.equal(s.get('glutes_med'), 3);
  assert.equal(s.get('upper_back'), 3);
  assert.equal(s.get('triceps'), 3);
  assert.equal(s.get('adductors'), 2);
  assert.equal(s.get('abs'), 1);
  assert.equal(s.get('calves'), undefined);
});

test('разминка считается отдельно и даёт дробные значения', () => {
  const w = setsByGroup(legs, 'warmup');
  assert.equal(w.get('hip_flexors'), 6);
  assert.equal(w.get('abs'), 5.5);
  assert.equal(w.get('delts_rear'), 3);
  assert.equal(w.get('upper_back'), 0.5);
});

test('заминка считается отдельно', () => {
  const c = setsByGroup(legs, 'cooldown');
  assert.equal(c.get('hip_flexors'), 1);
  assert.equal(c.get('lower_back'), 1);
});

test('силовые не смешиваются с разминкой', () => {
  assert.equal(setsByGroup(legs, 'strength').get('hip_flexors'), undefined);
});

test('объём по регионам складывает группы одного региона', () => {
  const r = setsByRegion(legs, 'strength');
  assert.equal(r.get('upper-back'), 5);       // upper_back 3 + lats 2
  assert.equal(r.get('front-deltoids'), 4);   // delts_front 2 + delts_side 2
  assert.equal(r.get('gluteal'), 6);
  assert.equal(r.get('abductors'), 3);        // отдельно от gluteal
});

test('записи для библиотеки: по одной на пару упражнение и группа', () => {
  const rows = exerciseEntries(legs, 'strength').filter(e => e.key === 'rdl');
  assert.equal(rows.length, 3);
  const byRegion = new Map(rows.map(r => [r.muscles[0], r.frequency]));
  assert.equal(byRegion.get('hamstring'), 2);    // load 1 × 2 круга
  assert.equal(byRegion.get('gluteal'), 2);
  assert.equal(byRegion.get('lower-back'), 1);   // load 0.5 × 2 круга
  for (const r of rows) assert.equal(r.muscles.length, 1);
});

test('дробный объём округляется, но задействованная группа не исчезает', () => {
  const rows = exerciseEntries(legs, 'warmup');
  for (const r of rows) {
    assert.ok(Number.isInteger(r.frequency), `${r.name}: frequency не целое`);
    assert.ok(r.frequency >= 1, `${r.name}: задействованная группа получила ${r.frequency}`);
  }
});

test('уровней палитры шесть — по максимуму объёма в тренировке', () => {
  assert.equal(PALETTE_STEPS, 6);
  assert.equal(Math.max(...setsByRegion(legs, 'strength').values()), PALETTE_STEPS);
});

test('неизвестный тип упражнения даёт пустой результат, а не ошибку', () => {
  assert.equal(setsByGroup(legs, 'нет-такого').size, 0);
});
