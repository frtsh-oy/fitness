// Недельный объём по группам мышц. Два числа на группу считаются РАЗНО, и это
// главное, что проверяется: наше — с коэффициентом 0.5 за вспомогательную
// работу и односторонними один раз, сопоставимое — только целевые доли и
// односторонние по сторонам. Числа ниже посчитаны из данных программы, а не
// выбраны: три тренировки в неделю (days = [1,3,5]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklySets } from '../weekly.js';
import { MUSCLES } from '../muscles.js';
import { WORKOUTS } from '../workouts/index.js';

const all = Object.values(WORKOUTS);

test('ягодичные: вспомогательная работа поднимает наше число выше сопоставимого', () => {
  const row = weeklySets(all).get('glutes');
  assert.equal(row.ours, 18);
  assert.equal(row.comparable, 12);
});

test('средняя ягодичная: односторонние поднимают сопоставимое выше нашего', () => {
  // Подъём верхней ноги лёжа на боку — целевое и одностороннее: 2 круга × 2
  // стороны × 3 дня = 12. Наше число меньше, потому что сторону не удваивает.
  const row = weeklySets(all).get('glutes_med');
  assert.equal(row.ours, 9);
  assert.equal(row.comparable, 12);
});

test('предплечья: работа есть, но целевой ни одной', () => {
  const row = weeklySets(all).get('forearms');
  assert.equal(row.ours, 18);
  assert.equal(row.comparable, 0);
});

test('сгибатели бедра: в силовых блоках не работают вовсе', () => {
  const row = weeklySets(all).get('hip_flexors');
  assert.equal(row.ours, 0);
  assert.equal(row.comparable, 0);
});

test('в ответе все двадцать групп, и порядок словаря сохранён', () => {
  const keys = [...weeklySets(all).keys()];
  assert.deepEqual(keys, Object.keys(MUSCLES));
});

test('групп без целевой работы ровно девять — это считается, а не вписано', () => {
  const idle = [...weeklySets(all).values()].filter(row => row.comparable === 0);
  assert.equal(idle.length, 9);
});

// Синтетическая тренировка: настоящая программа идёт три дня в неделю и
// проверить множитель дней на ней нельзя — три и «правильно» неразличимы.
function fixture({ days, rounds, load, unilateral = false }) {
  return {
    id: 'fixture',
    days,
    blocks: [{ id: 'b', n: '01', nav: 'Б', title: 'Блок', rounds, items: [
      { key: 'x', name: 'Упражнение', muscles: 'Мышцы', reps: '10', text: 'Текст',
        load, pattern: 'isolation', gear: ['none'], unilateral, kind: 'strength' },
    ] }],
  };
}

test('число дней умножает объём', () => {
  const two = weeklySets([fixture({ days: [1, 4], rounds: 2, load: { chest: 1 } })]);
  const four = weeklySets([fixture({ days: [1, 2, 4, 6], rounds: 2, load: { chest: 1 } })]);
  assert.equal(two.get('chest').comparable, 4);
  assert.equal(four.get('chest').comparable, 8);
});

test('односторонность удваивает только сопоставимое', () => {
  const row = weeklySets([fixture({ days: [1], rounds: 3, load: { biceps: 1 }, unilateral: true })]).get('biceps');
  assert.equal(row.ours, 3);
  assert.equal(row.comparable, 6);
});

test('вспомогательная доля не попадает в сопоставимое', () => {
  const row = weeklySets([fixture({ days: [1], rounds: 2, load: { traps: 0.5 } })]).get('traps');
  assert.equal(row.ours, 1);
  assert.equal(row.comparable, 0);
});

test('несколько тренировок складываются', () => {
  const rows = weeklySets([
    fixture({ days: [1], rounds: 2, load: { chest: 1 } }),
    fixture({ days: [3], rounds: 3, load: { chest: 1 } }),
  ]);
  assert.equal(rows.get('chest').comparable, 5);
});

test('группа вне словаря — это ошибка данных, а не ноль', () => {
  assert.throws(
    () => weeklySets([fixture({ days: [1], rounds: 1, load: { shoulders: 1 } })]),
    /Неизвестная группа мышц: shoulders/);
});
