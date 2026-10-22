// Обещание тренировки «Всё тело. Равномерно.» (шапка и комментарий в
// workouts/balanced-full-body.js): каждая группа, которую она нагружает
// целенаправленно, получает рабочий объём, бёдра работают со всех сторон, а
// спина — не меньше груди. Числа зависят от разметки мышц в таблице, поэтому
// сторож держит обещание, а не сами числа: правка разметки, которая его не
// ломает, тест не краснит.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklySets } from '../weekly.js';
import { verdictFor } from '../load-bands.js';
import balanced from '../workouts/balanced-full-body.js';

// Неделя одной тренировки, как на экране (app.js), а не сумма реестра.
const sets = weeklySets([balanced]);

test('«Всё тело. Равномерно.»: каждая целевая группа — в рабочем объёме', () => {
  const targeted = [...sets].filter(([, row]) => row.comparable > 0);
  assert.ok(targeted.length > 0, 'ни одной целевой группы — тест ничего не проверяет');
  for (const [group, { comparable }] of targeted) {
    assert.equal(verdictFor(comparable).verdict, 'рабочий объём', `${group}: ${comparable}`);
  }
});

test('«Всё тело. Равномерно.»: бёдра со всех сторон, спина не меньше груди', () => {
  for (const group of ['quads', 'hamstrings', 'glutes_med', 'adductors']) {
    assert.ok(sets.get(group).comparable > 0, `${group} без целевой работы`);
  }
  const chest = sets.get('chest').comparable;
  assert.ok(sets.get('lats').comparable >= chest, 'широчайшим меньше, чем груди');
  assert.ok(sets.get('upper_back').comparable >= chest, 'верху спины меньше, чем груди');
});
