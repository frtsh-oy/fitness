import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout, countMarks } from '../workouts/schema.js';
import legsMwf from '../workouts/legs-mwf.js';
import { getWorkout, DEFAULT_WORKOUT_ID, WORKOUTS } from '../workouts/index.js';

test('тренировка проходит валидацию схемы', () => {
  assert.deepEqual(validateWorkout(legsMwf), []);
});

// README обещает: «добавили workouts/<id>.js, зарегистрировали в WORKOUTS,
// npm test проверит форму разметки». Это правда только если что-то в наборе
// тестов действительно проходит по ВСЕМУ реестру, а не только по legs-mwf,
// импортированному выше напрямую, — иначе новая тренировка со сломанной
// схемой прошла бы npm test молча.
test('каждая тренировка в реестре WORKOUTS проходит валидацию схемы', () => {
  const entries = Object.entries(WORKOUTS);
  // Пустой реестр дал бы пустой цикл и молчаливый зелёный тест, который на
  // самом деле ничего не проверил, — ровно та ситуация, которую этот тест
  // должен ловить, если регистрация тренировки где-то потеряется.
  assert.ok(entries.length > 0, 'реестр WORKOUTS пуст — тест ничего не проверяет');
  for (const [id, workout] of entries) {
    assert.deepEqual(validateWorkout(workout), [], `${id}: схема не прошла валидацию`);
  }
});

test('в тренировке 8 блоков и 19 упражнений', () => {
  assert.equal(legsMwf.blocks.length, 8);
  assert.equal(legsMwf.blocks.flatMap(b => b.items).length, 19);
});

test('порядок и идентификаторы блоков совпадают с оригиналом', () => {
  assert.deepEqual(
    legsMwf.blocks.map(b => b.id),
    ['start', 'circuit', 'legs1', 'legs2', 'legs3', 'upper1', 'upper2', 'finish'],
  );
});

test('всего 37 отметок, как на исходном сайте', () => {
  assert.equal(countMarks(legsMwf), 37);
});

test('каждое силовое упражнение имеет хотя бы одну целевую группу', () => {
  for (const item of legsMwf.blocks.flatMap(b => b.items)) {
    if (item.kind !== 'strength') continue;
    const primary = Object.values(item.load).filter(v => v === 1);
    assert.ok(primary.length >= 1, `«${item.name}»: нет группы с load 1`);
  }
});

test('приводящие и средняя ягодичная размечены — программа заявлена на них', () => {
  const load = legsMwf.blocks.flatMap(b => b.items).map(i => i.load);
  assert.ok(load.some(l => l.adductors === 1), 'нет упражнения с целевыми приводящими');
  assert.ok(load.some(l => l.glutes_med === 1), 'нет упражнения с целевой средней ягодичной');
});

test('средняя ягодичная набирает подходы более чем в одном упражнении', () => {
  const withGlutesMed = legsMwf.blocks
    .flatMap(b => b.items)
    .filter(i => 'glutes_med' in i.load);
  assert.ok(
    withGlutesMed.length > 1,
    `средняя ягодичная размечена только в ${withGlutesMed.length} упражнении(ях), а программа заявлена на неё`,
  );
});

test('у каждого блока есть короткая подпись nav, отличная от заголовка', () => {
  assert.deepEqual(
    legsMwf.blocks.map(b => b.nav),
    ['Старт', 'Разогрев', 'Ноги 1', 'Ноги 2', 'Ноги 3', 'Верх 1', 'Верх 2', 'Финиш'],
  );
});

test('заголовок разбит на две строки как в оригинальной вёрстке', () => {
  assert.deepEqual(legsMwf.titleLines, ['Всё тело.', 'Акцент на ноги.']);
});

test('реестр отдаёт тренировку по id и падает на дефолт при неизвестном', () => {
  assert.equal(getWorkout('legs-mwf').id, 'legs-mwf');
  assert.equal(getWorkout('нет-такой').id, DEFAULT_WORKOUT_ID);
  assert.equal(getWorkout(undefined).id, DEFAULT_WORKOUT_ID);
});
