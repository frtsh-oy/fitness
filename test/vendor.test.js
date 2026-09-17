import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import createBodyHighlighter, { MuscleType, ModelType, normalizeMuscle } from '../vendor/body-highlighter.esm.js';

test('библиотека импортируется и отдаёт фабрику', () => {
  assert.equal(typeof createBodyHighlighter, 'function');
});

test('словарь мышц содержит регионы, на которые мы рассчитываем', () => {
  const values = new Set(Object.values(MuscleType));
  for (const region of ['gluteal', 'abductors', 'quadriceps', 'hamstring', 'adductor',
                        'calves', 'abs', 'obliques', 'lower-back', 'upper-back',
                        'trapezius', 'chest', 'front-deltoids', 'back-deltoids',
                        'biceps', 'triceps', 'forearm']) {
    assert.ok(values.has(region), `в библиотеке нет региона ${region}`);
  }
});

test('есть оба вида модели', () => {
  assert.deepEqual([ModelType.ANTERIOR, ModelType.POSTERIOR], ['anterior', 'posterior']);
});

test('normalizeMuscle приводит неканоническое имя к канону', () => {
  // Проверяем реальную нормализацию: неканоническое имя → каноническое
  assert.equal(normalizeMuscle('Pectoralis Major'), 'chest');
  assert.equal(normalizeMuscle('gluteus maximus'), 'gluteal');
  assert.equal(normalizeMuscle('Biceps Brachii'), 'biceps');
  // И оставляет канонические имена на месте
  assert.equal(normalizeMuscle('chest'), 'chest');
  assert.equal(normalizeMuscle('trapezius'), 'trapezius');
});

test('сборка самодостаточна: внутри нет внешних импортов', () => {
  const src = readFileSync(new URL('../vendor/body-highlighter.esm.js', import.meta.url), 'utf8');
  // Ловим статический import ... from '...'
  const staticImports = [...src.matchAll(/(?:^|\n)\s*import[^;]*from\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  // Ловим динамический import('...')
  const dynamicImports = [...src.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);
  // Ловим require('...')
  const requireCalls = [...src.matchAll(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m => m[1]);

  const allImports = [...staticImports, ...dynamicImports, ...requireCalls];
  assert.deepEqual(allImports, [], `сборка тянет ${allImports.join(', ')}`);
});

test('лицензия MIT сохранена полностью', () => {
  const text = readFileSync(new URL('../vendor/body-highlighter.LICENSE', import.meta.url), 'utf8');
  assert.match(text, /MIT License/, 'заголовок лицензии');
  assert.match(text, /Permission is hereby granted/, 'текст разрешения');
  assert.match(text, /THE SOFTWARE IS PROVIDED .* WITHOUT WARRANTY/, 'отказ от ответственности');
});

test('лицензия MI скопирована в шапку ESM сборки', () => {
  const src = readFileSync(new URL('../vendor/body-highlighter.esm.js', import.meta.url), 'utf8');
  assert.match(src, /MIT License/, 'заголовок лицензии в сборке');
  assert.match(src, /Permission is hereby granted/, 'текст разрешения в сборке');
  assert.match(src, /WITHOUT WARRANTY/, 'отказ от ответственности в сборке');
});
