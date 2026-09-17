import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLES, isMuscleId, muscleLabel, toRegions, regionLabel, regionGroups } from '../muscles.js';
import { MuscleType } from '../vendor/body-highlighter.esm.js';

test('словарь содержит ровно 20 групп', () => {
  assert.equal(Object.keys(MUSCLES).length, 20);
});

test('у каждой группы есть русская подпись и регион картинки', () => {
  for (const [id, m] of Object.entries(MUSCLES)) {
    assert.ok(m.ru && m.ru.length > 0, `${id}: нет подписи`);
    assert.ok(m.region && m.region.length > 0, `${id}: нет региона`);
  }
});

test('isMuscleId отличает известные группы от выдуманных', () => {
  assert.equal(isMuscleId('glutes'), true);
  assert.equal(isMuscleId('adductors'), true);
  assert.equal(isMuscleId('nonexistent'), false);
});

test('muscleLabel бросает ошибку на неизвестной группе', () => {
  assert.equal(muscleLabel('biceps'), 'Бицепс');
  assert.throws(() => muscleLabel('nope'), /nope/);
});

test('toRegions складывает группы, попавшие в один регион, и разделяет разные', () => {
  // две группы в один регион складываются
  const regions = toRegions({ quads: 1, hip_flexors: 0.5, hamstrings: 1, lats: 0.2, upper_back: 0.3 });
  assert.equal(regions.get('quadriceps'), 1.5);
  assert.equal(regions.get('upper-back'), 0.5);
  assert.equal(regions.get('hamstring'), 1);
  // не смешиваются
  assert.equal(regions.size, 3);
});

test('toRegions бросает ошибку на неизвестной группе', () => {
  assert.throws(() => toRegions({ nope: 1 }), /nope/);
});

test('MUSCLES не позволяет добавить новую группу', () => {
  assert.throws(() => {
    MUSCLES.new_muscle = { ru: 'Новая', region: 'new' };
  }, TypeError);
});

test('MUSCLES не позволяет изменить подпись существующей группы', () => {
  assert.throws(() => {
    MUSCLES.abs.ru = 'Изменённый текст';
  }, TypeError);
});

test('MUSCLES не позволяет изменить регион существующей группы', () => {
  assert.throws(() => {
    MUSCLES.abs.region = 'new-region';
  }, TypeError);
});

test('MUSCLES не позволяет удалить существующую группу', () => {
  assert.throws(() => {
    delete MUSCLES.abs;
  }, TypeError);
});

test('каждый регион существует в словаре библиотеки карты', () => {
  const known = new Set(Object.values(MuscleType));
  for (const [id, m] of Object.entries(MUSCLES)) {
    assert.ok(known.has(m.region), `${id}: региона ${m.region} нет в библиотеке`);
  }
});

test('приводящие используют единственное число, как в библиотеке', () => {
  assert.equal(MUSCLES.adductors.region, 'adductor');
});

test('средняя и малая ягодичные это отводящие, а не большая ягодичная', () => {
  assert.equal(MUSCLES.glutes_med.region, 'abductors');
  assert.equal(MUSCLES.glutes.region, 'gluteal');
  assert.notEqual(MUSCLES.glutes_med.region, MUSCLES.glutes.region);
});

test('дельты разведены по переднему и заднему виду', () => {
  assert.equal(MUSCLES.delts_front.region, 'front-deltoids');
  assert.equal(MUSCLES.delts_rear.region, 'back-deltoids');
  // боковой дельты у библиотеки нет: отдана переднему виду, где видна шапка плеча
  assert.equal(MUSCLES.delts_side.region, 'front-deltoids');
});

test('регионов стало 17', () => {
  assert.equal(new Set(Object.values(MUSCLES).map(m => m.region)).size, 17);
});

test('regionLabel даёт русское название региона, а не английский идентификатор', () => {
  assert.equal(regionLabel('gluteal'), 'Ягодичные');
  assert.equal(regionLabel('abductors'), 'Средняя и малая ягодичные');
  assert.equal(regionLabel('adductor'), 'Приводящие');
});

test('regionLabel перечисляет все группы, попавшие в один регион', () => {
  // одна группа в регионе — выводится как есть
  assert.equal(regionLabel('gluteal'), 'Ягодичные');
  // две группы — первая с заглавной, остальные со строчной
  assert.equal(regionLabel('upper-back'), 'Широчайшие, верх спины');
  assert.equal(regionLabel('front-deltoids'), 'Передняя дельта, средняя дельта');
  // quadriceps содержит quads и hip_flexors — проверяем стабильность порядка
  assert.equal(regionLabel('quadriceps'), 'Квадрицепсы, сгибатели бедра');
});

test('regionLabel бросает на неизвестном регионе', () => {
  assert.throws(() => regionLabel('нет-такого'), /нет-такого/);
});

// regionGroups нужен подписи в подборе: она появляется только у области,
// которая объединяет несколько групп мышц. Раньше числа групп спросить было
// не у кого — regionLabel отдаёт готовую строку, и разбирать её обратно по
// запятым значило бы считать названия, а не группы.
test('regionGroups отдаёт идентификаторы групп региона в порядке словаря', () => {
  assert.deepEqual(regionGroups('quadriceps'), ['quads', 'hip_flexors']);
  assert.deepEqual(regionGroups('upper-back'), ['lats', 'upper_back']);
  assert.deepEqual(regionGroups('chest'), ['chest']);
});

test('regionGroups бросает на неизвестном регионе, как и regionLabel', () => {
  assert.throws(() => regionGroups('нет-такого'), /нет-такого/);
});

// Число из брифа Task 8: общих областей три из семнадцати, и постоянная
// подпись под картой ради трёх случаев не нужна. Тест сторожит и состав
// списка: если общей станет ещё одна область, подпись в подборе начнёт
// появляться и на ней — это надо увидеть, а не узнать случайно.
test('несколько групп мышц — ровно у трёх областей схемы из семнадцати', () => {
  const regions = [...new Set(Object.values(MUSCLES).map(m => m.region))];
  assert.equal(regions.length, 17);
  assert.deepEqual(regions.filter(r => regionGroups(r).length > 1).sort(),
    ['front-deltoids', 'quadriceps', 'upper-back']);
});

// На этом стоит подпись в подборе: она обещает, что в заголовке перечислены
// все группы области. Если regionLabel когда-нибудь начнёт сокращать список,
// обещание станет ложью — и упадёт вот здесь.
test('regionLabel называет каждую группу из regionGroups', () => {
  for (const region of new Set(Object.values(MUSCLES).map(m => m.region))) {
    const label = regionLabel(region).toLowerCase();
    for (const id of regionGroups(region)) {
      assert.ok(label.includes(muscleLabel(id).toLowerCase()),
        `в подписи региона ${region} («${regionLabel(region)}») нет группы ${id}`);
    }
  }
});
