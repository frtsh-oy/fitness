// Единственный источник истины по группам мышц.
// region — идентификатор области на картинке тела; несколько наших групп
// могут указывать на один регион. Значения region обязаны существовать в
// словаре библиотеки карты тела — это требование закреплено тестом.

function deepFreeze(obj) {
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

export const MUSCLES = deepFreeze({
  glutes:      { ru: 'Ягодичные',                  region: 'gluteal' },
  glutes_med:  { ru: 'Средняя и малая ягодичные',  region: 'abductors' },
  quads:       { ru: 'Квадрицепсы',                region: 'quadriceps' },
  hamstrings:  { ru: 'Задняя поверхность бедра',   region: 'hamstring' },
  adductors:   { ru: 'Приводящие',                 region: 'adductor' },
  calves:      { ru: 'Икроножные',                 region: 'calves' },
  abs:         { ru: 'Прямая мышца живота',        region: 'abs' },
  obliques:    { ru: 'Косые мышцы живота',         region: 'obliques' },
  lower_back:  { ru: 'Разгибатели поясницы',       region: 'lower-back' },
  hip_flexors: { ru: 'Сгибатели бедра',            region: 'quadriceps' },
  lats:        { ru: 'Широчайшие',                 region: 'upper-back' },
  upper_back:  { ru: 'Верх спины',                 region: 'upper-back' },
  traps:       { ru: 'Трапеции',                   region: 'trapezius' },
  chest:       { ru: 'Грудные',                    region: 'chest' },
  delts_front: { ru: 'Передняя дельта',            region: 'front-deltoids' },
  delts_side:  { ru: 'Средняя дельта',             region: 'front-deltoids' }, // боковой дельты у библиотеки нет: отдана переднему виду, где видна шапка плеча
  delts_rear:  { ru: 'Задняя дельта',              region: 'back-deltoids' },
  biceps:      { ru: 'Бицепс',                     region: 'biceps' },
  triceps:     { ru: 'Трицепс',                    region: 'triceps' },
  forearms:    { ru: 'Предплечья',                 region: 'forearm' },
});

export function isMuscleId(id) {
  return Object.hasOwn(MUSCLES, id);
}

export function muscleLabel(id) {
  if (!isMuscleId(id)) throw new Error(`Неизвестная группа мышц: ${id}`);
  return MUSCLES[id].ru;
}

export function toRegions(load) {
  const regions = new Map();
  for (const [id, value] of Object.entries(load)) {
    if (!isMuscleId(id)) throw new Error(`Неизвестная группа мышц: ${id}`);
    const region = MUSCLES[id].region;
    regions.set(region, (regions.get(region) ?? 0) + value);
  }
  return regions;
}

// Группы, попавшие в один регион картинки, в порядке словаря. На этом стоит и
// regionLabel, и подпись в подборе под картой: она появляется, только когда
// область объединяет больше одной группы.
//
// Отдаём идентификаторы, а не число и не готовую строку. Считать группы по
// строке regionLabel нельзя: это оформленный для показа текст, и запятые в нём
// — оформление, а не данные.
export function regionGroups(region) {
  const ids = Object.keys(MUSCLES).filter(id => MUSCLES[id].region === region);
  if (ids.length === 0) throw new Error(`Неизвестный регион: ${region}`);
  return ids;
}

// Регион картинки может покрывать несколько наших групп (upper-back это и
// широчайшие, и верх спины), поэтому перечисляем все — иначе человек решит,
// что клик показал не то. Первое название остаётся как есть, названия после
// него переводятся в строчные: подпись стоит в начале строки (app.js), а
// заглавные буквы внутри перечисления читались бы как отдельные подписи
// (например: «Широчайшие, верх спины — 5 подх.»).
export function regionLabel(region) {
  const names = regionGroups(region).map(id => MUSCLES[id].ru);
  return names.map((n, i) => (i === 0 ? n : n.toLowerCase())).join(', ');
}
