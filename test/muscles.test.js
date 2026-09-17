import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLES, isMuscleId, muscleLabel, toRegions, regionLabel } from '../muscles.js';
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
