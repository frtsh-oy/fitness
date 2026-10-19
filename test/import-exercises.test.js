import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MUSCLES } from '../muscles.js';
import { PATTERNS, validateWorkout, itemProblems } from '../workouts/schema.js';
import {
  COLUMNS, KEY_PATTERN, parseCsv, parseYoutube, formatStart, buildLibrary, renderLibraryJs,
} from '../tools/import-exercises.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'tools', 'import-exercises.mjs');

const BASE = { 'Ключ': 'rdl', 'Название': 'Румынская тяга', 'Тип': 'силовое', 'Паттерн': 'наклон от таза',
  'Мышцы (подпись)': 'Ягодицы', 'Дозировка': '10–15 раз', 'Техника': 'Текст',
  'Видео': 'https://www.youtube.com/watch?v=9aLdnLtIBhY&t=4s', 'Инвентарь': 'длинная резинка',
  'Одностороннее': 'нет', 'Сложность': 'базовое', 'Многосуставное': 'да',
  'Ягодичные': '1', 'Задняя поверхность бедра': '1', 'Разгибатели поясницы': '0,5' };
const row = (o = {}) => COLUMNS.map(c => ({ ...BASE, ...o })[c] ?? '');
const build = (rows, options) => buildLibrary([COLUMNS, ...rows], options);
const errorsOf = (rows, options) => build(rows, options).errors;

// Разметки нагрузки нет вовсе: нужна и для «восстановления», и чтобы проверить
// отказ у остальных паттернов.
const NO_LOAD = { 'Ягодичные': '', 'Задняя поверхность бедра': '', 'Разгибатели поясницы': '' };
// Завершение без сложности и многосуставности: эти колонки у несиловых пусты.
const COOLDOWN = { 'Тип': 'завершение', 'Паттерн': 'растяжка', 'Сложность': '', 'Многосуставное': '' };

// Как отдаёт таблицу Google Sheets: BOM, CRLF, ячейки с запятой, кавычкой или
// переносом строки — в кавычках.
function toCsv(records) {
  const cell = v => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return '\uFEFF' + records.map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

const tmpDirs = [];
function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'import-exercises-'));
  tmpDirs.push(dir);
  return dir;
}
after(() => { for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true }); });

// ── сборка библиотеки ────────────────────────────────────────────────────────

test('правильная строка становится упражнением библиотеки', () => {
  assert.deepEqual(build([row()]), { errors: [], entries: [{ key: 'rdl', slot: 'strength', name: 'Румынская тяга',
    muscles: 'Ягодицы', reps: '10–15 раз', text: 'Текст', v: ['9aLdnLtIBhY', 4, '0:04'],
    load: { glutes: 1, hamstrings: 1, lower_back: 0.5 }, pattern: 'hinge', gear: ['band_long'],
    unilateral: false, kind: 'strength', difficulty: 'basic', compound: true }] });
});

test('0,5 и 0.5 дают одно и то же', () => {
  const comma = build([row({ 'Разгибатели поясницы': '0,5' })]);
  const dot = build([row({ 'Разгибатели поясницы': '0.5' })]);
  assert.deepEqual(dot, comma);
  assert.equal(dot.entries[0].load.lower_back, 0.5);
});

test('все ошибки печатаются разом, с номером строки и колонкой', () => {
  const { entries, errors } = build([row({ 'Ключ': 'Bad Key' }), row({ 'Ключ': 'x', 'Тип': 'кардио' }), row({ 'Ключ': 'y', 'Ягодичные': '2' })]);
  assert.equal(entries, null);
  assert.deepEqual(errors, [
    'Строка 2, «Ключ»: только строчная латиница, цифры и дефис, до 40 символов — получено «Bad Key»',
    'Строка 3, «Тип»: одно из «разминка», «разогрев», «силовое», «завершение» — получено «кардио»',
    'Строка 4, «Ягодичные»: пусто, 1 или 0,5 — получено «2»',
  ]);
});

test('несколько ошибок в одной строке идут в порядке колонок', () => {
  assert.deepEqual(errorsOf([row({ 'Название': '', 'Инвентарь': 'гантели', 'Одностороннее': '', 'Ягодичные': '3' })]), [
    'Строка 2, «Название»: не может быть пустым',
    'Строка 2, «Инвентарь»: через запятую из «длинная резинка», «мини-петля», «без инвентаря» — получено «гантели»',
    'Строка 2, «Одностороннее»: «да» или «нет» — получено «»',
    'Строка 2, «Ягодичные»: пусто, 1 или 0,5 — получено «3»',
  ]);
});

test('нет колонки: сообщение по заголовку, строки не читаются', () => {
  const header = COLUMNS.filter(c => c !== 'Дозировка');
  const dataRow = row().filter((_, i) => COLUMNS[i] !== 'Дозировка');
  // Без колонки каждая строка ругалась бы «Дозировка: не может быть пустым»:
  // это шум, правится одна колонка.
  assert.deepEqual(buildLibrary([header, dataRow]), { entries: null, errors: ['Заголовок: нет колонки «Дозировка»'] });
});

test('лишняя колонка называется в сообщении', () => {
  const result = buildLibrary([[...COLUMNS, 'Заметки'], [...row(), 'не для приложения']]);
  assert.deepEqual(result, { entries: null, errors: ['Заголовок: неизвестная колонка «Заметки»'] });
});

test('лишняя колонка не мешает проверять строки', () => {
  const result = buildLibrary([[...COLUMNS, 'Заметки'], [...row({ 'Ключ': 'Bad' }), '']]);
  assert.deepEqual(result.errors, [
    'Заголовок: неизвестная колонка «Заметки»',
    'Строка 2, «Ключ»: только строчная латиница, цифры и дефис, до 40 символов — получено «Bad»',
  ]);
});

test('повторяющаяся колонка — ошибка, а не молчаливый выбор первой', () => {
  // Человек правил бы вторую «Ключ», а импорт читал бы первую.
  const result = buildLibrary([[...COLUMNS, 'Ключ'], [...row(), 'другой']]);
  assert.deepEqual(result, { entries: null, errors: ['Заголовок: колонка «Ключ» повторяется'] });
});

test('колонки читаются по названию, а не по месту', () => {
  const order = [...COLUMNS].reverse();
  const reordered = rec => order.map(c => rec[COLUMNS.indexOf(c)]);
  const result = buildLibrary([order, reordered(row())]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries, build([row()]).entries);
});

test('ключ: только строчная латиница, цифры и дефис, до 40 символов', () => {
  const message = v => `Строка 2, «Ключ»: только строчная латиница, цифры и дефис, до 40 символов — получено «${v}»`;
  for (const bad of ['', 'Bad', 'rdl_2', 'a b', 'ключ', 'a'.repeat(41)]) {
    assert.deepEqual(errorsOf([row({ 'Ключ': bad })]), [message(bad)], `ключ «${bad}»`);
  }
  for (const good of ['a', 'rdl-2', '0', 'a'.repeat(40)]) {
    assert.deepEqual(errorsOf([row({ 'Ключ': good })]), [], `ключ «${good}»`);
  }
  assert.ok(KEY_PATTERN.test('hip-thrust'));
  assert.ok(!KEY_PATTERN.test('Hip'));
});

test('ключ из ячейки с пробелами по краям читается без пробелов', () => {
  assert.equal(build([row({ 'Ключ': ' rdl ' })]).entries[0].key, 'rdl');
});

test('повтор ключа называет первую строку', () => {
  assert.deepEqual(errorsOf([row(), row({ 'Ключ': 'other' }), row()]),
    ['Строка 4, «Ключ»: ключ «rdl» уже есть в строке 2']);
});

test('пустой обязательный текст: название, мышцы, дозировка, техника', () => {
  for (const column of ['Название', 'Мышцы (подпись)', 'Дозировка', 'Техника']) {
    // Пробелы — это пусто: в таблице их не видно.
    for (const empty of ['', '   ']) {
      assert.deepEqual(errorsOf([row({ [column]: empty })]), [`Строка 2, «${column}»: не может быть пустым`], column);
    }
  }
});

test('текст ячейки берётся без пробелов и переводов строки по краям', () => {
  const [entry] = build([row({ 'Название': '  Румынская тяга ', 'Техника': '\nПервая строка\r\nВторая\n' })]).entries;
  assert.equal(entry.name, 'Румынская тяга');
  assert.equal(entry.text, 'Первая строка\nВторая');
});

test('Тип: четыре значения дают слот и kind', () => {
  const cases = [['разминка', 'warmup', 'warmup'], ['разогрев', 'circuit', 'warmup'],
    ['силовое', 'strength', 'strength'], ['завершение', 'cooldown', 'cooldown']];
  for (const [ru, slot, kind] of cases) {
    const over = ru === 'силовое' ? {} : { 'Тип': ru, 'Сложность': '', 'Многосуставное': '' };
    const [entry] = build([row(over)]).entries;
    assert.equal(entry.slot, slot, ru);
    assert.equal(entry.kind, kind, ru);
  }
});

test('Тип: регистр и пробелы не важны', () => {
  assert.equal(build([row({ 'Тип': '  СИЛОВОЕ ' })]).entries[0].slot, 'strength');
});

test('Тип: вымышленное слово вроде «constructor» не принимается за значение', () => {
  assert.deepEqual(errorsOf([row({ 'Тип': 'constructor' })]),
    ['Строка 2, «Тип»: одно из «разминка», «разогрев», «силовое», «завершение» — получено «constructor»']);
});

test('Паттерн: десять русских названий дают десять паттернов схемы', () => {
  const names = { 'наклон от таза': 'hinge', 'присед': 'squat', 'выпад': 'lunge', 'жим': 'push', 'тяга': 'pull',
    'кор': 'core', 'изолирующее': 'isolation', 'подвижность': 'mobility', 'растяжка': 'stretch', 'восстановление': 'recovery' };
  assert.deepEqual(Object.values(names).sort(), [...PATTERNS].sort(), 'в PATTERNS появился паттерн без русского названия');
  for (const [ru, pattern] of Object.entries(names)) {
    const over = pattern === 'recovery' ? { 'Паттерн': ru, ...NO_LOAD } : { 'Паттерн': ru };
    assert.equal(build([row(over)]).entries[0].pattern, pattern, ru);
  }
});

test('Паттерн: в сообщении перечислены все названия', () => {
  assert.deepEqual(errorsOf([row({ 'Паттерн': 'бег' })]), ['Строка 2, «Паттерн»: одно из «наклон от таза», «присед», '
    + '«выпад», «жим», «тяга», «кор», «изолирующее», «подвижность», «растяжка», «восстановление» — получено «бег»']);
});

test('Видео: id и старт берутся из ссылки, подпись по умолчанию — время начала', () => {
  const [entry] = build([row({ 'Видео': 'https://youtu.be/kOAy8BGdxBc?t=523' })]).entries;
  assert.deepEqual(entry.v, ['kOAy8BGdxBc', 523, '8:43']);
});

test('Видео: не ссылка на YouTube', () => {
  for (const bad of ['https://example.com/watch?v=kOAy8BGdxBc', 'просто текст', 'youtu.be/kOAy8BGdxBc']) {
    assert.deepEqual(errorsOf([row({ 'Видео': bad })]), [`Строка 2, «Видео»: не ссылка на ролик YouTube — «${bad}»`], bad);
  }
});

test('Видео: id не из одиннадцати символов называет проверка схемы', () => {
  assert.deepEqual(errorsOf([row({ 'Видео': 'https://youtu.be/abc' })]),
    ['Строка 2: упражнение «Румынская тяга»: v[0] — id ролика YouTube (11 символов), получено "abc"']);
});

test('Доп. видео: id не из одиннадцати символов называет проверка схемы', () => {
  assert.deepEqual(errorsOf([row({ 'Доп. видео': 'Сбоку — https://youtu.be/abc' })]),
    ['Строка 2: упражнение «Румынская тяга»: links[0][0] — id ролика YouTube (11 символов), получено "abc"']);
});

test('Видео нет: поля v нет вовсе', () => {
  const result = build([row({ 'Видео': '' })]);
  assert.deepEqual(result.errors, []);
  assert.equal(Object.hasOwn(result.entries[0], 'v'), false);
});

test('Подпись видео: заполнена — берётся как есть, пуста — время начала', () => {
  assert.deepEqual(build([row({ 'Видео': 'https://youtu.be/kOAy8BGdxBc?t=523s', 'Подпись видео': '' })]).entries[0].v,
    ['kOAy8BGdxBc', 523, '8:43']);
  assert.deepEqual(build([row({ 'Видео': 'https://youtu.be/kOAy8BGdxBc?t=523s', 'Подпись видео': '0:00–0:02 · внизу экрана' })]).entries[0].v,
    ['kOAy8BGdxBc', 523, '0:00–0:02 · внизу экрана']);
});

test('Подпись видео: подпись есть, а видео нет', () => {
  assert.deepEqual(errorsOf([row({ 'Видео': '', 'Подпись видео': '0:08' })]),
    ['Строка 2, «Подпись видео»: подпись есть, а видео нет']);
});

test('Подпись видео: при кривой ссылке называется только ссылка', () => {
  assert.deepEqual(errorsOf([row({ 'Видео': 'ссылка', 'Подпись видео': '0:08' })]),
    ['Строка 2, «Видео»: не ссылка на ролик YouTube — «ссылка»']);
});

test('Доп. видео: две строки дают два элемента links в порядке строк', () => {
  const extra = 'Вид сбоку — https://youtu.be/zMZWyURC6tw?t=18\r\nС резинкой — https://www.youtube.com/watch?v=kOAy8BGdxBc&t=8m43s\r\n';
  const [entry] = build([row({ 'Доп. видео': extra })]).entries;
  assert.deepEqual(entry.links, [['zMZWyURC6tw', 18, 'Вид сбоку'], ['kOAy8BGdxBc', 523, 'С резинкой']]);
});

test('Доп. видео: подпись режется по последнему « — », пустые строки пропускаются', () => {
  const extra = 'Сбоку — вид — https://youtu.be/zMZWyURC6tw\n\n  Спереди — https://youtu.be/kOAy8BGdxBc  ';
  assert.deepEqual(build([row({ 'Доп. видео': extra })]).entries[0].links,
    [['zMZWyURC6tw', 0, 'Сбоку — вид'], ['kOAy8BGdxBc', 0, 'Спереди']]);
});

test('Доп. видео: нет ячейки — поля links нет вовсе', () => {
  assert.equal(Object.hasOwn(build([row()]).entries[0], 'links'), false);
});

test('Доп. видео: строка не по образцу называется с номером', () => {
  const bad = ['Вид сбоку https://youtu.be/zMZWyURC6tw', 'Вид сбоку — https://example.com/x', ' — https://youtu.be/zMZWyURC6tw', 'просто подпись'];
  for (const line of bad) {
    const extra = `Ок — https://youtu.be/kOAy8BGdxBc\n${line}`;
    assert.deepEqual(errorsOf([row({ 'Доп. видео': extra })]),
      [`Строка 2, «Доп. видео»: строка 2 — нужно «подпись — ссылка на YouTube», получено «${line.trim()}»`], line);
  }
});

test('Доп. видео: номер строки считается по ячейке, с пустыми строками', () => {
  assert.deepEqual(errorsOf([row({ 'Доп. видео': 'Ок — https://youtu.be/kOAy8BGdxBc\n\nплохо' })]),
    ['Строка 2, «Доп. видео»: строка 3 — нужно «подпись — ссылка на YouTube», получено «плохо»']);
});

test('Уточнение и Прогрессия: пусто — полей detail и extra нет, есть — берутся', () => {
  const bare = build([row()]).entries[0];
  assert.equal(Object.hasOwn(bare, 'detail'), false);
  assert.equal(Object.hasOwn(bare, 'extra'), false);
  const full = build([row({ 'Уточнение': 'Колени по линии носков.', 'Прогрессия': 'Добавь вторую резинку.' })]).entries[0];
  assert.equal(full.detail, 'Колени по линии носков.');
  assert.equal(full.extra, 'Добавь вторую резинку.');
});

test('Инвентарь: через запятую, регистр и пробелы не важны', () => {
  assert.deepEqual(build([row({ 'Инвентарь': 'Длинная резинка,  мини-петля' })]).entries[0].gear, ['band_long', 'loop_short']);
  assert.deepEqual(build([row({ 'Инвентарь': 'без инвентаря' })]).entries[0].gear, ['none']);
});

test('Инвентарь: неизвестное или пустое значение — ошибка со всей ячейкой', () => {
  const message = v => `Строка 2, «Инвентарь»: через запятую из «длинная резинка», «мини-петля», «без инвентаря» — получено «${v}»`;
  for (const bad of ['гантели', 'длинная резинка, гантели', '', 'длинная резинка,']) {
    assert.deepEqual(errorsOf([row({ 'Инвентарь': bad })]), [message(bad)], bad);
  }
});

test('Одностороннее и Многосуставное: да и нет', () => {
  const [yes] = build([row({ 'Одностороннее': 'Да', 'Многосуставное': ' нет ' })]).entries;
  assert.equal(yes.unilateral, true);
  assert.equal(yes.compound, false);
});

test('да/нет: другое значение и пустое — ошибка', () => {
  for (const column of ['Одностороннее', 'Многосуставное']) {
    for (const bad of ['может быть', '']) {
      assert.deepEqual(errorsOf([row({ [column]: bad })]), [`Строка 2, «${column}»: «да» или «нет» — получено «${bad}»`], `${column} «${bad}»`);
    }
  }
});

test('Сложность у силового: три значения дают basic, medium, hard', () => {
  for (const [ru, difficulty] of [['базовое', 'basic'], ['среднее', 'medium'], ['сложное', 'hard']]) {
    assert.equal(build([row({ 'Сложность': ru })]).entries[0].difficulty, difficulty, ru);
  }
});

test('Сложность у силового: пустая или чужая — ошибка', () => {
  for (const bad of ['', 'лёгкое']) {
    assert.deepEqual(errorsOf([row({ 'Сложность': bad })]),
      [`Строка 2, «Сложность»: у силового одно из «базовое», «среднее», «сложное» — получено «${bad}»`], `«${bad}»`);
  }
});

test('Сложность и Многосуставное не у силового: заполнены — ошибка, пусты — полей нет', () => {
  for (const type of ['разминка', 'разогрев', 'завершение']) {
    assert.deepEqual(errorsOf([row({ 'Тип': type })]), [
      'Строка 2, «Сложность»: заполняется только у силовых',
      'Строка 2, «Многосуставное»: заполняется только у силовых',
    ], type);
    const [entry] = build([row({ 'Тип': type, 'Сложность': '', 'Многосуставное': '' })]).entries;
    assert.equal(Object.hasOwn(entry, 'difficulty'), false, type);
    assert.equal(Object.hasOwn(entry, 'compound'), false, type);
  }
});

test('Сложность и Многосуставное: при неизвестном типе не проверяются', () => {
  // Тип непонятен, силовое это или нет, — вторая ошибка была бы догадкой.
  assert.deepEqual(errorsOf([row({ 'Тип': 'кардио' })]),
    ['Строка 2, «Тип»: одно из «разминка», «разогрев», «силовое», «завершение» — получено «кардио»']);
});

test('группа: пусто, 1 или 0,5, остальное — ошибка с названием колонки', () => {
  for (const bad of ['2', '0', '0,6', '1,0', 'да']) {
    assert.deepEqual(errorsOf([row({ 'Икроножные': bad })]), [`Строка 2, «Икроножные»: пусто, 1 или 0,5 — получено «${bad}»`], bad);
  }
  assert.deepEqual(build([row({ 'Икроножные': '1' })]).entries[0].load.calves, 1);
  assert.equal(Object.hasOwn(build([row()]).entries[0].load, 'calves'), false);
});

test('load идёт в порядке MUSCLES при любом порядке колонок', () => {
  const order = [...COLUMNS].reverse();
  const record = row({ 'Икроножные': '1', 'Предплечья': '0,5' });
  const { entries } = buildLibrary([order, order.map(c => record[COLUMNS.indexOf(c)])]);
  const muscleOrder = Object.keys(MUSCLES);
  assert.deepEqual(Object.keys(entries[0].load), ['glutes', 'hamstrings', 'calves', 'lower_back', 'forearms']);
  assert.deepEqual(Object.keys(entries[0].load), muscleOrder.filter(id => Object.hasOwn(entries[0].load, id)));
});

test('поля упражнения идут в порядке из описания формата', () => {
  const [entry] = build([row({ 'Уточнение': 'Д', 'Прогрессия': 'П', 'Доп. видео': 'Подпись — https://youtu.be/kOAy8BGdxBc' })]).entries;
  assert.deepEqual(Object.keys(entry), ['key', 'slot', 'name', 'muscles', 'reps', 'text', 'detail', 'extra', 'v', 'links',
    'load', 'pattern', 'gear', 'unilateral', 'kind', 'difficulty', 'compound']);
});

test('проверки itemProblems: пустая разметка нагрузки у силового — ошибка', () => {
  assert.deepEqual(errorsOf([row(NO_LOAD)]),
    ['Строка 2: упражнение «Румынская тяга»: нужен непустой load (пустой разрешён только при pattern recovery)']);
});

test('проверки itemProblems: у восстановления пустая разметка проходит', () => {
  const result = build([row({ ...COOLDOWN, 'Паттерн': 'восстановление', ...NO_LOAD })]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries[0].load, {});
});

test('проверки itemProblems не запускаются, пока в строке есть другие ошибки', () => {
  // Недособранное упражнение дало бы вдобавок «неизвестный pattern undefined»
  // и «нужен непустой load» — эхо той же ошибки.
  assert.deepEqual(errorsOf([row({ 'Паттерн': 'бег', ...NO_LOAD })]),
    ['Строка 2, «Паттерн»: одно из «наклон от таза», «присед», «выпад», «жим», «тяга», «кор», «изолирующее», '
      + '«подвижность», «растяжка», «восстановление» — получено «бег»']);
});

test('itemProblems даёт те же сообщения, что validateWorkout, а уникальность key остаётся за ним', () => {
  const item = { key: 'ex', name: 'Упр', muscles: 'М', reps: '1', text: 'Т', load: {}, pattern: 'hinge', gear: ['x'],
    unilateral: 'нет', kind: 'strength' };
  const at = 'Блок b1, упражнение «Упр»';
  const workout = { id: 'w', kicker: 'k', title: 't', titleLines: ['t'], lead: 'l', days: [1], stats: [], equipment: 'e',
    blocks: [{ id: 'b1', n: '01', nav: 'n', title: 't', sub: 's', rounds: 1, items: [item] }], progression: [], caution: 'c' };
  const problems = itemProblems(item, at);
  assert.ok(problems.length >= 3, 'в фикстуре должно быть несколько ошибок');
  assert.deepEqual(validateWorkout(workout), problems);
  workout.blocks[0].items.push({ ...item });
  assert.deepEqual(itemProblems(item, at), problems, 'повтор ключа — забота validateWorkout, не itemProblems');
  assert.equal(validateWorkout(workout).filter(p => p.includes('дубликат key ex внутри блока')).length, 1);
});

test('пропавший ключ: ошибка с флагом, а с allowRemoved проходит', () => {
  const { entries, errors } = build([row()], { previousKeys: ['rdl', 'gone'] });
  assert.equal(entries, null);
  assert.deepEqual(errors, ['Ключ «gone» был в библиотеке и пропал из таблицы. Удаление ломает сохранённые тренировки; '
    + 'если это намеренно, запусти импорт с --allow-removed=gone']);
  assert.deepEqual(build([row()], { previousKeys: ['rdl', 'gone'], allowRemoved: ['gone'] }).errors, []);
  assert.deepEqual(build([row()], { previousKeys: ['rdl'] }).errors, []);
});

test('пропавший ключ: каждый назван отдельно, разрешённые не мешают остальным', () => {
  const { errors } = build([row()], { previousKeys: ['a', 'rdl', 'b', 'c'], allowRemoved: ['b'] });
  assert.deepEqual(errors.map(e => e.slice(0, 7)), ['Ключ «a', 'Ключ «c']);
});

test('пропавший ключ не проверяется, когда заголовок нечитаем', () => {
  // Без колонки «Ключ» все прежние ключи «пропали» бы, а настоящая беда — заголовок.
  const header = COLUMNS.filter(c => c !== 'Ключ');
  assert.deepEqual(buildLibrary([header], { previousKeys: ['rdl'] }).errors, ['Заголовок: нет колонки «Ключ»']);
});

test('пустые строки таблицы пропускаются, но номера не сдвигаются', () => {
  const blank = COLUMNS.map(() => '');
  const result = buildLibrary([COLUMNS, row(), blank, [''], ['  ', '', ''], row({ 'Ключ': 'Bad' }), blank, blank]);
  assert.deepEqual(result.errors, ['Строка 6, «Ключ»: только строчная латиница, цифры и дефис, до 40 символов — получено «Bad»']);
  assert.deepEqual(buildLibrary([COLUMNS, blank, row(), blank]).entries.map(e => e.key), ['rdl']);
});

test('строка короче заголовка читается: недостающие ячейки пусты', () => {
  const short = row().slice(0, COLUMNS.indexOf('Одностороннее'));
  assert.deepEqual(errorsOf([short]), [
    'Строка 2, «Одностороннее»: «да» или «нет» — получено «»',
    'Строка 2, «Сложность»: у силового одно из «базовое», «среднее», «сложное» — получено «»',
    'Строка 2, «Многосуставное»: «да» или «нет» — получено «»',
  ]);
});

test('без единой строки данных библиотека пуста, но не ошибочна', () => {
  assert.deepEqual(buildLibrary([COLUMNS]), { entries: [], errors: [] });
});

test('пустой текст вместо таблицы: нет ни одной колонки', () => {
  const { entries, errors } = buildLibrary(parseCsv(''));
  assert.equal(entries, null);
  assert.equal(errors.length, COLUMNS.length);
  assert.equal(errors[0], 'Заголовок: нет колонки «Ключ»');
});

// ── CSV ──────────────────────────────────────────────────────────────────────

test('parseCsv: кавычки, удвоенные кавычки, перенос строки в ячейке, BOM, CRLF', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n"x, y","строка 1\nстрока 2"\r\n"он сказал ""да""",\r\n'),
    [['a', 'b'], ['x, y', 'строка 1\nстрока 2'], ['он сказал "да"', '']]);
});

test('parseCsv: LF без CR и последняя строка без перевода строки', () => {
  assert.deepEqual(parseCsv('a,b\nc,d'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  assert.deepEqual(parseCsv('a,'), [['a', '']]);
});

test('parseCsv: пустая ячейка в кавычках, пустая строка, пустой текст', () => {
  assert.deepEqual(parseCsv('"",x\n\ny,""\n'), [['', 'x'], [''], ['y', '']]);
  assert.deepEqual(parseCsv(''), []);
});

test('parseCsv: CRLF внутри кавычек остаётся в ячейке', () => {
  assert.deepEqual(parseCsv('"а\r\nб",в\r\n'), [['а\r\nб', 'в']]);
});

test('parseCsv: кавычка внутри незакавыченной ячейки — обычный символ', () => {
  assert.deepEqual(parseCsv('5" гвоздь,x\n'), [['5" гвоздь', 'x']]);
});

test('parseCsv: незакрытая кавычка — ошибка, а не молчаливый хвост файла в одной ячейке', () => {
  assert.throws(() => parseCsv('a,"b\nc,d\n'), /кавычка не закрыта/);
});

test('выгрузка Google Sheets читается целиком: BOM, CRLF, многострочная ячейка, 0,5, пустые хвостовые строки', () => {
  const blank = COLUMNS.map(() => '');
  const text = toCsv([COLUMNS, row({ 'Техника': 'Первая строка\nВторая, с запятой и «кавычкой» "в кавычках"', 'Разгибатели поясницы': '0,5' }), blank, blank]);
  assert.ok(text.startsWith('\uFEFF') && text.includes('\r\n'));
  const { entries, errors } = buildLibrary(parseCsv(text));
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].text, 'Первая строка\nВторая, с запятой и «кавычкой» "в кавычках"');
  assert.equal(entries[0].load.lower_back, 0.5);
});

// ── ссылки YouTube ───────────────────────────────────────────────────────────

test('parseYoutube: старт из t в секундах, с «s», в минутах и секундах, с часами', () => {
  assert.deepEqual(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc&t=523s'), { id: 'kOAy8BGdxBc', start: 523 });
  assert.deepEqual(parseYoutube('https://youtu.be/zMZWyURC6tw?t=18'), { id: 'zMZWyURC6tw', start: 18 });
  assert.deepEqual(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc&t=8m43s'), { id: 'kOAy8BGdxBc', start: 523 });
  assert.deepEqual(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc&t=1h2m3s'), { id: 'kOAy8BGdxBc', start: 3723 });
  assert.deepEqual(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc&t=2m'), { id: 'kOAy8BGdxBc', start: 120 });
  assert.deepEqual(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc&t=1h'), { id: 'kOAy8BGdxBc', start: 3600 });
});

test('parseYoutube: старт из start, и t сильнее start', () => {
  assert.deepEqual(parseYoutube('https://www.youtube.com/embed/kOAy8BGdxBc?start=30'), { id: 'kOAy8BGdxBc', start: 30 });
  assert.equal(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc&start=30&t=40').start, 40);
});

test('parseYoutube: без метки или с пустой меткой старт 0', () => {
  assert.deepEqual(parseYoutube('https://www.youtube.com/shorts/kOAy8BGdxBc'), { id: 'kOAy8BGdxBc', start: 0 });
  assert.deepEqual(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc'), { id: 'kOAy8BGdxBc', start: 0 });
  assert.deepEqual(parseYoutube('https://youtu.be/kOAy8BGdxBc'), { id: 'kOAy8BGdxBc', start: 0 });
  assert.deepEqual(parseYoutube('https://www.youtube.com/watch?v=kOAy8BGdxBc&t='), { id: 'kOAy8BGdxBc', start: 0 });
});

test('parseYoutube: все хосты и виды путей из описания', () => {
  for (const url of ['https://www.youtube.com/watch?v=kOAy8BGdxBc', 'https://youtube.com/watch?v=kOAy8BGdxBc',
    'https://m.youtube.com/watch?v=kOAy8BGdxBc', 'http://www.youtube.com/watch?v=kOAy8BGdxBc&si=xyz',
    'https://www.youtube.com/shorts/kOAy8BGdxBc', 'https://m.youtube.com/shorts/kOAy8BGdxBc',
    'https://www.youtube.com/embed/kOAy8BGdxBc', 'https://youtu.be/kOAy8BGdxBc', ' https://youtu.be/kOAy8BGdxBc ']) {
    assert.equal(parseYoutube(url)?.id, 'kOAy8BGdxBc', url);
  }
});

test('parseYoutube: чужой хост, не ссылка, нет id или кривая метка — null', () => {
  for (const bad of ['https://example.com/watch?v=kOAy8BGdxBc', 'https://youtube.com.example.com/watch?v=kOAy8BGdxBc',
    'https://notyoutube.com/watch?v=kOAy8BGdxBc', 'youtu.be/kOAy8BGdxBc', 'ftp://youtu.be/kOAy8BGdxBc', '',
    'https://www.youtube.com/watch', 'https://www.youtube.com/', 'https://youtu.be/', 'https://www.youtube.com/channel/kOAy8BGdxBc',
    'https://www.youtube.com/watch?v=kOAy8BGdxBc&t=abc', 'https://www.youtube.com/watch?v=kOAy8BGdxBc&t=-5']) {
    assert.equal(parseYoutube(bad), null, bad);
  }
});

test('formatStart: минуты и секунды с нулём впереди', () => {
  assert.equal(formatStart(0), '0:00');
  assert.equal(formatStart(4), '0:04');
  assert.equal(formatStart(59), '0:59');
  assert.equal(formatStart(60), '1:00');
  assert.equal(formatStart(523), '8:43');
  assert.equal(formatStart(3723), '62:03');
});

// ── вывод ────────────────────────────────────────────────────────────────────

const MANY = () => build([
  row({ 'Уточнение': 'Колени по линии носков.', 'Прогрессия': 'Добавь вторую резинку.', 'Доп. видео': 'Сбоку — https://youtu.be/zMZWyURC6tw?t=18' }),
  row({ 'Ключ': 'stretch', ...COOLDOWN, 'Видео': '', 'Название': 'Растяжка «с кавычками» и "двойными"' }),
]).entries;

test('renderLibraryJs: файл читается обратно и даёт те же упражнения', async () => {
  const entries = MANY();
  assert.equal(entries.length, 2);
  const module = await import('data:text/javascript,' + encodeURIComponent(renderLibraryJs(entries)));
  assert.deepEqual(module.default, entries);
});

test('renderLibraryJs: два вызова дают один и тот же текст', () => {
  assert.equal(renderLibraryJs(MANY()), renderLibraryJs(MANY()));
});

test('renderLibraryJs: шапка, export default и перевод строки в конце', () => {
  const text = renderLibraryJs(MANY());
  const [head, ...rest] = text.split('\n');
  assert.equal(head, '// Сгенерировано tools/import-exercises.mjs из exercises/library.csv. Руками не править: правки идут в таблицу и импорт.');
  assert.ok(text.includes('export default [\n  {\n    "key": "rdl",'));
  assert.ok(text.endsWith('\n];\n'));
  assert.equal(rest.at(-1), '');
  assert.equal(renderLibraryJs([]), `${head}\nexport default [];\n`);
});

test('renderLibraryJs: порядок полей в файле — порядок описания формата', () => {
  const text = renderLibraryJs(MANY());
  const firstEntry = text.slice(text.indexOf('{'), text.indexOf('\n  },\n'));
  const keys = [...firstEntry.matchAll(/^ {4}"(\w+)":/gm)].map(m => m[1]);
  assert.deepEqual(keys, ['key', 'slot', 'name', 'muscles', 'reps', 'text', 'detail', 'extra', 'v', 'links',
    'load', 'pattern', 'gear', 'unilateral', 'kind', 'difficulty', 'compound']);
});

// ── командная строка ─────────────────────────────────────────────────────────

const GOOD_CSV = toCsv([COLUMNS, row()]);
const BAD_CSV = toCsv([COLUMNS, row({ 'Ключ': 'Bad Key' })]);

function cli(args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: ROOT, encoding: 'utf8' });
}

test('CLI: ошибки в stderr, код 1, ничего не пишется', () => {
  const dir = tmp();
  const bad = join(dir, 'bad.csv');
  writeFileSync(bad, BAD_CSV);
  const out = join(dir, 'out');
  const result = cli([bad, '--out=' + out]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Строка 2, «Ключ»: только строчная латиница, цифры и дефис, до 40 символов — получено «Bad Key»/);
  assert.equal(readdirSync(dir).includes('out'), false, 'каталог вывода не создаётся');
});

test('CLI: к существующему каталогу вывода при ошибке тоже не прикасается', () => {
  const dir = tmp();
  const bad = join(dir, 'bad.csv');
  writeFileSync(bad, BAD_CSV);
  const out = tmp();
  const result = cli([bad, '--out=' + out]);
  assert.equal(result.status, 1);
  assert.deepEqual(readdirSync(out), []);
});

test('CLI: правильный CSV — код 0, в каталоге ровно library.csv и library.js', async () => {
  const dir = tmp();
  const good = join(dir, 'good.csv');
  writeFileSync(good, GOOD_CSV);
  const out = join(dir, 'новый', 'каталог');
  const result = cli([good, '--out=' + out]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(out).sort(), ['library.csv', 'library.js']);
  assert.equal(readFileSync(join(out, 'library.csv'), 'utf8'), GOOD_CSV, 'снимок — текст как получен, вместе с BOM');
  const expected = renderLibraryJs(buildLibrary(parseCsv(GOOD_CSV)).entries);
  assert.equal(readFileSync(join(out, 'library.js'), 'utf8'), expected);
});

test('CLI: без аргументов и с неизвестным параметром — код 1 и подсказка', () => {
  const none = cli([]);
  assert.equal(none.status, 1);
  assert.match(none.stderr, /node tools\/import-exercises\.mjs/);
  const dir = tmp();
  const good = join(dir, 'good.csv');
  writeFileSync(good, GOOD_CSV);
  const typo = cli([good, '--allow-remove=gone', '--out=' + dir]);
  assert.equal(typo.status, 1);
  assert.deepEqual(readdirSync(dir), ['good.csv']);
});

test('CLI: файла нет — код 1 без записи', () => {
  const out = tmp();
  const result = cli([join(out, 'нет-такого.csv'), '--out=' + out]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /нет-такого\.csv/);
  assert.deepEqual(readdirSync(out), []);
});

test('CLI: прежние ключи берутся из library.js, пропажа останавливает, --allow-removed разрешает', () => {
  const dir = tmp();
  const csv = join(dir, 'new.csv');
  writeFileSync(csv, GOOD_CSV);
  const out = tmp();
  const previous = renderLibraryJs([{ ...build([row()]).entries[0] }, { ...build([row({ 'Ключ': 'gone' })]).entries[0] }]);
  writeFileSync(join(out, 'library.js'), previous);

  const stopped = cli([csv, '--out=' + out]);
  assert.equal(stopped.status, 1);
  assert.match(stopped.stderr, /Ключ «gone» был в библиотеке и пропал из таблицы/);
  assert.match(stopped.stderr, /--allow-removed=gone/);
  assert.equal(readFileSync(join(out, 'library.js'), 'utf8'), previous, 'прежняя библиотека не тронута');
  assert.deepEqual(readdirSync(out), ['library.js']);

  const allowed = cli([csv, '--allow-removed=gone,other', '--out=' + out]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.deepEqual(readdirSync(out).sort(), ['library.csv', 'library.js']);
  assert.doesNotMatch(readFileSync(join(out, 'library.js'), 'utf8'), /gone/);
});

test('CLI: нечитаемый прежний library.js останавливает импорт, а не отключает проверку', () => {
  const dir = tmp();
  const csv = join(dir, 'new.csv');
  writeFileSync(csv, GOOD_CSV);
  for (const broken of ['это не js {{{', 'export default { key: "rdl" };\n', 'export default [{ name: "без ключа" }];\n']) {
    const out = tmp();
    writeFileSync(join(out, 'library.js'), broken);
    const result = cli([csv, '--out=' + out]);
    assert.equal(result.status, 1, broken);
    assert.match(result.stderr, /Не удалось прочитать прежнюю библиотеку/, broken);
    assert.deepEqual(readdirSync(out), ['library.js'], broken);
    assert.equal(readFileSync(join(out, 'library.js'), 'utf8'), broken);
  }
});

// Сервер в этом же процессе: spawnSync заблокировал бы его, поэтому spawn.
function runCli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, ...args], { cwd: ROOT });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, stderr }));
  });
}

async function withServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}/library.csv`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test('CLI: ссылку скачивает, снимок — текст как получен, вместе с BOM', async () => {
  const out = tmp();
  const result = await withServer((req, res) => { res.setHeader('content-type', 'text/csv; charset=utf-8'); res.end(GOOD_CSV); },
    url => runCli([url, '--out=' + out]));
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readdirSync(out).sort(), ['library.csv', 'library.js']);
  assert.equal(readFileSync(join(out, 'library.csv'), 'utf8'), GOOD_CSV);
  assert.equal(readFileSync(join(out, 'library.js'), 'utf8'), renderLibraryJs(buildLibrary(parseCsv(GOOD_CSV)).entries));
});

test('CLI: ссылка отвечает ошибкой — код 1 без записи', async () => {
  const out = tmp();
  const result = await withServer((req, res) => { res.statusCode = 404; res.end('нет'); },
    url => runCli([url, '--out=' + out]));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /404/);
  assert.deepEqual(readdirSync(out), []);
});
