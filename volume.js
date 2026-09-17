// Расчёт тренировочного объёма. Ни DOM, ни библиотеки карты, ни конкретной
// тренировки: на вход объект по схеме, на выход числа. Это же основание для
// будущей оценки недельной нагрузки, поэтому модуль обязан жить отдельно
// от рисования картинки.
import { MUSCLES, isMuscleId, toRegions } from './muscles.js';

// Сколько уровней объёма различает карта. Во время работы приложения эта
// константа ни на что не влияет: шкалу задаёт длина PALETTE из bodymap.js,
// которая уходит в библиотеку целиком, а PALETTE_STEPS приложение не
// импортирует — её читают только тесты. Это записанное здесь ожидание, за
// которым следят два теста: длина PALETTE обязана ей равняться («палитра ровно
// на число уровней объёма», test/bodymap.test.js), а объём на регион — её не
// превышать («палитра закрывает максимальный объём по всем тренировкам»,
// test/volume.test.js). Смысл ожидания: объёмы выше шкалы библиотека покрасит
// последним оттенком, и различие между ними на карте пропадёт. Текущий
// максимум на регион в нашей тренировке — шесть подходов.
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
    if (!isMuscleId(group)) {
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
      // share — результат toRegions, сумма одной или нескольких долей load.
      // Например, seated-row (широчайшие и верх спины в один регион): 1 + 1 = 2.
      // Сам набор долей {0.5, 1} держит не этот модуль, а LOAD_VALUES в
      // workouts/schema.js: проверка load отвергает там любое другое значение.
      // volume.js доли не валидирует и на данных мимо схемы посчитает что дадут.
      // На долях из LOAD_VALUES сумма ненулевых не меньше 0.5, а число кругов —
      // целое ≥1, значит share * rounds ≥0.5, и Math.round(0.5) даёт 1 —
      // frequency ≥1 всегда, без Math.max(1, …). Нижняя граница закреплена
      // тестом «дробный объём округляется до целого, минимум один подход»
      // в test/volume.test.js.
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
