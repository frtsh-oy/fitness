// Генератор тренировки на всё тело: по уровню, зонам упора и зерну случайности
// строит сжатую запись своей тренировки (builder/compact.js) или честно
// отказывает, называя, чего не хватает библиотеке.
//
// Правила — из раздела «Генератор» спеки
// docs/superpowers/specs/2026-10-19-workout-builder-design.md: случайный
// перебор из библиотеки, кандидат проверяется обязательными условиями (нет
// повторов, пул уровня, нижняя граница у каждой из 17 основных групп, упор с
// десятью подходами, не больше девяти пар), а мягкая граница SOFT_CEILING —
// предпочтение при выборе из прошедших, не условие. Одинаковый вход даёт
// одинаковую тренировку: «другой вариант» — это другое зерно.
//
// Почему подходы считает weeklySets, а не свой счёт. Генератор обещает, что у
// выданной тренировки каждая группа не ниже границы уровня, а человек проверит
// это по экрану недельной нагрузки. Два счёта, разойдясь на односторонних
// упражнениях или на вспомогательной доле, дали бы тренировку, которую сам
// генератор считает годной, а экран — нет. Поэтому перебор зовёт тот же
// weeklySets и берёт тот же `comparable`.
//
// Почему условие «упор ≥ FOCUS_MIN» касается только основных групп упражнения
// упора. Экран оценивает 17 основных групп; предплечья, трапеции и сгибатели
// бедра он не показывает и не проверяет, так что требовать с них десять
// подходов значило бы требовать то, чего нельзя ни проверить, ни увидеть.
//
// Силовых упражнений не больше MAX_STRENGTH, а в скелете не больше SKELETON.*.count:
// на этих границах держится оценка размера записи в облаке (VALUE_MAX).
import { LIBRARY } from '../exercises/index.js';
import { groupsPhrase } from '../muscles.js';
import { weeklySets } from '../weekly.js';
import {
  CORE_GROUPS, LEVELS, ZONES, FOCUS_MIN, SOFT_CEILING, MAX_STRENGTH, MAX_ZONES, PLAN_DAYS, DEFAULT_DAYS, SKELETON,
} from './rules.js';
import { defaultName } from './texts.js';

// Попыток перебора. Хватает с запасом: в богатой библиотеке подходит почти
// каждая, а в бедной лишние попытки ничего не меняют.
const ATTEMPTS = 50;

// mulberry32: маленький генератор с одним числом состояния. Math.random нельзя:
// зерно должно давать одну и ту же последовательность.
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (list, random) => list[Math.floor(random() * list.length)];

// Случайные без повторов, сколько есть, но не больше count.
function sample(list, count, random) {
  const rest = [...list];
  const picked = [];
  while (picked.length < count && rest.length > 0) {
    picked.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  }
  return picked;
}

// Разминка, разогрев и завершение: случайные упражнения своего слота. Завершение
// кончается восстановительным упражнением («Спокойное дыхание»), если оно есть:
// тренировка не должна обрываться на растяжке. Нормы — SKELETON.
export function pickSkeleton(library, random) {
  const slotOf = slot => library.filter(e => e.slot === slot);
  const keysOf = (entries, count) => sample(entries, count, random).map(e => e.key);

  const cooldown = slotOf('cooldown');
  const recovery = cooldown.filter(e => e.pattern === 'recovery');
  const stretches = cooldown.filter(e => e.pattern !== 'recovery');
  const last = recovery.length > 0 ? [pick(recovery, random).key] : [];

  return {
    warmup: keysOf(slotOf('warmup'), SKELETON.warmup.count),
    circuit: keysOf(slotOf('circuit'), SKELETON.circuit.count),
    cooldown: [...keysOf(stretches, SKELETON.cooldown.count - last.length), ...last],
  };
}

// Целевые группы упражнения — те, где доля 1; вспомогательная (0.5) в счёт не идёт.
const targetsOf = entry => Object.keys(entry.load).filter(group => entry.load[group] === 1);

// Пул уровня: силовые упражнения библиотеки той сложности, что разрешает уровень.
const poolOf = (library, level) => library.filter(e => e.slot === 'strength' && LEVELS[level].pool.includes(e.difficulty));

// Упражнения, на которые можно опереть упор в зону: целят хотя бы одну её группу
// и для каждой своей основной целевой группы имеют в пуле ещё одно упражнение
// с долей 1. Без второго до десяти подходов в неделю не дотянуть, а упор, который
// не выполним, лучше назвать отказом сразу, чем гонять перебор впустую.
export function focusCandidates(pool, zone) {
  const zoneGroups = ZONES[zone].groups;
  return pool.filter(entry => {
    const targets = targetsOf(entry);
    return targets.some(group => zoneGroups.includes(group))
      && targets.filter(group => CORE_GROUPS.includes(group))
        .every(group => pool.some(other => other.key !== entry.key && other.load[group] === 1));
  });
}

// Чего не хватает библиотеке на этом уровне: основные группы, на которые нет ни
// одного упражнения пула с долей 1, и зоны, для которых нет опоры упора.
export function availability(library, level) {
  const pool = poolOf(library, level);
  return {
    missing: CORE_GROUPS.filter(group => !pool.some(entry => entry.load[group] === 1)),
    zones: Object.fromEntries(Object.keys(ZONES).map(zone => [zone, focusCandidates(pool, zone).length > 0])),
  };
}

export function missingGroupsMessage(level, groups) {
  const { genitive, poolWords } = LEVELS[level];
  return `Для ${genitive} уровня в библиотеке пока нет ${poolWords} на: ${groupsPhrase(groups)}.`;
}

export function missingZoneMessage(level, zone) {
  return `Для упора на зону «${ZONES[zone].label}» на ${LEVELS[level].prepositional} уровне в библиотеке пока не хватает упражнений: нужно второе упражнение на ту же группу.`;
}

// Девять пар — это MAX_STRENGTH, поделённое на два упражнения в паре.
export function ceilingMessage(groups) {
  return `Не получилось уложиться в ${MAX_STRENGTH / 2} силовых пар: ниже границы остались ${groupsPhrase(groups)}.`;
}

// Подходы в неделю при трёх днях — тем же расчётом, что у экрана нагрузки.
function weeklyOf(chosen, rounds) {
  return weeklySets([{ days: PLAN_DAYS, blocks: [{ rounds, items: chosen }] }]);
}

// Из списка — те, у кого наибольшая оценка.
function topBy(list, score) {
  const top = Math.max(...list.map(score));
  return list.filter(entry => score(entry) === top);
}

// Многосуставное, если оно среди кандидатов есть: на них уходят силы
// (ACSM 2009), и одно такое закрывает несколько групп разом.
const preferCompound = list => {
  const compound = list.filter(entry => entry.compound);
  return compound.length > 0 ? compound : list;
};

// Одна попытка: сначала упражнения упора, затем добор по одному на ту группу,
// которой не хватает, пока все основные не дойдут до своих границ или не
// кончится место. candidates — кандидаты упора по зонам (focusCandidates).
function attempt({ pool, rounds, floor, zones, candidates, random }) {
  const chosen = [];
  const focus = [];
  const need = new Map(CORE_GROUPS.map(group => [group, floor]));

  for (const [index, zone] of zones.entries()) {
    const free = candidates.get(zone).filter(entry => !chosen.includes(entry));
    if (free.length === 0) return { ok: false, kind: 'missing', groups: [...ZONES[zone].groups] };
    // Жадный выбор не должен забирать упражнение, которое осталось единственным
    // у одной из следующих зон: тогда та зона получила бы отказ, хотя у этой
    // нашлась бы замена. Если замены нет, берём из всех, как раньше.
    const later = zones.slice(index + 1);
    const spare = free.filter(entry => later.every(next => candidates.get(next).some(other => other !== entry && !chosen.includes(other))));
    const inZone = entry => targetsOf(entry).filter(group => ZONES[zone].groups.includes(group)).length;
    const entry = pick(topBy(preferCompound(spare.length > 0 ? spare : free), inZone), random);
    chosen.push(entry);
    focus.push([entry.key, zone]);
    for (const group of targetsOf(entry)) {
      if (need.has(group)) need.set(group, Math.max(need.get(group), FOCUS_MIN));
    }
  }

  for (;;) {
    const sets = weeklyOf(chosen, rounds);
    const deficient = CORE_GROUPS.filter(group => sets.get(group).comparable < need.get(group));
    if (deficient.length === 0) return { ok: true, chosen, focus };
    if (chosen.length === MAX_STRENGTH) return { ok: false, kind: 'ceiling', groups: deficient };

    const group = pick(deficient, random);
    const free = pool.filter(entry => !chosen.includes(entry) && entry.load[group] === 1);
    if (free.length === 0) return { ok: false, kind: 'missing', groups: [group] };
    const covers = entry => deficient.filter(g => entry.load[g] === 1).length;
    chosen.push(pick(preferCompound(topBy(free, covers)), random));
  }
}

function checkInput(level, zones) {
  if (!Object.hasOwn(LEVELS, level)) throw new Error(`Неизвестный уровень: ${level}`);
  if (zones.length > MAX_ZONES) throw new RangeError('Зон упора не больше двух');
  for (const zone of zones) {
    if (!Object.hasOwn(ZONES, zone)) throw new Error(`Неизвестная зона: ${zone}`);
  }
  // Повтор зоны дал бы запись, которую parseCompact отвергает как нечитаемую.
  if (new Set(zones).size !== zones.length) throw new Error('Зона указана дважды');
}

// Результат: { ok: true, compact } либо { ok: false, reason, groups, message }.
// Ключ zone есть только у отказа из-за зоны упора.
export function generate({ level, zones, seed, library = LIBRARY, now = Date.now }) {
  checkInput(level, zones);

  const { floor, rounds } = LEVELS[level];
  const { missing, zones: zoneOk } = availability(library, level);
  if (missing.length > 0) {
    return { ok: false, reason: 'missing', groups: missing, message: missingGroupsMessage(level, missing) };
  }
  const blocked = zones.find(zone => !zoneOk[zone]);
  if (blocked !== undefined) {
    const groups = [...ZONES[blocked].groups];
    return { ok: false, reason: 'missing', groups, zone: blocked, message: missingZoneMessage(level, blocked) };
  }

  const pool = poolOf(library, level);
  const candidates = new Map(zones.map(zone => [zone, focusCandidates(pool, zone)]));
  const random = makeRandom(seed);
  // Скелет набирается тем же зерном, но после перебора: так упор и добор не
  // зависят от того, сколько в библиотеке разминок.
  const finish = result => {
    const { warmup, circuit, cooldown } = pickSkeleton(library, random);
    return {
      ok: true,
      compact: {
        v: 1,
        name: defaultName(zones),
        days: [...DEFAULT_DAYS],
        level,
        zones: [...zones],
        warmup,
        circuit,
        strength: result.chosen.map(entry => entry.key),
        focus: result.focus,
        cooldown,
        t: now(),
      },
    };
  };

  let firstValid = null;
  let closest = null;
  for (let i = 0; i < ATTEMPTS; i += 1) {
    const result = attempt({ pool, rounds, floor, zones, candidates, random });
    if (result.ok) {
      const sets = weeklyOf(result.chosen, rounds);
      if (CORE_GROUPS.every(group => sets.get(group).comparable <= SOFT_CEILING)) return finish(result);
      firstValid ??= result;
    } else if (closest === null || result.groups.length < closest.groups.length) {
      closest = result;
    }
  }
  if (firstValid) return finish(firstValid);

  // Лучший из неудачных — тот, у кого меньше всего групп осталось без опоры.
  const message = closest.kind === 'ceiling' ? ceilingMessage(closest.groups) : missingGroupsMessage(level, closest.groups);
  return { ok: false, reason: closest.kind, groups: closest.groups, message };
}
