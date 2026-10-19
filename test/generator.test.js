import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeRandom, pickSkeleton, focusCandidates, availability, generate,
  missingGroupsMessage, missingZoneMessage, ceilingMessage,
} from '../builder/generator.js';
import {
  CORE_GROUPS, LEVELS, ZONES, FOCUS_MIN, SOFT_CEILING, MAX_STRENGTH, SKELETON,
} from '../builder/rules.js';
import { expandWorkout, serializeCompact, parseCompact, NAME_MAX, VALUE_MAX } from '../builder/compact.js';
import { weeklySets } from '../weekly.js';
import { itemProblems, KEY_PATTERN, NO_LOAD_PATTERN } from '../workouts/schema.js';
import { toItem } from '../exercises/index.js';
import { TEST_LIBRARY, withoutTargets, singlesOnly, onlyOneFor, variant } from './fixtures/test-library.js';

const ZONE_SETS = [[], ...Object.keys(ZONES).map(z => [z]), ['glutes', 'back'], ['arms', 'core']];
const byKey = new Map(TEST_LIBRARY.map(e => [e.key, e]));
const run = (level, zones, seed, library = TEST_LIBRARY) => generate({ level, zones, seed, library, now: () => 1 });

// Силовая часть так, как её видит экран нагрузки: через expandWorkout и weeklySets.
function weeklyOf(compact, library = TEST_LIBRARY) {
  const { workout } = expandWorkout('gen', compact, library);
  return weeklySets([{ ...workout, days: [1, 3, 5] }]);
}

test('записи тестовой библиотеки проходят схему упражнения', () => {
  const keys = new Set();
  for (const e of TEST_LIBRARY) {
    assert.deepEqual(itemProblems(toItem(e), e.key), [], e.key);
    assert.match(e.key, KEY_PATTERN);
    assert.ok(!keys.has(e.key), `ключ ${e.key} повторён`);
    keys.add(e.key);
    // Пустой load — только у восстановительного упражнения.
    assert.equal(Object.keys(e.load).length === 0, e.pattern === NO_LOAD_PATTERN, e.key);
  }
});

test('обязательные условия выполнены для каждого уровня, набора зон и зерна', () => {
  for (const level of Object.keys(LEVELS)) for (const zones of ZONE_SETS) for (let seed = 1; seed <= 20; seed += 1) {
    const r = run(level, zones, seed);
    assert.ok(r.ok, `${level} ${zones} ${seed}: ${r.message}`);
    const { compact } = r;
    const sets = weeklyOf(compact);
    assert.equal(new Set(compact.strength).size, compact.strength.length);                                   // 1
    for (const k of compact.strength) assert.ok(LEVELS[level].pool.includes(byKey.get(k).difficulty));       // 2
    for (const g of CORE_GROUPS) assert.ok(sets.get(g).comparable >= LEVELS[level].floor, g);                 // 3
    for (const z of zones) assert.ok(compact.focus.some(([k, fz]) => fz === z
      && ZONES[z].groups.some(g => byKey.get(k).load[g] === 1)));                                             // 4
    for (const [k] of compact.focus) for (const [g, share] of Object.entries(byKey.get(k).load))
      if (share === 1 && CORE_GROUPS.includes(g)) assert.ok(sets.get(g).comparable >= FOCUS_MIN, g);         // 5
    assert.ok(compact.strength.length <= MAX_STRENGTH);                                                       // 6
    assert.equal(compact.warmup.length, 2); assert.equal(compact.circuit.length, 4); assert.equal(compact.cooldown.length, 3);
    assert.equal(byKey.get(compact.cooldown.at(-1)).pattern, 'recovery');
    assert.ok(serializeCompact({ ...compact, name: 'Ж'.repeat(NAME_MAX) }).length <= VALUE_MAX);
  }
});

test('запись генератора читается приложением как есть', () => {
  const { compact } = run('intermediate', ['glutes', 'back'], 7);
  assert.deepEqual(parseCompact(serializeCompact(compact)), compact);
  assert.deepEqual([compact.v, compact.level, compact.zones, compact.days, compact.t, compact.name],
    [1, 'intermediate', ['glutes', 'back'], [1, 3, 5], 1, 'Всё тело. Упор: ягодицы и спина']);
});

test('одинаковый вход даёт одинаковую тренировку', () => {
  for (const zones of ZONE_SETS) {
    assert.deepEqual(run('advanced', zones, 5), run('advanced', zones, 5));
  }
  assert.equal(generate({ level: 'beginner', zones: [], seed: 1, library: TEST_LIBRARY, now: () => 42 }).compact.t, 42);
});

test('другое зерно даёт другую тренировку, когда пул позволяет', () => {
  const variants = new Set(Array.from({ length: 10 }, (_, i) =>
    JSON.stringify(generate({ level: 'beginner', zones: [], seed: i + 1, library: TEST_LIBRARY, now: () => 1 }).compact.strength.toSorted())));
  assert.ok(variants.size >= 2);
});

test('нет упражнения на группу — отказ с её названием, а не тренировка', () => {
  assert.deepEqual(generate({ level: 'beginner', zones: [], seed: 1, library: withoutTargets(['biceps']) }),
    { ok: false, reason: 'missing', groups: ['biceps'], message: 'Для начального уровня в библиотеке пока нет базовых упражнений на: бицепс.' });
});

test('не хватает второго упражнения для зоны — отказ с названием зоны', () => {
  const r = generate({ level: 'beginner', zones: ['chest'], seed: 1, library: onlyOneFor('chest') });
  assert.deepEqual([r.ok, r.reason, r.zone, r.groups, r.message], [false, 'missing', 'chest', ['chest'],
    'Для упора на зону «Грудь» на начальном уровне в библиотеке пока не хватает упражнений: нужно второе упражнение на ту же группу.']);
  assert.equal(availability(onlyOneFor('chest'), 'beginner').zones.chest, false);
});

test('не уложились в 9 пар — отказ «ceiling» с группами ниже границы', () => {
  const r = generate({ level: 'beginner', zones: ['legs', 'arms'], seed: 1, library: singlesOnly() });
  assert.equal(r.ok, false); assert.equal(r.reason, 'ceiling');
  assert.ok(r.groups.length > 0 && r.groups.every(g => CORE_GROUPS.includes(g)));
  assert.match(r.message, /^Не получилось уложиться в 9 силовых пар: ниже границы остались /);
});

test('третья зона — ошибка вызова', () => assert.throws(() => generate({ level: 'beginner', zones: ['legs', 'arms', 'core'], seed: 1, library: TEST_LIBRARY }), RangeError));

// Недостающие группы считаются по пулу уровня: у начального только базовые, у
// среднего базовые и средние, у продвинутого все; порядок — как у основных групп.
// Настоящая библиотека здесь не нужна: чего в ней не хватает, меняется с каждой
// правкой таблицы.
test('availability: недостающие группы считаются по пулу уровня и идут в порядке основных групп', () => {
  const levels = Object.keys(LEVELS);
  const lacking = library => levels.map(level => availability(library, level).missing);
  assert.deepEqual(lacking(TEST_LIBRARY), [[], [], []], 'богатая библиотека закрывает все группы на всех уровнях');

  const both = CORE_GROUPS.filter(group => group === 'calves' || group === 'biceps');
  assert.deepEqual(lacking(withoutTargets(['biceps', 'calves'])), [both, both, both]);

  const withoutKeys = (library, keys) => library.filter(entry => !keys.includes(entry.key));
  const noBasic = withoutKeys(TEST_LIBRARY, ['calves-1', 'calves-2']);
  assert.deepEqual(lacking(noBasic), [['calves'], [], []], 'без базовых начальному не хватает, остальным хватает средних');
  assert.deepEqual(lacking(withoutKeys(noBasic, ['calves-3'])), [['calves'], ['calves'], []], 'без средних не хватает и среднему');
});

test('неизвестный уровень, неизвестная зона и повтор зоны — ошибка вызова, а не запись', () => {
  const call = (level, zones) => () => generate({ level, zones, seed: 1, library: TEST_LIBRARY });
  assert.throws(call('expert', []), /Неизвестный уровень: expert/);
  assert.throws(call('constructor', []), /Неизвестный уровень: constructor/);
  assert.throws(call('beginner', ['arms2']), /Неизвестная зона: arms2/);
  // Повтор дал бы запись, которую parseCompact отвергает как нечитаемую.
  assert.throws(call('beginner', ['arms', 'arms']), /Зона указана дважды/);
});

test('сообщения отказов дословны', () => {
  assert.equal(missingGroupsMessage('advanced', ['delts_rear', 'biceps']), 'Для продвинутого уровня в библиотеке пока нет упражнений на: задняя дельта, бицепс.');
  assert.equal(missingGroupsMessage('intermediate', ['calves']), 'Для среднего уровня в библиотеке пока нет базовых и средних упражнений на: икроножные.');
  assert.equal(missingZoneMessage('intermediate', 'core'),
    'Для упора на зону «Пресс и кор» на среднем уровне в библиотеке пока не хватает упражнений: нужно второе упражнение на ту же группу.');
  assert.equal(missingZoneMessage('advanced', 'arms'),
    'Для упора на зону «Руки» на продвинутом уровне в библиотеке пока не хватает упражнений: нужно второе упражнение на ту же группу.');
  assert.equal(ceilingMessage(['abs', 'obliques']), 'Не получилось уложиться в 9 силовых пар: ниже границы остались прямая мышца живота, косые мышцы живота.');
});

test('отказ без зоны не несёт ключа zone', () => {
  const r = generate({ level: 'beginner', zones: ['arms'], seed: 1, library: withoutTargets(['biceps']) });
  assert.equal(r.ok, false);
  assert.ok(!Object.hasOwn(r, 'zone'));
});

test('мягкая граница: ни одна основная группа не выше верха полосы, когда перебор находит такой вариант', () => {
  // Продвинутый с упором на грудь, плечи или руки сюда не входит: жим и жим над
  // головой вместе дают передней дельте 27 из 20 в каждой попытке, потому что
  // многосуставное всегда предпочтительнее односуставного, и перебор обхода не
  // находит. Это допустимо (граница мягкая), но и проверять тут нечего.
  const cases = Object.keys(LEVELS).flatMap(level => ZONE_SETS
    .filter(zones => level !== 'advanced' || !zones.some(z => ['chest', 'shoulders', 'arms'].includes(z)))
    .map(zones => [level, zones]));
  for (const [level, zones] of cases) for (let seed = 1; seed <= 20; seed += 1) {
    const sets = weeklyOf(run(level, zones, seed).compact);
    for (const g of CORE_GROUPS) assert.ok(sets.get(g).comparable <= SOFT_CEILING, `${level} ${zones} ${seed} ${g}: ${sets.get(g).comparable}`);
  }
});

test('мягкая граница — предпочтение, а не условие: когда иначе нельзя, тренировка всё равно выдаётся', () => {
  // Четыре упражнения, каждое на ягодицы и на свою группу, у которой других
  // упражнений нет: все четыре обязательны, и ягодицы получают 4 × 6 = 24 > 20.
  const alone = ['adductors', 'calves', 'abs', 'obliques'];
  const forced = alone.map(group => variant(byKey.get(`${group}-1`), {
    key: `forced-${group}`, unilateral: false, load: { glutes: 1, [group]: 1 },
  }));
  const library = [...singlesOnly().filter(e => !alone.some(g => e.load[g] === 1)), ...forced,
    ...TEST_LIBRARY.filter(e => e.slot !== 'strength')];
  const r = generate({ level: 'beginner', zones: [], seed: 3, library, now: () => 1 });
  assert.ok(r.ok, r.message);
  for (const e of forced) assert.ok(r.compact.strength.includes(e.key), e.key);
  assert.ok(weeklyOf(r.compact, library).get('glutes').comparable > SOFT_CEILING);
});

test('makeRandom: числа от 0 до 1, одно зерно — одна последовательность', () => {
  const take = seed => { const random = makeRandom(seed); return Array.from({ length: 5 }, random); };
  assert.deepEqual(take(7), take(7));
  assert.notDeepEqual(take(7), take(8));
  for (const x of take(7).concat(take(0), take(4294967295))) assert.ok(x >= 0 && x < 1);
});

test('скелет: из своего слота, без повторов, не больше нормы, дыхание последним', () => {
  for (let seed = 1; seed <= 10; seed += 1) {
    const skeleton = pickSkeleton(TEST_LIBRARY, makeRandom(seed));
    for (const [slot, { count }] of Object.entries(SKELETON)) {
      assert.equal(skeleton[slot].length, count);
      assert.equal(new Set(skeleton[slot]).size, count);
      for (const k of skeleton[slot]) assert.equal(byKey.get(k).slot, slot);
    }
    assert.equal(skeleton.cooldown.at(-1), 'breathing');
  }
  // Зерно меняет выбор: за десять зёрен разминка не одна и та же.
  const warmups = new Set(Array.from({ length: 10 }, (_, i) => pickSkeleton(TEST_LIBRARY, makeRandom(i)).warmup.join()));
  assert.ok(warmups.size >= 2);
});

test('скелет: упражнений меньше нормы — берётся сколько есть; без дыхания завершение без него', () => {
  const only = keys => TEST_LIBRARY.filter(e => keys.includes(e.key));
  const short = pickSkeleton(only(['warm-1', 'circ-1', 'circ-2', 'stretch-1', 'stretch-2']), makeRandom(1));
  assert.deepEqual(short.warmup, ['warm-1']);
  assert.deepEqual(short.circuit.toSorted(), ['circ-1', 'circ-2']);
  assert.deepEqual(short.cooldown.toSorted(), ['stretch-1', 'stretch-2']);
  assert.deepEqual(pickSkeleton([], makeRandom(1)), { warmup: [], circuit: [], cooldown: [] });
  // Одно дыхание и ничего больше — завершение из него одного.
  assert.deepEqual(pickSkeleton(only(['breathing']), makeRandom(1)).cooldown, ['breathing']);
  // Растяжек как раз по норме и нет дыхания: все три на месте, дыхания в них нет.
  assert.deepEqual(pickSkeleton(only(['stretch-1', 'stretch-2', 'stretch-3']), makeRandom(1)).cooldown.toSorted(), ['stretch-1', 'stretch-2', 'stretch-3']);
});

test('кандидат упора: целевая группа зоны и ещё одно упражнение на каждую его основную целевую группу', () => {
  const stub = (key, load) => ({ key, load, slot: 'strength', difficulty: 'basic', compound: false });
  const pool = [
    stub('press', { chest: 1, triceps: 1, delts_front: 1 }),   // второго трицепса нет
    stub('chest-only', { chest: 1 }),
    stub('chest-grip', { chest: 1, forearms: 1 }),             // предплечья не основные: второго не требует
    stub('front-only', { delts_front: 1 }),
    stub('lone-biceps', { biceps: 1 }),                        // у бицепса есть только вспомогательная доля
    stub('assist-biceps', { biceps: 0.5, lats: 1 }),
  ];
  const keys = zone => focusCandidates(pool, zone).map(e => e.key);
  assert.deepEqual(keys('chest'), ['chest-only', 'chest-grip']);
  assert.deepEqual(keys('shoulders'), ['front-only']);
  assert.deepEqual(keys('arms'), []);
});

// Маленькая библиотека для упора: скелет и по одному базовому односуставному на
// каждую группу, кроме грудных, бицепса и икроножных. Односуставное, которому
// нет пары на ту же группу, кандидатом упора не становится, так что кандидаты
// остаются только там, где их задали.
//   PRESS — многосуставное на грудные и бицепс;
//   EXTRA — односуставное на грудные, бицепс и икроножные: икроножные только у
//           него, поэтому само оно кандидатом не станет, но даёт PRESS «второе
//           упражнение на ту же группу» и по грудным, и по бицепсу.
const PRESS = variant(byKey.get('chest-1'), { key: 'chest-biceps', load: { chest: 1, biceps: 1 }, compound: true, unilateral: false });
const EXTRA = variant(byKey.get('chest-1'), { key: 'chest-biceps-calves', load: { chest: 1, biceps: 1, calves: 1 }, unilateral: false });
const lean = (...extra) => [
  ...TEST_LIBRARY.filter(e => e.slot !== 'strength'),
  ...TEST_LIBRARY.filter(e => e.slot === 'strength' && e.key.endsWith('-1') && !['chest-1', 'biceps-1', 'calves-1'].includes(e.key)),
  PRESS, EXTRA, ...extra,
];

test('упор: упражнение, единственное у следующей зоны, первая зона не забирает', () => {
  // У «Грудь» один кандидат — PRESS, он же единственное многосуставное
  // у «Руки». Жадно «Руки» взяли бы его, и «Грудь» получила бы
  // отказ, хотя у «Рук» есть трицепс.
  const library = lean(byKey.get('triceps-2'));
  assert.deepEqual(focusCandidates(library, 'chest').map(e => e.key), ['chest-biceps']);
  for (const zones of [['arms', 'chest'], ['chest', 'arms']]) for (let seed = 1; seed <= 10; seed += 1) {
    const r = generate({ level: 'beginner', zones, seed, library, now: () => 1 });
    assert.ok(r.ok, `${zones} ${seed}: ${r.message}`);
    const focus = Object.fromEntries(r.compact.focus.map(([key, zone]) => [zone, key]));
    assert.equal(focus.chest, 'chest-biceps');
    assert.ok(['triceps-1', 'triceps-2'].includes(focus.arms), `${zones} ${seed}: ${focus.arms}`);
  }
});

test('упор: если замены у первой зоны нет, берётся то же единственное упражнение и отказ называет вторую зону', () => {
  // Без triceps-2 и у «Рук», и у «Груди» кандидат один и тот же: двух разных не
  // набрать, и «Грудь» остаётся без упражнения.
  const library = lean();
  assert.deepEqual(focusCandidates(library, 'arms').map(e => e.key), ['chest-biceps']);
  const r = generate({ level: 'beginner', zones: ['arms', 'chest'], seed: 1, library, now: () => 1 });
  assert.deepEqual([r.ok, r.reason, r.groups], [false, 'missing', ['chest']]);
});

test('копии фикстуры заморожены глубоко', () => {
  const frozen = value => Object.isFrozen(value)
    && Object.values(value).every(inner => typeof inner !== 'object' || inner === null || frozen(inner));
  const copies = [TEST_LIBRARY, withoutTargets(['biceps']), singlesOnly(), onlyOneFor('chest'), [PRESS, EXTRA]];
  for (const copy of copies) for (const e of copy) assert.ok(frozen(e), e.key);
  assert.throws(() => { singlesOnly()[0].load.glutes = 0; }, TypeError);
});
