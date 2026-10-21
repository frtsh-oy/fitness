// Превращает выгрузку таблицы упражнений (Google Sheets → CSV) в библиотеку
// приложения: exercises/library.csv (снимок таблицы как получен, чтобы в истории
// git было видно, что поменялось) и exercises/library.js (его читает приложение).
// Источник правды — таблица владельца: library.js руками не правится, как и
// docs/muscle-map.md.
//
// Импорт либо принимает таблицу целиком, либо не пишет ничего: полупринятая
// библиотека хуже старой. Ошибки строк собираются разом, с номером строки и
// названием колонки (номер — как в Google Sheets, заголовок — строка 1), и
// человек правит всё найденное за раз, а не по одной ошибке за запуск. Два
// исключения: без колонки в заголовке строки не читаются (каждая повторяла бы
// одно и то же), а незакрытая кавычка останавливает разбор всего файла.
//
// Запуск: node tools/import-exercises.mjs <файл.csv | https://…> [--allow-removed=ключ1,ключ2] [--out=каталог]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { MUSCLES } from '../muscles.js';
import { GEAR, NO_GEAR, NO_GEAR_LABEL, gearLabel } from '../gear.js';
import { itemProblems, NO_LOAD_PATTERN, KEY_PATTERN, YOUTUBE_ID } from '../workouts/schema.js';

// Шаблон ключа живёт в схеме, а отсюда по-прежнему отдаётся (на него ссылаются тесты).
export { KEY_PATTERN };

export const COLUMNS = ['Ключ', 'Название', 'Тип', 'Паттерн', 'Мышцы (подпись)', 'Дозировка', 'Техника', 'Уточнение',
  'Видео', 'Подпись видео', 'Доп. видео', 'Прогрессия', 'Инвентарь', 'Одностороннее', 'Сложность', 'Многосуставное',
  ...Object.values(MUSCLES).map(m => m.ru)];

// Значения ячеек сравниваются после trim() и в нижнем регистре: в таблице
// регистр и пробелы по краям не видны и не должны ронять импорт. Справочники —
// Map, а не объекты: по объекту «constructor» или «__proto__» из ячейки
// нашёлся бы как значение.
const SLOTS = new Map([['разминка', 'warmup'], ['разогрев', 'circuit'], ['силовое', 'strength'], ['завершение', 'cooldown']]);
const PATTERN_NAMES = new Map([['наклон от таза', 'hinge'], ['присед', 'squat'], ['выпад', 'lunge'], ['жим', 'push'],
  ['тяга', 'pull'], ['кор', 'core'], ['изолирующее', 'isolation'], ['подвижность', 'mobility'], ['растяжка', 'stretch'],
  ['восстановление', 'recovery']]);
// Подписи и порядок — из словаря gear.js, «без инвентаря» последним: так их и
// перечисляет сообщение об ошибке.
const GEAR_BY_LABEL = new Map([...GEAR.map(([id, label]) => [label, id]), [NO_GEAR_LABEL, NO_GEAR]]);
const DIFFICULTIES = new Map([['базовое', 'basic'], ['среднее', 'medium'], ['сложное', 'hard']]);
const YES_NO = new Map([['да', true], ['нет', false]]);

const quoted = names => [...names].map(name => `«${name}»`).join(', ');

// RFC 4180: поле в кавычках может содержать запятую, перенос строки и удвоенную
// кавычку; строки кончаются на \r\n или \n. BOM срезается: Google Sheets кладёт
// его в начало файла, и в первой ячейке он сидел бы невидимым символом.
export function parseCsv(text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const records = [];
  let record = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch !== '"') cell += ch;
      else if (text[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = false;
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === ',') {
      record.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      record.push(cell);
      records.push(record);
      record = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  // Незакрытая кавычка — почти всегда обрезанный файл или опечатка; молча
  // принять значило бы слить весь остаток таблицы в одну ячейку.
  if (inQuotes) throw new Error('CSV: кавычка не закрыта до конца файла');
  // Последняя запись без перевода строки в конце.
  if (cell !== '' || record.length > 0) {
    record.push(cell);
    records.push(record);
  }
  return records;
}

// Метка времени в ссылке: «523», «523s», «8m43s», «1h2m3s». Пусто — с начала.
// Метка, которую не разобрать, — это null, а не 0: ролик молча начался бы не с
// того места, и узнали бы об этом только на телефоне.
function parseStart(raw) {
  if (raw === '') return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!match) return null;
  const [, hours = 0, minutes = 0, seconds = 0] = match;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

// Идентификатор ролика проверяем по YOUTUBE_ID из схемы (его же требует
// player.js) и здесь: иначе обрезанная ссылка доходила бы до человека
// сообщением схемы «v[0] — id ролика…», а не сообщением с названием его колонки.

// Ссылка на ролик → { id, start } или null, если это не ссылка на ролик
// YouTube с правильным id.
export function parseYoutube(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  let id = null;
  if (parsed.hostname === 'youtu.be') {
    id = parsed.pathname.split('/')[1];
  } else if (YOUTUBE_HOSTS.has(parsed.hostname)) {
    const [, kind, rest] = parsed.pathname.split('/');
    if (kind === 'watch') id = parsed.searchParams.get('v');
    else if (kind === 'shorts' || kind === 'embed') id = rest;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const start = parseStart(parsed.searchParams.get('t') || parsed.searchParams.get('start') || '');
  return start === null ? null : { id, start };
}

// Подпись ролика по умолчанию — время начала: «8:43». Часы в формат не входят
// (3723 с дают «62:03»): метки у роликов упражнений короткие.
export function formatStart(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

// Заглушка для колонки, не прошедшей свою проверку: непустая строка. Её видит
// только itemProblems; в библиотеку строка с ошибкой не попадает.
const STAND_IN = '?';

// Ячейки одной строки → упражнение в форме записи библиотеки. Ошибки колонок
// уходят в errors все сразу. Колонка, не прошедшая свою проверку, ставится в
// упражнение заглушкой, чтобы itemProblems, который запускается для каждой
// строки, сказал только то, что от этой колонки не зависит, а не эхо уже
// названной ошибки: вместо названия, подписи, дозировки, техники и ключа —
// STAND_IN, вместо типа — «разминка», вместо паттерна — NO_LOAD_PATTERN (у него
// пустая разметка нагрузки допустима, так что её пустота не судится), вместо
// инвентаря — ['none'], вместо «Одностороннее» — false, группа мышц с
// непонятным значением считается размеченной (1), а видео и строки «Доп. видео»
// с ошибкой просто не попадают в упражнение.
function readRow(record, n, columnAt, errors, keyRows) {
  const raw = column => (record[columnAt.get(column)] ?? '').replace(/\r\n?/g, '\n');
  const get = column => raw(column).trim();
  const fail = (column, message) => errors.push(`Строка ${n}, «${column}»: ${message}`);
  const pick = (column, map, expected, standIn) => {
    const value = get(column);
    if (map.has(value.toLowerCase())) return map.get(value.toLowerCase());
    fail(column, `${expected} — получено «${value}»`);
    return standIn;
  };
  const yesNo = (column, standIn) => pick(column, YES_NO, '«да» или «нет»', standIn);
  const need = column => {
    const value = get(column);
    if (value !== '') return value;
    fail(column, 'не может быть пустым');
    return STAND_IN;
  };

  let key = get('Ключ');
  if (!KEY_PATTERN.test(key)) {
    fail('Ключ', `только строчная латиница, цифры и дефис, до 40 символов — получено «${key}»`);
    key = STAND_IN;
  } else if (keyRows.has(key)) {
    fail('Ключ', `ключ «${key}» уже есть в строке ${keyRows.get(key)}`);
  } else {
    keyRows.set(key, n);
  }

  const name = need('Название');
  const slot = pick('Тип', SLOTS, `одно из ${quoted(SLOTS.keys())}`);
  const pattern = pick('Паттерн', PATTERN_NAMES, `одно из ${quoted(PATTERN_NAMES.keys())}`, NO_LOAD_PATTERN);
  const muscles = need('Мышцы (подпись)');
  const reps = need('Дозировка');
  const text = need('Техника');

  let v;
  const videoUrl = get('Видео');
  const videoCaption = get('Подпись видео');
  if (videoUrl !== '') {
    const video = parseYoutube(videoUrl);
    if (video) v = [video.id, video.start, videoCaption || formatStart(video.start)];
    else fail('Видео', `не ссылка на ролик YouTube — «${videoUrl}»`);
  } else if (videoCaption !== '') {
    fail('Подпись видео', 'подпись есть, а видео нет');
  }

  // Номер строки в сообщении — номер строки в ячейке, как её видит человек, с
  // пустыми строками: считаем по raw, а не по обрезанному get.
  const links = [];
  raw('Доп. видео').split('\n').forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (line === '') return;
    // Строка уже без пробелов по краям, поэтому « — » стоит не раньше второго
    // символа и подпись перед ним непуста.
    const cut = line.lastIndexOf(' — ');
    const video = cut < 0 ? null : parseYoutube(line.slice(cut + 3).trim());
    if (video) links.push([video.id, video.start, line.slice(0, cut).trim()]);
    else fail('Доп. видео', `строка ${i + 1} — нужно «подпись — ссылка на YouTube», получено «${line}»`);
  });

  const gearCell = get('Инвентарь');
  let gear = gearCell.split(',').map(part => GEAR_BY_LABEL.get(part.trim().toLowerCase()));
  if (gear.includes(undefined)) {
    fail('Инвентарь', `через запятую из ${quoted(GEAR_BY_LABEL.keys())} — получено «${gearCell}»`);
    gear = [NO_GEAR];
  } else if (gear.includes(NO_GEAR) && gear.some(id => id !== NO_GEAR)) {
    // «Без инвентаря» не вид инвентаря, а его отсутствие: рядом с другим видом
    // оно противоречит само себе, и на карточке вышло бы «без инвентаря, гантели».
    fail('Инвентарь', `«${NO_GEAR_LABEL}» не сочетается с другим инвентарём — получено «${gearCell}»`);
    gear = [NO_GEAR];
  } else if (new Set(gear).size < gear.length) {
    // Повтор — почти наверняка опечатка («гантели, гантели» вместо «гантели,
    // гиря»): тихо схлопнутый, он потерял бы второй вид, а оставленный как есть
    // дал бы на карточке «гантели, гантели».
    const repeated = gear.find((id, i) => gear.indexOf(id) !== i);
    fail('Инвентарь', `инвентарь повторяется: «${gearLabel(repeated)}» — получено «${gearCell}»`);
    gear = [NO_GEAR];
  }

  const unilateral = yesNo('Одностороннее', false);

  // Сложность и многосуставность — только у силовых. При неизвестном типе не
  // проверяем ни то, ни другое: неясно, силовое ли это, и вторая ошибка была бы
  // догадкой.
  let difficulty;
  let compound;
  if (slot === 'strength') {
    difficulty = pick('Сложность', DIFFICULTIES, `у силового одно из ${quoted(DIFFICULTIES.keys())}`);
    compound = yesNo('Многосуставное');
  } else if (slot !== undefined) {
    for (const column of ['Сложность', 'Многосуставное']) {
      if (get(column) !== '') fail(column, 'заполняется только у силовых');
    }
  }

  // Порядок ключей load — порядок MUSCLES, а не колонок таблицы: от того, как
  // владелец переставит колонки, не должен меняться library.js.
  const load = {};
  for (const [id, { ru }] of Object.entries(MUSCLES)) {
    const value = get(ru);
    if (value === '') continue;
    if (value === '1') load[id] = 1;
    else if (value === '0,5' || value === '0.5') load[id] = 0.5;
    else {
      fail(ru, `пусто, 1 или 0,5 — получено «${value}»`);
      load[id] = 1;
    }
  }

  // Пустая разметка допустима «восстановлению» (itemProblems), но не силовому:
  // у пары из такого упражнения нет ни одной группы для подзаголовка, и своя
  // тренировка с ним не прошла бы проверку схемы. Паттерн «восстановление»
  // судим, только если он назван в ячейке: заглушка при неизвестном паттерне
  // тоже NO_LOAD_PATTERN, и сообщение о нём было бы эхом уже названной ошибки.
  // У других паттернов пустую разметку называет itemProblems.
  if (slot === 'strength' && PATTERN_NAMES.get(get('Паттерн').toLowerCase()) === NO_LOAD_PATTERN
      && Object.keys(load).length === 0) {
    errors.push(`Строка ${n}, колонки мышц: у силового нужна хотя бы одна группа — 1 или 0,5`);
  }

  const entry = { key, slot: slot ?? 'warmup', name, muscles, reps, text };
  const detail = get('Уточнение');
  const extra = get('Прогрессия');
  if (detail !== '') entry.detail = detail;
  if (extra !== '') entry.extra = extra;
  if (v) entry.v = v;
  if (links.length > 0) entry.links = links;
  Object.assign(entry, { load, pattern, gear, unilateral,
    kind: slot === undefined || slot === 'circuit' ? 'warmup' : slot });
  if (slot === 'strength') Object.assign(entry, { difficulty, compound });
  return entry;
}

// records — вывод parseCsv: первая запись заголовок. Возвращает entries: null,
// пока есть хоть одна ошибка, — частичной библиотеки не бывает.
export function buildLibrary(records, { previousKeys = [], allowRemoved = [] } = {}) {
  const errors = [];

  const header = (records[0] ?? []).map(name => name.trim());
  const columnAt = new Map();
  const repeated = [];
  const unknown = [];
  header.forEach((name, i) => {
    if (!COLUMNS.includes(name)) unknown.push(name);
    else if (columnAt.has(name)) repeated.push(name);
    else columnAt.set(name, i);
  });
  const missing = COLUMNS.filter(name => !columnAt.has(name));
  for (const name of missing) errors.push(`Заголовок: нет колонки «${name}»`);
  for (const name of unknown) errors.push(`Заголовок: неизвестная колонка «${name}»`);
  for (const name of repeated) errors.push(`Заголовок: колонка «${name}» повторяется`);
  // Без колонки строки не прочитать: каждая ругалась бы на то же самое
  // («Дозировка: не может быть пустым»), а без колонки «Ключ» пропавшими
  // оказались бы все прежние ключи. Лишняя и повторная колонки строкам не
  // мешают: у одноимённых берётся первая.
  if (missing.length > 0) return { entries: null, errors };

  const entries = [];
  const keyRows = new Map();
  const tableKeys = new Set();
  for (let i = 1; i < records.length; i++) {
    const record = records[i];
    // Пустые хвостовые строки таблицы приходят как «,,,,»; номера следующих
    // строк при этом не сдвигаются — они такие же, как в Google Sheets.
    if (record.every(value => value.trim() === '')) continue;
    const n = i + 1;
    tableKeys.add((record[columnAt.get('Ключ')] ?? '').trim());

    const rowErrors = [];
    const entry = readRow(record, n, columnAt, rowErrors, keyRows);
    // itemProblems — для каждой строки: независимые от колонок ошибки (пустая
    // разметка нагрузки при известном паттерне) иначе всплыли бы только вторым
    // запуском. Значения колонок, не прошедших проверку, в упражнении заменены
    // заглушками — см. readRow.
    for (const problem of itemProblems(entry, `упражнение «${entry.name}»`)) rowErrors.push(`Строка ${n}: ${problem}`);
    if (rowErrors.length === 0) entries.push(entry);
    errors.push(...rowErrors);
  }

  // Удаление упражнения ломает чужие сохранённые тренировки: они ссылаются на
  // ключи библиотеки. Поэтому пропажа — отказ, и снять его можно только
  // осознанно, флагом на конкретный ключ.
  for (const key of previousKeys) {
    if (tableKeys.has(key) || allowRemoved.includes(key)) continue;
    errors.push(`Ключ «${key}» был в библиотеке и пропал из таблицы. Удаление ломает сохранённые тренировки; `
      + `если это намеренно, запусти импорт с --allow-removed=${key}`);
  }

  return { entries: errors.length === 0 ? entries : null, errors };
}

// JSON.stringify сохраняет порядок полей, заданный в buildLibrary, и ничего не
// «улучшает»: вывод детерминирован, поэтому library.js можно сверить с тем, что
// импорт построил бы из library.csv заново, и поймать правку руками.
export function renderLibraryJs(entries) {
  return '// Сгенерировано tools/import-exercises.mjs из exercises/library.csv. Руками не править: правки идут в таблицу и импорт.\n'
    + `export default ${JSON.stringify(entries, null, 2)};\n`;
}

async function readSource(source) {
  if (!/^https?:\/\//i.test(source)) return readFileSync(source, 'utf8');
  // Таймаут: зависшее соединение иначе держало бы запуск бесконечно.
  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Не удалось скачать таблицу: ${response.status} ${response.statusText}`);
  // Не response.text(): он срезает BOM, и снимок отличался бы от того же файла,
  // прочитанного с диска. ignoreBOM оставляет его в строке.
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await response.arrayBuffer());
}

// Ключи прежней библиотеки — основа проверки «ничего не пропало». Нечитаемый
// файл — остановка, а не «ключей не было»: иначе повреждённый library.js молча
// отключил бы единственную защиту сохранённых тренировок. Читаем как модуль из
// data: URL, чтобы не зависеть от package.json рядом с файлом (--out может
// указывать куда угодно).
async function readPreviousKeys(file) {
  if (!existsSync(file)) return [];
  try {
    const { default: entries } = await import('data:text/javascript,' + encodeURIComponent(readFileSync(file, 'utf8')));
    if (!Array.isArray(entries) || entries.some(entry => typeof entry?.key !== 'string')) {
      throw new Error('это не список упражнений с ключами');
    }
    return entries.map(entry => entry.key);
  } catch (error) {
    throw new Error(`Не удалось прочитать прежнюю библиотеку ${file}: ${error.message}. Без неё нельзя проверить, что ключи не пропали.`);
  }
}

async function main(argv) {
  const usage = 'node tools/import-exercises.mjs <файл.csv | https://…> [--allow-removed=ключ1,ключ2] [--out=каталог]';
  let parsed;
  try {
    parsed = parseArgs({ args: argv, allowPositionals: true,
      options: { 'allow-removed': { type: 'string' }, out: { type: 'string' } } });
  } catch (error) {
    throw new Error(`${error.message}\nЗапуск: ${usage}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length !== 1) throw new Error(`Нужен один аргумент — файл CSV или ссылка.\nЗапуск: ${usage}`);

  // Каталог по умолчанию — exercises/ репозитория, где бы ни запустили скрипт
  // (как docs/muscle-map.md у muscle-report.js); заданный --out — от текущей папки.
  const out = values.out ? resolve(values.out) : fileURLToPath(new URL('../exercises/', import.meta.url));
  const allowRemoved = (values['allow-removed'] ?? '').split(',').map(key => key.trim()).filter(Boolean);

  const csv = await readSource(positionals[0]);
  const previousKeys = await readPreviousKeys(join(out, 'library.js'));
  const { entries, errors } = buildLibrary(parseCsv(csv), { previousKeys, allowRemoved });
  if (!entries) {
    console.error(errors.join('\n'));
    console.error(`\nОшибок: ${errors.length}. Файлы не записаны.`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'library.csv'), csv);
  writeFileSync(join(out, 'library.js'), renderLibraryJs(entries));
  console.log(`Библиотека обновлена: ${entries.length} упражнений → ${join(out, 'library.js')}`);
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
