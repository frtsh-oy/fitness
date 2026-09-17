// Расчёт тренировочного объёма. Ни DOM, ни библиотеки карты, ни конкретной
// тренировки: на вход объект по схеме, на выход числа. Это же основание для
// будущей оценки недельной нагрузки, поэтому модуль обязан жить отдельно
// от рисования картинки.
import { MUSCLES, toRegions } from './muscles.js';

// Объёмы выше этого числа библиотека красит последним оттенком палитры,
// различие между ними на карте пропадёт. Это принятое ограничение,
// не защита: текущий максимум на регион в нашей тренировке — шесть подходов.
export const PALETTE_STEPS = 6;

function itemsOfKind(workout, kind) {
  const rows = [];
  for (const block of workout.blocks) {
    for (const item of block.items) {
      if (item.kind !== kind) continue;
      rows.push({ item, rounds: block.rounds });
    }
  }
  return rows;
}

export function setsByGroup(workout, kind) {
  const sets = new Map();
  for (const { item, rounds } of itemsOfKind(workout, kind)) {
    for (const [group, share] of Object.entries(item.load)) {
      sets.set(group, (sets.get(group) ?? 0) + share * rounds);
    }
  }
  return sets;
}

export function setsByRegion(workout, kind) {
  const sets = new Map();
  for (const [group, value] of setsByGroup(workout, kind)) {
    if (!Object.hasOwn(MUSCLES, group)) {
      throw new Error(`Неизвестная группа мышц: ${group}`);
    }
    const region = MUSCLES[group].region;
    sets.set(region, (sets.get(region) ?? 0) + value);
  }
  return sets;
}

export function exerciseEntries(workout, kind) {
  const entries = [];
  for (const { item, rounds } of itemsOfKind(workout, kind)) {
    // toRegions сворачивает группы упражнения в регионы, поэтому две группы
    // одного региона внутри одного упражнения дают одну запись, а не две.
    // Форма этой функции подогнана под то, как библиотека карты суммирует частоту.
    // Для будущей оценки недельной нагрузки опираться на setsByGroup и setsByRegion.
    for (const [region, share] of toRegions(item.load)) {
      // Схема гарантирует, что доля равна 0.5 или 1, а rounds — целое не меньше 1.
      // Поэтому произведение никогда не меньше 0.5, а Math.round(0.5) даёт 1.
      // Инвариант (минимум один подход) обеспечен входными данными, а не защитой.
      entries.push({
        name: item.name,
        key: item.key,
        muscles: [region],
        frequency: Math.round(share * rounds),
      });
    }
  }
  return entries;
}
