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

// Регион картинки может покрывать несколько наших групп (upper-back это и
// широчайшие, и верх спины), поэтому перечисляем все — иначе человек решит,
// что клик показал не то.
export function regionLabel(region) {
  const names = Object.values(MUSCLES).filter(m => m.region === region).map(m => m.ru);
  if (names.length === 0) throw new Error(`Неизвестный регион: ${region}`);
  return names.length === 1 ? names[0] : names[0] + ', ' + names.slice(1).join(', ');
}
