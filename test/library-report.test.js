import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibraryReport } from '../tools/library-report.js';
import { ZONES } from '../builder/rules.js';
import { LIBRARY } from '../exercises/index.js';
import { TEST_LIBRARY, onlyOneFor } from './fixtures/test-library.js';

const ZONE_LABELS = Object.values(ZONES).map(zone => zone.label);
const zoneLines = state => ZONE_LABELS.map(label => `  упор «${label}»: ${state}`);

test('нынешняя библиотека: начальный уровень называет шесть групп без базового упражнения', () => {
  // Без аргумента отчёт строится по настоящей библиотеке.
  assert.ok(buildLibraryReport().includes(
    'Начальный: нет базовых упражнений на: икроножные, прямая мышца живота, косые мышцы живота, передняя дельта, задняя дельта, бицепс.'));
  assert.deepEqual(buildLibraryReport(), buildLibraryReport(LIBRARY));
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
  const lines = buildLibraryReport(LIBRARY.filter(e => e.key !== 'chest-press'));
  assert.ok(lines.some(line => /^Средний: нет базовых и средних упражнений на: .*грудные/.test(line)));
  assert.ok(lines.some(line => /^Продвинутый: нет упражнений на: .*грудные/.test(line)));
});
