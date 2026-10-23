// Значки и петля-счётчик (icons.js): значок скрыт от диктора, имя проверяется,
// счётчик не рисует точку на нуле.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { icon, loopMeter } from '../icons.js';

const { document } = makeDom();

test('значок: svg с переданным классом, скрыт от диктора, без фокуса', () => {
  const svg = icon(document, 'tick', 'ic ic-hand');
  assert.equal(svg.getAttribute('class'), 'ic ic-hand');
  assert.equal(svg.getAttribute('aria-hidden'), 'true');
  assert.equal(svg.getAttribute('focusable'), 'false');
  assert.ok(svg.querySelector('path'));
});

test('значок с неизвестным именем — ошибка, а не пустой svg', () => {
  assert.throws(() => icon(document, 'нет-такого'), /Нет значка/);
  assert.throws(() => icon(document, 'constructor'), /Нет значка/, 'имя из прототипа объекта — тоже неизвестное');
});

test('волна тянется на всю ширину, а петля шире остальных значков', () => {
  assert.equal(icon(document, 'wave', 'wave').getAttribute('preserveAspectRatio'), 'none');
  assert.equal(icon(document, 'tick').getAttribute('preserveAspectRatio'), null);
  assert.equal(icon(document, 'loop', '').getAttribute('viewBox'), '0 0 132 72');
  assert.equal(icon(document, 'plus').getAttribute('viewBox'), '0 0 24 24');
});

test('петля-счётчик: дорожка и штрих по контуру значка петли, у обоих длина пути — сотня', () => {
  const meter = loopMeter(document, 'meter');
  const [track, fill] = meter.svg.querySelectorAll('path');
  assert.equal(meter.svg.getAttribute('class'), 'meter');
  assert.equal(meter.svg.getAttribute('aria-hidden'), 'true');
  assert.equal(meter.svg.getAttribute('viewBox'), '0 0 132 72');
  assert.equal(track.getAttribute('class'), 'loop-track');
  assert.equal(fill.getAttribute('class'), 'loop-fill');
  const outline = icon(document, 'loop', '').querySelector('path').getAttribute('d');
  assert.equal(track.getAttribute('d'), outline);
  assert.equal(fill.getAttribute('d'), outline);
  assert.equal(track.getAttribute('pathLength'), '100');
  assert.equal(fill.getAttribute('pathLength'), '100');
});

test('петля-счётчик: доля задаёт длину штриха, пустой штрих скрыт, значения вне 0…1 обрезаются', () => {
  const meter = loopMeter(document);
  const fill = meter.svg.querySelector('.loop-fill');

  meter.set(0.5);
  assert.equal(fill.style.strokeDasharray, '50 100');
  assert.equal(fill.style.opacity, '1');

  meter.set(1 / 3);
  assert.equal(fill.style.strokeDasharray, '33 100', 'длина — целое число сотых');

  // Нулевой штрих со скруглённым концом нарисовал бы точку: его не видно совсем.
  meter.set(0);
  assert.equal(fill.style.strokeDasharray, '0 100');
  assert.equal(fill.style.opacity, '0');
  meter.set(0.004);
  assert.equal(fill.style.opacity, '0', 'доля меньше сотой — тоже пусто');

  meter.set(1);
  assert.equal(fill.style.strokeDasharray, '100 100');
  meter.set(7);
  assert.equal(fill.style.strokeDasharray, '100 100');
  meter.set(-3);
  assert.equal(fill.style.strokeDasharray, '0 100');
  assert.equal(fill.style.opacity, '0');
});
