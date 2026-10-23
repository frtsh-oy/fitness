// Поиск упражнений по тексту: один на библиотеку и на шторку замены. Запрос и
// название сравниваются в одном виде, и искать можно по названию, подписи мышц,
// целевым группам, движению и инвентарю — так человек находит упражнение тем
// словом, которым сам его называет.
import { PATTERN_LABELS } from '../exercises/index.js';
import { muscleLabel } from '../muscles.js';
import { gearText } from '../gear.js';

// Без регистра, «ё» как «е» (на телефоне «ё» набирают редко, и «Ёлочка» должна
// находиться по «елоч»), без пробелов по краям (клавиатура телефона любит
// дописать пробел после слова).
export function normalizeQuery(text) {
  return text.toLowerCase().replaceAll('ё', 'е').trim();
}

// Где ищет поиск: название, подпись мышц с карточки, целевые группы (доля 1,
// как у зоны), движение и инвентарь. Подпись мышц пишут по-разному («Бёдра и
// ягодицы»), а названия групп из словаря одни и те же: по «квадрицепс»
// находится и приседание, у которого в подписи «бёдра». Инвентарь — той же
// подписью, что на карточке: по «петл» находятся упражнения с мини-петлёй, по
// «без инв» — без инвентаря.
export function entrySearchText(entry) {
  const targets = Object.keys(entry.load).filter(group => entry.load[group] === 1).map(muscleLabel);
  return normalizeQuery([entry.name, entry.muscles, ...targets, PATTERN_LABELS[entry.pattern], gearText(entry)].join(' '));
}

// Запрос делится на слова, и найтись должно каждое, в любом порядке: «мост
// петл» — мосты с мини-петлёй. Пустой запрос находит всё.
export function matchesQuery(entry, query) {
  const words = normalizeQuery(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = entrySearchText(entry);
  return words.every(word => text.includes(word));
}
