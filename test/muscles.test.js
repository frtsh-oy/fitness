import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLES, isMuscleId, muscleLabel, toRegions } from '../muscles.js';

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

test('toRegions складывает группы, указывающие на один регион', () => {
  const regions = toRegions({ glutes: 1, glutes_med: 0.5, quads: 1 });
  assert.equal(regions.get('gluteal'), 1.5);
  assert.equal(regions.get('quadriceps'), 1);
});

test('toRegions бросает ошибку на неизвестной группе', () => {
  assert.throws(() => toRegions({ nope: 1 }), /nope/);
});
