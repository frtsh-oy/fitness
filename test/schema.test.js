import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout, countMarks } from '../workouts/schema.js';

function minimalWorkout(overrides = {}) {
  return {
    id: 'test',
    kicker: 'ДОМА',
    title: 'Тест один. Тест два.',
    titleLines: ['Тест один.', 'Тест два.'],
    lead: 'Описание',
    schedule: 'ПН · СР · ПТ',
    stats: [{ v: '10', l: 'минут' }],
    gear: 'Коврик',
    blocks: [{
      id: 'b1', n: '01', nav: 'Блок', title: 'Блок', sub: 'Подзаголовок', rounds: 2,
      items: [{
        name: 'Упражнение', muscles: 'Ягодицы', reps: '10 раз', text: 'Описание',
        load: { glutes: 1 }, pattern: 'hinge', gear: ['band_long'],
        unilateral: false, kind: 'strength',
      }],
    }],
    progression: ['Совет'],
    caution: 'Осторожно',
    ...overrides,
  };
}

test('корректная тренировка проходит проверку', () => {
  assert.deepEqual(validateWorkout(minimalWorkout()), []);
});

test('отсутствие обязательного поля верхнего уровня попадает в отчёт', () => {
  const w = minimalWorkout();
  delete w.title;
  const problems = validateWorkout(w);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /title/);
});

test('titleLines из трёх строк попадает в отчёт', () => {
  const w = minimalWorkout({ titleLines: ['раз', 'два', 'три'] });
  assert.match(validateWorkout(w).join('\n'), /titleLines/);
});

test('блок без короткой подписи nav попадает в отчёт', () => {
  const w = minimalWorkout();
  delete w.blocks[0].nav;
  assert.match(validateWorkout(w).join('\n'), /nav/);
});

test('неизвестная группа мышц в load попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = { nonexistent: 1 };
  assert.match(validateWorkout(w).join('\n'), /nonexistent/);
});

test('значение load кроме 1 и 0.5 попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = { glutes: 0.7 };
  assert.match(validateWorkout(w).join('\n'), /0\.7/);
});

test('неизвестный pattern попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].pattern = 'flying';
  assert.match(validateWorkout(w).join('\n'), /flying/);
});

test('неизвестный инвентарь попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].gear = ['kettlebell'];
  assert.match(validateWorkout(w).join('\n'), /kettlebell/);
});

test('разминочному упражнению разрешён пустой load', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].kind = 'warmup';
  w.blocks[0].items[0].load = {};
  assert.deepEqual(validateWorkout(w), []);
});

test('силовому упражнению пустой load запрещён', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = {};
  assert.match(validateWorkout(w).join('\n'), /load/);
});

test('countMarks считает rounds умножить на число упражнений по всем блокам', () => {
  const w = minimalWorkout();
  w.blocks.push({
    id: 'b2', n: '02', nav: 'Второй', title: 'Второй', sub: '', rounds: 3,
    items: [w.blocks[0].items[0], w.blocks[0].items[0]],
  });
  // блок 1: 2 круга * 1 упражнение = 2; блок 2: 3 круга * 2 упражнения = 6
  assert.equal(countMarks(w), 8);
});
