import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout, countMarks, NO_LOAD_PATTERN } from '../workouts/schema.js';
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

// Разметка есть у КАЖДОГО упражнения, включая растяжки и подвижность: иначе
// клик по мышце на карте тела не покажет растяжку на неё.
//
// Исключение одно — восстановительное упражнение, помеченное
// NO_LOAD_PATTERN: оно не тренирует ничего, и пустой load у него утверждение,
// а не пропуск. Список таких упражнений тест держит дословно: пометить этим
// pattern ещё одно упражнение можно только осознанно, а не мимоходом, обойдя
// правило схемы.
test('непустая разметка мышц у каждого упражнения, кроме восстановительного', () => {
  const items = legsMwf.blocks.flatMap(b => b.items);
  const noLoad = items.filter(i => i.pattern === NO_LOAD_PATTERN);
  assert.deepEqual(noLoad.map(i => i.key), ['breathing']);
  for (const item of items) {
    if (item.pattern === NO_LOAD_PATTERN) {
      assert.deepEqual(item.load, {},
        `«${item.name}»: восстановительное упражнение не должно нагружать ничего`);
      continue;
    }
    assert.ok(Object.keys(item.load).length > 0, `«${item.name}»: пустой load`);
  }
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

// Икроножные размечены после сообщения человека, который тренируется по этой
// программе: он отчётливо чувствует голень, а карта показывала её нетронутой.
// Отдельного упражнения на икры в программе нет, поэтому везде 0.5 —
// вспомогательная работа: удержание стопы и равновесия. Тест сторожит и состав
// списка (пятое упражнение добавили бы, не подумав), и долю (1 означала бы
// целевую группу, то есть «программа тренирует икры», что неправда).
test('икроножные размечены вспомогательными ровно в четырёх упражнениях', () => {
  const withCalves = legsMwf.blocks.flatMap(b => b.items).filter(i => 'calves' in i.load);
  assert.deepEqual(
    withCalves.map(i => i.key),
    ['chinese-squat', 'knee-raise', 'glute-bridge', 'leg-press'],
  );
  for (const item of withCalves) {
    assert.equal(item.load.calves, 0.5, `«${item.name}»: икроножные должны быть вспомогательными`);
  }
});

// Хват резинки (Task 11): владелец программы решил размечать нагрузку от
// хвата предплечьям. Список дословно из брифа, доля везде 0.5 — хват не цель
// ни одного из этих упражнений. Тест сторожит и состав (лишнее или забытое
// упражнение сдвинуло бы силовую сумму предплечий с шести подходов), и долю.
test('предплечья размечены вспомогательными ровно в семи упражнениях — хват резинки', () => {
  const withForearms = legsMwf.blocks.flatMap(b => b.items).filter(i => 'forearms' in i.load);
  assert.deepEqual(
    withForearms.map(i => i.key),
    ['overhead-pull-apart', 'rdl', 'leg-press', 'seated-row', 'chest-press', 'mini-row', 'overhead-extension'],
  );
  for (const item of withForearms) {
    assert.equal(item.load.forearms, 0.5, `«${item.name}»: хват должен быть вспомогательной нагрузкой`);
  }
});

// Соглашение разметки хвата (записано как правило в docs/muscle-map.md):
// длинная резинка (band_long) в этой программе не имеет отдельных креплений
// и держится только руками — анкера вроде двери или турника в списке
// инвентаря нет (см. equipment в workouts/legs-mwf.js: коврик, резинки,
// стена для равновесия), поэтому хват при ней есть всегда, и предплечьям
// обязана достаться доля нагрузки. Проверка идёт по всему реестру WORKOUTS,
// а не только по legs-mwf, ровно по той же причине, что и «каждая тренировка
// в реестре проходит валидацию схемы» выше: иначе новая тренировка с
// забытым хватом у band_long прошла бы npm test молча.
//
// Вторую половину правила — что короткая петля (loop_short) даёт хват, только
// когда её держат руками, а не когда надевают на ногу, — тестом не закрепляю.
// В данных нет поля вроде «как держат»: это решает свободный текст описания
// упражнения (text/detail), а не gear. Тест, который цеплялся бы за слово в
// строке text ради этого различения, был бы подгонкой под формулировки
// сегодняшних шести loop_short-упражнений, а не проверкой инвентаря: он ловил
// бы не пропущенный хват, а всего лишь непривычную фразу в описании. Эта
// половина остаётся решением человека при разметке, объяснённым в
// docs/muscle-map.md, а не проверкой schema.js — как и вся семантика load,
// которую schema.js сознательно не оценивает (см. её комментарии).
test('у каждого упражнения с band_long размечен хват — предплечья', () => {
  const items = Object.values(WORKOUTS).flatMap(w => w.blocks.flatMap(b => b.items));
  const withBandLong = items.filter(i => i.gear.includes('band_long'));
  assert.ok(withBandLong.length > 0, 'в реестре нет ни одного упражнения с band_long — тест ничего не проверяет');
  for (const item of withBandLong) {
    assert.ok('forearms' in item.load,
      `«${item.name}»: длинную резинку держат руками, а предплечья не размечены`);
  }
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
