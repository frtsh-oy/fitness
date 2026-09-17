// Расчёт тренировочного объёма. Ни DOM, ни библиотеки карты, ни конкретной
// тренировки: на вход объект по схеме, на выход числа. Это же основание для
// будущей оценки недельной нагрузки, поэтому модуль обязан жить отдельно
// от рисования картинки.
import { MUSCLES, toRegions } from './muscles.js';

// Максимум объёма на регион в текущей тренировке — шесть подходов на ягодичные.
// Столько же уровней в палитре, иначе разница между 6 и 3 подходами пропадёт.
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
    for (const [region, share] of toRegions(item.load)) {
      // Округление вверх от нуля: доля 0.5 на один круг — это половина
      // подхода, но группа задействована, и серой на карте быть не должна.
      entries.push({
        name: item.name,
        key: item.key,
        muscles: [region],
        frequency: Math.max(1, Math.round(share * rounds)),
      });
    }
  }
  return entries;
}
