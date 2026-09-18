// Секция недельного объёма на странице: раскрытие, память состояния и
// содержимое. Сам расчёт проверен в test/weekly.test.js, полосы — в
// test/load-bands.test.js; здесь только связывание с разметкой.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function mount() {
  const { window } = makeDom(html);
  return { window, document: window.document };
}

test('секция есть в разметке и свёрнута по умолчанию', () => {
  const { window, document } = mount();
  startApp(window);
  const section = document.querySelector('.weekly');
  assert.ok(section, 'секции .weekly нет');
  assert.equal(section.querySelector('.weekly-body').hidden, true);
  assert.equal(section.querySelector('.weekly-toggle').getAttribute('aria-expanded'), 'false');
});

test('нажатие раскрывает секцию и рисует строки по всем группам', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  assert.equal(document.querySelector('.weekly-body').hidden, false);
  assert.equal(document.querySelector('.weekly-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelectorAll('.weekly-row').length, 20);
});

test('строка показывает оба числа и вердикт', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const glutes = rows.find(row => row.textContent.includes('Ягодичные'));
  assert.match(glutes.textContent, /12/, 'нет сопоставимого числа');
  assert.match(glutes.textContent, /18/, 'нет нашего числа');
  assert.match(glutes.textContent, /рабочий объём/);
});

test('группа без целевой работы получает свой вердикт, а не «мало»', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const forearms = rows.find(row => row.textContent.includes('Предплечья'));
  assert.match(forearms.textContent, /не тренируется целенаправленно/);
});

test('строки идут по убыванию сопоставимого объёма', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const nums = [...document.querySelectorAll('.weekly-row .weekly-main')]
    .map(cell => Number(cell.textContent.replace(',', '.')));
  assert.deepEqual(nums, [...nums].sort((a, b) => b - a));
});

test('секция говорит о себе две оговорки', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const notes = document.querySelector('.weekly-body').textContent;
  assert.match(notes, /количество, а не качество/,
    'нет оговорки про то, что усилие из данных не видно');
  assert.match(notes, /наше чтение/,
    'нет оговорки про счёт односторонних');
});

// Спека потребовала это ПОСЛЕ того, как у полосы появилось поле basis (см.
// load-bands.js): у ягодичных сопоставимое — 12, оно попадает в «рабочий
// объём», а у этой полосы basis — «низ из источника, верх — наша линия». Верх
// не подтверждён источником, и экран обязан это показывать прямо в строке, а
// не только в тексте вердикта, который от источника к «нашей линии» не
// меняется ни словом.
test('вердикт «рабочий объём» помечен как частично наша линия, а не только источник', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const glutes = rows.find(row => row.textContent.includes('Ягодичные'));
  const mark = glutes.querySelector('.weekly-basis');
  assert.ok(mark, 'нет отдельной пометки про происхождение границы');
  assert.match(mark.textContent, /наша линия/);
});

// Обратная сторона того же требования: вердикт-определение («ноль
// упражнений») не должен получить ту же пометку, что и «наша линия», — это
// разные основания (basis: «определение» против «наша линия»), и одинаковая
// пометка стёрла бы разницу, которую спека просит показать.
test('вердикт-определение «не тренируется» пометки «наша линия» не получает', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const forearms = rows.find(row => row.textContent.includes('Предплечья'));
  assert.equal(forearms.querySelector('.weekly-basis'), null,
    'у вердикта-определения не должно быть пометки происхождения границы');
});

test('секция объясняет, что значит пометка «наша линия»', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const notes = document.querySelector('.weekly-body').textContent;
  assert.match(notes, /наша линия/,
    'нет оговорки о том, что значит пометка «наша линия»');
});

test('состояние раскрытия помнится между загрузками', () => {
  const first = mount();
  startApp(first.window);
  first.document.querySelector('.weekly-toggle').click();
  assert.equal(first.window.localStorage.getItem('weekly-open'), '1');

  const second = mount();
  second.window.localStorage.setItem('weekly-open', '1');
  startApp(second.window);
  assert.equal(second.document.querySelector('.weekly-body').hidden, false);
});

test('свёрнутое состояние тоже помнится', () => {
  const { window, document } = mount();
  window.localStorage.setItem('weekly-open', '1');
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  assert.equal(window.localStorage.getItem('weekly-open'), '0');
});

test('повторное раскрытие не рисует строки заново', () => {
  const { window, document } = mount();
  startApp(window);
  const toggle = document.querySelector('.weekly-toggle');
  toggle.click();
  // Узел, а не только счётчик: renderWeekly чистит host.textContent перед
  // отрисовкой, поэтому и перерисовка даёт ровно 20 строк — счётчик после
  // третьего клика ничего не доказывает. Настоящий признак пропущенной
  // перерисовки — тот же самый DOM-узел, а не свежий с тем же содержимым.
  const firstRow = document.querySelector('.weekly-row');
  toggle.click();
  toggle.click();
  assert.equal(document.querySelectorAll('.weekly-row').length, 20);
  assert.equal(document.querySelector('.weekly-row'), firstRow,
    'строка — новый узел: секция перерисовалась заново, хотя весь смысл ленивой отрисовки — не делать этого дважды');
});
