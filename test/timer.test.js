import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, formatTime } from '../timer.js';

test('formatTime переводит секунды в мм:сс', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(60), '01:00');
  assert.equal(formatTime(95), '01:35');
});

test('новый таймер стоит на выбранной длительности и не идёт', () => {
  const t = createTimer({});
  t.setDuration(45);
  assert.equal(t.remaining, 45);
  assert.equal(t.running, false);
});

test('toggle запускает и останавливает', () => {
  const t = createTimer({});
  t.setDuration(60);
  t.toggle();
  assert.equal(t.running, true);
  t.toggle();
  assert.equal(t.running, false);
});

test('tick уменьшает остаток только на ходу', () => {
  const t = createTimer({});
  t.setDuration(10);
  t.tick();
  assert.equal(t.remaining, 10);
  t.toggle();
  t.tick();
  assert.equal(t.remaining, 9);
});

test('по достижении нуля таймер останавливается и зовёт onDone один раз', () => {
  let done = 0;
  const t = createTimer({ onDone: () => { done += 1; } });
  t.setDuration(2);
  t.toggle();
  t.tick();
  t.tick();
  t.tick();
  assert.equal(t.remaining, 0);
  assert.equal(t.running, false);
  assert.equal(done, 1);
});

test('reset возвращает выбранную длительность и останавливает', () => {
  const t = createTimer({});
  t.setDuration(20);
  t.toggle();
  t.tick();
  t.reset();
  assert.equal(t.remaining, 20);
  assert.equal(t.running, false);
});

// Кнопка «Старт» на отработавшем таймере должна начинать новый отсчёт.
// Без этого первый же tick вернул бы остаток в ноль и повторно позвал onDone,
// а на экране таймер так и остался бы стоять на 00:00.
test('старт с нуля начинает отсчёт заново от выбранной длительности', () => {
  let done = 0;
  const t = createTimer({ onDone: () => { done += 1; } });
  t.setDuration(2);
  t.toggle();
  t.tick();
  t.tick();
  assert.equal(t.remaining, 0);

  t.toggle();
  assert.equal(t.remaining, 2);
  assert.equal(t.running, true);
  t.tick();
  assert.equal(t.remaining, 1);
  assert.equal(done, 1);
});

test('onTick получает остаток на каждом шаге и при смене длительности', () => {
  const seen = [];
  const t = createTimer({ onTick: remaining => seen.push(remaining) });
  t.setDuration(3);
  t.toggle();
  t.tick();
  t.reset();
  assert.deepEqual(seen, [3, 3, 2, 3]);
});
