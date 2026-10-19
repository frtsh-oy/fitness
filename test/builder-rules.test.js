import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLES } from '../muscles.js';
import {
  CORE_GROUPS, LEVELS, ZONES, PLAN_DAYS, FOCUS_MIN, SKELETON, BIG_GROUPS, MANUAL_ROUNDS, MAX_STRENGTH,
} from '../builder/rules.js';

test('17 основных групп: все, кроме предплечий, трапеций и сгибателей бедра', () => {
  assert.equal(CORE_GROUPS.length, 17);
  for (const g of ['forearms', 'traps', 'hip_flexors']) assert.ok(!CORE_GROUPS.includes(g));
});

test('основные группы идут в порядке словаря MUSCLES', () => {
  // Порядок виден человеку: по нему zeroGroups и belowFloor выстраивают списки
  // «без нагрузки», и перестановка тихо поменяла бы тексты на экране.
  assert.deepEqual(CORE_GROUPS, Object.keys(MUSCLES).filter(g => CORE_GROUPS.includes(g)));
});

test('каждая основная группа ровно в одной зоне, в зонах только основные', () => {
  const all = Object.values(ZONES).flatMap(z => z.groups);
  assert.deepEqual([...all].sort(), [...CORE_GROUPS].sort());
});

test('одно целевое упражнение даёт нижнюю границу уровня, два — рабочий объём', () => {
  for (const L of Object.values(LEVELS)) {
    assert.ok(L.rounds * PLAN_DAYS.length >= L.floor);
    assert.ok(2 * L.rounds * PLAN_DAYS.length >= FOCUS_MIN);
  }
});

test('уровни: порядок, вложенные пулы сложности и заполненные подписи', () => {
  assert.deepEqual(Object.keys(LEVELS), ['beginner', 'intermediate', 'advanced']);
  const ids = Object.keys(LEVELS);
  ids.forEach((id, i) => {
    const L = LEVELS[id];
    for (const field of ['label', 'genitive', 'who', 'poolWords', 'reserve']) {
      assert.ok(typeof L[field] === 'string' && L[field].length > 0, `${id}.${field}`);
    }
    // Следующий уровень берёт всё, что брал предыдущий, и что-то сверх.
    if (i > 0) {
      const prev = LEVELS[ids[i - 1]].pool;
      assert.ok(prev.every(d => L.pool.includes(d)) && L.pool.length > prev.length, id);
    }
  });
});

test('остальные константы: большие группы основные, скелет и дни заданы', () => {
  for (const g of BIG_GROUPS) assert.ok(CORE_GROUPS.includes(g), g);
  assert.deepEqual(SKELETON, {
    warmup: { count: 2, rounds: 1 }, circuit: { count: 4, rounds: 3 }, cooldown: { count: 3, rounds: 1 },
  });
  assert.deepEqual(PLAN_DAYS, [1, 3, 5]);
  assert.equal(MANUAL_ROUNDS, 2);
  assert.equal(MAX_STRENGTH, 18);
});
