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

// toItem отбрасывает slot, difficulty и compound, поэтому предыдущий тест их не
// видит. Разметка библиотеки — то, по чему конструктор будет отбирать
// упражнения, и закреплена здесь отдельно: значения те, что пишет импорт.
test('тип, сложность и многосуставность записей совпадают с разметкой нынешней тренировки', () => {
  const SLOT_BY_BLOCK = { start: 'warmup', circuit: 'circuit', finish: 'cooldown' };
  const COMPOUND = new Set(['rdl', 'leg-press', 'seated-row', 'chest-press', 'mini-row']);
  let strength = 0;
  for (const block of SNAPSHOT.blocks) {
    const slot = SLOT_BY_BLOCK[block.id] ?? 'strength';
    for (const it of block.items) {
      const e = entry(it.key);
      assert.equal(e.slot, slot, `${it.key}: тип`);
      if (slot === 'strength') {
        strength++;
        assert.equal(e.difficulty, 'basic', `${it.key}: сложность`);
        assert.equal(e.compound, COMPOUND.has(it.key), `${it.key}: многосуставность`);
      } else {
        assert.equal(Object.hasOwn(e, 'difficulty'), false, `${it.key}: у несилового нет сложности`);
        assert.equal(Object.hasOwn(e, 'compound'), false, `${it.key}: у несилового нет многосуставности`);
      }
    }
  }
  // Без этого пустой обход (скажем, карта типов, в которую ничего не попало)
  // дал бы зелёный тест, который ничего не проверил.
  assert.equal(strength, 10);
});

test('item() на неизвестный ключ падает с понятной ошибкой', () => {
  assert.throws(() => item('net-takogo'), /Нет упражнения «net-takogo» в библиотеке/);
});
