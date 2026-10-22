import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, entry } from '../exercises/index.js';
import { validateWorkout } from '../workouts/schema.js';
import { MAX_STRENGTH, SKELETON } from '../builder/rules.js';
import { arrangeStrength } from '../builder/arrange.js';
import { FORMATS } from '../builder/format.js';
import { weeklySets } from '../weekly.js';
import { setsByGroup } from '../volume.js';
import { KEY_PATTERN } from '../workouts/schema.js';
import { TEST_LIBRARY } from './fixtures/test-library.js';
import {
  PAIR_PREAMBLE, LOOP_PREAMBLE, SETS_PREAMBLE, BLOCK_TEXTS, progressionFor, CAUTION,
} from '../builder/texts.js';
import {
  NAME_MAX, VALUE_MAX, SKELETON_BLOCK_IDS, serializeCompact, parseCompact, roundsOf, exerciseCount, expandWorkout,
} from '../builder/compact.js';

// Образцы общие для всех тестов файла, поэтому заморожены: развёртка, которая
// правит запись на месте, упала бы сразу в первом же тесте, а не испортила бы
// образец тихо для всех последующих.
function deepFreeze(value) {
  Object.freeze(value);
  for (const inner of Object.values(value)) {
    if (typeof inner === 'object' && inner !== null && !Object.isFrozen(inner)) deepFreeze(inner);
  }
  return value;
}

const WARMUP = ['pelvic-tilt', 'thoracic-rotation'];
const CIRCUIT = ['chinese-squat', 'knee-raise', 'overhead-pull-apart', 'leg-raise'];
const COOLDOWN = ['hip-flexor', 'knees-to-chest', 'breathing'];

// Ручная сборка: уровня нет, упора нет, силовых три — последняя без пары.
const MANUAL = deepFreeze({
  v: 1, name: 'Моя тренировка', days: [1, 3, 5], level: null, zones: [], format: 'pairs',
  warmup: [...WARMUP], circuit: [...CIRCUIT], strength: ['rdl', 'adduction', 'glute-bridge'], focus: [],
  cooldown: [...COOLDOWN], t: 1760000000000,
});

// Подобранная по правилам: уровень, зона упора и упражнение упора.
const GENERATED = deepFreeze({
  v: 1, name: 'Всё тело. Упор: ягодицы', days: [1, 3, 5], level: 'beginner', zones: ['glutes'], format: 'pairs',
  warmup: [...WARMUP], circuit: [...CIRCUIT],
  strength: ['rdl', 'adduction', 'glute-bridge', 'leg-press', 'side-leg-raise', 'bird-dog', 'seated-row', 'chest-press'],
  focus: [['glute-bridge', 'glutes']], cooldown: [...COOLDOWN], t: 1760000000000,
});

const blockOf = (workout, id) => workout.blocks.find(b => b.id === id);

test('своя тренировка в полном виде проходит validateWorkout', () => {
  for (const c of [MANUAL, GENERATED]) assert.deepEqual(validateWorkout(expandWorkout('my-test0001', c).workout), []);
});

test('блоки: старт 1 круг, разогрев 3, пары по кругам уровня, завершение 1; у первой пары вступление', () => {
  const { workout } = expandWorkout('my-test0001', MANUAL);
  assert.deepEqual(workout.blocks.map(b => b.id), ['start', 'circuit', 'pair1', 'pair2', 'finish']);
  assert.deepEqual(workout.blocks.map(b => b.n), ['01', '02', '03', '04', '05']);
  assert.deepEqual(workout.blocks.map(b => b.rounds), [1, 3, 2, 2, 1]);
  assert.deepEqual(workout.blocks.map(b => b.items.length), [2, 4, 2, 1, 3]);

  assert.deepEqual(blockOf(workout, 'pair1').preamble, PAIR_PREAMBLE);
  for (const b of workout.blocks.filter(b => b.id !== 'pair1')) assert.ok(!('preamble' in b), b.id);

  const { start, circuit, finish } = BLOCK_TEXTS;
  const textsOf = b => ({ nav: b.nav, title: b.title, sub: b.sub, note: b.note });
  assert.deepEqual(textsOf(blockOf(workout, 'start')), { ...start, note: undefined });
  assert.deepEqual(textsOf(blockOf(workout, 'circuit')), circuit);
  assert.deepEqual(textsOf(blockOf(workout, 'finish')), { ...finish, note: undefined });
  assert.deepEqual(blockOf(workout, 'start').items.map(i => i.key), WARMUP);
  assert.deepEqual(blockOf(workout, 'finish').items.map(i => i.key), COOLDOWN);
});

// Состав пар зависит от разметки нагрузки, а настоящую правит владелец таблицы:
// на ней первая же правка доли переставляла бы пары и роняла тест. Поэтому
// упражнения здесь из тестовой библиотеки, где разметка закреплена.
test('пара называется по номеру, а подзаголовок — целевые группы пары', () => {
  const compact = { ...MANUAL, warmup: [], circuit: [], strength: ['hinge-a', 'adductors-1', 'glutes-1'], cooldown: [] };
  const { workout } = expandWorkout('my-test0001', compact, TEST_LIBRARY);
  // Порядок силовых: hinge-a (многосуставное), затем glutes-1 (целит ягодицы,
  // как и hinge-a), поэтому hinge-a идёт в пару с приводящими, а glutes-1
  // остаётся один.
  const [pair1, pair2] = ['pair1', 'pair2'].map(id => blockOf(workout, id));
  assert.deepEqual(pair1.items.map(i => i.key), ['hinge-a', 'adductors-1']);
  assert.deepEqual(pair2.items.map(i => i.key), ['glutes-1']);
  assert.deepEqual([pair1.nav, pair1.title, pair1.sub], ['Пара 1', 'Пара 1', 'Задняя поверхность бедра, ягодичные, разгибатели поясницы, приводящие']);
  assert.deepEqual([pair2.nav, pair2.title, pair2.sub], ['Пара 2', 'Пара 2', 'Ягодичные']);
});

test('пара без целевых групп называется по вспомогательным, а не пустой строкой', () => {
  // Библиотека допускает упражнение, размеченное одними долями 0.5.
  const assistOnly = { ...entry('side-leg-raise'), key: 'assist-only', load: { glutes_med: 0.5 } };
  const { workout } = expandWorkout('my-x', { ...MANUAL, strength: ['assist-only'] }, [...LIBRARY, assistOnly]);
  assert.equal(blockOf(workout, 'pair1').sub, 'Средняя и малая ягодичные');
  assert.deepEqual(validateWorkout(workout), []);
});

test('у ручной сборки 2 круга, у продвинутого 3', () => {
  const pairRounds = c => expandWorkout('my-x', c).workout.blocks.filter(b => b.id.startsWith('pair')).map(b => b.rounds);
  assert.deepEqual(pairRounds(MANUAL), [2, 2]);
  assert.deepEqual(pairRounds(GENERATED), [2, 2, 2, 2]);
  assert.deepEqual(pairRounds({ ...GENERATED, level: 'intermediate' }), [2, 2, 2, 2]);
  assert.deepEqual(pairRounds({ ...GENERATED, level: 'advanced' }), [3, 3, 3, 3]);
  assert.equal(roundsOf(MANUAL), 2);
  assert.equal(roundsOf({ ...MANUAL, level: 'beginner' }), 2);
  assert.equal(roundsOf({ ...MANUAL, level: 'advanced' }), 3);
  assert.equal(expandWorkout('my-x', { ...GENERATED, level: 'advanced' }).workout.stats[1].v, '3 + 3');
  assert.equal(expandWorkout('my-x', MANUAL).workout.stats[1].v, '3 + 2');
});

test('упражнение упора помечено focus: true, остальные без поля focus', () => {
  const { workout } = expandWorkout('my-test0001', GENERATED);
  const items = workout.blocks.flatMap(b => b.items);
  assert.deepEqual(items.filter(i => i.focus).map(i => i.key), ['glute-bridge']);
  assert.equal(items.find(i => i.key === 'glute-bridge').focus, true);
  for (const i of items.filter(i => i.key !== 'glute-bridge')) assert.ok(!('focus' in i), i.key);
  // Метка живёт на копии: запись библиотеки общая для всех тренировок.
  assert.ok(!('focus' in entry('glute-bridge')));
  const manual = expandWorkout('my-test0001', MANUAL).workout.blocks.flatMap(b => b.items);
  assert.ok(manual.every(i => !('focus' in i)));
});

test('ключ, которого нет в библиотеке, пропускается и попадает в removed; пустой блок не рисуется', () => {
  const { workout, removed } = expandWorkout('my-x', { ...MANUAL, strength: ['gone-key'] });
  assert.deepEqual(removed, ['gone-key']);
  assert.ok(!workout.blocks.some(b => b.id.startsWith('pair')));
  assert.deepEqual(validateWorkout(workout), []);
});

test('пропуски в любом слоте: removed по порядку слотов, номера блоков без дыр', () => {
  const { workout, removed } = expandWorkout('my-x', {
    ...MANUAL, warmup: ['gone-1', 'pelvic-tilt'], circuit: [], strength: ['rdl', 'gone-2'], cooldown: ['gone-3'],
  });
  assert.deepEqual(removed, ['gone-1', 'gone-2', 'gone-3']);
  assert.deepEqual(workout.blocks.map(b => b.id), ['start', 'pair1']);
  assert.deepEqual(workout.blocks.map(b => b.n), ['01', '02']);
  assert.deepEqual(workout.blocks.map(b => b.items.map(i => i.key)), [['pelvic-tilt'], ['rdl']]);
  assert.deepEqual(validateWorkout(workout), []);
});

test('библиотека передаётся параметром: чего в ней нет, то пропущено', () => {
  const library = LIBRARY.filter(e => e.key !== 'rdl');
  const { workout, removed } = expandWorkout('my-x', MANUAL, library);
  assert.deepEqual(removed, ['rdl']);
  assert.ok(!workout.blocks.flatMap(b => b.items).some(i => i.key === 'rdl'));
  assert.deepEqual(validateWorkout(workout), []);
});

test('шапка: название, дни, тексты уровня, счётчики и инвентарь', () => {
  const { workout } = expandWorkout('my-test0001', GENERATED);
  assert.equal(workout.id, 'my-test0001');
  assert.equal(workout.kicker, 'СВОЯ · НАЧАЛЬНЫЙ УРОВЕНЬ');
  assert.equal(workout.title, 'Всё тело. Упор: ягодицы');
  assert.deepEqual(workout.titleLines, ['Всё тело. Упор: ягодицы']);
  assert.equal(workout.lead, 'Подобрана по правилам для уровня «Начальный». Упор: ягодицы.');
  assert.deepEqual(workout.days, [1, 3, 5]);
  assert.deepEqual(workout.stats, [
    { v: '17', l: 'упражнений' },
    { v: '3 + 2', l: 'круга разминки + каждой пары' },
  ]);
  assert.equal(workout.equipment, 'Нужно: коврик, длинная резинка, мини-петля.');
  assert.deepEqual(workout.progression, progressionFor('beginner'));
  assert.equal(workout.caution, CAUTION);

  const manual = expandWorkout('my-test0002', MANUAL).workout;
  assert.equal(manual.kicker, 'СВОЯ · СБОРКА ИЗ БИБЛИОТЕКИ');
  assert.equal(manual.lead, 'Собрана из библиотеки упражнений.');
  assert.deepEqual(manual.progression, progressionFor(null));
  assert.equal(manual.stats[0].v, '12');
});

test('дни тренировки — копия: правка развёрнутой тренировки не трогает сжатую', () => {
  const compact = structuredClone(MANUAL);
  const { workout } = expandWorkout('my-x', compact);
  workout.days.push(7);
  assert.deepEqual(compact.days, [1, 3, 5]);
});

test('счётчик упражнений и инвентарь считают то, что вошло в тренировку', () => {
  // Пропущенное из библиотеки в тренировке не показано, значит и в счёт не идёт.
  const one = expandWorkout('my-x', { ...MANUAL, strength: ['rdl', 'gone'] }).workout;
  assert.equal(one.stats[0].v, '10');
  assert.equal(exerciseCount(MANUAL), 12);
  const noGear = expandWorkout('my-x', {
    ...MANUAL, warmup: ['pelvic-tilt'], circuit: [], strength: ['bird-dog'], cooldown: ['breathing'],
  }).workout;
  assert.equal(noGear.equipment, 'Нужно: коврик.');
  assert.deepEqual(noGear.stats[0], { v: '3', l: 'упражнения' });
});

test('развёртка не меняет ни сжатую запись, ни библиотеку', () => {
  const compact = structuredClone(GENERATED);
  const before = JSON.stringify(LIBRARY);
  expandWorkout('my-x', compact);
  assert.deepEqual(compact, GENERATED);
  assert.equal(JSON.stringify(LIBRARY), before);
});

test('самая большая тренировка укладывается в 4096 символов', () => {
  const key = i => `${'k'.repeat(37)}-${String(i).padStart(2, '0')}`; // 40 символов
  const huge = { v: 1, name: 'Ж'.repeat(NAME_MAX), days: [1, 2, 3, 4, 5, 6, 7], level: 'intermediate', zones: ['shoulders', 'core'], format: 'pairs',
    warmup: [key(1), key(2)], circuit: [key(3), key(4), key(5), key(6)], strength: Array.from({ length: MAX_STRENGTH }, (_, i) => key(10 + i)),
    focus: [[key(10), 'shoulders'], [key(11), 'core']], cooldown: [key(7), key(8), key(9)], t: 9_999_999_999_999 };
  assert.ok(serializeCompact(huge).length <= VALUE_MAX);
  // Название из символов, которые JSON пишет escape-последовательностями (кавычка
  // — два знака, управляющий символ — шесть): запас от этого не должен кончиться.
  for (const ch of ['"', '\u0001']) {
    assert.ok(serializeCompact({ ...huge, name: ch.repeat(NAME_MAX) }).length <= VALUE_MAX, JSON.stringify(ch));
  }
});

test('parseCompact отвергает битое и чужое', () => {
  for (const text of ['{', '{"v":2}', serializeCompact({ ...MANUAL, name: '   ' }), serializeCompact({ ...MANUAL, name: 'ж'.repeat(61) }),
    serializeCompact({ ...MANUAL, level: 'expert' }), serializeCompact({ ...MANUAL, days: [0] }), serializeCompact({ ...MANUAL, days: [] })]) {
    assert.equal(parseCompact(text), null, text);
  }
});

test('parseCompact проверяет форму каждого поля', () => {
  const broken = {
    'не JSON-объект': ['null', '[]', '"текст"', '42', ''],
    'версия': [serializeCompact({ ...MANUAL, v: undefined }), serializeCompact({ ...MANUAL, v: '1' })],
    'название не строка': [serializeCompact({ ...MANUAL, name: 7 }), serializeCompact({ ...MANUAL, name: null })],
    'название из неразрывных пробелов': [serializeCompact({ ...MANUAL, name: ' \t\n' })],
    'уровень из прототипа': [serializeCompact({ ...MANUAL, level: 'constructor' }), serializeCompact({ ...MANUAL, level: 'toString' })],
    'уровень не задан': [serializeCompact({ ...MANUAL, level: undefined })],
    'дни': [serializeCompact({ ...MANUAL, days: [8] }), serializeCompact({ ...MANUAL, days: [1, 1] }),
      serializeCompact({ ...MANUAL, days: [1.5] }), serializeCompact({ ...MANUAL, days: ['1'] }), serializeCompact({ ...MANUAL, days: 1 })],
    'зоны': [serializeCompact({ ...MANUAL, zones: ['nope'] }), serializeCompact({ ...MANUAL, zones: ['constructor'] }),
      serializeCompact({ ...MANUAL, zones: ['core', 'core'] }), serializeCompact({ ...MANUAL, zones: 'core' })],
    'список ключей не массив': [serializeCompact({ ...MANUAL, strength: 'rdl' }), serializeCompact({ ...MANUAL, warmup: undefined })],
    'ключ не строка или не по шаблону': [serializeCompact({ ...MANUAL, strength: [5] }), serializeCompact({ ...MANUAL, strength: [''] }),
      serializeCompact({ ...MANUAL, circuit: ['Верхний-Регистр'] }), serializeCompact({ ...MANUAL, cooldown: ['k'.repeat(41)] })],
    'повтор ключа в слоте': [serializeCompact({ ...MANUAL, strength: ['rdl', 'rdl'] })],
    'упор': [serializeCompact({ ...MANUAL, focus: [['rdl']] }), serializeCompact({ ...MANUAL, focus: [['rdl', 'nope']] }),
      serializeCompact({ ...MANUAL, focus: ['rdl'] }), serializeCompact({ ...MANUAL, focus: [[1, 'core']] }), serializeCompact({ ...MANUAL, focus: undefined })],
    'время': [serializeCompact({ ...MANUAL, t: -1 }), serializeCompact({ ...MANUAL, t: 1.5 }), serializeCompact({ ...MANUAL, t: '1' }),
      serializeCompact({ ...MANUAL, t: undefined })],
  };
  for (const [what, texts] of Object.entries(broken)) {
    for (const text of texts) assert.equal(parseCompact(text), null, `${what}: ${text}`);
  }
});

test('parseCompact принимает записи в допустимых границах и оставляет только свои поля', () => {
  for (const c of [MANUAL, GENERATED, { ...MANUAL, name: 'ж'.repeat(NAME_MAX) }, { ...MANUAL, level: 'advanced', days: [7] }, { ...MANUAL, t: 0 }]) {
    assert.deepEqual(parseCompact(serializeCompact(c)), c);
  }
  assert.deepEqual(parseCompact(serializeCompact({ ...MANUAL, чужое: 1, name: ' Моя ' })), { ...MANUAL, name: ' Моя ' });
});

test('parseCompact принимает запись, где всё пустое, и она разворачивается без блоков', () => {
  // Пустые слоты, нет уровня, зон и упора — допустимая запись: «слот не может
  // быть пустым» из неё сделало бы нечитаемую тренировку, например после замены
  // в библиотеке всех её упражнений.
  const empty = { v: 1, name: 'Пустая', days: [1], level: null, zones: [], format: 'pairs', warmup: [], circuit: [], strength: [], focus: [], cooldown: [], t: 0 };
  assert.deepEqual(parseCompact(serializeCompact(empty)), empty);
  const { workout, removed } = expandWorkout('my-empty', empty);
  assert.deepEqual(workout.blocks, []);
  assert.deepEqual(removed, []);
});

// Ключ принимает один и тот же шаблон у импорта таблицы и у чтения записи: иначе
// ключ, который библиотека приняла, делал бы тренировку нечитаемой.
test('parseCompact принимает ровно те ключи, которые принимает шаблон ключа библиотеки', () => {
  for (const key of ['a', '0', 'rdl-2', 'a'.repeat(40), 'Bad', 'rdl_2', 'a b', '', 'a'.repeat(41), 'ключ']) {
    const parsed = parseCompact(serializeCompact({ ...MANUAL, strength: [key] }));
    assert.equal(parsed !== null, KEY_PATTERN.test(key), JSON.stringify(key));
  }
});

test('название с кавычками и эмодзи переживает запись и чтение', () => {
  const c = { ...MANUAL, name: 'Мой «день» "Б" 💪' };
  assert.deepEqual(parseCompact(serializeCompact(c)), c);
});

// Запись до появления формата. Новые записи формат несут всегда, а эту читаем
// как «Пары» и не отбрасываем: у тех, кто уже собирал тренировки, она лежит в
// облаке и на устройстве.
const withoutFormat = compact => {
  const { format, ...rest } = compact;
  return rest;
};

test('parseCompact: запись без format читается как «Пары» и не отбрасывается', () => {
  const old = withoutFormat(MANUAL);
  assert.ok(!('format' in old));
  assert.deepEqual(parseCompact(serializeCompact(old)), { ...old, format: 'pairs' });
});

test('parseCompact: формат переживает запись и чтение, у любой записи он есть', () => {
  for (const format of Object.keys(FORMATS)) {
    assert.equal(parseCompact(serializeCompact({ ...MANUAL, format })).format, format, format);
  }
  for (const c of [MANUAL, GENERATED, withoutFormat(MANUAL)]) assert.ok('format' in parseCompact(serializeCompact(c)));
});

test('parseCompact: незнакомый format — «Пары», а не отказ', () => {
  for (const format of ['zzz', 'toString', 'circuit', 42, null, ['sets'], {}]) {
    const parsed = parseCompact(serializeCompact({ ...MANUAL, format }));
    assert.notEqual(parsed, null, JSON.stringify(format));
    assert.equal(parsed.format, 'pairs', JSON.stringify(format));
  }
});

test('«Пары» без format и с format: pairs разворачиваются в одну и ту же тренировку', () => {
  const library = TEST_LIBRARY;
  const compact = { ...MANUAL, warmup: [], circuit: [], strength: ['squat-a', 'hinge-a', 'row-a'], cooldown: [] };
  assert.deepEqual(expandWorkout('my-x', withoutFormat(compact), library), expandWorkout('my-x', compact, library));
});

// Четыре силовых из тестовой библиотеки и полный скелет: все три формата
// раскладывают одно и то же. Нагрузка упражнений здесь закреплена разметкой
// фикстуры, поэтому состав блоков можно называть точно.
const FULL = deepFreeze({
  v: 1, name: 'Формат', days: [1, 3, 5], level: null, zones: [], format: 'pairs',
  warmup: ['warm-1', 'warm-2'], circuit: ['circ-1', 'circ-2', 'circ-3', 'circ-4'],
  strength: ['squat-a', 'hinge-a', 'row-a', 'press-a'], focus: [],
  cooldown: ['stretch-1', 'stretch-2', 'breathing'], t: 1760000000000,
});
const FORMAT_IDS = Object.keys(FORMATS);
const expandAs = (format, changes = {}) => expandWorkout('my-fmt', { ...FULL, ...changes, format }, TEST_LIBRARY);
const strengthBlocks = workout => workout.blocks.filter(b => !SKELETON_BLOCK_IDS.includes(b.id));
const keysOf = blocks => blocks.flatMap(b => b.items.map(i => i.key));

test('все форматы дают тренировку, которая проходит схему', () => {
  for (const format of FORMAT_IDS) {
    const { workout, removed } = expandAs(format);
    assert.deepEqual(validateWorkout(workout), [], format);
    assert.deepEqual(removed, [], format);
    assert.deepEqual(workout.blocks.map(b => b.n), workout.blocks.map((_, i) => String(i + 1).padStart(2, '0')), format);
  }
});

test('«Пары»: пары по номеру, вступление у первой, кругов по уровню', () => {
  const { workout } = expandAs('pairs');
  const blocks = strengthBlocks(workout);
  assert.deepEqual(blocks.map(b => [b.id, b.nav, b.title, b.rounds, b.items.map(i => i.key)]), [
    ['pair1', 'Пара 1', 'Пара 1', 2, ['hinge-a', 'press-a']],
    ['pair2', 'Пара 2', 'Пара 2', 2, ['row-a', 'squat-a']],
  ]);
  assert.deepEqual(blocks[0].preamble, PAIR_PREAMBLE);
  assert.ok(!('preamble' in blocks[1]));
  for (const b of blocks) assert.ok(!('unit' in b), b.id);
});

test('«Круг»: один блок «Силовой круг» со всеми силовыми, вступление и подзаголовок по счёту', () => {
  const { workout } = expandAs('loop');
  assert.deepEqual(workout.blocks.map(b => b.id), ['start', 'circuit', 'loop', 'finish']);
  const [loop] = strengthBlocks(workout);
  assert.deepEqual(
    { id: loop.id, nav: loop.nav, title: loop.title, sub: loop.sub, rounds: loop.rounds, n: loop.n },
    { id: 'loop', nav: 'Силовые', title: 'Силовой круг', sub: '4 упражнения подряд', rounds: 2, n: '03' },
  );
  assert.deepEqual(loop.preamble, LOOP_PREAMBLE);
  assert.ok(!('unit' in loop));
  assert.deepEqual(loop.items.map(i => i.key), ['hinge-a', 'press-a', 'row-a', 'squat-a']);
  assert.equal(workout.blocks[0].n, '01');
  assert.equal(workout.blocks.at(-1).n, '04');
});

test('«Круг»: подзаголовок склоняет число упражнений', () => {
  const sub = strength => strengthBlocks(expandAs('loop', { strength }).workout)[0].sub;
  assert.equal(sub(['squat-a']), '1 упражнение подряд');
  assert.equal(sub(['squat-a', 'hinge-a']), '2 упражнения подряд');
  assert.equal(sub(['squat-a', 'hinge-a', 'row-a']), '3 упражнения подряд');
  assert.equal(sub(['squat-a', 'hinge-a', 'row-a', 'press-a', 'overhead-a']), '5 упражнений подряд');
  // Пропущенный ключ в счёт не идёт: на экране его нет.
  assert.equal(sub(['squat-a', 'gone-key']), '1 упражнение подряд');
});

test('«Подходы»: блок на каждое упражнение, подходы по кругам уровня, вступление у первого', () => {
  const { workout } = expandAs('sets');
  assert.deepEqual(workout.blocks.map(b => b.id), ['start', 'circuit', 'ex1', 'ex2', 'ex3', 'ex4', 'finish']);
  const blocks = strengthBlocks(workout);
  assert.deepEqual(blocks.map(b => [b.id, b.n, b.nav, b.title, b.sub, b.rounds, b.unit, b.items.map(i => i.key)]), [
    ['ex1', '03', 'Упр. 1', 'Упражнение 1', 'Задняя поверхность бедра, ягодичные, разгибатели поясницы', 2, 'sets', ['hinge-a']],
    ['ex2', '04', 'Упр. 2', 'Упражнение 2', 'Грудные, трицепс, передняя дельта', 2, 'sets', ['press-a']],
    ['ex3', '05', 'Упр. 3', 'Упражнение 3', 'Широчайшие, верх спины, задняя дельта', 2, 'sets', ['row-a']],
    ['ex4', '06', 'Упр. 4', 'Упражнение 4', 'Квадрицепсы, ягодичные', 2, 'sets', ['squat-a']],
  ]);
  assert.deepEqual(blocks[0].preamble, SETS_PREAMBLE);
  for (const b of blocks.slice(1)) assert.ok(!('preamble' in b), b.id);
});

test('подходов на упражнение столько же, сколько кругов пары: у продвинутого три', () => {
  for (const format of FORMAT_IDS) {
    const { workout } = expandAs(format, { level: 'advanced' });
    assert.deepEqual(strengthBlocks(workout).map(b => b.rounds), strengthBlocks(workout).map(() => 3), format);
  }
});

test('порядок упражнений силовой части одинаков во всех форматах и идёт по парам arrangeStrength', () => {
  const byKey = new Map(TEST_LIBRARY.map(e => [e.key, e]));
  const expected = arrangeStrength(FULL.strength.map(key => byKey.get(key))).flat().map(e => e.key);
  assert.deepEqual(expected, ['hinge-a', 'press-a', 'row-a', 'squat-a']);
  for (const format of FORMAT_IDS) {
    assert.deepEqual(keysOf(strengthBlocks(expandAs(format).workout)), expected, format);
  }
});

// Ради этого подходов и столько же, сколько кругов: пороги уровней, проверка
// покрытия и экран нагрузки от формата не должны зависеть.
test('недельная нагрузка по группам одинакова во всех трёх форматах', () => {
  const weeklyOf = format => weeklySets([expandAs(format).workout]);
  const strengthOf = format => setsByGroup(expandAs(format).workout, 'strength');
  for (const format of ['loop', 'sets']) {
    assert.deepEqual(weeklyOf(format), weeklyOf('pairs'), format);
    assert.deepEqual(strengthOf(format), strengthOf('pairs'), format);
  }
  // Не пустое равенство: нагрузка у фикстуры есть.
  assert.ok(weeklyOf('pairs').get('glutes').comparable > 0);
});

test('шапка: вторая строка по формату, с разогревом и без него', () => {
  const stat = (format, changes) => expandAs(format, changes).workout.stats[1];
  // С разогревом: «3 + кругов силовой части», подпись по формату.
  assert.deepEqual(stat('pairs'), { v: `${SKELETON.circuit.rounds} + 2`, l: 'круга разминки + каждой пары' });
  assert.deepEqual(stat('loop'), { v: '3 + 2', l: 'круга разминки + силового круга' });
  assert.deepEqual(stat('sets'), { v: '3 + 2', l: 'круга разминки + подхода на упражнение' });
  assert.deepEqual(stat('sets', { level: 'advanced' }), { v: '3 + 3', l: 'круга разминки + подхода на упражнение' });
  // Без разогрева «3 +» уходит, а число называет только силовую часть.
  assert.deepEqual(stat('pairs', { circuit: [] }), { v: '2', l: 'круга каждой пары' });
  assert.deepEqual(stat('loop', { circuit: [] }), { v: '2', l: 'силовых круга' });
  assert.deepEqual(stat('sets', { circuit: [] }), { v: '2', l: 'подхода на упражнение' });
  assert.deepEqual(stat('pairs', { circuit: [], level: 'advanced' }), { v: '3', l: 'круга каждой пары' });
  assert.deepEqual(stat('loop', { circuit: [], level: 'advanced' }), { v: '3', l: 'силовых круга' });
  assert.deepEqual(stat('sets', { circuit: [], level: 'advanced' }), { v: '3', l: 'подхода на упражнение' });
});

test('разогрев выключен: блока circuit нет, номера подряд, остальное на месте', () => {
  for (const format of FORMAT_IDS) {
    const { workout } = expandAs(format, { circuit: [] });
    assert.ok(!workout.blocks.some(b => b.id === 'circuit'), format);
    assert.deepEqual(workout.blocks.map(b => b.n), workout.blocks.map((_, i) => String(i + 1).padStart(2, '0')), format);
    assert.deepEqual(workout.blocks.filter(b => SKELETON_BLOCK_IDS.includes(b.id)).map(b => b.id), ['start', 'finish'], format);
    assert.deepEqual(validateWorkout(workout), [], format);
  }
});

test('разминка и завершение выключены: от скелета остаётся один разогрев', () => {
  const { workout } = expandAs('loop', { warmup: [], cooldown: [] });
  assert.deepEqual(workout.blocks.map(b => b.id), ['circuit', 'loop']);
  assert.equal(workout.stats[1].v, '3 + 2');
});

test('все три блока скелета пусты: остаются только силовые блоки, шапка без «3 +»', () => {
  const empty = { warmup: [], circuit: [], cooldown: [] };
  const ids = format => expandAs(format, empty).workout.blocks.map(b => b.id);
  assert.deepEqual(ids('pairs'), ['pair1', 'pair2']);
  assert.deepEqual(ids('loop'), ['loop']);
  assert.deepEqual(ids('sets'), ['ex1', 'ex2', 'ex3', 'ex4']);
  for (const format of FORMAT_IDS) {
    const { workout } = expandAs(format, empty);
    assert.deepEqual(validateWorkout(workout), [], format);
    assert.equal(workout.blocks[0].n, '01', format);
    assert.equal(workout.stats[1].v, '2', format);
    assert.equal(workout.stats[0].v, '4', format);
  }
});

test('нет силовых: силовых блоков нет ни в одном формате', () => {
  for (const format of FORMAT_IDS) {
    const { workout } = expandAs(format, { strength: [] });
    assert.deepEqual(workout.blocks.map(b => b.id), ['start', 'circuit', 'finish'], format);
    assert.deepEqual(validateWorkout(workout), [], format);
  }
});

test('id блоков скелета — start, circuit и finish; силовые блоки называются иначе', () => {
  assert.deepEqual(SKELETON_BLOCK_IDS, ['start', 'circuit', 'finish']);
  for (const format of FORMAT_IDS) {
    const { workout } = expandAs(format);
    assert.deepEqual(workout.blocks.filter(b => SKELETON_BLOCK_IDS.includes(b.id)).map(b => b.id), SKELETON_BLOCK_IDS, format);
    const strength = strengthBlocks(workout);
    assert.ok(strength.length > 0, format);
    for (const b of strength) assert.match(b.id, /^(pair\d+|loop|ex\d+)$/, format);
    // Силовые блоки — все упражнения kind strength и только они.
    assert.ok(keysOf(strength).every(key => TEST_LIBRARY.find(e => e.key === key).kind === 'strength'), format);
  }
});

test('прогрессия берёт формат записи', () => {
  for (const format of FORMAT_IDS) {
    assert.deepEqual(expandAs(format).workout.progression, progressionFor(null, format), format);
    assert.deepEqual(expandAs(format, { level: 'beginner' }).workout.progression, progressionFor('beginner', format), format);
  }
});

test('незнакомый формат в записи разворачивается как «Пары»', () => {
  assert.deepEqual(expandAs('zzz'), expandAs('pairs'));
  assert.deepEqual(expandAs('toString'), expandAs('pairs'));
});

test('формат не меняет, что вошло в тренировку: те же упражнения, счётчик и инвентарь', () => {
  const base = expandAs('pairs').workout;
  for (const format of ['loop', 'sets']) {
    const { workout } = expandAs(format);
    assert.deepEqual(workout.stats[0], base.stats[0], format);
    assert.equal(workout.equipment, base.equipment, format);
    assert.deepEqual(keysOf(workout.blocks).toSorted(), keysOf(base.blocks).toSorted(), format);
  }
});

test('развёртка в любом формате не меняет сжатую запись', () => {
  for (const format of FORMAT_IDS) {
    const compact = structuredClone({ ...FULL, format });
    expandWorkout('my-x', compact, TEST_LIBRARY);
    assert.deepEqual(compact, { ...FULL, format }, format);
  }
});
