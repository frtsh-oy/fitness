// Библиотека упражнений: единственное место, где упражнение описано целиком.
// Тренировка берёт упражнение по ключу (item('rdl')) и не копирует его текст
// к себе, поэтому правка в таблице доходит до всех тренировок разом.
// Данные — library.js, его строит tools/import-exercises.mjs из library.csv.
import LIBRARY from './library.js';

export { LIBRARY };

// Подписи для экрана. Значения slot и difficulty в записях — латиница из
// импорта; русский текст живёт здесь, а не в данных.
export const SLOT_LABELS = { warmup: 'Разминка', circuit: 'Разогрев', strength: 'Силовое', cooldown: 'Завершение' };
export const DIFFICULTY_LABELS = { basic: 'Базовое', medium: 'Среднее', hard: 'Сложное' };
// Подписи pattern — те же слова, что в колонке «Движение» таблицы (PATTERN_NAMES
// в импорте), но с заглавной: на экране это отдельная подпись чипа. Порядок —
// порядок чипов в библиотеке, он же порядок PATTERNS в схеме.
export const PATTERN_LABELS = {
  hinge: 'Наклон от таза',
  squat: 'Присед',
  lunge: 'Выпад',
  push: 'Жим',
  pull: 'Тяга',
  core: 'Кор',
  isolation: 'Изолирующее',
  mobility: 'Подвижность',
  stretch: 'Растяжка',
  recovery: 'Восстановление',
};

// Map, а не объект: по объекту «constructor» или «__proto__» нашёлся бы как
// упражнение, и item() вернул бы не ошибку, а мусор.
const BY_KEY = new Map(LIBRARY.map(e => [e.key, e]));

export function entry(key) {
  return BY_KEY.get(key);
}

// Упражнение в форме, которую читает тренировка (workouts/schema.js). slot,
// difficulty и compound нужны только библиотеке — для отбора в конструкторе, —
// а в упражнении тренировки схема их не знает.
// Копия поверхностная: вложенные load, gear, v и links общие с записью
// библиотеки и считаются неизменяемыми — код приложения упражнение на месте не
// меняет. Начнёт конструктор их править — понадобится структурная копия.
export function toItem(e) {
  const { slot, difficulty, compound, ...rest } = e;
  return rest;
}

// Дозировка — свойство программы, а не упражнения: «птица-собака» в одной
// тренировке идёт по 6–8 раз с паузой, в другой — по 15. Поэтому готовая
// тренировка может задать своё reps, и только его: техника, видео и разметка
// мышц остаются общими и правятся в таблице, иначе у упражнения снова было бы
// два источника правды. Другое поле в overrides — ошибка, а не тихая замена.
const OVERRIDABLE = new Set(['reps']);

export function item(key, overrides = {}) {
  const e = entry(key);
  if (!e) throw new Error(`Нет упражнения «${key}» в библиотеке`);
  for (const field of Object.keys(overrides)) {
    if (!OVERRIDABLE.has(field)) throw new Error(`Упражнение «${key}»: тренировка может заменить только reps, а не ${field}`);
  }
  return { ...toItem(e), ...overrides };
}
