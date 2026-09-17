// Секция карты тела на странице: связывание bodymap.js/muscles.js с разметкой
// в app.js. Сама отрисовка и расчёт объёма проверены в test/bodymap.test.js
// и test/volume.test.js — здесь только то, что относится к секции: раскрытие,
// запоминание состояния, тексты подписей и передача клика в разметку страницы.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';
import legs from '../workouts/legs-mwf.js';
import { warmupOnlyGroups, idleGroups } from '../bodymap.js';
import { muscleLabel, regionGroups } from '../muscles.js';

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
  assert.deepEqual(saved, ['bodymap-open'],
    'раскрытие секции не сохранено (а режим карты, которого человек не трогал, сохраняться и не должен)');
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

test('подписи про разминку и неразмеченные группы на месте, а списки групп — из данных', () => {
  const { window } = mount();
  window.document.querySelector('.bodymap-toggle').click();
  const groups = window.document.querySelector('.bodymap-groups').textContent;

  // Списки собираются из разметки, а не вписаны в подпись руками.
  for (const group of [...warmupOnlyGroups(legs), ...idleGroups(legs)]) {
    assert.match(groups, new RegExp(muscleLabel(group), 'i'),
      `в подписи нет группы «${muscleLabel(group)}»`);
  }
  // Внутри фразы названия групп идут со строчной — так в согласованном макете.
  assert.match(groups, /Только в разминке и заминке: сгибатели бедра, задняя дельта\./);
  assert.match(groups, /Светлым — то, чего нет в разметке: предплечья\./);

  // Подпись говорит про разметку, а не про тело: предплечья в ней потому, что
  // хват резинки нигде не размечен, а не потому, что тренировка их не касается.
  // Эту формулировку уже ломали один раз, поэтому проверка отдельная.
  assert.doesNotMatch(groups, /не работа|не участв|не задейств|не касает/i,
    'светлым показано отсутствие разметки, а не отсутствие работы в теле');
  assert.doesNotMatch(groups, /Икроножные/i,
    'икроножные размечены в четырёх упражнениях и в список неразмеченных больше не попадают');
});

test('под картой ровно две подписи и меньше двухсот знаков', () => {
  // Владелец программы сказал, что подписей под картой много: их было три и
  // около 380 знаков — шесть строк текста под картинкой на телефоне. Тест
  // держит не формулировку, а объём и число абзацев: он упадёт, если под карту
  // вернут третий абзац или разрастётся текст.
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  const captions = [...d.querySelectorAll('.bodymap-body > p')];
  assert.deepEqual(captions.map(p => p.className), ['bodymap-note', 'bodymap-groups']);
  const total = captions.map(p => p.textContent).join(' ');
  assert.ok(total.length < 200, `под картой ${total.length} знаков:\n${total}`);
});

test('объяснения про общие области схемы под картой больше нет', () => {
  // Постоянный абзац .bodymap-scope объяснял затруднение до того, как человек
  // с ним столкнётся, и владелец сказал, что он непонятен. Объяснение
  // переехало в подбор — туда, где область действительно общая (тест ниже).
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  assert.equal(d.querySelector('.bodymap-scope'), null,
    'статичная подпись про области схемы должна была уйти из разметки');
  assert.doesNotMatch(d.querySelector('.bodymap-body').textContent, /област/i,
    'до клика по мышце про области схемы под картой говорить нечего');
  assert.equal(d.querySelectorAll('.bodymap-note').length, 1,
    'класс .bodymap-note обязан остаться единственным: app.js пишет его содержимое по выборке класса');
  assert.equal(d.querySelectorAll('.bodymap-groups').length, 1,
    'класс .bodymap-groups обязан остаться единственным: app.js пишет его содержимое по выборке класса');
});

test('в подборе по общей области схемы есть объяснение, по обычной — нет', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();

  // Квадрицепсы — область из двух наших групп: квадрицепсы и сгибатели бедра.
  const title = pickByTitle(d, window, 'Квадрицепсы');
  assert.equal(title, 'Квадрицепсы, сгибатели бедра — 2 подх.');
  const shared = d.querySelector('.bodymap-pick .bodymap-shared');
  assert.ok(shared, 'у области из нескольких групп мышц объяснение обязано быть');
  assert.match(shared.textContent, /общая/);
  // Подпись обещает, что в заголовке перечислены все группы области. Проверяем,
  // что это правда, а не обещание.
  for (const id of regionGroups('quadriceps')) {
    assert.ok(title.toLowerCase().includes(muscleLabel(id).toLowerCase()),
      `в заголовке подбора нет группы ${id}`);
  }
  // И стоит объяснение сразу под заголовком, а не после списка упражнений:
  // речь в нём именно про заголовок.
  assert.deepEqual([...d.querySelector('.bodymap-pick').children].slice(0, 2).map(e => e.tagName),
    ['H3', 'P']);

  // Грудные — область из одной группы: перечислять нечего, объяснять нечего.
  assert.equal(regionGroups('chest').length, 1);
  assert.equal(pickByTitle(d, window, 'Грудные'), 'Грудные — 2 подх.');
  assert.equal(d.querySelector('.bodymap-pick .bodymap-shared'), null,
    'у области из одной группы мышц объяснение появляться не должно');
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
// regionSummary/regionLabel из volume.js и muscles.js, а не подобраны по
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

// Ниже — переключатель режима карты (Task 7). Силовой режим — как было:
// цветом только силовые подходы. Второй режим складывает разминку, силовые и
// заминку в одно число. Икроножные — самая наглядная пара чисел: 2 против 5.

// Кнопка режима по значению data-mode. Ищем по нему, а не по тексту: подпись
// кнопки — вопрос вёрстки, а data-mode — то, что уходит в bodymap.js и в
// localStorage.
function modeButton(d, mode) {
  return d.querySelector(`.bodymap-modes button[data-mode="${mode}"]`);
}

function pressed(d) {
  return [...d.querySelectorAll('.bodymap-modes button')]
    .filter(b => b.getAttribute('aria-pressed') === 'true')
    .map(b => b.dataset.mode);
}

test('переключатель режима есть в раскрытой секции, по умолчанию выбраны силовые', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  const buttons = [...d.querySelectorAll('.bodymap-modes button')];
  assert.deepEqual(buttons.map(b => b.dataset.mode), ['strength', 'all'],
    'в переключателе должны быть ровно два режима в этом порядке');
  for (const button of buttons) {
    assert.equal(button.type, 'button', 'режим переключают обычной кнопкой — она доступна с клавиатуры');
  }
  assert.deepEqual(pressed(d), ['strength'], 'по умолчанию нажат ровно один режим — силовой');
});

test('режим «вся нагрузка» меняет число подходов и список упражнений в подборе', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();

  assert.equal(pickByTitle(d, window, 'Икроножные'), 'Икроножные — 2 подх.');
  assert.deepEqual([...d.querySelectorAll('.bodymap-pick button')].map(b => b.textContent),
    ['Ягодичный мост', 'Жим двумя ногами лёжа']);

  modeButton(d, 'all').click();
  assert.deepEqual(pressed(d), ['all']);
  assert.equal(pickByTitle(d, window, 'Икроножные'), 'Икроножные — 5 подх.');
  assert.deepEqual([...d.querySelectorAll('.bodymap-pick button')].map(b => b.textContent), [
    '«Китайское» приседание с подъёмом таза и разворотом',
    'Подъём колена с лёгкой резинкой',
    'Ягодичный мост',
    'Жим двумя ногами лёжа',
  ]);
});

test('первая подпись говорит про тот режим, который выбран', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  const note = () => d.querySelector('.bodymap-note').textContent;

  assert.match(note(), /Цветом/);
  assert.match(note(), /силовые подходы/);
  assert.doesNotMatch(note(), /вся нагрузка/i,
    'в силовом режиме цветом показаны только силовые подходы');

  modeButton(d, 'all').click();
  assert.match(note(), /Цветом/);
  assert.match(note(), /вся нагрузка: разминка, силовые и заминка/,
    'в режиме всей нагрузки цвет — это уже не только силовые подходы');

  modeButton(d, 'strength').click();
  assert.match(note(), /силовые подходы/, 'возврат в силовой режим обязан вернуть и подпись');
  assert.doesNotMatch(note(), /вся нагрузка/i);
});

test('строка про разминку и заминку есть только в силовом режиме, а про светлое — в обоих', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  const groups = () => d.querySelector('.bodymap-groups').textContent;

  assert.match(groups(), /Только в разминке и заминке: сгибатели бедра, задняя дельта/);
  assert.match(groups(), /чего нет в разметке: предплечья/);

  modeButton(d, 'all').click();
  // В этом режиме те же группы раскрашены наравне с силовыми: бледность
  // объяснять больше нечем, и строка про них уходит совсем, а не переписывается.
  assert.doesNotMatch(groups(), /разминк/i,
    'в режиме всей нагрузки разминка и заминка уже в цвете — говорить о них нечего');
  assert.doesNotMatch(groups(), /сгибатели бедра|задняя дельта/i);
  // А предплечий нет ни в одном типе нагрузки, поэтому эта строка одна на оба режима.
  assert.match(groups(), /Светлым — то, чего нет в разметке: предплечья\./);

  modeButton(d, 'strength').click();
  assert.match(groups(), /Только в разминке и заминке: сгибатели бедра, задняя дельта/,
    'возврат в силовой режим обязан вернуть и строку про разминку');
});

test('смена режима убирает прежний подбор, а не оставляет числа другого режима', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  assert.equal(pickByTitle(d, window, 'Ягодичные'), 'Ягодичные — 6 подх.');
  modeButton(d, 'all').click();
  assert.equal(d.querySelector('.bodymap-pick').textContent, '',
    'подбор со старыми числами обязан исчезнуть при смене режима');
});

test('смена режима не рисует силуэт заново', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  modeButton(d, 'all').click();
  modeButton(d, 'strength').click();
  assert.equal(d.querySelectorAll('.bodymap-anterior svg').length, 1);
  assert.equal(d.querySelectorAll('.bodymap-posterior svg').length, 1);
});

test('свежее окно с сохранённым режимом «вся нагрузка» открывается в нём', () => {
  const { window } = makeDom(html);
  window.localStorage.setItem('bodymap-mode', 'all');
  startApp(window);
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  assert.deepEqual(pressed(d), ['all']);
  assert.equal(pickByTitle(d, window, 'Икроножные'), 'Икроножные — 5 подх.',
    'сохранённый режим обязан дойти до самой карты, а не только до кнопок');
});

// Мутацией показано: запись всегда одного значения (например, 'all') не роняет
// ни один тест выше — сохранение проверялось только в одну сторону. Возврат к
// силовым обязан перезаписать ключ, иначе режим по умолчанию перестанет быть
// режимом по умолчанию после первого же переключения.
test('возврат к силовым тоже сохраняется', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  modeButton(d, 'all').click();
  modeButton(d, 'strength').click();

  const fresh = makeDom(html).window;
  fresh.localStorage.setItem('bodymap-mode', window.localStorage.getItem('bodymap-mode'));
  startApp(fresh);
  fresh.document.querySelector('.bodymap-toggle').click();
  assert.deepEqual(pressed(fresh.document), ['strength']);
});

test('незнакомое значение режима в хранилище не ломает карту: остаются силовые', () => {
  // localStorage переживает и смену версии приложения, и правку руками, так
  // что прочитать оттуда можно что угодно.
  const { window } = makeDom(html);
  window.localStorage.setItem('bodymap-mode', 'чепуха');
  startApp(window);
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  assert.deepEqual(pressed(d), ['strength']);
  assert.equal(pickByTitle(d, window, 'Икроножные'), 'Икроножные — 2 подх.');
});

// Правка раунда 1: число в подборе — точный объём, тот же, что в
// docs/muscle-map.md. Дробные значения в режиме всей нагрузки — обычное дело
// (доля 0.5 на нечётное число кругов), и в русском тексте у них запятая.
test('дробное число подходов написано через запятую', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  modeButton(d, 'all').click();
  // Трапеции: 0.5 × 3 круга разминки + 0.5 × 2 круга силовых = 2.5.
  assert.equal(pickByTitle(d, window, 'Трапеции'), 'Трапеции — 2,5 подх.');
});

// Часть A Task 8: у «Спокойного дыхания» разметку убрали — дыхание не тренирует
// ничего. Пресс во всей нагрузке даёт 6,5 подхода вместо 7, и это то самое
// число, которое человек видит по клику. 6,5 = 1 (подкручивание таза) + 1,5
// (подъём колена) + 3 (подъёмы ног) + 1 («Птица-собака»).
test('пресс во всей нагрузке показывает 6,5 подхода, дыхания в подборе нет', () => {
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  modeButton(d, 'all').click();
  assert.equal(pickByTitle(d, window, 'Прямая мышца живота'), 'Прямая мышца живота — 6,5 подх.');
  const names = [...d.querySelectorAll('.bodymap-pick button')].map(b => b.textContent);
  assert.ok(!names.includes('Спокойное дыхание'),
    'упражнение без разметки нагрузки не должно попадать в подбор ни по одной мышце');
  assert.equal(names.length, 4);
});

test('про округление и верх шкалы подписи под картой молчат', () => {
  // Объяснение «оттенок берётся по округлённому числу подходов: самый тёмный —
  // 6 и больше, то есть уже с 5,5» из подписи убрано целиком: на экране оно
  // почти никому не нужно, а сократить его, не соврав, нельзя — верх шкалы
  // начинается с 5,5, а не с шести (цвет берётся от Math.round(объём), см.
  // bodymap.js). Поэтому подпись про верх шкалы молчит, а подробность осталась
  // в README. Точное число подходов по-прежнему видно по клику.
  const { window } = mount();
  const d = window.document;
  d.querySelector('.bodymap-toggle').click();
  const underMap = () => d.querySelector('.bodymap-body').textContent;
  for (const mode of ['strength', 'all']) {
    modeButton(d, mode).click();
    assert.doesNotMatch(underMap(), /округл/i, `${mode}: про округление под картой сказать нечего`);
    assert.doesNotMatch(underMap(), /оттенок|тёмн/i, `${mode}: про верх шкалы подпись молчит`);
    assert.doesNotMatch(underMap(), /6 и больше|5,5/, `${mode}: чисел шкалы в подписи нет`);
  }
});
