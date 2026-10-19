import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibraryReport } from '../tools/library-report.js';
import { availability } from '../builder/generator.js';
import { ZONES } from '../builder/rules.js';
import { LIBRARY } from '../exercises/index.js';
import { TEST_LIBRARY, onlyOneFor, withoutTargets } from './fixtures/test-library.js';

const ZONE_LABELS = Object.values(ZONES).map(zone => zone.label);
const zoneLines = state => ZONE_LABELS.map(label => `  упор «${label}»: ${state}`);

test('без аргумента отчёт строится по настоящей библиотеке', () => {
  assert.deepEqual(buildLibraryReport(), buildLibraryReport(LIBRARY));
});

// Конкретных строк про настоящую библиотеку здесь нет: чего в ней не хватает,
// меняется с каждой правкой таблицы, и тест краснел бы от того, что стало лучше.
// Формат закреплён на библиотеках, у которых нехватка задана самой фикстурой.
test('начальный уровень называет все основные группы без базового упражнения', () => {
  const library = withoutTargets(['calves', 'abs', 'obliques', 'delts_front', 'delts_rear', 'biceps']);
  assert.ok(buildLibraryReport(library).includes(
    'Начальный: нет базовых упражнений на: икроножные, прямая мышца живота, косые мышцы живота, передняя дельта, задняя дельта, бицепс.'));
});

// Четыре подписи зоны в порядке тяжести, и каждая встречается: у начального
// уровня нет базовых на икроножные и на пресс, у любого уровня на грудь одно
// упражнение. Тяжесть решает, какая подпись стоит, когда причин несколько:
// - «Ноги»: на икроножные нет ни одного (уровень не закрыт);
// - «Пресс и кор»: нет ни одного на пресс, и к тому же второго упражнения на ту
//   же группу нет (zones.core ложно) — стоит «нет ни одного», а не «не хватает второго»;
// - «Грудь»: ни одной пропавшей группы, но второго на ту же группу нет — стоит
//   «не хватает второго», хотя уровень не закрыт;
// - остальные зоны годятся, но уровень не закрыт у начального;
// - у среднего и продвинутого все группы закрыты, и годные зоны помечены «можно».
test('подпись зоны называет причину по тяжести: все четыре подписи', () => {
  const dropped = ['calves-1', 'calves-2', 'abs-1', 'abs-2', 'crunch-a', 'crunch-b', 'obliques-2'];
  const library = onlyOneFor('chest').filter(entry => !dropped.includes(entry.key));
  // Условия теста: на «Пресс и кор» у начального уровня сразу обе причины.
  const beginner = availability(library, 'beginner');
  assert.deepEqual(beginner.missing, ['calves', 'abs']);
  assert.equal(beginner.zones.core, false);
  assert.equal(beginner.zones.chest, false);

  const closed = 'на зону хватает, но сначала нужны упражнения на весь уровень';
  const second = 'не хватает второго упражнения на ту же группу';
  const zone = (label, state) => `  упор «${label}»: ${state}`;
  const upper = [
    zone('Ягодицы', 'можно'), zone('Спина', 'можно'), zone('Грудь', second),
    zone('Плечи', 'можно'), zone('Руки', 'можно'), zone('Пресс и кор', 'можно'),
  ];
  assert.deepEqual(buildLibraryReport(library), [
    'Начальный: нет базовых упражнений на: икроножные, прямая мышца живота.',
    zone('Ноги', 'нет ни одного упражнения на: икроножные'),
    zone('Ягодицы', closed), zone('Спина', closed), zone('Грудь', second),
    zone('Плечи', closed), zone('Руки', closed),
    zone('Пресс и кор', 'нет ни одного упражнения на: прямая мышца живота'),
    'Средний: все основные группы закрыты.', zone('Ноги', 'можно'), ...upper,
    'Продвинутый: все основные группы закрыты.', zone('Ноги', 'можно'), ...upper,
  ]);
});

test('богатая библиотека: все группы закрыты, у каждого уровня по строке на зону', () => {
  assert.deepEqual(buildLibraryReport(TEST_LIBRARY), [
    'Начальный: все основные группы закрыты.', ...zoneLines('можно'),
    'Средний: все основные группы закрыты.', ...zoneLines('можно'),
    'Продвинутый: все основные группы закрыты.', ...zoneLines('можно'),
  ]);
});

test('зона, на которую целевое упражнение одно, помечена: нужно второе на ту же группу', () => {
  const lines = buildLibraryReport(onlyOneFor('chest'));
  assert.ok(lines.includes('  упор «Грудь»: не хватает второго упражнения на ту же группу'));
  assert.ok(lines.includes('  упор «Ноги»: можно'));
  assert.equal(lines.filter(line => line.includes('не хватает')).length, 3);
});

test('строка уровня называет пул этого уровня', () => {
  const lines = buildLibraryReport(withoutTargets(['chest']));
  assert.ok(lines.some(line => /^Средний: нет базовых и средних упражнений на: .*грудные/.test(line)));
  assert.ok(lines.some(line => /^Продвинутый: нет упражнений на: .*грудные/.test(line)));
});
