// Своя тренировка в двух видах. Хранится сжатая запись — списки ключей
// упражнений библиотеки, умещающаяся в одно значение облачного хранилища
// (VALUE_MAX). Рисуется полная тренировка, такая же, как готовая из workouts/,
// и проходит ту же проверку схемы. Тексты упражнений в записи не лежат: правка
// библиотеки доходит до своих тренировок так же, как до готовых.
import { LIBRARY, toItem } from '../exercises/index.js';
import { groupsPhrase } from '../muscles.js';
import { LEVELS, ZONES, MANUAL_ROUNDS, SKELETON } from './rules.js';
import { KEY_PATTERN } from '../workouts/schema.js';
import { arrangeStrength } from './arrange.js';
import { hasOwn } from '../own.js';
import { formatOf } from './format.js';
import {
  plural, PAIR_PREAMBLE, LOOP_PREAMBLE, SETS_PREAMBLE, BLOCK_TEXTS, CAUTION, progressionFor, kickerFor, leadFor,
  equipmentFor,
} from './texts.js';

// Compact = { v: 1, name, days, level: LevelId | null, zones: ZoneId[],
//             format: FormatId, warmup: key[], circuit: key[], strength: key[],
//             focus: [key, ZoneId][], cooldown: key[], t: number }
// t — время сборки в миллисекундах (Date.now()).
// format — вид силовой части (builder/format.js). У записи, сохранённой до его
// появления, поля нет: parseCompact читает её как «Пары». Выключенная разминка,
// разогрев или завершение — пустой список своего слота, отдельного поля нет:
// так запись читает и прежняя версия приложения.

// Имя — до 60 знаков (по длине строки, как maxlength поля ввода). Значение в
// облаке — до 4096 знаков: самая большая запись (18 силовых, 7 дней, ключи по
// 40 знаков) занимает около 1500, а с именем из управляющих знаков, которые
// JSON пишет по шесть, около 1800; поле format прибавляет около двадцати
// знаков — запас по-прежнему больше чем вдвое.
export const NAME_MAX = 60;
export const VALUE_MAX = 4096;

const SLOTS = ['warmup', 'circuit', 'strength', 'cooldown'];

export function serializeCompact(compact) {
  return JSON.stringify(compact);
}

// Шаблон ключа — тот, по которому импорт принимает упражнения в библиотеку.
const isKey = value => typeof value === 'string' && KEY_PATTERN.test(value);
const isOwn = (object, id) => typeof id === 'string' && hasOwn(object, id);
const isDistinctArray = (value, ok) => Array.isArray(value) && value.every(ok) && new Set(value).size === value.length;

// Читает запись из текста. Форму проверяем целиком, а не по версии: запись пришла
// из облака, и «чужое» (другая версия, битый JSON, запись не нашего приложения)
// не должно доехать до развёртки, где упало бы или нарисовало пустое. Возвращаем
// копию только со своими полями: лишнее не выживает чтение. Пробелы вместо
// названия — это пусто; кавычки, эмодзи и пробелы по краям — просто текст,
// и сохраняются как есть. Исключение — format: его нет в записи, сохранённой
// раньше, а незнакомое значение пришло из другой версии. Ни то ни другое не
// делает запись нечитаемой: формат читается как «Пары» (formatOf), и в копии
// поле есть всегда.
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
    v, name, days: [...days], level, zones: [...zones], format: formatOf(data),
    warmup: [...data.warmup], circuit: [...data.circuit], strength: [...data.strength],
    focus: focus.map(([key, zone]) => [key, zone]), cooldown: [...data.cooldown], t,
  };
}

// Кругов силовой части: у подобранной — по уровню, у ручной сборки — свои. В
// «Подходах» то же число — подходов на упражнение, поэтому от формата оно не
// зависит.
export function roundsOf(compact) {
  return compact.level === null ? MANUAL_ROUNDS : LEVELS[compact.level].rounds;
}

// Все ключи всех слотов; упор — это пометка на упражнении из strength, а не
// отдельные упражнения, и в счёт не идёт.
export function exerciseCount(compact) {
  return SLOTS.reduce((sum, slot) => sum + compact[slot].length, 0);
}

// Группы пары для подзаголовка (в «Подходах» — одного упражнения): целевые
// (доля 1) без повторов, по порядку упражнений. Упражнение, размеченное одними
// вспомогательными долями, библиотека допускает; пара из таких назвала бы
// пустую строку, поэтому в этом случае называются все размеченные группы.
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

// id блоков скелета: разминка, разогрев и завершение. Всё остальное в
// тренировке — силовые блоки, и называются они по формату (pair1, loop, ex1…),
// поэтому экран отличает силовые от скелета по этому списку, а не по началу id.
export const SKELETON_BLOCK_IDS = ['start', 'circuit', 'finish'];

// Вторая строка шапки, про круги: v — число, l — к чему оно. С разогревом стоит
// «3 + 2» (круги разогрева плюс силовые); без него «3 +» ничего не значило бы
// и уходит, а подпись называет только силовую часть. Подписи свои у каждого
// формата: в «Круге» и «Подходах» «каждой пары» было бы неправдой.
function roundsStat(format, rounds, hasCircuit) {
  const withCircuit = {
    pairs: 'круга разминки + каждой пары',
    loop: 'круга разминки + силового круга',
    sets: 'круга разминки + подхода на упражнение',
  };
  const without = {
    pairs: () => `${plural(rounds, ['круг', 'круга', 'кругов'])} каждой пары`,
    loop: () => plural(rounds, ['силовой круг', 'силовых круга', 'силовых кругов']),
    sets: () => `${plural(rounds, ['подход', 'подхода', 'подходов'])} на упражнение`,
  };
  return hasCircuit
    ? { v: `${SKELETON.circuit.rounds} + ${rounds}`, l: withCircuit[format] }
    : { v: String(rounds), l: without[format]() };
}

// Полная тренировка по сжатой записи. Ключ, которого уже нет в библиотеке
// (упражнение убрали из таблицы), пропускается и попадает в removed: показать
// это человеку — дело экрана, а тренировка остаётся целой и проходит схему.
//
// Силовые раскладываются по формату записи, но в одном и том же порядке —
// том, что даёт arrangeStrength, пары подряд. Подходов на упражнение везде
// столько же (roundsOf), поэтому недельная нагрузка, пороги уровней и проверка
// покрытия от формата не зависят; меняются только блоки и подписи.
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

  const format = formatOf(compact);
  const rounds = roundsOf(compact);
  const pairs = arrangeStrength(found.strength);
  const order = pairs.flat();

  add('start', BLOCK_TEXTS.start, SKELETON.warmup.rounds, found.warmup);
  add('circuit', BLOCK_TEXTS.circuit, SKELETON.circuit.rounds, found.circuit);
  if (format === 'pairs') {
    pairs.forEach((pair, index) => {
      const number = index + 1;
      add(`pair${number}`, {
        nav: `Пара ${number}`,
        title: `Пара ${number}`,
        sub: capitalize(groupsPhrase(pairGroups(pair))),
      }, rounds, pair, number === 1 ? { preamble: PAIR_PREAMBLE } : {});
    });
  } else if (format === 'loop') {
    const n = order.length;
    add('loop', {
      nav: 'Силовые',
      title: 'Силовой круг',
      sub: `${n} ${plural(n, ['упражнение', 'упражнения', 'упражнений'])} подряд`,
    }, rounds, order, { preamble: LOOP_PREAMBLE });
  } else {
    // Блок на упражнение, а не один блок на всё: подходы одного упражнения идут
    // подряд, и «Сегодня» рисует его отдельной карточкой с отметками «Подход N».
    // unit: 'sets' меняет только подписи отметок и метки блока (render.js).
    order.forEach((entry, index) => {
      const number = index + 1;
      add(`ex${number}`, {
        nav: `Упр. ${number}`,
        title: `Упражнение ${number}`,
        sub: capitalize(groupsPhrase(pairGroups([entry]))),
      }, rounds, [entry], { unit: 'sets', ...(number === 1 ? { preamble: SETS_PREAMBLE } : {}) });
    });
  }
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
      roundsStat(format, rounds, found.circuit.length > 0),
    ],
    equipment: equipmentFor(all),
    blocks,
    progression: progressionFor(compact.level, format),
    caution: CAUTION,
  };
  return { workout, removed };
}
