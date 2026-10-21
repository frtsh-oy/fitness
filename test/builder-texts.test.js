import { test } from 'node:test';
import assert from 'node:assert/strict';
import legsMwf from '../workouts/legs-mwf.js';
import { LIBRARY, entry } from '../exercises/index.js';
import {
  plural, PAIR_PREAMBLE, BLOCK_TEXTS, CAUTION, progressionFor, kickerFor, leadFor, equipmentFor, defaultName,
} from '../builder/texts.js';

const FORMS = ['упражнение', 'упражнения', 'упражнений'];

test('plural выбирает форму по русским правилам, включая 11–14 и сотни', () => {
  const cases = {
    0: 'упражнений', 1: 'упражнение', 2: 'упражнения', 4: 'упражнения', 5: 'упражнений',
    10: 'упражнений', 11: 'упражнений', 12: 'упражнений', 14: 'упражнений',
    21: 'упражнение', 22: 'упражнения', 25: 'упражнений',
    100: 'упражнений', 101: 'упражнение', 111: 'упражнений', 112: 'упражнений', 122: 'упражнения',
  };
  for (const [n, word] of Object.entries(cases)) assert.equal(plural(Number(n), FORMS), word, n);
});

// Вступление к силовым парам и тексты блоков — те же слова, что в готовой
// тренировке. Сверка с legs-mwf.js, а не второй набранный руками экземпляр:
// правка там без правки здесь развела бы две тренировки, и тест это скажет.
test('вступление пары дословно совпадает с блоком legs1 готовой тренировки', () => {
  const legs1 = legsMwf.blocks.find(b => b.id === 'legs1');
  assert.deepEqual(PAIR_PREAMBLE, legs1.preamble);
});

test('тексты блоков старта и завершения совпадают с готовой тренировкой', () => {
  for (const [key, id] of [['start', 'start'], ['finish', 'finish']]) {
    const block = legsMwf.blocks.find(b => b.id === id);
    const { nav, title, sub } = BLOCK_TEXTS[key];
    assert.deepEqual({ nav, title, sub }, { nav: block.nav, title: block.title, sub: block.sub });
  }
  const circuit = legsMwf.blocks.find(b => b.id === 'circuit');
  assert.equal(BLOCK_TEXTS.circuit.nav, circuit.nav);
  assert.equal(BLOCK_TEXTS.circuit.title, circuit.title);
  assert.equal(BLOCK_TEXTS.circuit.note, circuit.note);
  // Подзаголовок разогрева у своей тренировки другой: «знакомого блока» у неё нет.
  assert.equal(BLOCK_TEXTS.circuit.sub, 'Повышает пульс, резинки лёгкие');
});

test('памятка о боли дословно', () => {
  assert.equal(CAUTION, 'При острой боли в суставе прекрати вызывающее её упражнение. Не увеличивай сопротивление через боль. Если боль повторяется, сохраняется после тренировки или появляется отёк, обратись к врачу или физиотерапевту.\n\nУпражнения укрепляют мышцы, но не убирают жир только в одной выбранной зоне. Оценивай прогресс по силе, технике и изменениям тела со временем.');
});

const REPS_UP = 'Сделала на 1–2 повтора больше верхней границы в обоих подходах на двух тренировках подряд? Возьми резинку жёстче или перехвати её короче и вернись к нижней границе.';
const FORM_KEEP = 'Сохраняй амплитуду и контроль. Если приходится раскачиваться, более тугая резинка пока не подходит.';

test('прогрессия новичка: круги и запас уровня, ориентир ACSM четвёртым пунктом', () => {
  assert.deepEqual(progressionFor('beginner'), [
    'Сохраняй 2 круга каждой силовой пары. Заканчивай подход с запасом 3–4 повторов до отказа.',
    REPS_UP,
    FORM_KEEP,
    'Новичкам Американская коллегия спортивной медицины (ACSM) советует нагрузку примерно на 8–12 повторов. Если у упражнения дозировка больше, ориентируйся на неё и на запас повторов.',
  ]);
});

test('прогрессия других уровней и ручной сборки: три пункта, круги и запас свои', () => {
  const first = level => progressionFor(level)[0];
  assert.equal(first('intermediate'), 'Сохраняй 2 круга каждой силовой пары. Заканчивай подход с запасом 2–3 повторов до отказа.');
  assert.equal(first('advanced'), 'Сохраняй 3 круга каждой силовой пары. Заканчивай подход с запасом 1–2 повторов до отказа.');
  assert.equal(first(null), 'Сохраняй 2 круга каждой силовой пары. Заканчивай подход с запасом 2–3 повторов до отказа.');
  for (const level of ['intermediate', 'advanced', null]) {
    assert.deepEqual(progressionFor(level).slice(1), [REPS_UP, FORM_KEEP], String(level));
  }
});

test('название: без зон «Всё тело», с зонами — упор строчными; две зоны через «и», а при «и» в названии зоны — через запятую', () => {
  assert.equal(defaultName([]), 'Всё тело');
  assert.equal(defaultName(['glutes', 'back']), 'Всё тело. Упор: ягодицы и спина');
  assert.equal(defaultName(['legs', 'glutes']), 'Всё тело. Упор: ноги и ягодицы');
  assert.equal(defaultName(['arms']), 'Всё тело. Упор: руки');
  // «Пресс и кор» уже содержит «и»: ещё один «и» рядом читался бы как три зоны.
  assert.equal(defaultName(['core', 'glutes']), 'Всё тело. Упор: пресс и кор, ягодицы');
  assert.equal(defaultName(['shoulders', 'core']), 'Всё тело. Упор: плечи, пресс и кор');
});

test('kickerFor: уровень заглавными или сборка из библиотеки', () => {
  assert.equal(kickerFor('beginner'), 'СВОЯ · НАЧАЛЬНЫЙ УРОВЕНЬ');
  assert.equal(kickerFor('intermediate'), 'СВОЯ · СРЕДНИЙ УРОВЕНЬ');
  assert.equal(kickerFor('advanced'), 'СВОЯ · ПРОДВИНУТЫЙ УРОВЕНЬ');
  assert.equal(kickerFor(null), 'СВОЯ · СБОРКА ИЗ БИБЛИОТЕКИ');
});

test('leadFor: по правилам уровня (с упором, если он есть) или из библиотеки', () => {
  assert.equal(leadFor('intermediate', []), 'Подобрана по правилам для уровня «Средний».');
  assert.equal(leadFor('beginner', ['glutes']), 'Подобрана по правилам для уровня «Начальный». Упор: ягодицы.');
  assert.equal(leadFor('advanced', ['core', 'glutes']), 'Подобрана по правилам для уровня «Продвинутый». Упор: пресс и кор, ягодицы.');
  assert.equal(leadFor(null, []), 'Собрана из библиотеки упражнений.');
  // У ручной сборки упора нет: правил уровня за ней не стоит.
  assert.equal(leadFor(null, ['glutes']), 'Собрана из библиотеки упражнений.');
});

test('equipmentFor: коврик и подписи инвентаря в постоянном порядке, «ничего» не пишется', () => {
  const byGear = gear => LIBRARY.find(e => e.gear.length === 1 && e.gear[0] === gear);
  const band = byGear('band_long');
  const loop = byGear('loop_short');
  const none = byGear('none');
  // Точка в конце — как у строки готовой тренировки («Нужно: …, стена.»): на
  // одном экране они должны выглядеть одинаково.
  assert.equal(equipmentFor([]), 'Нужно: коврик.');
  assert.equal(equipmentFor([none]), 'Нужно: коврик.');
  assert.equal(equipmentFor([loop, none]), 'Нужно: коврик, мини-петля.');
  assert.equal(equipmentFor([band, none]), 'Нужно: коврик, длинная резинка.');
  assert.equal(equipmentFor([loop, band, band]), 'Нужно: коврик, длинная резинка, мини-петля.');
  assert.equal(equipmentFor([band, loop]), 'Нужно: коврик, длинная резинка, мини-петля.');
  // Упражнение с двумя видами инвентаря (если появится) называет оба.
  assert.equal(equipmentFor([{ ...entry('rdl'), gear: ['loop_short', 'band_long'] }]), 'Нужно: коврик, длинная резинка, мини-петля.');
});

// Порядок строки «Нужно» — порядок словаря gear.js, а не порядок упражнений или
// записи у упражнения. Записи свои: нужен только gear.
test('equipmentFor: новые виды инвентаря идут в порядке словаря и не повторяются', () => {
  const needs = (...gear) => ({ gear });
  assert.equal(equipmentFor([needs('kettlebell'), needs('dumbbells'), needs('band_handles')]),
    'Нужно: коврик, резинка с ручками, гантели, гиря.');
  assert.equal(equipmentFor([needs('kettlebell', 'loop_short'), needs('dumbbells', 'band_long'), needs('none')]),
    'Нужно: коврик, длинная резинка, мини-петля, гантели, гиря.');
  assert.equal(equipmentFor([needs('dumbbells'), needs('dumbbells', 'none')]), 'Нужно: коврик, гантели.');
});
