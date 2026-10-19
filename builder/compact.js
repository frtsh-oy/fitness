// Своя тренировка в двух видах. Хранится сжатая запись — списки ключей
// упражнений библиотеки, умещающаяся в одно значение облачного хранилища
// (VALUE_MAX). Рисуется полная тренировка, такая же, как готовая из workouts/,
// и проходит ту же проверку схемы. Тексты упражнений в записи не лежат: правка
// библиотеки доходит до своих тренировок так же, как до готовых.
import { LIBRARY, toItem } from '../exercises/index.js';
import { groupsPhrase } from '../muscles.js';
import { LEVELS, ZONES, MANUAL_ROUNDS, SKELETON } from './rules.js';
import { arrangeStrength } from './arrange.js';
import {
  plural, PAIR_PREAMBLE, BLOCK_TEXTS, CAUTION, progressionFor, kickerFor, leadFor, equipmentFor,
} from './texts.js';

// Compact = { v: 1, name, days, level: LevelId | null, zones: ZoneId[],
//             warmup: key[], circuit: key[], strength: key[],
//             focus: [key, ZoneId][], cooldown: key[], t: number }
// t — время сборки в миллисекундах (Date.now()).

// Имя — до 60 знаков (по длине строки, как maxlength поля ввода). Значение в
// облаке — до 4096 знаков: самая большая запись (18 силовых, 7 дней, ключи по
// 40 знаков) занимает около 1500, а с именем из управляющих знаков, которые
// JSON пишет по шесть, около 1800 — запас больше чем вдвое.
export const NAME_MAX = 60;
export const VALUE_MAX = 4096;

// Ключ упражнения — как в библиотеке (тот же шаблон проверяет импорт таблицы,
// tools/import-exercises.mjs; из tools/ приложение не импортирует).
const KEY = /^[a-z0-9-]{1,40}$/;
const SLOTS = ['warmup', 'circuit', 'strength', 'cooldown'];

export function serializeCompact(compact) {
  return JSON.stringify(compact);
}

const isKey = value => typeof value === 'string' && KEY.test(value);
const isOwn = (object, id) => typeof id === 'string' && Object.hasOwn(object, id);
const isDistinctArray = (value, ok) => Array.isArray(value) && value.every(ok) && new Set(value).size === value.length;

// Читает запись из текста. Форму проверяем целиком, а не по версии: запись пришла
// из облака, и «чужое» (другая версия, битый JSON, запись не нашего приложения)
// не должно доехать до развёртки, где упало бы или нарисовало пустое. Возвращаем
// копию только со своими полями: лишнее не выживает чтение. Пробелы вместо
// названия — это пусто; кавычки, эмодзи и пробелы по краям — просто текст,
// и сохраняются как есть.
export function parseCompact(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const { v, name, days, level, zones, focus, t } = data;

  if (v !== 1) return null;
  if (typeof name !== 'string' || name.trim() === '' || name.length > NAME_MAX) return null;
  if (!isDistinctArray(days, d => Number.isInteger(d) && d >= 1 && d <= 7) || days.length === 0) return null;
  if (level !== null && !isOwn(LEVELS, level)) return null;
  if (!isDistinctArray(zones, z => isOwn(ZONES, z))) return null;
  for (const slot of SLOTS) {
    if (!isDistinctArray(data[slot], isKey)) return null;
  }
  if (!Array.isArray(focus) || !focus.every(pair => Array.isArray(pair) && pair.length === 2 && isKey(pair[0]) && isOwn(ZONES, pair[1]))) return null;
  if (!Number.isSafeInteger(t) || t < 0) return null;

  return {
    v, name, days: [...days], level, zones: [...zones],
    warmup: [...data.warmup], circuit: [...data.circuit], strength: [...data.strength],
    focus: focus.map(([key, zone]) => [key, zone]), cooldown: [...data.cooldown], t,
  };
}

// Кругов в силовой паре: у подобранной — по уровню, у ручной сборки — свои.
export function roundsOf(compact) {
  return compact.level === null ? MANUAL_ROUNDS : LEVELS[compact.level].rounds;
}

// Все ключи всех слотов; упор — это пометка на упражнении из strength, а не
// отдельные упражнения, и в счёт не идёт.
export function exerciseCount(compact) {
  return SLOTS.reduce((sum, slot) => sum + compact[slot].length, 0);
}

// Группы пары для подзаголовка: целевые (доля 1) без повторов, по порядку
// упражнений. Упражнение, размеченное одними вспомогательными долями, библиотека
// допускает; пара из таких назвала бы пустую строку, поэтому в этом случае
// называются все размеченные группы.
function pairGroups(pair) {
  const groupsWith = wanted => {
    const groups = [];
    for (const e of pair) {
      for (const [group, share] of Object.entries(e.load)) {
        if (wanted(share) && !groups.includes(group)) groups.push(group);
      }
    }
    return groups;
  };
  const targets = groupsWith(share => share === 1);
  return targets.length > 0 ? targets : groupsWith(() => true);
}

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);

// Полная тренировка по сжатой записи. Ключ, которого уже нет в библиотеке
// (упражнение убрали из таблицы), пропускается и попадает в removed: показать
// это человеку — дело экрана, а тренировка остаётся целой и проходит схему.
export function expandWorkout(id, compact, library = LIBRARY) {
  const byKey = new Map(library.map(e => [e.key, e]));
  const removed = [];
  const found = {};
  for (const slot of SLOTS) {
    found[slot] = [];
    for (const key of compact[slot]) {
      const e = byKey.get(key);
      if (e) found[slot].push(e);
      else removed.push(key);
    }
  }

  const focusKeys = new Set(compact.focus.map(([key]) => key));
  const itemOf = e => {
    const item = toItem(e);
    if (focusKeys.has(e.key)) item.focus = true;
    return item;
  };

  const blocks = [];
  // Блок без упражнений не рисуется, а номера идут подряд по нарисованным:
  // дыра в «01, 02, 04» выглядела бы потерей блока.
  const add = (blockId, text, rounds, entries, extra = {}) => {
    if (entries.length === 0) return;
    blocks.push({
      id: blockId,
      n: String(blocks.length + 1).padStart(2, '0'),
      nav: text.nav,
      title: text.title,
      sub: text.sub,
      ...(text.note ? { note: text.note } : {}),
      ...extra,
      rounds,
      items: entries.map(itemOf),
    });
  };

  add('start', BLOCK_TEXTS.start, SKELETON.warmup.rounds, found.warmup);
  add('circuit', BLOCK_TEXTS.circuit, SKELETON.circuit.rounds, found.circuit);
  arrangeStrength(found.strength).forEach((pair, index) => {
    const number = index + 1;
    add(`pair${number}`, {
      nav: `Пара ${number}`,
      title: `Пара ${number}`,
      sub: capitalize(groupsPhrase(pairGroups(pair))),
    }, roundsOf(compact), pair, number === 1 ? { preamble: PAIR_PREAMBLE } : {});
  });
  add('finish', BLOCK_TEXTS.finish, SKELETON.cooldown.rounds, found.cooldown);

  const all = SLOTS.flatMap(slot => found[slot]);
  const count = all.length;
  const workout = {
    id,
    kicker: kickerFor(compact.level),
    title: compact.name,
    titleLines: [compact.name],
    lead: leadFor(compact.level, compact.zones),
    days: [...compact.days],
    stats: [
      { v: String(count), l: plural(count, ['упражнение', 'упражнения', 'упражнений']) },
      { v: `3 + ${roundsOf(compact)}`, l: 'круга разминки + каждой пары' },
    ],
    equipment: equipmentFor(all),
    blocks,
    progression: progressionFor(compact.level),
    caution: CAUTION,
  };
  return { workout, removed };
}
