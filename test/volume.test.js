import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setsByGroup, setsByRegion, regionSummary, PALETTE_STEPS } from '../volume.js';
import legs from '../workouts/legs-mwf.js';
import { WORKOUTS } from '../workouts/index.js';

test('силовой объём по группам совпадает с разметкой', () => {
  const s = setsByGroup(legs, 'strength');
  assert.equal(s.get('glutes'), 6);
  assert.equal(s.get('hamstrings'), 3);
  assert.equal(s.get('lower_back'), 3);
  assert.equal(s.get('glutes_med'), 3);
  assert.equal(s.get('upper_back'), 3);
  assert.equal(s.get('triceps'), 3);
  assert.equal(s.get('adductors'), 2);
  assert.equal(s.get('abs'), 1);
  // Икроножные — по 0.5 в «Ягодичном мосте» и «Жиме двумя ногами лёжа»,
  // оба блока по 2 круга.
  assert.equal(s.get('calves'), 2);
  assert.equal(s.get('forearms'), undefined);
});

test('разминка считается отдельно и даёт дробные значения', () => {
  const w = setsByGroup(legs, 'warmup');
  assert.equal(w.get('hip_flexors'), 6);
  assert.equal(w.get('abs'), 5.5);
  assert.equal(w.get('delts_rear'), 3);
  assert.equal(w.get('upper_back'), 0.5);
  // «Китайское» приседание и подъём колена, по 0.5 в блоке из 3 кругов.
  assert.equal(w.get('calves'), 3);
});

test('икроножные работают в разминке и в силовых, но не в заминке', () => {
  // Раздельный счёт — это и есть разница между двумя режимами карты: 2 против 5.
  assert.equal(setsByGroup(legs, 'strength').get('calves'), 2);
  assert.equal(setsByGroup(legs, 'warmup').get('calves'), 3);
  assert.equal(setsByGroup(legs, 'cooldown').get('calves'), undefined);
});

test('заминка считается отдельно', () => {
  const c = setsByGroup(legs, 'cooldown');
  assert.equal(c.get('hip_flexors'), 1);
  assert.equal(c.get('lower_back'), 1);
});

test('силовые не смешиваются с разминкой', () => {
  assert.equal(setsByGroup(legs, 'strength').get('hip_flexors'), undefined);
});

test('объём по регионам складывает группы одного региона', () => {
  const r = setsByRegion(legs, 'strength');
  assert.equal(r.get('upper-back'), 5);       // upper_back 3 + lats 2
  assert.equal(r.get('front-deltoids'), 4);   // delts_front 2 + delts_side 2
  assert.equal(r.get('gluteal'), 6);
  assert.equal(r.get('abductors'), 3);        // отдельно от gluteal
});

test('сводка по региону: точный объём и упражнения, которые его дают', () => {
  const summary = regionSummary(legs, ['strength']);
  // upper-back — регион из двух наших групп: широчайшие и верх спины.
  // «Тяга сидя» грузит обе (1 + 1 = 2 за круг, 2 круга → 4), «Тяга одной
  // рукой» — только верх спины (0.5 × 2 = 1). Итого 5.
  const back = summary.get('upper-back');
  assert.equal(back.sets, 5);
  // И одна запись на упражнение, а не по одной на каждую группу региона:
  // иначе «Тяга сидя» стояла бы в подборе дважды.
  assert.deepEqual(back.exercises, [
    'Тяга резинки сидя к поясу',
    'Тяга короткой резинки одной рукой к груди',
  ]);
});

// Несколько типов сразу — это второй режим карты («вся нагрузка»).
test('упражнения региона идут в порядке тренировки, а не по типам', () => {
  // Порядок важен не сам по себе: этот список показывается человеку в подборе
  // под картой, и клик по строке прокручивает страницу к упражнению. В
  // legs-mwf блоки идут «разминка → силовые → заминка», поэтому склейка по
  // типам совпала бы там с порядком страницы случайно. Фикстура ставит силовой
  // блок перед разминочным — на ней склейка по типам видна сразу.
  const workout = {
    blocks: [
      { rounds: 1, items: [{ kind: 'strength', load: { chest: 1 }, name: 'Силовое', key: 's' }] },
      { rounds: 1, items: [{ kind: 'warmup', load: { chest: 1 }, name: 'Разминочное', key: 'w' }] },
    ],
  };
  assert.deepEqual(
    regionSummary(workout, ['warmup', 'strength']).get('chest').exercises,
    ['Силовое', 'Разминочное'],
  );
});

test('вся нагрузка складывает разминку, силовые и заминку в одну сводку', () => {
  const calves = regionSummary(legs, ['warmup', 'strength', 'cooldown']).get('calves');
  assert.deepEqual(calves.exercises, [
    '«Китайское» приседание с подъёмом таза и разворотом',
    'Подъём колена с лёгкой резинкой',
    'Ягодичный мост',
    'Жим двумя ногами лёжа',
  ]);
  // 0.5×3 + 0.5×3 + 0.5×2 + 0.5×2 = 5, без округлений по дороге.
  assert.equal(calves.sets, 5);
});

// Главная проверка правки раунда 1: число на карте обязано совпадать с
// объёмом, который печатает docs/muscle-map.md. Раньше карта складывала
// частоты, округлённые по каждому упражнению, и в режиме всей нагрузки это
// расходилось у половины регионов (пресс 8 вместо 7, косые 5 вместо 4).
// Проверяем расчётом по всем регионам обоих режимов, а не примером на одной
// мышце: setsByRegion идёт через MUSCLES[group].region, regionSummary — через
// toRegions, то есть два независимых пути к одному числу.
test('сводка по регионам совпадает с точным объёмом setsByRegion в обоих режимах', () => {
  for (const kinds of [['strength'], ['warmup', 'strength', 'cooldown']]) {
    const expected = new Map();
    for (const kind of kinds) {
      for (const [region, value] of setsByRegion(legs, kind)) {
        expected.set(region, (expected.get(region) ?? 0) + value);
      }
    }
    const summary = regionSummary(legs, kinds);
    assert.deepEqual([...summary.keys()].sort(), [...expected.keys()].sort(),
      `${kinds}: набор регионов разошёлся`);
    for (const [region, value] of expected) {
      assert.equal(summary.get(region).sets, value, `${kinds}: регион ${region}`);
    }
    assert.ok(expected.size > 10, `${kinds}: слишком мало регионов, тест почти ничего не проверяет`);
  }
  // Без дробных значений этот тест не отличил бы точную сумму от округлённой.
  const all = [...regionSummary(legs, ['warmup', 'strength', 'cooldown']).values()];
  assert.ok(all.some(row => !Number.isInteger(row.sets)),
    'в режиме всей нагрузки обязаны быть дробные объёмы — иначе проверка слепа к округлению');
});

test('палитра закрывает максимальный силовой объём по всем тренировкам', () => {
  let maxVolume = 0;
  for (const workout of Object.values(WORKOUTS)) {
    const regions = setsByRegion(workout, 'strength');
    const max = Math.max(...regions.values(), 0);
    maxVolume = Math.max(maxVolume, max);
  }
  assert.ok(maxVolume <= PALETTE_STEPS, `объём ${maxVolume} превышает ${PALETTE_STEPS} уровней`);
});

test('неизвестный тип упражнения даёт пустой результат, а не ошибку', () => {
  assert.equal(setsByGroup(legs, 'нет-такого').size, 0);
});

test('setsByRegion на неизвестной группе мышц бросает осмысленную ошибку', () => {
  const badWorkout = {
    blocks: [
      {
        rounds: 1,
        items: [
          {
            kind: 'strength',
            load: { 'неизвестная-группа': 1 },
            name: 'Фиктивное упражнение',
            key: 'fake',
          },
        ],
      },
    ],
  };
  assert.throws(
    () => setsByRegion(badWorkout, 'strength'),
    /Неизвестная группа мышц: неизвестная-группа/,
  );
});
