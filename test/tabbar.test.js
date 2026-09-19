// Таймер в навигации. Само поведение таймера проверено в существующих тестах —
// здесь только его новое место: шторка и подпись пункта.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mount = () => {
  const { window } = makeDom(html);
  return { window, document: window.document };
};

test('полосы таймера во всю ширину больше нет', () => {
  const { window, document } = mount();
  startApp(window);
  assert.equal(document.querySelector('aside.timer'), null,
    'прежняя полоса должна быть убрана, а не спрятана стилями');
});

test('шторка закрыта по умолчанию и открывается пунктом «Отдых»', () => {
  const { window, document } = mount();
  startApp(window);
  const sheet = document.getElementById('timer-sheet');
  assert.equal(sheet.hidden, true);
  document.getElementById('timer-open').click();
  assert.equal(sheet.hidden, false);
  assert.equal(document.getElementById('timer-open').getAttribute('aria-expanded'), 'true');
});

test('крестик закрывает шторку', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  document.getElementById('timer-close').click();
  assert.equal(document.getElementById('timer-sheet').hidden, true);
});

test('пока отдых идёт, пункт показывает время вместо подписи', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  document.getElementById('timer-toggle').click();
  const label = document.getElementById('timer-open').textContent.trim();
  assert.match(label, /\d\d:\d\d/, `в пункте должно быть время, а не «${label}»`);
});

test('в покое пункт подписан «Отдых»', () => {
  const { window, document } = mount();
  startApp(window);
  assert.equal(document.getElementById('timer-open').textContent.trim(), 'Отдых');
});

test('пункт «Отдых» не переключает раздел', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  const shown = [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);
  assert.deepEqual(shown, ['screen-today'], 'шторка не должна менять раздел');
});
