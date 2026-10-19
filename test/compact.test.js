import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIBRARY, entry } from '../exercises/index.js';
import { validateWorkout } from '../workouts/schema.js';
import { MAX_STRENGTH } from '../builder/rules.js';
import { PAIR_PREAMBLE, BLOCK_TEXTS, progressionFor, CAUTION } from '../builder/texts.js';
import {
  NAME_MAX, VALUE_MAX, serializeCompact, parseCompact, roundsOf, exerciseCount, expandWorkout,
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
  v: 1, name: 'Моя тренировка', days: [1, 3, 5], level: null, zones: [],
  warmup: [...WARMUP], circuit: [...CIRCUIT], strength: ['rdl', 'adduction', 'glute-bridge'], focus: [],
  cooldown: [...COOLDOWN], t: 1760000000000,
});

// Подобранная по правилам: уровень, зона упора и упражнение упора.
const GENERATED = deepFreeze({
  v: 1, name: 'Всё тело. Упор: ягодицы', days: [1, 3, 5], level: 'beginner', zones: ['glutes'],
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

test('пара называется по номеру, а подзаголовок — целевые группы пары', () => {
  const { workout } = expandWorkout('my-test0001', MANUAL);
  // Порядок силовых: rdl (многосуставное), затем glute-bridge (целит ягодицы,
  // как и rdl), поэтому rdl идёт в пару с приводящими, а мостик остаётся один.
  const [pair1, pair2] = ['pair1', 'pair2'].map(id => blockOf(workout, id));
  assert.deepEqual(pair1.items.map(i => i.key), ['rdl', 'adduction']);
  assert.deepEqual(pair2.items.map(i => i.key), ['glute-bridge']);
  assert.deepEqual([pair1.nav, pair1.title, pair1.sub], ['Пара 1', 'Пара 1', 'Ягодичные, задняя поверхность бедра, приводящие']);
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
  assert.equal(workout.equipment, 'Нужно: коврик, длинная резинка, мини-петля');
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
  assert.equal(noGear.equipment, 'Нужно: коврик');
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
  const huge = { v: 1, name: 'Ж'.repeat(NAME_MAX), days: [1, 2, 3, 4, 5, 6, 7], level: 'intermediate', zones: ['shoulders', 'core'],
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

test('название с кавычками и эмодзи переживает запись и чтение', () => {
  const c = { ...MANUAL, name: 'Мой «день» "Б" 💪' };
  assert.deepEqual(parseCompact(serializeCompact(c)), c);
});
