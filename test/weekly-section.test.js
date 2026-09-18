// Секция недельного объёма на странице: раскрытие, память состояния и
// содержимое. Сам расчёт проверен в test/weekly.test.js, полосы — в
// test/load-bands.test.js; здесь только связывание с разметкой.
//
// Раунд правок 1 (task-3-fix-1.md, доказательства — task-3-review.md):
// пометка «наша линия» раньше стояла на «рабочем объёме» тоже (basis
// «низ из источника, верх — наша линия»), хотя вход в эту полосу (десять и
// больше) подтверждён источником — на настоящих данных пометка врала на всех
// шести ненулевых строках. Тест на это (было: «вердикт «рабочий объём»
// помечен как частично наша линия») заменён на противоположный по смыслу —
// «...пометки не получает». Заодно закрыты три находки того же ревью: тест на
// оговорку проверял не оговорку, а пилюли («секция объясняет...»); ленивость
// была покрыта только с одной стороны (добавлен ноль строк по умолчанию);
// сравнение чисел шло по тексту всей строки, а не по ячейкам (не отличало
// перестановку местами).
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

test('секция есть в разметке, свёрнута по умолчанию и ничего не рисует заранее', () => {
  const { window, document } = mount();
  startApp(window);
  const section = document.querySelector('.weekly');
  assert.ok(section, 'секции .weekly нет');
  assert.equal(section.querySelector('.weekly-body').hidden, true);
  assert.equal(section.querySelector('.weekly-toggle').getAttribute('aria-expanded'), 'false');
  // Вторая половина требования «рисуется при первом раскрытии»: до раскрытия
  // строк быть не должно вовсе, а не только не должно быть видно (ревью,
  // находка 3). host.js/app.js устроены так, что drawWeekly() при чистом
  // localStorage вообще не вызывается — эта проверка ловит будущий регресс,
  // если кто-то станет звать её раньше раскрытия.
  assert.equal(section.querySelectorAll('.weekly-row').length, 0);
});

test('нажатие раскрывает секцию и рисует строки по всем группам', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  assert.equal(document.querySelector('.weekly-body').hidden, false);
  assert.equal(document.querySelector('.weekly-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelectorAll('.weekly-row').length, 20);
});

test('строка показывает оба числа в своих ячейках, не переставленными местами', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const glutes = rows.find(row => row.textContent.includes('Ягодичные'));
  // Сравнение по ячейкам, а не по тексту всей строки (было раньше): текст
  // строки «Ягодичные 12 18 …» и «Ягодичные 18 12 …» одинаково проходил бы
  // /12/ и /18/ — ревью поймало это находкой 4, перестановка ловилась только
  // побочно, через тест на сортировку.
  assert.equal(glutes.querySelector('.weekly-main').textContent, '12', 'сопоставимое число не в своей ячейке');
  assert.equal(glutes.querySelector('.weekly-ours').textContent, '18', 'наше число не в своей ячейке');
  assert.match(glutes.querySelector('.weekly-verdict').textContent, /рабочий объём/);
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

// Тай-брейкеры сортировки (по нашему числу, потом по названию) не были
// покрыты ни одним тестом (ревью, находка 6): упрощение до одного лишь
// сравнения по сопоставимому объёму оставляло все тесты зелёными, хотя на
// настоящих данных ничья — норма (шесть строк на 12, пять на 6, девять на 0).
// Порядок пересчитан независимым скриптом по реальному WORKOUTS (см. отчёт),
// а не предположен.
test('порядок внутри равного объёма — по нашему числу, потом по названию, а не по словарю', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const names = [...document.querySelectorAll('.weekly-row .weekly-name')].map(n => n.textContent);
  assert.deepEqual(names, [
    'Ягодичные',                    // 12 / 18
    'Разгибатели поясницы',         // 12 / 9 — далее по имени: Р < С < Т
    'Средняя и малая ягодичные',    // 12 / 9
    'Трицепс',                      // 12 / 9
    'Приводящие',                   // 12 / 6 — далее по имени: П < С
    'Средняя дельта',               // 12 / 6
    'Верх спины',                   // 6 / 9 — далее по имени: В < З
    'Задняя поверхность бедра',     // 6 / 9
    'Грудные',                      // 6 / 6 — далее по имени: Г < К < Ш
    'Квадрицепсы',                  // 6 / 6
    'Широчайшие',                   // 6 / 6
    'Предплечья',                   // 0 / 18
    'Бицепс',                       // 0 / 6 — далее по имени: Б < И < П
    'Икроножные',                   // 0 / 6
    'Передняя дельта',              // 0 / 6
    'Косые мышцы живота',           // 0 / 3 — далее по имени: К < П < Т
    'Прямая мышца живота',          // 0 / 3
    'Трапеции',                     // 0 / 3
    'Задняя дельта',                // 0 / 0 — далее по имени: З < С
    'Сгибатели бедра',              // 0 / 0
  ]);
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

// Критическая находка ревью (task-3-review.md, находка 1): у «рабочего
// объёма» вход в полосу (десять и больше подходов) подтверждён источником
// (Schoenfeld 2017) — наша только верхняя граница 20, до которой сегодняшние
// данные не доходят. У ягодичных сопоставимое 12 классифицировано в «рабочий
// объём» ИМЕННО источником, а не нами, — пометка «наша линия» здесь была бы
// (и была, до этой правки) неправдой. Разница уровня «весь потолок полосы —
// наш» теперь в тексте секции, а не в пилюле построчно (см. тест про
// WORKING_CEILING_NOTE ниже).
test('вердикт «рабочий объём» пометки «наша линия» не получает: вход в полосу подтверждён источником', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const glutes = rows.find(row => row.textContent.includes('Ягодичные'));
  assert.match(glutes.querySelector('.weekly-verdict').textContent, /рабочий объём/);
  assert.equal(glutes.querySelector('.weekly-basis'), null,
    'у «рабочего объёма» не должно быть пометки «наша линия»: классификация 12 в эту полосу — по числу из источника');
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

// Ревью нашло (находка 2), что этот тест ничего не проверял: искал /наша
// линия/ по всей .weekly-body, а эта фраза уже есть в шести пилюлях —
// удаление самой оговорки оставляло тест зелёным. Починка: искать только
// среди .weekly-note (пилюли лежат в .weekly-verdict, структурно в другом
// месте) и по фразе, которой в пилюле нет, — «означает».
test('секция объясняет, что значит пометка «наша линия», а не только показывает её в пилюлях', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const notes = [...document.querySelectorAll('.weekly-note')].map(n => n.textContent).join(' ');
  assert.match(notes, /означает: вся его граница — наше решение, а не источник/,
    'нет оговорки о том, что значит пометка «наша линия» (искать нужно среди .weekly-note, а не по всей секции — там же и пилюли)');
});

// Часть критической находки 1: раз пометка построчно больше не несёт разницу
// у «рабочего объёма», эту разницу обязана нести секция целиком — иначе на
// сегодняшних данных (ноль пометок) экран вообще ничего не говорит про то,
// что верхняя граница этой полосы не из источника.
test('секция объясняет, что верхняя граница «рабочего объёма» — наша линия, а нижняя подтверждена источником', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const notes = [...document.querySelectorAll('.weekly-note')].map(n => n.textContent).join(' ');
  assert.match(notes, /нижняя граница \(десять подходов\) подтверждена источником/,
    'нет оговорки про то, что у «рабочего объёма» источник подтверждает только вход, а не потолок');
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
