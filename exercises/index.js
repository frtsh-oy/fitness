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

export function item(key) {
  const e = entry(key);
  if (!e) throw new Error(`Нет упражнения «${key}» в библиотеке`);
  return toItem(e);
}
