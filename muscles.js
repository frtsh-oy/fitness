// Единственный источник истины по группам мышц.
// region — идентификатор области на картинке тела; несколько наших групп
// могут указывать на один регион. Значения region сверяются с библиотекой
// карты тела на этапе S2 и живут только здесь.

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
  glutes_med:  { ru: 'Средняя и малая ягодичные',  region: 'gluteal' },
  quads:       { ru: 'Квадрицепсы',                region: 'quadriceps' },
  hamstrings:  { ru: 'Задняя поверхность бедра',   region: 'hamstring' },
  adductors:   { ru: 'Приводящие',                 region: 'adductors' },
  calves:      { ru: 'Икроножные',                 region: 'calves' },
  abs:         { ru: 'Прямая мышца живота',        region: 'abs' },
  obliques:    { ru: 'Косые мышцы живота',         region: 'obliques' },
  lower_back:  { ru: 'Разгибатели поясницы',       region: 'lower-back' },
  hip_flexors: { ru: 'Сгибатели бедра',            region: 'quadriceps' },
  lats:        { ru: 'Широчайшие',                 region: 'upper-back' },
  upper_back:  { ru: 'Верх спины',                 region: 'upper-back' },
  traps:       { ru: 'Трапеции',                   region: 'trapezius' },
  chest:       { ru: 'Грудные',                    region: 'chest' },
  delts_front: { ru: 'Передняя дельта',            region: 'deltoids' },
  delts_side:  { ru: 'Средняя дельта',             region: 'deltoids' },
  delts_rear:  { ru: 'Задняя дельта',              region: 'deltoids' },
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
