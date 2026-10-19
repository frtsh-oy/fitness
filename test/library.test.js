import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLibrary, parseCsv, renderLibraryJs } from '../tools/import-exercises.mjs';
import { entry, item, toItem } from '../exercises/index.js';

// Снимок нынешней тренировки (см. legs-mwf-snapshot.test.js): библиотека
// обязана содержать каждое её упражнение без потерь.
const SNAPSHOT = JSON.parse(readFileSync(new URL('./fixtures/legs-mwf.json', import.meta.url), 'utf8'));

// library.js руками не правится, а прогон через импорт вывод не меняет: если
// файл разошёлся с таблицей, его правили в обход.
test('library.js совпадает с тем, что импорт построит из library.csv', () => {
  const csv = readFileSync(new URL('../exercises/library.csv', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../exercises/library.js', import.meta.url), 'utf8');
  const { entries, errors } = buildLibrary(parseCsv(csv));
  assert.deepEqual(errors, []);
  assert.equal(js, renderLibraryJs(entries));
});

test('каждое упражнение нынешней тренировки есть в библиотеке и совпадает полем в поле', () => {
  const items = SNAPSHOT.blocks.flatMap(b => b.items);
  assert.equal(items.length, 19);
  for (const it of items) assert.deepStrictEqual(JSON.parse(JSON.stringify(toItem(entry(it.key)))), it);
});

test('item() на неизвестный ключ падает с понятной ошибкой', () => {
  assert.throws(() => item('net-takogo'), /Нет упражнения «net-takogo» в библиотеке/);
});
