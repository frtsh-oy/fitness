// Секция карты тела на странице: связывание bodymap.js/muscles.js с разметкой
// в app.js. Сама отрисовка и расчёт объёма проверены в test/bodymap.test.js
// и test/volume.test.js — здесь только то, что относится к секции: раскрытие,
// запоминание состояния, тексты подписей и передача клика в разметку страницы.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function mount() {
  const { window } = makeDom(html);
  return { window, app: startApp(window) };
}

// Ищет среди полигонов обоих видов первый, после клика по которому заголовок
// подбора (.bodymap-pick h3) начинается с ожидаемого текста — так же, как
// test/bodymap.test.js ищет конкретный регион перебором всех 66 кликабельных
// полигонов чужой библиотеки (у нас нет другого способа адресовать регион).
// Промежуточные клики по пути безвредны: они лишь перезаписывают подбор.
function pickByTitle(d, window, startsWith) {
  const polygons = [
    ...d.querySelectorAll('.bodymap-anterior polygon'),
    ...d.querySelectorAll('.bodymap-posterior polygon'),
  ];
  for (const polygon of polygons) {
    polygon.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const title = d.querySelector('.bodymap-pick h3')?.textContent ?? '';
    if (title.startsWith(startsWith)) return title;
  }
  return null;
}

test('секция карты есть в разметке и свёрнута по умолчанию', () => {
  const { window } = mount();
  const section = window.document.querySelector('.bodymap');
  assert.ok(section, 'секции .bodymap нет');
  assert.equal(section.querySelector('.bodymap-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(section.querySelector('.bodymap-body').hidden, true);
});

test('клик по заголовку раскрывает карту и рисует оба вида', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  assert.equal(d.querySelector('.bodymap-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(d.querySelector('.bodymap-body').hidden, false);
  assert.ok(d.querySelector('.bodymap-anterior svg'), 'передний вид не отрисован');
  assert.ok(d.querySelector('.bodymap-posterior svg'), 'задний вид не отрисован');
});

test('повторный клик сворачивает', () => {
  const { window } = mount();
  const t = window.document.querySelector('.bodymap-toggle');
  t.click(); t.click();
  assert.equal(t.getAttribute('aria-expanded'), 'false');
  assert.equal(window.document.querySelector('.bodymap-body').hidden, true);
});

// Исходный вариант этого теста в брифе вызывал startApp дважды на одном и том
// же window — так делать нельзя: второй вызов заново строит разметку внутри
// #workout и заново навешивает делегированные слушатели на host (см. app.js),
// то есть проверял бы устойчивость к повторной инициализации, а не запоминание
// состояния между открытиями приложения. Разбито на два независимых
// утверждения, как и решено до начала работы (см. progress.md, Ruling P2).
test('после раскрытия ключ раскрытия карты записан в localStorage', () => {
  const { window } = mount();
  window.document.querySelector('.bodymap-toggle').click();
  const saved = Object.keys(window.localStorage).filter(k => k.includes('bodymap'));
  assert.equal(saved.length, 1, 'состояние секции не сохранено');
});

test('свежее окно с заранее раскрытым состоянием открывается с раскрытой картой', () => {
  const { window } = makeDom(html);
  window.localStorage.setItem('bodymap-open', '1');
  startApp(window);
  const d = window.document;
  assert.equal(d.querySelector('.bodymap-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(d.querySelector('.bodymap-body').hidden, false);
  assert.ok(d.querySelector('.bodymap-anterior svg'), 'карта не отрисована при восстановлении раскрытого состояния');
});

// Мутацией показано, что запись одного и того же значения независимо от
// open (например, всегда '1') не роняет тест выше про «ключ записан» — он
// проверяет только факт наличия ключа — и не роняет ни один тест брифа.
// Требуется отдельная проверка: закрытие обязано перезаписать значение,
// иначе свежий запуск после того, как карту свернули, снова покажет её
// раскрытой.
test('закрытие карты тоже сохраняется в localStorage, а не только раскрытие', () => {
  const { window } = mount();
  const toggle = window.document.querySelector('.bodymap-toggle');
  toggle.click();
  toggle.click();
  const fresh = makeDom(html).window;
  fresh.localStorage.setItem('bodymap-open', window.localStorage.getItem('bodymap-open'));
  startApp(fresh);
  assert.equal(fresh.document.querySelector('.bodymap-toggle').getAttribute('aria-expanded'), 'false',
    'свежий запуск должен помнить, что карту свернули, а не открывать её заново');
});

test('подписи про разминку и незадействованные группы на месте', () => {
  const { window } = mount();
  window.document.querySelector('.bodymap-toggle').click();
  const note = window.document.querySelector('.bodymap-note').textContent;
  assert.match(note, /Сгибатели бедра/, 'не сказано, что греется только в разминке');
  const idle = window.document.querySelector('.bodymap-idle').textContent;
  assert.match(idle, /Предплечья/);
  assert.doesNotMatch(idle, /Икроножные/,
    'икроножные размечены в четырёх упражнениях и в список неразмеченных больше не попадают');
});

test('подпись про укрупнение областей схемы есть в раскрытой секции', () => {
  // Спека требует подписать в интерфейсе, что области схемы крупнее нашей
  // разметки: без этого на одном экране видно противоречие — клик по бедру
  // перечисляет «Квадрицепсы, сгибатели бедра», а подпись ниже говорит, что
  // сгибатели бедра работают только в разминке и заминке.
  // Текст не зависит ни от тренировки, ни от выбора мышцы, поэтому живёт в
  // разметке index.html, а не собирается в app.js, и своего класса у него два
  // повода: .bodymap-note и .bodymap-idle app.js находит по классу, и второй
  // элемент с тем же классом сломал бы выборку.
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  const scope = d.querySelector('.bodymap-body .bodymap-scope');
  assert.ok(scope, 'подписи про укрупнение областей нет в секции');
  assert.match(scope.textContent, /в одну область попадает несколько групп мышц/);
  assert.equal(d.querySelectorAll('.bodymap-note').length, 1,
    'класс .bodymap-note обязан остаться единственным: app.js пишет его содержимое по выборке класса');
});

test('карта рисуется только при первом раскрытии, а не при загрузке', () => {
  const { window } = mount();
  assert.equal(window.document.querySelector('.bodymap-anterior svg'), null,
    'карта отрисована до раскрытия');
});

// Ниже — тесты сверх брифа. Клик по мышце (showPick и прокрутка к упражнению)
// не был проверен ни одним тестом брифа, хотя это ровно половина
// функциональности секции и отдельные пункты ручной проверки в браузере.
// Числа (6 подходов, четыре упражнения, их порядок) сверены независимо через
// exerciseEntries/regionLabel из volume.js и muscles.js, а не подобраны по
// тому, что покажет экран.

test('клик по ягодичным показывает верное число подходов и список упражнений', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  const title = pickByTitle(d, window, 'Ягодичные');
  assert.equal(title, 'Ягодичные — 6 подх.');
  const names = [...d.querySelectorAll('.bodymap-pick button')].map(b => b.textContent);
  assert.deepEqual(names, [
    'Румынская тяга с длинной резинкой',
    'Ягодичный мост',
    'Жим двумя ногами лёжа',
    '«Птица-собака»: противоположные рука и нога',
  ]);
});

test('клик по другой мышце заменяет прежний список, а не дополняет его', () => {
  // mapPick.replaceChildren() в showPick ничем себя не проявит, если кликнуть
  // только один раз — список и так пуст с самого начала. Проверить его можно
  // только сменой мышцы: если бы кнопки лишь добавлялись, здесь их было бы 4,
  // а не 0.
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  pickByTitle(d, window, 'Ягодичные');
  assert.equal(d.querySelectorAll('.bodymap-pick button').length, 4);
  // Предплечья — единственная группа без разметки, и ноль подходов у неё в
  // любом режиме карты.
  const title = pickByTitle(d, window, 'Предплечья');
  assert.equal(title, 'Предплечья — 0 подх.');
  assert.equal(d.querySelectorAll('.bodymap-pick button').length, 0,
    'старый список упражнений не должен оставаться при клике по другой мышце');
});

test('клик по упражнению в подборе прокручивает к нему на странице', () => {
  const { window } = mount();
  const d = window.document;
  const scrolls = [];
  window.Element.prototype.scrollIntoView = function (opts) { scrolls.push({ el: this, opts }); };

  d.querySelector('.bodymap-toggle').click();
  pickByTitle(d, window, 'Ягодичные');
  const button = [...d.querySelectorAll('.bodymap-pick button')].find(b => b.textContent === 'Ягодичный мост');
  assert.ok(button, 'кнопка упражнения «Ягодичный мост» не найдена в подборе');
  button.click();

  assert.equal(scrolls.length, 1, 'клик по упражнению должен прокрутить страницу ровно один раз');
  const expected = [...d.querySelectorAll('.exercise h3')].find(h => h.textContent === 'Ягодичный мост');
  assert.ok(expected, 'на странице нет упражнения с таким названием');
  assert.equal(scrolls[0].el, expected, 'прокрутка должна вести к заголовку именно этого упражнения');
  assert.deepEqual(scrolls[0].opts, { block: 'center', behavior: 'smooth' });
});

test('прокрутка к упражнению мгновенная, если анимацию просили выключить', () => {
  const { window } = mount();
  const d = window.document;
  window.matchMedia = query => ({ media: query, matches: query.includes('prefers-reduced-motion') });
  const scrolls = [];
  window.Element.prototype.scrollIntoView = function (opts) { scrolls.push(opts); };

  d.querySelector('.bodymap-toggle').click();
  pickByTitle(d, window, 'Ягодичные');
  const button = [...d.querySelectorAll('.bodymap-pick button')].find(b => b.textContent === 'Ягодичный мост');
  button.click();

  assert.deepEqual(scrolls, [{ block: 'center', behavior: 'instant' }]);
});

test('повторное раскрытие не рисует карту заново', () => {
  // Библиотека дорисовывает SVG в контейнер, а не заменяет прежний
  // (body-highlighter: container.appendChild нового узла без очистки старых) —
  // без защиты в openMap() второе раскрытие удвоило бы силуэт на экране.
  const { window } = mount();
  const d = window.document;
  const toggle = d.querySelector('.bodymap-toggle');
  toggle.click();
  toggle.click();
  toggle.click();
  assert.equal(d.querySelectorAll('.bodymap-anterior svg').length, 1,
    'повторное раскрытие нарисовало передний вид ещё раз');
  assert.equal(d.querySelectorAll('.bodymap-posterior svg').length, 1,
    'повторное раскрытие нарисовало задний вид ещё раз');
});
