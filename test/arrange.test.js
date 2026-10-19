import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrangeStrength } from '../builder/arrange.js';

// Записи-заглушки: порядок пар зависит только от key, compound и load, остальные
// поля библиотеки ему не нужны.
const stub = (key, load, compound = false) => ({ key, load, compound, slot: 'strength', difficulty: 'basic' });
const keys = pairs => pairs.map(pair => pair.map(e => e.key));

test('многосуставные раньше односуставных, крупные группы раньше мелких', () => {
  // Буквы ключей идут против ожидаемого порядка: алфавит дал бы w, x, y, z.
  const entries = [
    stub('w-small-single', { biceps: 1 }),
    stub('x-big-single', { glutes: 1 }),
    stub('y-small-compound', { delts_side: 1 }, true),
    stub('z-big-compound', { quads: 1 }, true),
  ];
  assert.deepEqual(keys(arrangeStrength(entries)),
    [['z-big-compound', 'y-small-compound'], ['x-big-single', 'w-small-single']]);
});

test('крупной считается только целевая доля, вспомогательная не в счёт', () => {
  const entries = [
    stub('a-assist', { glutes: 0.5, biceps: 1 }),
    stub('b-target', { chest: 1 }),
  ];
  assert.deepEqual(keys(arrangeStrength(entries)), [['b-target', 'a-assist']]);
});

test('при равенстве порядок по ключу', () => {
  const entries = [stub('c', { glutes: 1 }), stub('a', { quads: 1 }), stub('b', { lats: 1 })];
  assert.deepEqual(keys(arrangeStrength(entries)), [['a', 'b'], ['c']]);
});

test('в паре нет общей целевой группы, когда есть выбор', () => {
  const entries = [
    stub('a', { glutes: 1, hamstrings: 1 }),
    stub('b', { glutes: 1 }),
    stub('c', { adductors: 1 }),
  ];
  // a и b целят одну группу, поэтому партнёр для a — c, а b остаётся одна.
  assert.deepEqual(keys(arrangeStrength(entries)), [['a', 'c'], ['b']]);
});

test('вспомогательная доля общей группой не считается', () => {
  const entries = [
    stub('a', { glutes: 1 }),
    stub('b', { glutes: 0.5, quads: 1 }),
    stub('c', { lats: 1 }),
  ];
  assert.deepEqual(keys(arrangeStrength(entries)), [['a', 'b'], ['c']]);
});

test('когда выбора нет, партнёр — просто первое оставшееся', () => {
  const entries = [stub('a', { glutes: 1 }), stub('b', { glutes: 1 }), stub('c', { glutes: 1 })];
  assert.deepEqual(keys(arrangeStrength(entries)), [['a', 'b'], ['c']]);
});

test('нечётное упражнение — отдельным последним блоком', () => {
  const entries = ['a', 'b', 'c', 'd', 'e'].map((k, i) => stub(k, { [['glutes', 'quads', 'lats', 'chest', 'abs'][i]]: 1 }));
  const pairs = arrangeStrength(entries);
  assert.equal(pairs.length, 3);
  assert.deepEqual(pairs.map(p => p.length), [2, 2, 1]);
  assert.deepEqual(arrangeStrength([entries[0]]).map(p => p.length), [1]);
  assert.deepEqual(arrangeStrength([]), []);
});

test('порядок не зависит от порядка на входе и вход не меняется', () => {
  const entries = [
    stub('k1', { glutes: 1, hamstrings: 1 }, true),
    stub('k2', { quads: 1 }, true),
    stub('k3', { glutes: 1 }),
    stub('k4', { adductors: 1 }),
    stub('k5', { biceps: 1 }),
  ];
  const expected = keys(arrangeStrength(entries));
  const permutations = list => (list.length <= 1 ? [list]
    : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(rest => [x, ...rest])));
  for (const permutation of permutations(entries)) {
    const input = [...permutation];
    assert.deepEqual(keys(arrangeStrength(permutation)), expected);
    assert.deepEqual(permutation, input, 'вход не должен меняться');
  }
});
