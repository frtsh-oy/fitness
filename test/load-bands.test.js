// Полосы недельного объёма. Проверяется главным образом попадание ТОЧНО на
// границу: ошибка на единицу здесь меняет вердикт целой группе мышц, а увидеть
// её на глаз невозможно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_BANDS, verdictFor } from '../load-bands.js';

test('ноль — отдельная полоса, а не «мало»', () => {
  assert.equal(verdictFor(0).verdict, 'не тренируется целенаправленно');
});

test('границы полос: каждое число попадает туда, куда задумано', () => {
  const at = n => verdictFor(n).verdict;
  assert.equal(at(1), 'ниже минимума');
  assert.equal(at(3), 'ниже минимума');
  assert.equal(at(4), 'поддержание');
  assert.equal(at(9), 'поддержание');
  assert.equal(at(10), 'рабочий объём');
  assert.equal(at(20), 'рабочий объём');
  assert.equal(at(21), 'у предела восстановления');
  assert.equal(at(100), 'у предела восстановления');
});

test('полосы идут по возрастанию и покрывают всё без разрывов', () => {
  const maxes = LOAD_BANDS.map(band => band.max);
  assert.deepEqual(maxes, [...maxes].sort((a, b) => a - b));
  assert.equal(maxes.at(-1), Infinity);
});

test('у каждой полосы есть обоснование и источник', () => {
  for (const band of LOAD_BANDS) {
    assert.ok(band.why.length > 0, `у полосы «${band.verdict}» нет обоснования`);
    assert.ok(band.source.startsWith('https://'), `у полосы «${band.verdict}» нет ссылки`);
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
