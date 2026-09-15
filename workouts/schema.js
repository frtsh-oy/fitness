import { isMuscleId } from '../muscles.js';

export const PATTERNS = ['hinge', 'squat', 'lunge', 'push', 'pull', 'core', 'isolation', 'mobility', 'stretch'];
export const GEAR = ['band_long', 'loop_short', 'none'];
export const KINDS = ['warmup', 'strength', 'cooldown'];
export const LOAD_VALUES = [0.5, 1];

const WORKOUT_FIELDS = ['id', 'kicker', 'title', 'titleLines', 'lead', 'days', 'stats', 'equipment', 'blocks', 'progression', 'caution'];
const BLOCK_FIELDS = ['id', 'n', 'nav', 'title', 'sub', 'rounds', 'items'];
const ITEM_FIELDS = ['key', 'name', 'muscles', 'reps', 'text', 'load', 'pattern', 'gear', 'unilateral', 'kind'];

const WORKOUT_TEXT_FIELDS = ['id', 'kicker', 'title', 'lead', 'equipment', 'caution'];
const BLOCK_TEXT_FIELDS = ['id', 'n', 'nav', 'title', 'sub'];
const ITEM_TEXT_FIELDS = ['name', 'muscles', 'reps', 'text'];

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// Часть абзаца preamble: либо обычный текст, либо { b: 'текст' } для полужирного —
// так инлайновая разметка переносится без innerHTML и без своего мини-языка.
function isValidPreamblePart(part) {
  if (typeof part === 'string') return part.length > 0;
  if (typeof part === 'object' && part !== null && !Array.isArray(part)) {
    const keys = Object.keys(part);
    return keys.length === 1 && keys[0] === 'b' && isNonEmptyString(part.b);
  }
  return false;
}

export function validateWorkout(workout) {
  const problems = [];

  for (const field of WORKOUT_FIELDS) {
    if (workout[field] === undefined) problems.push(`Тренировка: нет поля ${field}`);
  }
  for (const field of WORKOUT_TEXT_FIELDS) {
    if (workout[field] !== undefined && !isNonEmptyString(workout[field])) problems.push(`Тренировка: поле ${field} должно быть непустой строкой`);
  }
  if (!Array.isArray(workout.titleLines) || workout.titleLines.length < 1 || workout.titleLines.length > 2
      || workout.titleLines.some(line => typeof line !== 'string' || line.length === 0)) {
    problems.push('Тренировка: titleLines должен быть массивом из одной или двух непустых строк');
  }
  // days — дни недели по ISO-8601 (1 — понедельник, 7 — воскресенье). Это
  // единственный источник расписания: строки «ПН · СР · ПТ» в шапке и
  // «Понедельник · Среда · Пятница» в подвале строит render.js. Заодно это
  // машиночитаемая частота для будущей оценки недельной нагрузки, которую
  // из строки было не достать.
  if (!Array.isArray(workout.days) || workout.days.length === 0) {
    problems.push('Тренировка: days должен быть непустым массивом');
  } else {
    const seenDays = new Set();
    for (const day of workout.days) {
      if (!Number.isInteger(day) || day < 1 || day > 7) {
        problems.push(`Тренировка: день недели должен быть целым числом от 1 до 7, получено ${day}`);
      } else if (seenDays.has(day)) {
        problems.push(`Тренировка: день недели ${day} указан дважды`);
      }
      seenDays.add(day);
    }
  }
  if (!Array.isArray(workout.stats)) {
    problems.push('Тренировка: stats должен быть массивом');
  } else {
    for (const stat of workout.stats) {
      if (!isNonEmptyString(stat.v) || !isNonEmptyString(stat.l)) {
        problems.push('Тренировка: каждый элемент stats должен иметь непустые строковые поля v и l');
      }
    }
  }
  if (!Array.isArray(workout.progression)) {
    problems.push('Тренировка: progression должен быть массивом');
  } else {
    for (const item of workout.progression) {
      if (!isNonEmptyString(item)) {
        problems.push('Тренировка: каждый элемент progression должен быть непустой строкой');
      }
    }
  }
  if (!Array.isArray(workout.blocks)) return problems;

  const seenBlockIds = new Set();
  for (const block of workout.blocks) {
    const where = `Блок ${block.id ?? '?'}`;
    for (const field of BLOCK_FIELDS) {
      if (block[field] === undefined) problems.push(`${where}: нет поля ${field}`);
    }
    for (const field of BLOCK_TEXT_FIELDS) {
      if (block[field] !== undefined && !isNonEmptyString(block[field])) problems.push(`${where}: поле ${field} должно быть непустой строкой`);
    }
    if (seenBlockIds.has(block.id)) {
      problems.push(`${where}: дубликат id`);
    }
    seenBlockIds.add(block.id);
    if (!Number.isInteger(block.rounds) || block.rounds < 1) {
      problems.push(`${where}: rounds должен быть целым числом не меньше 1, получено ${block.rounds}`);
    }

    if (block.preamble !== undefined) {
      const { preamble } = block;
      if (typeof preamble !== 'object' || preamble === null || Array.isArray(preamble)) {
        problems.push(`${where}: preamble должен быть объектом`);
      } else {
        if (!isNonEmptyString(preamble.title)) problems.push(`${where}: preamble.title должен быть непустой строкой`);
        if (!Array.isArray(preamble.paragraphs) || preamble.paragraphs.length === 0) {
          problems.push(`${where}: preamble.paragraphs должен быть непустым массивом`);
        } else {
          preamble.paragraphs.forEach((paragraph, pi) => {
            if (!Array.isArray(paragraph) || paragraph.length === 0) {
              problems.push(`${where}: preamble.paragraphs[${pi}] должен быть непустым массивом`);
              return;
            }
            paragraph.forEach((part, parti) => {
              if (!isValidPreamblePart(part)) {
                problems.push(`${where}: preamble.paragraphs[${pi}][${parti}] должен быть непустой строкой либо объектом { b: непустая строка }`);
              }
            });
          });
        }
      }
    }

    if (block.items !== undefined && !Array.isArray(block.items)) {
      problems.push(`${where}: items должен быть массивом`);
      continue;
    }
    if (!Array.isArray(block.items)) continue;
    if (block.items.length === 0) {
      problems.push(`${where}: items не может быть пустым массивом`);
      continue;
    }

    // key — устойчивый идентификатор упражнения: из него строится идентификатор
    // отметки (см. render.js). Требуется у каждого упражнения и обязан быть
    // уникальным внутри блока. Без первого отметки «переезжают» на соседей при
    // любой вставке упражнения, без второго два чекбокса схлопываются в один
    // идентификатор — и оба раза молча, потому что countMarks по-прежнему
    // насчитает 37.
    const seenKeys = new Set();
    for (const item of block.items) {
      const at = `${where}, упражнение «${item.name ?? '?'}»`;
      for (const field of ITEM_FIELDS) {
        if (item[field] === undefined) problems.push(`${at}: нет поля ${field}`);
      }
      // Отсутствие key уже названо выше, поэтому здесь только форма и уникальность.
      if (item.key !== undefined) {
        if (!isNonEmptyString(item.key)) problems.push(`${at}: key должен быть непустой строкой`);
        else if (seenKeys.has(item.key)) problems.push(`${at}: дубликат key ${item.key} внутри блока`);
        seenKeys.add(item.key);
      }
      for (const field of ITEM_TEXT_FIELDS) {
        if (item[field] !== undefined && !isNonEmptyString(item[field])) problems.push(`${at}: поле ${field} должно быть непустой строкой`);
      }
      if (!PATTERNS.includes(item.pattern)) problems.push(`${at}: неизвестный pattern ${item.pattern}`);
      if (!KINDS.includes(item.kind)) problems.push(`${at}: неизвестный kind ${item.kind}`);
      if (typeof item.unilateral !== 'boolean') problems.push(`${at}: unilateral должен быть true или false`);

      if (!Array.isArray(item.gear)) {
        problems.push(`${at}: gear должен быть массивом`);
      } else {
        for (const g of item.gear) {
          if (!GEAR.includes(g)) problems.push(`${at}: неизвестный инвентарь ${g}`);
        }
      }

      if (item.load !== undefined && (typeof item.load !== 'object' || item.load === null || Array.isArray(item.load))) {
        problems.push(`${at}: load должен быть объектом`);
        continue;
      }
      const load = item.load ?? {};
      const entries = Object.entries(load);
      // Непустой load нужен упражнению ЛЮБОГО типа, а не только силовому.
      // Пустой load у растяжки выбрасывал информацию без нужды: будущая карта
      // тела определена как «клик по мышце даёт упражнения на неё», и без
      // разметки клик по сгибателям бедра не покажет растяжку сгибателей бедра,
      // потому что данные не знают, что это она. Разминку и заминку от объёма
      // отделяет kind, а не пустота разметки.
      if (entries.length === 0) {
        problems.push(`${at}: нужен непустой load`);
      }
      for (const [id, value] of entries) {
        if (!isMuscleId(id)) problems.push(`${at}: неизвестная группа мышц ${id}`);
        if (!LOAD_VALUES.includes(value)) problems.push(`${at}: load[${id}] должен быть 1 или 0.5, получено ${value}`);
      }
    }
  }
  return problems;
}

export function countMarks(workout) {
  return workout.blocks.reduce((sum, block) => sum + block.rounds * block.items.length, 0);
}
