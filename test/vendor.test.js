import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import createBodyHighlighter, { MuscleType, ModelType, normalizeMuscle } from '../vendor/body-highlighter.esm.js';

test('библиотека импортируется и отдаёт фабрику', () => {
  assert.equal(typeof createBodyHighlighter, 'function');
});

test('содержимое вендорного файла привязано контрольной суммой', () => {
  // Зачем сумма, когда есть шесть проверок ниже: они сторожат отдельные
  // свойства сборки (импорт, словарь, виды, нормализацию, самодостаточность,
  // лицензию), но не её геометрию. А координаты стоп, кистей и головы в
  // figure.js сняты ровно с полигонов ЭТОЙ сборки: сдвинься они — и фигура
  // разъедется, а все проверки ниже останутся зелёными. Сумма закрывает файл
  // целиком.
  //
  // Сверить с пакетом на npm нельзя и не нужно: сети в тестах нет, а шапка
  // самого файла документирует два намеренных отличия от опубликованной
  // сборки (вписан полный текст MIT, убрана строка sourceMappingURL) — то
  // есть побайтно он ей не равен по построению.
  //
  // Если правка вендора когда-нибудь понадобится (обновление версии), порядок
  // такой: правим файл, перепроверяем по новой геометрии координаты в
  // figure.js, и только потом ставим сюда новую сумму.
  const bytes = readFileSync(new URL('../vendor/body-highlighter.esm.js', import.meta.url));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    'ff3cf6c6d31c7ed79e669fe934a0852efda92359811ab72f16c82b7e87c3de13',
    'содержимое vendor/body-highlighter.esm.js изменилось — см. комментарий выше',
  );
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

test('лицензия MIT скопирована в шапку ESM сборки', () => {
  const src = readFileSync(new URL('../vendor/body-highlighter.esm.js', import.meta.url), 'utf8');
  assert.match(src, /MIT License/, 'заголовок лицензии в сборке');
  assert.match(src, /Permission is hereby granted/, 'текст разрешения в сборке');
  assert.match(src, /WITHOUT WARRANTY/, 'отказ от ответственности в сборке');
});
