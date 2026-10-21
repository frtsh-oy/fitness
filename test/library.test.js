import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildLibrary, parseCsv, renderLibraryJs } from '../tools/import-exercises.mjs';
import { LIBRARY, DIFFICULTY_LABELS, PATTERN_LABELS, entry, item } from '../exercises/index.js';
import { PATTERNS } from '../workouts/schema.js';
import legsMwf from '../workouts/legs-mwf.js';

// library.js руками не правится, а прогон через импорт вывод не меняет: если
// файл разошёлся с таблицей, его правили в обход.
test('library.js совпадает с тем, что импорт построит из library.csv', () => {
  const csv = readFileSync(new URL('../exercises/library.csv', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../exercises/library.js', import.meta.url), 'utf8');
  const { entries, errors } = buildLibrary(parseCsv(csv));
  assert.deepEqual(errors, []);
  assert.equal(js, renderLibraryJs(entries));
});

// Подпись есть у каждого движения схемы, и в том же порядке: новое движение без
// подписи дало бы чип «undefined» в библиотеке, а порядок чипов — это порядок
// словаря.
test('PATTERN_LABELS: по подписи на каждое движение схемы, в порядке схемы', () => {
  assert.deepEqual(Object.keys(PATTERN_LABELS), PATTERNS);
  assert.ok(Object.values(PATTERN_LABELS).every(label => typeof label === 'string' && label !== ''));
});

// Сравнения «поле в поле» с прежним текстом тренировки здесь больше нет: оно
// служило страховкой переезда на библиотеку, а таблицу теперь правит владелец,
// и любая его правка текста, видео или разметки роняла бы его. Остались свойства,
// которые правкой таблицы не меняются: форма упражнения тренировки и то, что
// записи библиотеки лежат в тех слотах, куда их кладёт готовая тренировка.

// slot, difficulty и compound нужны только библиотеке (отбор в конструкторе);
// в упражнении тренировки схема их не знает, а всё остальное доезжает целиком.
test('item() отдаёт упражнение в форме тренировки: без slot, difficulty и compound, остальное из записи', () => {
  const LIBRARY_ONLY = ['slot', 'difficulty', 'compound'];
  for (const e of LIBRARY) {
    const it = item(e.key);
    assert.deepEqual(Object.keys(it).sort(), Object.keys(e).filter(field => !LIBRARY_ONLY.includes(field)).sort(), e.key);
    for (const field of Object.keys(it)) assert.equal(it[field], e[field], `${e.key}: ${field}`);
  }
});

// Тип записи — слот, в который её кладёт готовая тренировка; kind равен слоту, а
// у разогрева он тот же, что у разминки. Сложность и многосуставность —
// суждение владельца таблицы, и при правке их значения меняются, поэтому
// закреплена только форма: у силового они есть, у остальных нет.
test('записи упражнений готовой тренировки: тип совпадает с блоком, сложность и многосуставность только у силовых', () => {
  const SLOT_BY_BLOCK = { start: 'warmup', circuit: 'circuit', finish: 'cooldown' };
  let strength = 0;
  for (const block of legsMwf.blocks) {
    const slot = SLOT_BY_BLOCK[block.id] ?? 'strength';
    for (const { key } of block.items) {
      const e = entry(key);
      assert.ok(e, `${key}: нет в библиотеке`);
      assert.equal(e.slot, slot, `${key}: тип`);
      assert.equal(e.kind, slot === 'circuit' ? 'warmup' : slot, `${key}: kind`);
      if (slot === 'strength') {
        strength++;
        assert.ok(Object.hasOwn(DIFFICULTY_LABELS, e.difficulty), `${key}: сложность «${e.difficulty}»`);
        assert.equal(typeof e.compound, 'boolean', `${key}: многосуставность`);
      } else {
        assert.equal(Object.hasOwn(e, 'difficulty'), false, `${key}: у несилового нет сложности`);
        assert.equal(Object.hasOwn(e, 'compound'), false, `${key}: у несилового нет многосуставности`);
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
