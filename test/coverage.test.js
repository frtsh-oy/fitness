import { test } from 'node:test';
import assert from 'node:assert/strict';
import legsMwf from '../workouts/legs-mwf.js';
import { CORE_GROUPS } from '../builder/rules.js';
import { zeroGroups, belowFloor } from '../builder/coverage.js';

test('zeroGroups называет ровно основные группы без целевой нагрузки', () => {
  assert.deepEqual(zeroGroups(legsMwf), ['calves', 'abs', 'obliques', 'delts_front', 'delts_rear', 'biceps']);
});

test('belowFloor считает при днях тренировки', () => {
  assert.deepEqual(belowFloor(legsMwf, 5), zeroGroups(legsMwf));
  assert.deepEqual(belowFloor({ ...legsMwf, days: [1] }, 5), CORE_GROUPS);
});

// Два круга и три дня: двустороннее целевое упражнение даёт ровно 6 подходов в неделю.
const oneExercise = (load, extra = {}) => ({
  days: [1, 3, 5],
  blocks: [{ rounds: 2, items: [{ kind: 'strength', unilateral: false, load, ...extra }] }],
});

test('belowFloor: ровно на границе уже не «ниже», на подходе меньше — ниже', () => {
  const workout = oneExercise({ glutes: 1 });
  assert.ok(!belowFloor(workout, 6).includes('glutes'));
  assert.ok(belowFloor(workout, 7).includes('glutes'));
});

test('вспомогательная доля и неосновные группы в списки не попадают', () => {
  const workout = oneExercise({ glutes: 1, quads: 0.5, forearms: 1, traps: 1, hip_flexors: 1 });
  // quads — основная, но только с долей 0.5: в «без нагрузки» остаётся.
  assert.ok(zeroGroups(workout).includes('quads'));
  assert.ok(!zeroGroups(workout).includes('glutes'));
  for (const g of ['forearms', 'traps', 'hip_flexors']) {
    assert.ok(!zeroGroups(workout).includes(g), g);
    assert.ok(!belowFloor(workout, 100).includes(g), g);
  }
});

test('односторонняя считается на обе стороны, а разминка не считается вовсе', () => {
  const sided = oneExercise({ glutes: 1 }, { unilateral: true });
  assert.ok(!belowFloor(sided, 12).includes('glutes'));
  assert.ok(belowFloor(sided, 13).includes('glutes'));
  const warmup = oneExercise({ glutes: 1 }, { kind: 'warmup' });
  assert.ok(zeroGroups(warmup).includes('glutes'));
});
