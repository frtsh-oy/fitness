import { test } from 'node:test';
import assert from 'node:assert/strict';
import { similarity, replaceCandidates, replaceExercise } from '../builder/replace.js';
import { pickSkeleton, makeRandom } from '../builder/generator.js';
import { expandWorkout } from '../builder/compact.js';
import { zeroGroups } from '../builder/coverage.js';
import { TEST_LIBRARY, onlyOneFor } from './fixtures/test-library.js';

// Образцы общие для всех тестов файла, поэтому заморожены: замена, которая
// правит запись на месте, упала бы сразу TypeError, а не испортила бы образец
// тихо для всех последующих тестов.
function deepFreeze(value) {
  for (const inner of Object.values(value)) {
    if (typeof inner === 'object' && inner !== null) deepFreeze(inner);
  }
  return Object.freeze(value);
}

// Разминка, разогрев и завершение — один и тот же скелет у всех образцов:
// ключи разминок и растяжек в тестах называются явно, и им надо стоять на месте.
const SKELETON = pickSkeleton(TEST_LIBRARY, makeRandom(1));
// warmup: warm-1, warm-3 · circuit: circ-5, circ-4, circ-1, circ-3 ·
// cooldown: stretch-3, stretch-1, breathing

const build = changes => deepFreeze({
  v: 1, name: 'Своя', days: [1, 3, 5], level: null, zones: [], strength: [], focus: [], t: 1,
  ...SKELETON, ...changes,
});

const GEN = build({
  level: 'beginner', zones: ['glutes'], strength: ['glutes-1', 'quads-1'], focus: [['glutes-1', 'glutes']],
});
const MANUAL_ONE = build({ strength: ['squat-a'] });

const byKey = new Map(TEST_LIBRARY.map(e => [e.key, e]));
const keys = entries => entries.map(e => e.key);
const candidates = (compact, slot, key, library = TEST_LIBRARY) => keys(replaceCandidates({ compact, slot, key, library }));

test('сходство — сумма меньших долей по группам', () => {
  const squat = byKey.get('squat-a');   // quads 1, glutes 1, hamstrings 0.5
  const hinge = byKey.get('hinge-a');   // hamstrings 1, glutes 1, lower_back 1
  assert.equal(similarity(squat, hinge), 1.5);                    // glutes 1 + hamstrings min(0.5, 1)
  assert.equal(similarity(hinge, squat), 1.5);                    // не зависит от порядка
  assert.equal(similarity(squat, squat), 2.5);                    // с самим собой — сумма всех долей
  assert.equal(similarity(squat, byKey.get('chest-1')), 0);       // общих групп нет
  assert.equal(similarity(squat, byKey.get('breathing')), 0);     // пустая разметка не ломает счёт
  assert.equal(similarity(byKey.get('breathing'), squat), 0);
});

test('кандидаты — того же слота и ещё не в тренировке', () => {
  // В скелете занято по слоту почти всё: свободно ровно по одному.
  assert.deepEqual(candidates(GEN, 'warmup', 'warm-1'), ['warm-2']);
  assert.deepEqual(candidates(GEN, 'circuit', 'circ-5'), ['circ-2']);
  assert.deepEqual(candidates(GEN, 'cooldown', 'stretch-3'), ['stretch-2']);

  const strength = replaceCandidates({ compact: GEN, slot: 'strength', key: 'quads-1', library: TEST_LIBRARY });
  assert.ok(strength.length > 0);
  for (const e of strength) {
    assert.equal(e.slot, 'strength');
    assert.ok(!['glutes-1', 'quads-1'].includes(e.key), e.key);
  }
});

test('упражнение, стоящее в другом слоте записи, тоже занято', () => {
  // Библиотеку могли поправить после сохранения: запись держит разминку warm-2
  // в разогреве. Предложи её на замену в разминку — на экране она встала бы в
  // тренировку дважды.
  const stale = build({ circuit: ['circ-5', 'circ-4', 'circ-1', 'warm-2'] });
  assert.deepEqual(candidates(stale, 'warmup', 'warm-1'), []);
});

test('у силового обязательна общая целевая группа, у разминки — нет', () => {
  // quads-1 целит только quads: подходят те, у кого quads с долей 1.
  assert.deepEqual(candidates(GEN, 'strength', 'quads-1'), ['lunge-a', 'lunge-b', 'quads-2', 'squat-a', 'squat-b']);
  // Доля 0.5 общей группой не считается ни у заменяемого, ни у кандидата:
  // у squat-a hamstrings вспомогательная, значит hamstrings-N не подходят...
  assert.ok(!candidates(MANUAL_ONE, 'strength', 'squat-a').some(key => key.startsWith('hamstrings-')));
  // ...а у row-a biceps вспомогательная, так что на замену biceps-1 row-a не годится.
  const manualRow = build({ strength: ['biceps-1'] });
  assert.ok(!candidates(manualRow, 'strength', 'biceps-1').some(key => key.startsWith('row-')));
  // Разминка: warm-1 целит traps, warm-2 — hip_flexors; общего нет, и всё равно предлагается.
  assert.deepEqual(candidates(GEN, 'warmup', 'warm-1'), ['warm-2']);
});

test('у сгенерированной — только пул её уровня, у ручной — любая сложность', () => {
  const strength = ['glutes-1', 'quads-1'];
  const forLevel = level => candidates(build({ level, strength }), 'strength', 'glutes-1');
  assert.deepEqual(forLevel('beginner'), ['glutes-2', 'hinge-a', 'hinge-b', 'squat-a', 'squat-b']);
  assert.deepEqual(forLevel('intermediate'), ['glutes-2', 'glutes-3', 'hinge-a', 'hinge-b', 'squat-a', 'squat-b']);
  assert.deepEqual(forLevel('advanced'), ['glutes-2', 'glutes-3', 'glutes-4', 'hinge-a', 'hinge-b', 'squat-a', 'squat-b']);
  assert.deepEqual(forLevel(null), forLevel('advanced'));
  // У разминки сложности нет: пул уровня её не отсекает.
  assert.deepEqual(candidates(GEN, 'warmup', 'warm-1'), ['warm-2']);
});

test('порядок — по сходству разметки, при равенстве по ключу', () => {
  const expected = [
    'squat-b',                                               // 2.5
    'hinge-a', 'hinge-b',                                    // 1.5
    'glutes-1', 'glutes-2', 'glutes-3', 'glutes-4',          // 1 — дальше по ключу, а не по порядку библиотеки
    'lunge-a', 'lunge-b',
    'quads-1', 'quads-2', 'quads-3', 'quads-4',
  ];
  assert.deepEqual(candidates(MANUAL_ONE, 'strength', 'squat-a'), expected);
  // Порядок библиотеки на результат не влияет.
  assert.deepEqual(candidates(MANUAL_ONE, 'strength', 'squat-a', [...TEST_LIBRARY].reverse()), expected);
});

test('у упражнения упора кандидаты нагружают ту же зону', () => {
  // squat-a целит quads (зона «Ноги») и glutes (зона «Ягодицы»); упор — на ягодицы.
  // quads-1 и quads-2 делят с ним группу quads, но зону ягодиц не нагружают.
  const focused = build({
    level: 'beginner', zones: ['glutes'], strength: ['squat-a', 'glutes-1'], focus: [['squat-a', 'glutes']],
  });
  assert.deepEqual(candidates(focused, 'strength', 'squat-a'),
    ['squat-b', 'hinge-a', 'hinge-b', 'glutes-2', 'lunge-a', 'lunge-b']);
  // Тот же набор без пометки упора — и ноги в кандидатах.
  const plain = build({ level: 'beginner', strength: ['squat-a', 'glutes-1'] });
  assert.ok(candidates(plain, 'strength', 'squat-a').includes('quads-1'));
});

test('пометка упора переходит на замену', () => {
  const next = replaceExercise(GEN, 'strength', 'glutes-1', 'glutes-2');
  assert.deepEqual(next.focus, [['glutes-2', 'glutes']]);
  assert.ok(!next.strength.includes('glutes-1') && next.strength.includes('glutes-2'));
  // Замена не упора пометку не трогает.
  assert.deepEqual(replaceExercise(GEN, 'strength', 'quads-1', 'quads-2').focus, [['glutes-1', 'glutes']]);
});

test('замена, после которой группа остаётся с нулём, разрешена — покрытие показывает это сразу', () => {
  const zeros = compact => zeroGroups(expandWorkout('m', compact, TEST_LIBRARY).workout);
  assert.ok(!zeros(MANUAL_ONE).includes('glutes'));
  // Замена предлагается...
  assert.ok(candidates(MANUAL_ONE, 'strength', 'squat-a').includes('quads-1'));
  // ...и выполняется, а предупреждение о ягодицах приходит от покрытия.
  const next = replaceExercise(MANUAL_ONE, 'strength', 'squat-a', 'quads-1');
  assert.ok(zeros(next).includes('glutes'));
});

test('нечем заменить — пустой список', () => {
  // Разминка: все три уже в тренировке.
  const allWarmups = build({ warmup: ['warm-1', 'warm-2', 'warm-3'] });
  assert.deepEqual(replaceCandidates({ compact: allWarmups, slot: 'warmup', key: 'warm-1', library: TEST_LIBRARY }), []);
  // Силовое: в библиотеке на abs одно упражнение, и оно заменяемое.
  const lone = build({ strength: ['abs-1'] });
  assert.deepEqual(replaceCandidates({ compact: lone, slot: 'strength', key: 'abs-1', library: onlyOneFor('abs') }), []);
});

const THREE = build({
  level: 'beginner', zones: ['glutes', 'chest'], strength: ['glutes-1', 'quads-1', 'chest-1'],
  focus: [['glutes-1', 'glutes'], ['chest-1', 'chest']],
});

test('замена оставляет позицию в слоте и всё остальное как было', () => {
  const strength = replaceExercise(THREE, 'strength', 'quads-1', 'quads-2');
  assert.deepEqual(strength.strength, ['glutes-1', 'quads-2', 'chest-1']);      // середина осталась серединой
  assert.deepEqual(strength.focus, THREE.focus);
  const warmup = replaceExercise(THREE, 'warmup', 'warm-1', 'warm-2');
  assert.deepEqual(warmup.warmup, ['warm-2', 'warm-3']);                        // начало осталось началом
  assert.deepEqual(warmup.strength, THREE.strength);

  for (const next of [strength, warmup]) {
    for (const field of ['v', 'name', 'level', 't']) assert.equal(next[field], THREE[field], field);
    for (const field of ['days', 'zones', 'circuit', 'cooldown']) assert.deepEqual(next[field], THREE[field], field);
  }
});

test('новая запись не делит массивы с исходной, а исходная не меняется', () => {
  // Образец заморожен: правка на месте упала бы TypeError. Общий массив так не
  // поймать — он остался бы тем же объектом, — поэтому сравниваем сами массивы.
  const before = JSON.stringify(THREE);
  const next = replaceExercise(THREE, 'strength', 'quads-1', 'quads-2');
  for (const field of ['days', 'zones', 'warmup', 'circuit', 'strength', 'cooldown', 'focus']) {
    assert.notEqual(next[field], THREE[field], field);
  }
  assert.notEqual(next.focus[0], THREE.focus[0]);
  assert.equal(JSON.stringify(THREE), before);
});

test('ключа нет в библиотеке — ошибка, а не пустой или случайный список', () => {
  assert.throws(
    () => replaceCandidates({ compact: GEN, slot: 'strength', key: 'no-such', library: TEST_LIBRARY }),
    /Нет упражнения «no-such» в библиотеке/,
  );
});

test('заменяемого нет в слоте — ошибка', () => {
  assert.throws(() => replaceExercise(GEN, 'strength', 'quads-9', 'quads-2'), /«quads-9» нет в слоте «strength»/);
  // Ключ есть, но в другом слоте.
  assert.throws(() => replaceExercise(GEN, 'strength', 'warm-1', 'quads-2'), /«warm-1» нет в слоте «strength»/);
  // Слота такого нет вовсе: чужие поля записи слотом не считаются.
  assert.throws(() => replaceExercise(GEN, 'zones', 'glutes', 'quads-2'), /нет в слоте «zones»/);
});

test('замена на уже стоящее в тренировке — ошибка: запись с повтором не читается', () => {
  assert.throws(() => replaceExercise(GEN, 'strength', 'glutes-1', 'quads-1'), /«quads-1» уже есть в тренировке/);
  assert.throws(() => replaceExercise(GEN, 'strength', 'glutes-1', 'glutes-1'), /«glutes-1» уже есть в тренировке/);
  // В другом слоте тоже: тренировка показала бы его дважды.
  assert.throws(() => replaceExercise(GEN, 'strength', 'glutes-1', 'warm-3'), /«warm-3» уже есть в тренировке/);
});
