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

// Спека требует: «пока отдых идёт — подсвечивается», и это про отсчёт, а не
// про открытую шторку. Закрытие шторки крестиком не останавливает отдых, и
// подсветка обязана пережить закрытие — иначе единственный намёк на идущее
// время исчезает, хотя оно всё ещё тикает.
test('подсветка пункта держится на отсчёте, а не на открытости шторки', () => {
  const { window, document } = mount();
  const app = startApp(window);
  const openButton = document.getElementById('timer-open');
  assert.equal(openButton.dataset.running, 'false', 'в покое пункт не подсвечен');

  openButton.click();
  document.getElementById('timer-toggle').click();
  assert.equal(openButton.dataset.running, 'true', 'во время отдыха пункт подсвечен');

  document.getElementById('timer-close').click();
  assert.equal(openButton.getAttribute('aria-expanded'), 'false', 'шторка и правда закрыта');
  // Тик после закрытия — не для отсчёта времени (он и так идёт), а чтобы
  // заставить перерисовку случиться уже ПОСЛЕ закрытия шторки: привязка к
  // sheet.hidden в этот момент дала бы false и погасила бы подсветку, привязка
  // к running — нет. Без этого тика мутация на sheet.hidden проходит случайно:
  // последняя перерисовка была ещё при открытой шторке.
  app.timer.tick();
  assert.equal(app.timer.running, true, 'отдых всё ещё идёт');
  assert.equal(openButton.dataset.running, 'true',
    'закрытие шторки не должно гасить подсветку идущего отсчёта');
});

test('пункт «Отдых» не переключает раздел', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  const shown = [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);
  assert.deepEqual(shown, ['screen-today'], 'шторка не должна менять раздел');
});
