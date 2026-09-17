import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setsByGroup, setsByRegion, exerciseEntries, PALETTE_STEPS } from '../volume.js';
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

test('записи для библиотеки: по одной на пару упражнение и группа', () => {
  const rows = exerciseEntries(legs, 'strength').filter(e => e.key === 'rdl');
  assert.equal(rows.length, 3);
  const byRegion = new Map(rows.map(r => [r.muscles[0], r.frequency]));
  assert.equal(byRegion.get('hamstring'), 2);    // load 1 × 2 круга
  assert.equal(byRegion.get('gluteal'), 2);
  assert.equal(byRegion.get('lower-back'), 1);   // load 0.5 × 2 круга
  for (const r of rows) assert.equal(r.muscles.length, 1);
});

test('дробный объём округляется до целого, минимум один подход', () => {
  const rows = exerciseEntries(legs, 'warmup');
  const byKeyRegion = new Map();
  for (const r of rows) {
    const k = `${r.key}:${r.muscles[0]}`;
    byKeyRegion.set(k, r.frequency);
  }
  // overhead-pull-apart (разведение резинки): rounds 3, load { delts_rear: 1, traps: 0.5, delts_side: 0.5 }
  // delts_rear доля 1: 1*3=3 → round(3)=3
  // traps доля 0.5: 0.5*3=1.5 → round(1.5)=2
  // delts_side → front-deltoids доля 0.5: 0.5*3=1.5 → round(1.5)=2
  assert.equal(byKeyRegion.get('overhead-pull-apart:back-deltoids'), 3);
  assert.equal(byKeyRegion.get('overhead-pull-apart:trapezius'), 2);
  assert.equal(byKeyRegion.get('overhead-pull-apart:front-deltoids'), 2);
  // Нижняя граница — ровно тот случай, ради которого из volume.js убрали
  // Math.max(1, …): произведение равно 0.5, и поднять его до 1 обязан сам
  // Math.round. Без этих двух утверждений тест обещал «минимум один подход»,
  // а проверял только значения 3, 2 и 2. Math.floor на них ещё видно (1.5
  // дало бы 1, а не 2), а вот обнуление всего, что меньше 1, — уже нет:
  // значения ≥1 такая замена не трогает, и вся проверка проходила зелёной.
  // pelvic-tilt (блок «Старт», rounds 1, load { abs: 1, obliques: 0.5 }):
  // obliques доля 0.5 × 1 круг = 0.5 → round(0.5)=1.
  // thoracic-rotation (тот же блок, load { obliques: 1, upper_back: 0.5 }):
  // upper_back → регион upper-back, доля 0.5 × 1 круг = 0.5 → round(0.5)=1.
  assert.equal(byKeyRegion.get('pelvic-tilt:obliques'), 1,
    'доля 0.5 при одном круге обязана дать один подход, а не ноль');
  assert.equal(byKeyRegion.get('thoracic-rotation:upper-back'), 1,
    'доля 0.5 при одном круге обязана дать один подход, а не ноль');
});

test('палитра закрывает максимальный объём по всем тренировкам', () => {
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
