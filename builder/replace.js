// Замена одного упражнения своей тренировки на похожее — без перегенерации всей.
// Кандидатов предлагает replaceCandidates, замену записывает replaceExercise;
// экран (шторка замены) только показывает список и вызывает вторую функцию.
//
// Правила — из раздела «Замена упражнения» спеки
// docs/superpowers/specs/2026-10-19-workout-builder-design.md. Замена, после
// которой основная группа осталась без нагрузки, здесь НЕ запрещается: покрытие
// (coverage.js) пересчитывается по записи и покажет это сразу, как при ручной
// сборке. Запретить значило бы оставить человека с упражнением, которое ему
// физически не подходит (нет резинки, болит колено), только потому, что другого
// на те же мышцы нет.
import { LIBRARY, SLOT_LABELS } from '../exercises/index.js';
import { LEVELS, ZONES } from './rules.js';
import { matchesQuery } from './search.js';

// Слоты записи. Список слотов у compact.js наружу не выходит, а ключи
// SLOT_LABELS — те же четыре в том же порядке.
const SLOTS = Object.keys(SLOT_LABELS);

// Целевая группа упражнения — та, где доля 1; вспомогательная (0.5) в счёт не идёт.
const isTarget = (entry, group) => entry.load[group] === 1;

// Сходство разметки: сумма меньших долей по группам. Идём по группам первого
// упражнения: у группы, которой в нём нет, доля 0, а меньшая из двух долей с нулём —
// тоже 0, так что остальные группы сумму не меняют.
export function similarity(a, b) {
  let sum = 0;
  for (const [group, share] of Object.entries(a.load)) sum += Math.min(share, b.load[group] ?? 0);
  return sum;
}

// Силовая замена обязана целить те же мышцы: хотя бы одна группа, где доля 1 у
// обоих. Вспомогательная доля с любой стороны не в счёт: «поясницу подключает» —
// не причина предлагать вместо тяги упражнение на поясницу.
const sharesTarget = (current, other) => Object.keys(current.load)
  .some(group => isTarget(current, group) && isTarget(other, group));

// Кандидаты на замену упражнения key из слота slot, от самого похожего к менее.
// Ключ, которого нет в библиотеке, — ошибка вызова: экран работает с развёрнутой
// тренировкой, а убранные из библиотеки ключи в ней уже отброшены (expandWorkout).
export function replaceCandidates({ compact, slot, key, library = LIBRARY }) {
  const current = library.find(entry => entry.key === key);
  if (!current) throw new Error(`Нет упражнения «${key}» в библиотеке`);

  // Занято всё, что стоит в любом слоте: библиотеку могли поправить после
  // сохранения, и ключ записи тогда лежит не в своём слоте.
  const taken = new Set(SLOTS.flatMap(name => compact[name]));
  // Пул уровня ограничивает только силовые: у остальных слотов сложности нет.
  // Базовое упражнение законно заменяется и средним у среднего уровня — пул
  // шире «ровно той же сложности».
  const pool = compact.level !== null && slot === 'strength' ? LEVELS[compact.level].pool : null;
  // Упор — пометка на упражнении: замена обязана нагружать ту же зону, иначе
  // упор тихо потеряет смысл.
  const focus = compact.focus.find(([focusKey]) => focusKey === key);
  const zoneGroups = focus === undefined ? null : ZONES[focus[1]].groups;

  return library
    .filter(entry => entry.slot === slot && !taken.has(entry.key))
    .filter(entry => pool === null || pool.includes(entry.difficulty))
    // У разминки, разогрева и завершения общей группы не требуем: их разметка в
    // основном косвенная (трапеции, сгибатели бедра), и по ней «те же мышцы» не найти.
    .filter(entry => slot !== 'strength' || sharesTarget(current, entry))
    .filter(entry => zoneGroups === null || zoneGroups.some(group => isTarget(entry, group)))
    .map(entry => ({ entry, score: similarity(current, entry) }))
    // При равенстве — по ключу, а не по порядку библиотеки: порядок строк в
    // таблице не должен менять, что видит человек. Сравнение по кодам знаков, а
    // не localeCompare: результат не зависит от языка устройства.
    .sort((x, y) => y.score - x.score || (x.entry.key < y.entry.key ? -1 : 1))
    .map(({ entry }) => entry);
}

// Кандидаты, подошедшие под слова запроса (название, мышцы, инвентарь — как в
// библиотеке). Порядок прежний: самые похожие остаются первыми. Пустой запрос
// оставляет всех.
export function searchCandidates(candidates, query) {
  return candidates.filter(entry => matchesQuery(entry, query));
}

// Новая запись с newKey на месте key; исходная не меняется. Массивы копируем все,
// в том числе нетронутые: правка одной записи не должна менять другую.
// Пара упора с этим ключом получает newKey, зона остаётся. Время сборки t не
// трогаем: это дело сохранения, а не замены.
//
// Отказ вместо тихого «ничего не произошло». Ключа нет в слоте — ошибка вызова;
// слот проверяем по списку слотов, а не по самой записи: иначе «zones» или
// «days» сошли бы за слот, и вызов с чужим полем вернул бы запись без замены и
// без ошибки. newKey, который в тренировке уже есть, дал бы повтор, а
// parseCompact отвергает запись с повтором, и своя тренировка пропала бы при
// следующем запуске.
export function replaceExercise(compact, slot, key, newKey) {
  if (!SLOTS.includes(slot) || !compact[slot].includes(key)) {
    throw new Error(`Упражнения «${key}» нет в слоте «${slot}»`);
  }
  if (SLOTS.some(name => compact[name].includes(newKey))) {
    throw new Error(`Упражнение «${newKey}» уже есть в тренировке`);
  }

  const swap = value => (value === key ? newKey : value);
  const next = {
    ...compact,
    days: [...compact.days],
    zones: [...compact.zones],
    focus: compact.focus.map(([focusKey, zone]) => [swap(focusKey), zone]),
  };
  for (const name of SLOTS) next[name] = compact[name].map(name === slot ? swap : value => value);
  return next;
}
