// Полосы недельного объёма. Проверяется главным образом попадание ТОЧНО на
// границу: ошибка на единицу здесь меняет вердикт целой группе мышц, а увидеть
// её на глаз невозможно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOAD_BANDS, verdictFor } from '../load-bands.js';

test('ноль — отдельная полоса, а не «мало»', () => {
  assert.equal(verdictFor(0).verdict, 'не тренируется целенаправленно');
});

test('границы полос: каждое число попадает туда, куда задумано', () => {
  const at = n => verdictFor(n).verdict;
  assert.equal(at(1), 'работает, но не оптимально');
  assert.equal(at(4), 'работает, но не оптимально');
  assert.equal(at(5), 'поддержание и слабый рост');
  assert.equal(at(9), 'поддержание и слабый рост');
  assert.equal(at(10), 'рабочий объём');
  assert.equal(at(20), 'рабочий объём');
  assert.equal(at(21), 'выше нашей границы');
  assert.equal(at(100), 'выше нашей границы');
});

test('полосы идут по возрастанию и покрывают всё без разрывов', () => {
  const maxes = LOAD_BANDS.map(band => band.max);
  assert.deepEqual(maxes, [...maxes].sort((a, b) => a - b));
  assert.equal(maxes.at(-1), Infinity);
});

// «Ноль» — единственная полоса без источника, и это осознанное решение
// (определение, а не вывод исследования), а не пропуск: проверяется отдельно
// и явно, а не молчаливым допуском пустого массива у всех подряд.
test('у каждой полосы есть обоснование и basis; источники — у всех, кроме «ноль», и это осознанно', () => {
  for (const band of LOAD_BANDS) {
    assert.ok(band.why.length > 0, `у полосы «${band.verdict}» нет обоснования`);
    assert.ok(band.basis.length > 0, `у полосы «${band.verdict}» не указан basis`);
  }
  const zero = LOAD_BANDS.find(band => band.max === 0);
  assert.equal(zero.sources.length, 0,
    'у полосы «ноль» источников не должно быть — это определение, а не вывод исследования');
  for (const band of LOAD_BANDS) {
    if (band === zero) continue;
    assert.ok(band.sources.length > 0, `у полосы «${band.verdict}» нет источника`);
    for (const source of band.sources) {
      assert.ok(source.startsWith('https://'), `у полосы «${band.verdict}» ссылка не похожа на URL: ${source}`);
    }
  }
});

test('мусор на входе — ошибка, а не тихий вердикт', () => {
  assert.throws(() => verdictFor(-1), /объём не может быть отрицательным/);
  assert.throws(() => verdictFor(Number.NaN), /объём должен быть числом/);
  assert.throws(() => verdictFor('12'), /объём должен быть числом/);
});

test('таблица заморожена: вердикт не подменить на ходу', () => {
  assert.throws(() => { LOAD_BANDS[0].verdict = 'другое'; });
});

// Отдельно от предыдущего теста: там проверяется заморозка ОБЪЕКТА полосы
// (Object.freeze(band) внутри .map()), здесь — заморозка самого МАССИВА
// (внешний Object.freeze). Это два разных вызова на одной строке load-bands.js,
// и мутация, снимающая только один из них, другой тест не трогает.
test('таблица заморожена и как массив: полосу не добавить и не заменить', () => {
  assert.throws(() => { LOAD_BANDS.push(LOAD_BANDS[0]); });
  assert.throws(() => { LOAD_BANDS[0] = LOAD_BANDS[1]; });
});

// Тон красит строку недели (style.css, data-tone), и у каждой полосы он свой:
// иначе две полосы выглядели бы одинаково. Правила для тонов лежат в CSS, а не
// здесь, поэтому новая полоса без цвета тихо осталась бы серой — тест этого не
// даёт. Серый («ноль») — тон по умолчанию, отдельного правила у него нет.
test('у каждой полосы свой тон, и в style.css для него есть цвет полоски и вердикта', () => {
  const tones = LOAD_BANDS.map(band => band.tone);
  assert.equal(new Set(tones).size, tones.length, 'два тона совпали: полосы стали бы одного цвета');
  assert.equal(LOAD_BANDS.find(band => band.tone === 'none').max, 0, 'серый тон принадлежит «нулю»');
  const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
  for (const tone of tones.filter(tone => tone !== 'none')) {
    assert.match(css, new RegExp(`\\.weekly-row\\[data-tone=${tone}\\] \\.weekly-bar i\\{`), `нет цвета полоски для тона «${tone}»`);
    assert.match(css, new RegExp(`\\.weekly-row\\[data-tone=${tone}\\] \\.weekly-verdict\\{`), `нет цвета вердикта для тона «${tone}»`);
  }
});
