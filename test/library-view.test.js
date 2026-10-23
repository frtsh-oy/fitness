// Экран библиотеки: поиск, чипы групп мышц, шторка фильтров и ряды с кнопкой
// «Добавить». Модуль самостоятельный: что значит «добавлено» и когда добавлять
// нельзя, ему сообщает вызывающий (isAdded и addBlocked), поэтому проверяется он
// без конструктора и без приложения.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { LIBRARY } from '../exercises/index.js';
import { ZONES } from '../builder/rules.js';
import { renderWorkout } from '../render.js';
import { setupPlayers } from '../player.js';
import { normalizeQuery, filterEntries, renderLibrary } from '../library-view.js';
import legsMwf from '../workouts/legs-mwf.js';

// Силовое упражнение с заданными ключом и названием, остальное — заглушки.
// Ролик настоящего вида: плеер подменяет ссылку кнопкой только у ссылок на
// YouTube с одиннадцатисимвольным id.
const strength = (key, name, extra = {}) => ({
  key,
  name,
  slot: 'strength',
  difficulty: 'basic',
  compound: false,
  muscles: 'Мышцы',
  reps: '10 раз',
  text: `Техника: ${name}`,
  v: ['dQw4w9WgXcQ', 5, '0:05'],
  load: { glutes: 1 },
  pattern: 'hinge',
  gear: [],
  unilateral: false,
  kind: 'strength',
  ...extra,
});

const keys = list => list.map(entry => entry.key);

function mount({
  entries = [strength('a', 'Тяга'), strength('b', 'Жим')],
  isAdded = () => false,
  addBlocked = () => null,
  onAdd = () => {},
  onBack = () => {},
  openLink = () => {},
  gear,
  document = makeDom('<!doctype html><html><body><div id="host"></div></body></html>').document,
} = {}) {
  const host = document.getElementById('host');
  const view = renderLibrary({ host, entries, isAdded, addBlocked, onAdd, onBack, openLink, gear });
  return { document, host, view };
}

const rows = host => [...host.querySelectorAll('.library-row')];
const names = host => rows(host).map(row => row.querySelector('.row-title').textContent);
const zoneChip = (host, label) => [...host.querySelectorAll('.library-zones .zone-chip')].find(c => c.textContent === label);
const pressedZones = host => [...host.querySelectorAll('.library-zones [aria-pressed="true"]')].map(c => c.textContent);
const searchInput = host => host.querySelector('.library-find input');
const filterButton = host => host.querySelector('.library-filter');
const foundText = host => host.querySelector('.library-found').textContent;
const dockOf = host => host.querySelector('.library-dock');

function type(host, text) {
  const input = searchInput(host);
  input.value = text;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

// Шторка фильтров: открывается кнопкой со значком, её чипы и сегменты находятся
// по подписи. Шторка стоит в host рядом с экраном, а не внутри него.
function openFilters(host) {
  filterButton(host).click();
  return host.querySelector('.library-sheet');
}
const control = (host, label) => [...host.querySelectorAll('.library-sheet .zone-chip, .library-sheet .seg button')]
  .find(c => c.textContent === label);
const pressedControls = host => [...host.querySelectorAll('.library-sheet [aria-pressed="true"]')].map(c => c.textContent);
const gearSwitch = (host, id) => host.querySelector(`.gear-picker [data-gear="${id}"]`);
const ownedSwitches = host => [...host.querySelectorAll('.gear-switch[aria-checked="true"]')].map(b => b.dataset.gear);
const escape = node => node.dispatchEvent(
  new node.ownerDocument.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

test('поиск без учёта регистра и разницы е/ё', () => {
  const lib = [strength('a', 'Ёлочка'), strength('b', 'елка'), strength('c', 'Тяга')];
  assert.deepEqual(filterEntries(lib, { query: 'ЕЛ' }).map(e => e.key), ['a', 'b']);
  assert.deepEqual(filterEntries(lib, { query: 'ёл' }).map(e => e.key), ['a', 'b']);
  assert.equal(normalizeQuery('  ЁЛКА '), 'елка');
});

test('на экране только силовые', () => {
  const shown = filterEntries(LIBRARY, {});
  assert.ok(shown.length > 0, 'силовые в библиотеке есть');
  assert.equal(shown.length, LIBRARY.filter(e => e.slot === 'strength').length);
  assert.ok(shown.every(e => e.slot === 'strength'));
  // Разминка с подходящим названием на экран не попадает.
  const lib = [strength('a', 'Тяга'), strength('w', 'Тяга лёжа', { slot: 'warmup' })];
  assert.deepEqual(keys(filterEntries(lib, { query: 'тяга' })), ['a']);
});

test('фильтр по зоне — упражнения, где целевая хотя бы одна группа зоны', () => {
  const lib = [
    strength('a', 'Мост', { load: { glutes: 1 } }),
    strength('b', 'Отведение', { load: { glutes_med: 1, hamstrings: 0.5 } }),
    // Ягодицы лишь вспомогательные (0.5): целевая здесь — квадрицепсы.
    strength('c', 'Жим ногами', { load: { quads: 1, glutes: 0.5 } }),
    strength('d', 'Разгибание', { load: { quads: 1 } }),
  ];
  assert.deepEqual(keys(filterEntries(lib, { zone: 'glutes' })), ['a', 'b']);
  assert.deepEqual(keys(filterEntries(lib, { zone: 'legs' })), ['c', 'd']);
  assert.deepEqual(keys(filterEntries(lib, { zone: 'chest' })), []);
  assert.deepEqual(keys(filterEntries(lib, { zone: null })), ['a', 'b', 'c', 'd']);
});

test('фильтр по сложности; поиск, зона и сложность действуют вместе', () => {
  const lib = [
    strength('a', 'Мост', { difficulty: 'basic', load: { glutes: 1 } }),
    strength('b', 'Мост с паузой', { difficulty: 'medium', load: { glutes: 1 } }),
    strength('c', 'Мост на одной ноге', { difficulty: 'hard', load: { glutes: 1 } }),
    strength('d', 'Присед', { difficulty: 'medium', load: { quads: 1 } }),
    strength('w', 'Мост лёжа', { slot: 'warmup', difficulty: 'medium', load: { glutes: 1 } }),
  ];
  assert.deepEqual(keys(filterEntries(lib, { difficulty: 'medium' })), ['b', 'd']);
  assert.deepEqual(keys(filterEntries(lib, { difficulty: 'hard' })), ['c']);
  assert.deepEqual(keys(filterEntries(lib, { difficulty: null })), ['a', 'b', 'c', 'd']);
  assert.deepEqual(keys(filterEntries(lib, { query: 'мост', zone: 'glutes', difficulty: 'medium' })), ['b']);
  assert.deepEqual(keys(filterEntries(lib, { query: 'присед', zone: 'glutes' })), []);
});

test('верх экрана: «К сборке», название «Библиотека» с фокусом и счёт в живой области', () => {
  const { document, host } = mount();
  const root = host.querySelector('.library');
  const title = root.querySelector('h1');

  assert.equal(root.firstElementChild.className, 'appbar');
  assert.equal(root.querySelector('.appbar .builder-back').textContent, 'К сборке');
  assert.equal(root.querySelector('.builder-back svg').getAttribute('aria-hidden'), 'true');
  assert.equal(title.textContent, 'Библиотека');
  assert.equal(document.activeElement, title, 'после смены экрана диктор начинает с названия');
  assert.equal(foundText(host), '2 упражнения');
  assert.equal(host.querySelector('.library-found').getAttribute('aria-live'), 'polite');
});

test('ряд: название, мышцы, сложность и инвентарь в одной кнопке, рядом круглая «Добавить»', () => {
  const entries = [
    strength('a', 'Тяга', { muscles: 'Спина', difficulty: 'basic', gear: ['band_handles', 'dumbbells'] }),
    strength('b', 'Жим', { muscles: 'Грудь', difficulty: 'medium', gear: ['none'] }),
    strength('c', 'Подъём', { muscles: 'Плечи', difficulty: 'hard', gear: ['kettlebell'] }),
  ];
  const { host } = mount({ entries, isAdded: key => key === 'b' });
  const items = rows(host);
  assert.equal(items.length, 3);
  assert.ok(items.every(item => item.tagName === 'LI' && item.parentElement.tagName === 'UL'));

  const mains = items.map(item => item.querySelector('button.library-main'));
  assert.deepEqual(mains.map(m => m.querySelector('.row-title').textContent), ['Тяга', 'Жим', 'Подъём']);
  assert.deepEqual(mains.map(m => m.querySelector('.row-sub').textContent), ['Спина', 'Грудь', 'Плечи']);
  assert.deepEqual(mains.map(m => m.querySelector('.library-level').textContent), ['Базовое', 'Среднее', 'Сложное']);
  // Инвентарь назван той же подписью, что в шторке замены.
  assert.deepEqual(mains.map(m => m.querySelector('.library-gear').textContent),
    ['резинка с ручками, гантели', 'без инвентаря', 'гиря']);
  assert.equal(mains[0].querySelector('.library-meta').textContent, 'Базовое · резинка с ручками, гантели');
  assert.ok(mains.every(m => m.type === 'button' && m.getAttribute('aria-expanded') === 'false'));
  assert.ok(mains.every(m => m.querySelector('.sr-only').textContent === 'Как выполнять'));

  const adds = items.map(item => item.querySelector('button.library-add'));
  assert.deepEqual(adds.map(b => b.disabled), [false, true, false]);
  // Добавленное отличается от недоступного по другой причине классом: оба disabled.
  assert.deepEqual(adds.map(b => b.classList.contains('is-added')), [false, true, false]);
  assert.ok(adds.every(b => b.type === 'button' && b.textContent === ''), 'в кнопке значок, слов нет');
  assert.ok(adds.every(b => b.querySelector('.ic-plus') && b.querySelector('.ic-check')),
    'плюс и галочка в разметке, какой виден — решает класс');
  assert.ok(adds.every((b, i) => b.previousElementSibling === mains[i] && b.parentElement.className === 'library-line'),
    'кнопка стоит в одной строке с названием');
  // Таких кнопок много, и по голой подписи диктору их не отличить.
  assert.deepEqual(adds.map(b => b.getAttribute('aria-label')),
    ['Добавить: Тяга', 'В тренировке: Жим', 'Добавить: Подъём']);
});

test('нажатие «Добавить» отдаёт ключ, а ряд сразу показывает, что вышло', () => {
  const added = new Set();
  const calls = [];
  const { host } = mount({
    isAdded: key => added.has(key),
    onAdd: key => { calls.push(key); added.add(key); },
  });
  const [first, second] = host.querySelectorAll('.library-add');

  first.click();
  assert.deepEqual(calls, ['a']);
  assert.equal(first.getAttribute('aria-label'), 'В тренировке: Тяга');
  assert.equal(first.disabled, true);
  assert.equal(first.classList.contains('is-added'), true);
  assert.equal(second.getAttribute('aria-label'), 'Добавить: Жим', 'соседний ряд не тронут');

  // Недоступная кнопка нажатий не принимает.
  first.click();
  assert.deepEqual(calls, ['a']);
});

test('«Как выполнять» раскрывает технику, видео и ссылки под рядом; ряды раскрываются независимо', () => {
  const links = [['dQw4w9WgXcQ', 18, 'Как установить резинку · 0:18']];
  const { host } = mount({
    entries: [strength('a', 'Тяга', { links }), strength('b', 'Жим', { detail: 'Подробность' })],
  });
  const [first, second] = rows(host);
  const main = row => row.querySelector('.library-main');
  const how = row => host.querySelector(`[id="${main(row).getAttribute('aria-controls')}"]`);

  assert.equal(main(first).getAttribute('aria-expanded'), 'false');
  assert.equal(how(first).hidden, true, 'по умолчанию техника свёрнута');
  assert.equal(how(first).closest('.library-row'), first);
  assert.equal(how(first).querySelector('.howto-body').id, 'lib-a');

  main(first).click();
  assert.equal(main(first).getAttribute('aria-expanded'), 'true');
  assert.equal(how(first).hidden, false);
  assert.equal(how(first).querySelector('.cap').textContent, 'Как выполнять');
  assert.match(how(first).textContent, /Техника: Тяга/);
  assert.equal(how(first).querySelectorAll('button.video').length, 1, 'видео — кнопка плеера, а не ссылка');
  assert.deepEqual([...how(first).querySelectorAll('button.extra-link')].map(b => b.textContent),
    ['Как установить резинку · 0:18']);

  // Не аккордеон: раскрытие второго ряда первый не сворачивает.
  main(second).click();
  assert.equal(how(second).hidden, false);
  assert.equal(how(first).hidden, false, 'раскрытие второй не сворачивает первую');
  assert.match(how(second).textContent, /Подробность/);

  main(first).click();
  assert.equal(main(first).getAttribute('aria-expanded'), 'false');
  assert.equal(how(first).hidden, true);
});

test('повторная отрисовка на том же узле не копит обработчиков: раскрытие — с одного нажатия', () => {
  const { document, host } = mount();
  mount({ document });
  const main = host.querySelector('.library-main');

  assert.equal(host.querySelectorAll('.library').length, 1, 'на узле один экран библиотеки');
  main.click();
  assert.equal(main.getAttribute('aria-expanded'), 'true');
});

test('поле поиска: подпись для диктора, список и счёт следят за вводом, поле остаётся тем же', () => {
  const { host } = mount({
    entries: [strength('a', 'Ёлочка'), strength('b', 'Тяга'), strength('c', 'Жим')],
  });
  const input = searchInput(host);
  assert.equal(input.getAttribute('aria-label'), 'Найти упражнение');
  assert.equal(input.placeholder, 'Найти упражнение');
  assert.equal(host.querySelector('.library-find [role="search"]'), input.parentElement);
  assert.equal(foundText(host), '3 упражнения');

  input.focus();
  type(host, 'ЕЛО');
  assert.deepEqual(names(host), ['Ёлочка']);
  assert.equal(foundText(host), 'Найдено: 1');
  assert.equal(searchInput(host), input);
  assert.equal(input.ownerDocument.activeElement, input, 'перерисовка списка не отбирает фокус у поля');

  type(host, '');
  assert.deepEqual(names(host), ['Ёлочка', 'Тяга', 'Жим']);
  assert.equal(foundText(host), '3 упражнения', 'без запроса — просто сколько всего');
});

test('крестик в поле поиска: виден при тексте, очищает, возвращает фокус и не мешает диктору пустым', () => {
  const { document, host } = mount({ entries: [strength('a', 'Ёлочка'), strength('b', 'Тяга')] });
  const clear = host.querySelector('.s-clear');
  assert.equal(clear.hidden, true, 'в пустом поле крестика нет');
  assert.equal(clear.getAttribute('aria-label'), 'Очистить поиск');

  type(host, 'тяг');
  assert.equal(clear.hidden, false);
  assert.deepEqual(names(host), ['Тяга']);

  clear.click();
  assert.equal(searchInput(host).value, '');
  assert.equal(clear.hidden, true);
  assert.deepEqual(names(host), ['Ёлочка', 'Тяга']);
  assert.equal(document.activeElement, searchInput(host), 'крестик исчез, фокус остался в поле');
});

test('чипы групп мышц: «Все» и семь зон, выбранный нажат, список и счёт меняются', () => {
  const lib = [
    strength('a', 'Мост', { difficulty: 'basic', load: { glutes: 1 } }),
    strength('b', 'Мост с паузой', { difficulty: 'medium', load: { glutes: 1 } }),
    strength('c', 'Присед', { difficulty: 'medium', load: { quads: 1 } }),
  ];
  const { host } = mount({ entries: lib });
  const zoneLabels = ['Все', ...Object.values(ZONES).map(zone => zone.label)];
  const chips = [...host.querySelectorAll('.library-zones .zone-chip')];
  const group = host.querySelector('.library-zones');

  assert.deepEqual(chips.map(c => c.textContent), zoneLabels);
  assert.equal(zoneLabels.length, 8, '«Все» и семь зон');
  assert.ok(chips.every(c => c.tagName === 'BUTTON' && c.type === 'button' && c.hasAttribute('aria-pressed')));
  assert.equal(group.getAttribute('role'), 'group');
  assert.equal(group.getAttribute('aria-label'), 'Группа мышц');
  // У нажатого галочка: выбранное читается не только по цвету.
  assert.ok(chips.every(c => c.querySelector('svg.tick')));
  assert.deepEqual(pressedZones(host), ['Все']);
  assert.equal(foundText(host), '3 упражнения');

  zoneChip(host, 'Ягодицы').click();
  assert.deepEqual(pressedZones(host), ['Ягодицы']);
  assert.deepEqual(names(host), ['Мост', 'Мост с паузой']);
  assert.equal(foundText(host), 'Найдено: 2');

  // Выбор зоны заменяет прежний, а не добавляется к нему.
  zoneChip(host, 'Ноги').click();
  assert.deepEqual(pressedZones(host), ['Ноги']);
  assert.deepEqual(names(host), ['Присед']);

  zoneChip(host, 'Все').click();
  assert.deepEqual(pressedZones(host), ['Все']);
  assert.deepEqual(names(host), ['Мост', 'Мост с паузой', 'Присед']);
  assert.equal(foundText(host), '3 упражнения');
});

test('ничего не найдено — подсказка и «Показать все», пока есть что показать, подсказки нет', () => {
  const { host } = mount({
    entries: [
      strength('a', 'Тяга', { load: { lats: 1 } }),
      strength('b', 'Присед', { load: { quads: 1 } }),
    ],
  });
  const empty = host.querySelector('.library-empty');
  const showAll = () => [...empty.querySelectorAll('.btn')].find(b => b.textContent === 'Показать все');
  assert.equal(empty.hidden, true, 'пока есть что показать, подсказки нет');
  assert.equal(empty.children.length, 0);

  zoneChip(host, 'Грудь').click();
  type(host, 'тяг');
  assert.equal(rows(host).length, 0);
  assert.equal(empty.hidden, false);
  assert.equal(empty.querySelector('.library-empty-title').textContent, 'Ничего не нашлось');
  assert.equal(empty.querySelector('.library-empty-hint').textContent, 'Попробуй другое слово или покажи все.');
  assert.equal(foundText(host), 'Найдено: 0');
  assert.equal(showAll().tagName, 'BUTTON');
  assert.equal(showAll().type, 'button');

  showAll().click();
  assert.equal(searchInput(host).value, '');
  assert.deepEqual(pressedZones(host), ['Все']);
  assert.deepEqual(names(host), ['Тяга', 'Присед']);
  assert.equal(empty.hidden, true);
  assert.equal(empty.children.length, 0);
});

test('добавлять нельзя — кнопки недоступны и причина на экране', () => {
  let reason = 'В тренировке уже 18 силовых — это потолок.';
  const { host, view } = mount({
    entries: [strength('a', 'Тяга'), strength('b', 'Жим'), strength('c', 'Присед')],
    isAdded: key => key === 'c',
    addBlocked: () => reason,
  });
  const buttons = () => [...host.querySelectorAll('.library-add')];

  assert.equal(host.querySelectorAll('.library-blocked').length, 1);
  const note = host.querySelector('p.library-blocked');
  assert.equal(note.getAttribute('role'), 'status');
  assert.equal(note.textContent, reason);
  assert.deepEqual(buttons().map(b => b.disabled), [true, true, true]);
  assert.deepEqual(buttons().map(b => b.getAttribute('aria-label')),
    ['Добавить: Тяга', 'Добавить: Жим', 'В тренировке: Присед']);
  assert.deepEqual(buttons().map(b => b.classList.contains('is-added')), [false, false, true]);

  // Причина ушла — кнопки снова доступны, а пометки на экране нет.
  reason = null;
  view.refresh();
  assert.equal(host.querySelector('.library-blocked'), null);
  assert.deepEqual(buttons().map(b => b.disabled), [false, false, true]);

  // И снова появилась: одна пометка, а не по одной на каждое обновление.
  reason = 'Нельзя.';
  view.refresh();
  view.refresh();
  assert.equal(host.querySelectorAll('.library-blocked').length, 1);
  assert.equal(host.querySelector('.library-blocked').textContent, 'Нельзя.');
});

test('refresh меняет кнопки и панель, а ряды не пересобирает: раскрытое остаётся раскрытым', () => {
  const added = new Set();
  const { host, view } = mount({ isAdded: key => added.has(key) });
  const row = host.querySelector('.library-row');
  row.querySelector('.library-main').click();
  assert.equal(dockOf(host).hidden, true, 'пока в тренировке нет силовых, панели нет');

  added.add('a');
  view.refresh();

  assert.equal(host.querySelector('.library-row'), row, 'ряд — тот же узел');
  assert.equal(row.querySelector('.library-main').getAttribute('aria-expanded'), 'true');
  assert.equal(row.querySelector('.library-add').getAttribute('aria-label'), 'В тренировке: Тяга');
  assert.equal(dockOf(host).hidden, false);
  assert.equal(dockOf(host).querySelector('.dock-text').textContent, 'В тренировке: 1');
});

test('«К сборке» сверху и в панели возвращают назад; в панели — сколько силовых в тренировке', () => {
  let backs = 0;
  // Записи-заглушки, а не настоящая библиотека: счёт «В тренировке» зависит от
  // типа упражнения (силовое считается, разминка нет), а тип в настоящей таблице
  // правит владелец.
  const { host } = mount({
    entries: [strength('a', 'Тяга'), strength('b', 'Жим'), strength('w', 'Мост лёжа', { slot: 'warmup' })],
    isAdded: key => key === 'a' || key === 'w',
    onBack: () => { backs += 1; },
  });
  const top = host.querySelector('.appbar .builder-back');
  const go = dockOf(host).querySelector('.dock-go');

  assert.equal(top.type, 'button');
  assert.equal(go.textContent, 'К сборке');
  assert.equal(go.type, 'button');
  // Разминка в счёт не идёт: на экране библиотеки её нет.
  assert.equal(dockOf(host).querySelector('.dock-text').textContent, 'В тренировке: 1');
  assert.equal(dockOf(host).querySelector('.dock-text').getAttribute('aria-live'), 'polite');

  top.click();
  go.click();
  assert.equal(backs, 2);
});

// — Шторка фильтров ——————————————————————————————————————————————————————

test('шторка фильтров: диалог под названием «Фильтры», экран под ней недоступен, Escape и фон закрывают', () => {
  const { document, host } = mount();
  const root = host.querySelector('.library');
  const opener = filterButton(host);
  assert.equal(opener.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(opener.getAttribute('aria-expanded'), 'false');
  assert.equal(host.querySelector('.library-sheet'), null, 'пока не открыта, шторки нет');

  const sheet = openFilters(host);
  assert.equal(sheet.getAttribute('role'), 'dialog');
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  assert.equal(host.querySelector(`#${sheet.getAttribute('aria-labelledby')}`).textContent, 'Фильтры');
  assert.ok(host.querySelector('.library-backdrop'), 'под шторкой затемнение');
  assert.equal(root.hasAttribute('inert'), true, 'экран под шторкой недоступен');
  assert.equal(opener.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, sheet, 'фокус ушёл внутрь шторки');
  assert.equal(sheet.parentElement, host, 'шторка рядом с экраном, а не внутри него');

  escape(sheet);
  assert.equal(host.querySelector('.library-sheet'), null);
  assert.equal(host.querySelector('.library-backdrop'), null);
  assert.equal(root.hasAttribute('inert'), false);
  assert.equal(opener.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, opener, 'фокус вернулся на кнопку');

  openFilters(host);
  host.querySelector('.library-backdrop').click();
  assert.equal(host.querySelector('.library-sheet'), null, 'нажатие на фон закрывает');
  assert.equal(root.hasAttribute('inert'), false);

  openFilters(host);
  host.querySelector('.library-sheet-close').click();
  assert.equal(host.querySelector('.library-sheet'), null, 'крестик закрывает');
  assert.equal(document.activeElement, opener);
});

test('шторка открывается повторно с теми же элементами: выбор в ней живёт столько же, сколько экран', () => {
  const lib = [
    strength('a', 'Мост', { difficulty: 'basic' }),
    strength('b', 'Мост с паузой', { difficulty: 'medium' }),
  ];
  const { host } = mount({ entries: lib });
  openFilters(host);
  const medium = control(host, 'Среднее');
  medium.click();
  host.querySelector('.library-sheet-close').click();

  openFilters(host);
  assert.equal(control(host, 'Среднее'), medium, 'тот же узел');
  assert.equal(medium.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(names(host), ['Мост с паузой']);
});

test('«Показать N» в шторке называет число найденного и закрывает её; при нуле — «Закрыть»', () => {
  const lib = [
    strength('a', 'Мост', { difficulty: 'basic' }),
    strength('b', 'Мост с паузой', { difficulty: 'medium' }),
    strength('c', 'Присед', { difficulty: 'medium' }),
  ];
  const { document, host } = mount({ entries: lib });
  openFilters(host);
  const show = () => [...host.querySelectorAll('.library-sheet-foot .btn.main')][0];

  assert.equal(show().textContent, 'Показать 3');
  control(host, 'Среднее').click();
  assert.equal(show().textContent, 'Показать 2');
  control(host, 'Сложное').click();
  assert.equal(show().textContent, 'Закрыть', 'ничего не найдено — показывать нечего');

  control(host, 'Среднее').click();
  show().click();
  assert.equal(host.querySelector('.library-sheet'), null);
  assert.equal(document.activeElement, filterButton(host));
  assert.deepEqual(names(host), ['Мост с паузой', 'Присед']);
});

test('сложность в шторке: сегмент на четыре положения, выбранный нажат, список и счёт меняются', () => {
  const lib = [
    strength('a', 'Мост', { difficulty: 'basic', load: { glutes: 1 } }),
    strength('b', 'Мост с паузой', { difficulty: 'medium', load: { glutes: 1 } }),
    strength('c', 'Присед', { difficulty: 'medium', load: { quads: 1 } }),
  ];
  const { host } = mount({ entries: lib });
  openFilters(host);
  const seg = control(host, 'Любая').parentElement;

  assert.deepEqual([...seg.children].map(c => c.textContent), ['Любая', 'Базовое', 'Среднее', 'Сложное']);
  assert.ok(seg.classList.contains('seg'));
  assert.ok([...seg.children].every(c => c.tagName === 'BUTTON' && c.type === 'button' && c.hasAttribute('aria-pressed')));
  assert.deepEqual(pressedControls(host), ['Любая']);

  control(host, 'Среднее').click();
  assert.deepEqual(pressedControls(host), ['Среднее']);
  assert.deepEqual(names(host), ['Мост с паузой', 'Присед']);
  assert.equal(foundText(host), 'Найдено: 2');

  // Вместе с зоной на экране под шторкой.
  zoneChip(host, 'Ягодицы').click();
  assert.deepEqual(names(host), ['Мост с паузой']);

  control(host, 'Любая').click();
  zoneChip(host, 'Все').click();
  assert.deepEqual(names(host), ['Мост', 'Мост с паузой', 'Присед']);
});

test('группы шторки названы видимым заголовком: aria-labelledby, а не второй aria-label', () => {
  const { host } = mount({ entries: gearEntries(), gear: { owned: [], onChange: () => {} } });
  openFilters(host);
  for (const [label, firstChip] of [['Сложность', 'Любая'], ['Инвентарь', 'Любой']]) {
    const group = control(host, firstChip).parentElement;
    assert.equal(group.getAttribute('role'), 'group', label);
    assert.equal(group.hasAttribute('aria-label'), false, label);
    const title = host.querySelector(`#${group.getAttribute('aria-labelledby')}`);
    assert.equal(title.textContent, label);
    assert.equal(title.nextElementSibling, group, `${label}: заголовок прямо над чипами`);
  }
  // Группа мышц снаружи шторки — с aria-label.
  assert.equal(zoneChip(host, 'Все').parentElement.getAttribute('aria-label'), 'Группа мышц');
});

test('«Движение»: только движения силовых из библиотеки, в порядке словаря; при одном — группы нет', () => {
  const lib = [
    strength('a', 'Тяга', { pattern: 'pull' }),
    strength('b', 'Присед', { pattern: 'squat' }),
    strength('c', 'Мост', { pattern: 'hinge' }),
    strength('d', 'Мост на одной ноге', { pattern: 'hinge' }),
    strength('w', 'Кошка', { slot: 'warmup', pattern: 'mobility' }),
  ];
  const { host } = mount({ entries: lib });
  openFilters(host);
  const group = control(host, 'Любое').parentElement;
  assert.deepEqual([...group.children].map(c => c.textContent), ['Любое', 'Наклон от таза', 'Присед', 'Тяга']);
  assert.ok([...group.children].every(c => c.querySelector('svg.tick')), 'у выбранного галочка');

  control(host, 'Наклон от таза').click();
  assert.deepEqual(names(host), ['Мост', 'Мост на одной ноге']);
  assert.ok(pressedControls(host).includes('Наклон от таза'));
  control(host, 'Любое').click();
  assert.equal(names(host).length, 4);

  const single = mount({ entries: [strength('a', 'Мост'), strength('b', 'Мост с паузой')] });
  openFilters(single.host);
  assert.equal(control(single.host, 'Любое'), undefined, 'одно движение — отсеивать нечего');
});

test('«Без инвентаря»: только с переключателями и когда есть и такие, и другие', () => {
  const { host } = mount({ entries: gearEntries(), gear: { owned: ['dumbbells'], onChange: () => {} } });
  openFilters(host);
  assert.deepEqual(names(host), ['Мост', 'Мост с гантелями', 'Присед с гантелями']);
  control(host, 'Без инвентаря').click();
  assert.deepEqual(names(host), ['Мост']);
  // Скрыто фильтром, а не инвентарём: «ещё M» не появляется.
  assert.equal(foundText(host), 'Найдено: 1');
  control(host, 'Любой').click();
  assert.equal(names(host).length, 3);

  const missing = options => {
    const { host: other } = mount(options);
    openFilters(other);
    return control(other, 'Без инвентаря');
  };
  const bareOnly = gearEntries().filter(entry => entry.gear[0] === 'none');
  assert.equal(missing({ entries: bareOnly, gear: { owned: [], onChange: () => {} } }), undefined);
  const withGear = gearEntries().filter(entry => entry.gear[0] !== 'none');
  assert.equal(missing({ entries: withGear, gear: { owned: [], onChange: () => {} } }), undefined);
  assert.equal(missing({ entries: gearEntries() }), undefined, 'без gear про инвентарь ни слова');
});

test('значок фильтров: число включённых фильтров шторки в имени и точка; зона и инвентарь не в счёте', () => {
  const lib = [
    ...gearEntries(),
    strength('pull', 'Тяга', { pattern: 'pull', gear: ['none'], difficulty: 'medium', load: { lats: 1 } }),
  ];
  const { host } = mount({ entries: lib, gear: { owned: [], onChange: () => {} } });
  const button = filterButton(host);
  const dot = () => button.querySelector('.dot');
  assert.equal(button.getAttribute('aria-label'), 'Фильтры');
  assert.equal(dot().hidden, true);
  assert.equal(button.querySelector('svg').getAttribute('aria-hidden'), 'true');

  zoneChip(host, 'Ноги').click();
  openFilters(host);
  gearSwitch(host, 'dumbbells').click();
  assert.equal(button.getAttribute('aria-label'), 'Фильтры', 'зона на виду, а инвентарь — не фильтр');
  assert.equal(dot().hidden, true);

  control(host, 'Среднее').click();
  assert.equal(button.getAttribute('aria-label'), 'Фильтры, выбрано: 1');
  assert.equal(dot().hidden, false);
  control(host, 'Тяга').click();
  control(host, 'Без инвентаря').click();
  assert.equal(button.getAttribute('aria-label'), 'Фильтры, выбрано: 3');
  control(host, 'Любая').click();
  assert.equal(button.getAttribute('aria-label'), 'Фильтры, выбрано: 2');
});

test('«Сбросить» в шторке снимает сложность, движение и «без инвентаря»; поиск, группа мышц и «Что есть дома» остаются', () => {
  const calls = [];
  const lib = [
    ...gearEntries(),
    strength('pull', 'Тяга', { pattern: 'pull', gear: ['none'], difficulty: 'medium', load: { lats: 1 } }),
  ];
  const { host } = mount({ entries: lib, gear: { owned: ['dumbbells'], onChange: owned => calls.push(owned) } });
  type(host, 'тяга');
  zoneChip(host, 'Спина').click();
  openFilters(host);
  control(host, 'Среднее').click();
  control(host, 'Тяга').click();
  control(host, 'Без инвентаря').click();
  assert.deepEqual(names(host), ['Тяга']);
  const reset = host.querySelector('.library-sheet-foot .btn.text');
  assert.equal(reset.textContent, 'Сбросить');
  assert.equal(reset.getAttribute('aria-label'), 'Сбросить фильтры');
  assert.equal(reset.type, 'button');

  reset.click();
  assert.deepEqual(pressedControls(host), ['Любая', 'Любое', 'Любой']);
  assert.equal(filterButton(host).getAttribute('aria-label'), 'Фильтры');
  assert.equal(searchInput(host).value, 'тяга', 'запрос на экране не тронут');
  assert.deepEqual(pressedZones(host), ['Спина'], 'группа мышц тоже');
  assert.deepEqual(ownedSwitches(host), ['dumbbells']);
  assert.deepEqual(names(host), ['Тяга']);
  assert.deepEqual(calls, [], 'сброс наружу про инвентарь не сообщает');
});

// — Видео ————————————————————————————————————————————————————————————————

// Идентификаторы панелей плеера обязаны быть уникальными на странице: у
// кнопки видео aria-controls указывает на панель по id, и одинаковые id
// привели бы диктора и фокус в чужую карточку.
test('ролики библиотеки и «Сегодня» не делят id панелей', () => {
  const { document } = makeDom('<!doctype html><html><body><div id="today"></div><div id="host"></div></body></html>');
  const today = document.getElementById('today');
  today.append(renderWorkout(legsMwf, document));
  setupPlayers(today, () => {});
  mount({ document });

  const todayVideo = today.querySelector('button.video');
  const libraryVideo = document.getElementById('host').querySelector('button.video');
  todayVideo.click();
  libraryVideo.click();

  const panels = [...document.querySelectorAll('.player-shell')];
  assert.equal(panels.length, 2, 'открыты оба ролика: у каждого плеера свой');
  assert.equal(new Set(panels.map(p => p.id)).size, 2, 'id панелей разные');
  assert.match(panels[0].id, /^exercise-video-\d+$/, 'у «Сегодня» прежние id');
  assert.match(panels[1].id, /^library-video-\d+$/);
  // Панель стоит следом за кнопкой, а если кнопка лежит в шапке упражнения
  // («Сегодня») — следом за шапкой: внутри строки с названием она бы сжалась.
  for (const button of [todayVideo, libraryVideo]) {
    assert.equal(document.getElementById(button.getAttribute('aria-controls')),
      (button.closest('.exercise-head') ?? button).nextElementSibling);
  }
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length, 'на странице нет повторяющихся id');
});

test('название ролика в библиотеке — название упражнения: имя кнопки и подпись окна плеера', () => {
  const { host } = mount({ entries: [strength('a', 'Румынская тяга')] });
  const video = host.querySelector('button.video');

  assert.equal(video.getAttribute('aria-label'), 'Видео: Румынская тяга, 0:05');
  video.click();
  assert.equal(host.querySelector('iframe').title, 'Видео: Румынская тяга');
});

test('Escape с фокусом внутри библиотеки закрывает открытое видео и возвращает фокус на кнопку', () => {
  const { document, host } = mount();
  const video = host.querySelector('button.video');
  video.click();
  assert.equal(host.querySelectorAll('.player-shell').length, 1);

  escape(host.querySelector('.player-close'));
  assert.equal(host.querySelectorAll('.player-shell').length, 0);
  assert.equal(video.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, video);
});

test('смена фильтра убирает открытое видео вместе с рядом: iframe не остаётся без хозяина', () => {
  const { host } = mount();
  host.querySelector('button.video').click();
  assert.equal(host.querySelectorAll('iframe').length, 1);

  type(host, 'жим');
  assert.deepEqual(names(host), ['Жим']);
  assert.equal(host.querySelectorAll('iframe').length, 0);
  assert.equal(host.querySelector('button.video').getAttribute('aria-expanded'), 'false');
});

// — «Что есть дома» ————————————————————————————————————————————————————

// Записи с инвентарём. Ягодицы — три упражнения с разным инвентарём, приседы —
// одно с гантелями: так видно и «ещё M» в зоне, и вне её.
function gearEntries() {
  return [
    strength('bridge', 'Мост', { gear: ['none'], load: { glutes: 1 } }),
    strength('bridge-band', 'Мост с резинкой', { gear: ['band_long'], load: { glutes: 1 } }),
    strength('bridge-db', 'Мост с гантелями', { gear: ['dumbbells'], load: { glutes: 1 } }),
    strength('bridge-both', 'Мост с гирей и гантелями', { gear: ['dumbbells', 'kettlebell'], load: { glutes: 1 } }),
    strength('squat-db', 'Присед с гантелями', { gear: ['dumbbells'], load: { quads: 1 } }),
  ];
}

test('filterEntries: owned оставляет только подходящее по инвентарю, owned null не фильтрует', () => {
  const lib = gearEntries();
  assert.deepEqual(keys(filterEntries(lib, { owned: ['band_long'] })), ['bridge', 'bridge-band']);
  assert.deepEqual(keys(filterEntries(lib, { owned: ['dumbbells'] })), ['bridge', 'bridge-db', 'squat-db']);
  // Нужно всё перечисленное: одних гантелей для «гири и гантелей» мало.
  assert.deepEqual(keys(filterEntries(lib, { owned: ['dumbbells', 'kettlebell'] })),
    ['bridge', 'bridge-db', 'bridge-both', 'squat-db']);
  assert.deepEqual(keys(filterEntries(lib, { owned: [] })), ['bridge'], 'пусто — остаётся «без инвентаря»');
  assert.equal(filterEntries(lib, { owned: null }).length, 5);
  assert.equal(filterEntries(lib, {}).length, 5);
  assert.equal(filterEntries(lib, { owned: undefined }).length, 5);
});

test('filterEntries: инвентарь действует вместе с поиском, зоной и сложностью', () => {
  const lib = [
    ...gearEntries(),
    strength('bridge-hard', 'Мост на одной ноге', { gear: ['none'], difficulty: 'hard', load: { glutes: 1 } }),
    strength('warm', 'Мост лёжа', { slot: 'warmup', gear: ['none'], load: { glutes: 1 } }),
  ];
  assert.deepEqual(keys(filterEntries(lib, { owned: ['dumbbells'], zone: 'glutes' })), ['bridge', 'bridge-db', 'bridge-hard']);
  assert.deepEqual(keys(filterEntries(lib, { owned: ['dumbbells'], query: 'гантел' })), ['bridge-db', 'squat-db']);
  assert.deepEqual(keys(filterEntries(lib, { owned: ['dumbbells'], difficulty: 'hard' })), ['bridge-hard']);
  assert.deepEqual(keys(filterEntries(lib, { owned: [], zone: 'legs' })), []);
});

test('с gear: упражнения с неотмеченным инвентарём скрыты, переключатель в шторке возвращает их', () => {
  const calls = [];
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: ['band_long'], onChange: owned => calls.push(owned) },
  });
  assert.deepEqual(names(host), ['Мост', 'Мост с резинкой']);

  openFilters(host);
  gearSwitch(host, 'dumbbells').click();
  assert.deepEqual(names(host), ['Мост', 'Мост с резинкой', 'Мост с гантелями', 'Присед с гантелями']);
  assert.deepEqual(calls, [['band_long', 'dumbbells']]);

  gearSwitch(host, 'kettlebell').click();
  assert.deepEqual(names(host), ['Мост', 'Мост с резинкой', 'Мост с гантелями', 'Мост с гирей и гантелями', 'Присед с гантелями']);
  assert.deepEqual(calls.at(-1), ['band_long', 'dumbbells', 'kettlebell']);

  // Снять всё: остаётся только «без инвентаря».
  for (const id of ['band_long', 'dumbbells', 'kettlebell']) gearSwitch(host, id).click();
  assert.deepEqual(names(host), ['Мост']);
  assert.deepEqual(calls.at(-1), []);
  assert.equal(calls.length, 5, 'по одному вызову на нажатие');
});

test('с gear: переключатели — последней группой шторки, после сложности, со своим id заголовка', () => {
  const { host } = mount({ gear: { owned: ['band_long', 'loop_short'], onChange: () => {} } });
  assert.equal(host.querySelector('.gear-picker'), null, 'в закрытой шторке переключателей на странице нет');
  openFilters(host);
  const body = host.querySelector('.library-sheet-body');
  const picker = body.querySelector('.gear-picker');

  // Все записи с одним движением и без инвентаря: групп «Движение» и «Инвентарь»
  // нет, остаются сложность и «Что есть дома».
  assert.equal(body.children.length, 2);
  assert.equal(body.firstElementChild.querySelector('.seg') !== null, true, 'сначала сложность');
  assert.equal(picker.parentElement, body.lastElementChild, 'переключатели — последней группой');
  assert.equal(picker.querySelector('h2').id, 'library-gear-title');
  assert.equal(picker.querySelector('h2').textContent, 'Что есть дома');
  assert.deepEqual(ownedSwitches(host), ['band_long', 'loop_short']);
  assert.deepEqual(pressedControls(host), ['Любая'], 'переключатели в нажатые чипы не попали');
});

test('с gear: сколько скрыто, считается по тем же поиску, зоне и сложности', () => {
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: [], onChange: () => {} },
  });
  // Из пяти силовых без инвентаря подходит одно, четыре скрыты.
  assert.equal(foundText(host), '1 упражнение · ещё 4 с другим инвентарём');

  // Зона «Ягодицы»: подходит «Мост», скрыты три моста; присед в зону не входит и
  // в «ещё» не попадает.
  zoneChip(host, 'Ягодицы').click();
  assert.equal(foundText(host), 'Найдено: 1 · ещё 3 с другим инвентарём');

  // Поиск вместе с зоной: «гантел» находит два моста с гантелями, оба скрыты.
  type(host, 'гантел');
  assert.deepEqual(names(host), []);
  assert.equal(foundText(host), 'Найдено: 0 · ещё 2 с другим инвентарём');
  assert.equal(host.querySelector('.library-empty-title').textContent, 'Ничего не нашлось');

  // Отметили гантели: «Мост с гантелями» вернулся, скрытым остаётся «с гирей и гантелями».
  openFilters(host);
  gearSwitch(host, 'dumbbells').click();
  assert.deepEqual(names(host), ['Мост с гантелями']);
  assert.equal(foundText(host), 'Найдено: 1 · ещё 1 с другим инвентарём');

  // Отмечено всё нужное: скрытого нет, остаётся одно «Найдено: N».
  gearSwitch(host, 'kettlebell').click();
  assert.equal(foundText(host), 'Найдено: 2');
});

test('с gear: «ещё M» учитывает сложность и не считает разминку', () => {
  const { host } = mount({
    entries: [
      strength('a', 'Мост', { gear: ['none'], difficulty: 'basic' }),
      strength('b', 'Мост с гантелями', { gear: ['dumbbells'], difficulty: 'hard' }),
      strength('c', 'Мост с гирей', { gear: ['kettlebell'], difficulty: 'basic' }),
      strength('w', 'Мост лёжа с гантелями', { slot: 'warmup', gear: ['dumbbells'], difficulty: 'basic' }),
    ],
    gear: { owned: [], onChange: () => {} },
  });
  assert.equal(foundText(host), '1 упражнение · ещё 2 с другим инвентарём', 'разминка не в счёте');
  openFilters(host);
  control(host, 'Сложное').click();
  assert.equal(foundText(host), 'Найдено: 0 · ещё 1 с другим инвентарём');
  control(host, 'Базовое').click();
  assert.equal(foundText(host), 'Найдено: 1 · ещё 1 с другим инвентарём');
});

test('с gear: если скрывать нечего, строка счёта прежняя', () => {
  const { host } = mount({
    entries: [strength('a', 'Тяга', { gear: ['none'] }), strength('b', 'Жим', { gear: ['band_long'] })],
    gear: { owned: ['band_long'], onChange: () => {} },
  });
  assert.equal(foundText(host), '2 упражнения');
});

test('«Показать все» инвентарь не трогает', () => {
  const calls = [];
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: ['dumbbells'], onChange: owned => calls.push(owned) },
  });
  zoneChip(host, 'Ноги').click();
  type(host, 'нет такого');
  assert.deepEqual(names(host), []);
  [...host.querySelectorAll('.library-empty .btn')].find(b => b.textContent === 'Показать все').click();

  openFilters(host);
  assert.deepEqual(ownedSwitches(host), ['dumbbells'], 'переключатель остался отмеченным');
  assert.deepEqual(names(host), ['Мост', 'Мост с гантелями', 'Присед с гантелями'], 'и список всё ещё по инвентарю');
  assert.equal(foundText(host), '3 упражнения · ещё 2 с другим инвентарём');
  assert.deepEqual(calls, [], 'сброс наружу про инвентарь не сообщает');
});

const emptyHint = host => host.querySelector('.library-empty-hint')?.textContent;
const emptyButton = (host, label) => [...host.querySelectorAll('.library-empty .btn')].find(b => b.textContent === label);
const BY_GEAR = 'С отмеченным инвентарём ничего не нашлось. Отметь инвентарь в «Что есть дома»';

test('пусто из-за инвентаря, фильтров нет: подсказка про «Что есть дома», «Показать все» нет', () => {
  const { host } = mount({
    entries: gearEntries().filter(entry => entry.gear[0] !== 'none'),
    gear: { owned: [], onChange: () => {} },
  });

  assert.deepEqual(names(host), []);
  assert.equal(foundText(host), '0 упражнений · ещё 4 с другим инвентарём');
  assert.equal(host.querySelector('.library-empty-title').textContent, 'Ничего не нашлось');
  assert.equal(emptyHint(host), `${BY_GEAR}.`);
  assert.equal(emptyButton(host, 'Показать все'), undefined, 'сбрасывать нечего: сброс не поменял бы ничего');

  // Отметили нужное: подсказка уходит вместе с пустотой.
  openFilters(host);
  gearSwitch(host, 'dumbbells').click();
  assert.deepEqual(names(host), ['Мост с гантелями', 'Присед с гантелями']);
  assert.equal(emptyHint(host), undefined);
  assert.equal(host.querySelector('.library-empty').hidden, true);
});

test('запрос из одних пробелов фильтром не считается: «Показать все» не предлагается', () => {
  const { host } = mount({
    entries: gearEntries().filter(entry => entry.gear[0] !== 'none'),
    gear: { owned: [], onChange: () => {} },
  });
  type(host, '   ');
  assert.equal(emptyHint(host), `${BY_GEAR}.`);
  assert.equal(emptyButton(host, 'Показать все'), undefined);
});

test('пусто из-за инвентаря при поиске, зоне или сложности: подсказка называет и фильтры, «Показать все» есть и инвентарь не трогает', () => {
  const entries = [
    strength('a', 'Мост', { gear: ['none'], difficulty: 'basic', load: { glutes: 1 } }),
    strength('b', 'Присед с гантелями', { gear: ['dumbbells'], difficulty: 'hard', load: { quads: 1 } }),
  ];
  const cases = [
    ['поиск', host => type(host, 'присед')],
    ['зона', host => zoneChip(host, 'Ноги').click()],
    ['сложность', host => { openFilters(host); control(host, 'Сложное').click(); host.querySelector('.library-sheet-close').click(); }],
  ];
  for (const [what, setFilter] of cases) {
    const calls = [];
    const { host } = mount({ entries, gear: { owned: [], onChange: owned => calls.push(owned) } });
    setFilter(host);

    assert.deepEqual(names(host), [], what);
    assert.equal(foundText(host), 'Найдено: 0 · ещё 1 с другим инвентарём', what);
    assert.equal(emptyHint(host), `${BY_GEAR} или покажи все.`, what);
    const reset = emptyButton(host, 'Показать все');
    assert.equal(reset.type, 'button', what);

    // После сброса инвентарь тот же (пустой): «Мост» без инвентаря найден, пустоты нет.
    reset.click();
    assert.deepEqual(names(host), ['Мост'], what);
    assert.equal(emptyHint(host), undefined, what);
    assert.deepEqual(calls, [], `${what}: сброс про инвентарь наружу не сообщает`);
  }
});

test('пусто, но инвентарь ничего не скрыл: подсказка прежняя, про инвентарь ни слова', () => {
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: ['dumbbells', 'kettlebell', 'band_long'], onChange: () => {} },
  });
  type(host, 'нет такого');

  assert.equal(foundText(host), 'Найдено: 0');
  assert.equal(emptyHint(host), 'Попробуй другое слово или покажи все.');
  assert.equal(emptyButton(host, 'Показать все').type, 'button');
  assert.doesNotMatch(host.querySelector('.library-empty').textContent, /инвентар/);
});

test('без gear пустой экран прежний: подсказка про слово и «Показать все», про инвентарь ни слова', () => {
  const { host } = mount({ entries: gearEntries() });
  type(host, 'нет такого');
  assert.equal(emptyHint(host), 'Попробуй другое слово или покажи все.');
  assert.ok(emptyButton(host, 'Показать все'));
  openFilters(host);
  assert.doesNotMatch(host.textContent, /инвентар/);
});

test('пусто из-за инвентаря: «Открыть «Что есть дома»» открывает шторку и ставит фокус на переключатель', () => {
  const { document, host } = mount({
    entries: gearEntries().filter(entry => entry.gear[0] !== 'none'),
    gear: { owned: [], onChange: () => {} },
  });
  assert.equal(host.querySelector('.library-sheet'), null);
  const open = emptyButton(host, 'Открыть «Что есть дома»');
  assert.equal(open.type, 'button');
  open.click();
  assert.ok(host.querySelector('.library-sheet'));
  assert.equal(filterButton(host).getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, host.querySelector('.gear-picker button'));

  // Пусто не из-за инвентаря — кнопки нет.
  const other = mount({ entries: gearEntries(), gear: { owned: ['dumbbells', 'kettlebell', 'band_long'], onChange: () => {} } });
  type(other.host, 'нет такого');
  assert.equal(emptyButton(other.host, 'Открыть «Что есть дома»'), undefined);
});

test('смена инвентаря не пересобирает переключатели и поле поиска: фокус остаётся на нажатой кнопке', () => {
  const { document, host } = mount({
    entries: gearEntries(),
    gear: { owned: [], onChange: () => {} },
  });
  openFilters(host);
  const picker = host.querySelector('.gear-picker');
  const button = gearSwitch(host, 'dumbbells');
  const input = searchInput(host);

  button.focus();
  button.click();
  assert.equal(host.querySelector('.gear-picker'), picker);
  assert.equal(gearSwitch(host, 'dumbbells'), button);
  assert.equal(document.activeElement, button);
  assert.equal(searchInput(host), input);
});

test('с gear: «В тренировке» считает добавленное, даже когда его скрыл инвентарь', () => {
  const { host } = mount({
    entries: gearEntries(),
    isAdded: key => key === 'bridge-db',
    gear: { owned: [], onChange: () => {} },
  });
  assert.deepEqual(names(host), ['Мост'], 'упражнения с гантелями не видно');
  assert.equal(dockOf(host).querySelector('.dock-text').textContent, 'В тренировке: 1');
});

test('без gear: переключателей нет, ничего не фильтруется, счёт без «ещё»', () => {
  const lib = gearEntries();
  const { host } = mount({ entries: lib });
  openFilters(host);
  assert.equal(host.querySelector('.gear-picker'), null);
  assert.equal(host.querySelector('[data-gear]'), null);
  assert.equal(names(host).length, lib.length);
  assert.equal(foundText(host), '5 упражнений');

  // gear: null — то же, что не передать совсем.
  const nulled = mount({ entries: lib, gear: null });
  openFilters(nulled.host);
  assert.equal(nulled.host.querySelector('.gear-picker'), null);
  assert.equal(foundText(nulled.host), '5 упражнений');
});

test('повторная отрисовка на том же узле оставляет одни переключатели', () => {
  const { document, host } = mount({ gear: { owned: [], onChange: () => {} } });
  mount({ document, gear: { owned: ['dumbbells'], onChange: () => {} } });
  openFilters(host);
  assert.equal(host.querySelectorAll('.gear-picker').length, 1);
  assert.deepEqual(ownedSwitches(host), ['dumbbells'], 'новый экран — со своим выбором');
});

test('инвентарь в ряду есть и при переключателях, и после смены выбора', () => {
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: ['dumbbells'], onChange: () => {} },
  });
  const gearOf = () => rows(host).map(row => row.querySelector('.library-gear').textContent);
  assert.deepEqual(gearOf(), ['без инвентаря', 'гантели', 'гантели']);
  openFilters(host);
  gearSwitch(host, 'kettlebell').click();
  assert.deepEqual(gearOf(), ['без инвентаря', 'гантели', 'гантели, гиря', 'гантели']);
});

// — Поиск по мышцам, движение, «без инвентаря» ——————————————————————————————

test('поиск: по подписи мышц, целевым группам, движению и инвентарю; каждое слово запроса', () => {
  const lib = [
    strength('squat', 'Приседание', { muscles: 'Бёдра и ягодицы', load: { quads: 1, glutes: 1 }, pattern: 'squat', gear: ['none'] }),
    strength('bridge', 'Мост', { muscles: 'Ягодицы', load: { glutes: 1, hamstrings: 0.5 }, pattern: 'hinge', gear: ['loop_short'] }),
    strength('row', 'Тяга сидя', { muscles: 'Спина и бицепс', load: { lats: 1, biceps: 0.5 }, pattern: 'pull', gear: ['band_long'] }),
  ];
  // Подпись мышц, с «ё» как «е».
  assert.deepEqual(keys(filterEntries(lib, { query: 'бедра' })), ['squat']);
  // Целевая группа словарём: «Квадрицепсы» в подписи нет, но квадрицепсы целевые.
  assert.deepEqual(keys(filterEntries(lib, { query: 'квадрицепс' })), ['squat']);
  // Вспомогательная группа (0.5) поиском не находится, как и зоной.
  assert.deepEqual(keys(filterEntries(lib, { query: 'задняя поверхность' })), []);
  // Движение и инвентарь — теми же подписями, что на экране.
  assert.deepEqual(keys(filterEntries(lib, { query: 'наклон' })), ['bridge']);
  assert.deepEqual(keys(filterEntries(lib, { query: 'петл' })), ['bridge']);
  assert.deepEqual(keys(filterEntries(lib, { query: 'без инвентаря' })), ['squat']);
  // Каждое слово, в любом порядке и с лишними пробелами.
  assert.deepEqual(keys(filterEntries(lib, { query: '  ягодиц   петл ' })), ['bridge']);
  assert.deepEqual(keys(filterEntries(lib, { query: 'ягодиц тяга' })), []);
});

test('filterEntries: движение и «только без инвентаря» действуют вместе с остальным', () => {
  const lib = [
    strength('squat', 'Присед', { pattern: 'squat', gear: ['none'], load: { quads: 1 } }),
    strength('squat-band', 'Присед с петлёй', { pattern: 'squat', gear: ['loop_short'], load: { quads: 1 } }),
    strength('bridge', 'Мост', { pattern: 'hinge', gear: ['none'], load: { glutes: 1 } }),
    strength('warm', 'Присед лёжа', { slot: 'warmup', pattern: 'squat', gear: ['none'], load: { quads: 1 } }),
  ];
  assert.deepEqual(keys(filterEntries(lib, { pattern: 'squat' })), ['squat', 'squat-band']);
  assert.deepEqual(keys(filterEntries(lib, { noGear: true })), ['squat', 'bridge']);
  assert.deepEqual(keys(filterEntries(lib, { pattern: 'squat', noGear: true })), ['squat']);
  // «Только без инвентаря» строже отмеченного: петля есть, но сегодня без неё.
  assert.deepEqual(keys(filterEntries(lib, { noGear: true, owned: ['loop_short'] })), ['squat', 'bridge']);
  assert.deepEqual(keys(filterEntries(lib, { pattern: 'hinge', zone: 'legs' })), []);
});

test('поле поиска подсказывает, что ищет, и по мышцам', () => {
  const { host } = mount();
  // Подпись и подсказка одни: «Найти упражнение» — а по мышцам поиск находит
  // сам, без подсказки в поле.
  assert.equal(searchInput(host).placeholder, 'Найти упражнение');
  assert.deepEqual(keys(filterEntries([strength('a', 'Тяга', { muscles: 'Спина' })], { query: 'спина' })), ['a']);
});
