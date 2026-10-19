// Экран библиотеки: поиск, фильтры и карточки с кнопкой «Добавить». Модуль
// самостоятельный: что значит «добавлено» и когда добавлять нельзя, ему
// сообщает вызывающий (isAdded и addBlocked), поэтому проверяется он без
// конструктора и без приложения.
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
  document = makeDom('<!doctype html><html><body><div id="host"></div></body></html>').document,
} = {}) {
  const host = document.getElementById('host');
  const view = renderLibrary({ host, entries, isAdded, addBlocked, onAdd, onBack, openLink });
  return { document, host, view };
}

const names = host => [...host.querySelectorAll('.library-card h3')].map(h => h.textContent);
const chip = (host, label) => [...host.querySelectorAll('.library-chip')].find(c => c.textContent === label);
const pressed = host => [...host.querySelectorAll('.library-chip[aria-pressed="true"]')].map(c => c.textContent);

function type(host, text) {
  const input = host.querySelector('input.library-search');
  input.value = text;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

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

test('карточка: название, мышцы, сложность и «Добавить»; добавленное — «В тренировке» и недоступно', () => {
  const entries = [
    strength('a', 'Тяга', { muscles: 'Спина', difficulty: 'basic' }),
    strength('b', 'Жим', { muscles: 'Грудь', difficulty: 'medium' }),
    strength('c', 'Подъём', { muscles: 'Плечи', difficulty: 'hard' }),
  ];
  const { host } = mount({ entries, isAdded: key => key === 'b' });
  const cards = [...host.querySelectorAll('article.exercise.library-card')];
  assert.equal(cards.length, 3);

  assert.deepEqual(cards.map(c => c.querySelector('h3').textContent), ['Тяга', 'Жим', 'Подъём']);
  assert.deepEqual(cards.map(c => c.querySelector('.muscles').textContent), ['Спина', 'Грудь', 'Плечи']);
  assert.deepEqual(cards.map(c => c.querySelector('.library-level').textContent), ['Базовое', 'Среднее', 'Сложное']);

  const adds = cards.map(c => c.querySelector('button.library-add'));
  assert.deepEqual(adds.map(b => b.textContent), ['Добавить', 'В тренировке', 'Добавить']);
  assert.deepEqual(adds.map(b => b.disabled), [false, true, false]);
  assert.ok(adds.every(b => b.type === 'button'));
  // Таких кнопок много, и по голой подписи диктору их не отличить.
  assert.deepEqual(adds.map(b => b.getAttribute('aria-label')),
    ['Добавить: Тяга', 'В тренировке: Жим', 'Добавить: Подъём']);
});

test('нажатие «Добавить» отдаёт ключ, а экран сразу показывает, что вышло', () => {
  const added = new Set();
  const calls = [];
  const { host } = mount({
    isAdded: key => added.has(key),
    onAdd: key => { calls.push(key); added.add(key); },
  });
  const [first, second] = host.querySelectorAll('.library-add');

  first.click();
  assert.deepEqual(calls, ['a']);
  assert.equal(first.textContent, 'В тренировке');
  assert.equal(first.disabled, true);
  assert.equal(second.textContent, 'Добавить', 'соседняя карточка не тронута');

  // Недоступная кнопка нажатий не принимает.
  first.click();
  assert.deepEqual(calls, ['a']);
});

test('«Как выполнять» раскрывает технику так же, как в «Сегодня»', () => {
  const { host } = mount({ entries: [strength('a', 'Тяга'), strength('b', 'Жим', { detail: 'Подробность' })] });
  const [first, second] = [...host.querySelectorAll('.library-card')];
  const toggle = card => card.querySelector('.howto-toggle');
  const region = card => host.querySelector(`[id="${toggle(card).getAttribute('aria-controls')}"]`);

  assert.equal(toggle(first).getAttribute('aria-expanded'), 'false');
  assert.equal(region(first).hidden, true, 'по умолчанию техника свёрнута');
  assert.equal(region(first).id, 'lib-a');
  assert.equal(region(first).closest('.library-card'), first);

  toggle(first).click();
  assert.equal(toggle(first).getAttribute('aria-expanded'), 'true');
  assert.equal(region(first).hidden, false);
  assert.match(region(first).textContent, /Техника: Тяга/);

  // Уголок внутри кнопки: палец попадает и в него.
  toggle(second).querySelector('.howto-caret').dispatchEvent(
    new host.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  assert.equal(region(second).hidden, false);
  assert.equal(region(first).hidden, false, 'раскрытие второй не сворачивает первую');
  assert.match(region(second).textContent, /Подробность/);

  toggle(first).click();
  assert.equal(toggle(first).getAttribute('aria-expanded'), 'false');
  assert.equal(region(first).hidden, true);
});

test('повторная отрисовка на том же узле не копит обработчиков: раскрытие — с одного нажатия', () => {
  const { document, host } = mount();
  mount({ document });
  const toggle = host.querySelector('.howto-toggle');

  assert.equal(host.querySelectorAll('.library').length, 1, 'на узле один экран библиотеки');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
});

test('ничего не найдено — подсказка и сброс фильтров', () => {
  const { host } = mount({
    entries: [
      strength('a', 'Тяга', { load: { lats: 1 } }),
      strength('b', 'Присед', { load: { quads: 1 } }),
    ],
  });
  assert.equal(host.querySelector('.library-empty'), null, 'пока есть что показать, подсказки нет');
  assert.equal(chip(host, 'Сбросить фильтры'), undefined);

  chip(host, 'Грудь').click();
  type(host, 'тяг');
  assert.equal(host.querySelectorAll('.library-card').length, 0);
  assert.match(host.textContent, /Ничего не найдено/);
  assert.match(host.textContent, /Измени запрос или сбрось фильтры\./);
  assert.match(host.textContent, /Найдено: 0/);
  const reset = chip(host, 'Сбросить фильтры');
  assert.equal(reset.tagName, 'BUTTON');
  assert.equal(reset.type, 'button');

  reset.click();
  assert.equal(host.querySelector('input.library-search').value, '');
  assert.deepEqual(pressed(host), ['Все', 'Любая']);
  assert.deepEqual(names(host), ['Тяга', 'Присед']);
  assert.doesNotMatch(host.textContent, /Ничего не найдено/);
  assert.equal(chip(host, 'Сбросить фильтры'), undefined);
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
  assert.deepEqual(buttons().map(b => b.textContent), ['Добавить', 'Добавить', 'В тренировке']);

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

test('refresh меняет кнопки и счётчик, а карточки не пересобирает: раскрытое остаётся раскрытым', () => {
  const added = new Set();
  const { host, view } = mount({ isAdded: key => added.has(key) });
  const article = host.querySelector('.library-card');
  article.querySelector('.howto-toggle').click();
  assert.match(host.querySelector('.library-total').textContent, /^В тренировке: 0$/);

  added.add('a');
  view.refresh();

  assert.equal(host.querySelector('.library-card'), article, 'карточка — тот же узел');
  assert.equal(article.querySelector('.howto-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(article.querySelector('.library-add').textContent, 'В тренировке');
  assert.equal(host.querySelector('.library-total').textContent, 'В тренировке: 1');
});

test('чипы зон и сложности: выбранный нажат, список и счёт меняются', () => {
  const lib = [
    strength('a', 'Мост', { difficulty: 'basic', load: { glutes: 1 } }),
    strength('b', 'Мост с паузой', { difficulty: 'medium', load: { glutes: 1 } }),
    strength('c', 'Присед', { difficulty: 'medium', load: { quads: 1 } }),
  ];
  const { host } = mount({ entries: lib });
  const zoneLabels = ['Все', ...Object.values(ZONES).map(zone => zone.label)];
  const difficultyLabels = ['Любая', 'Базовое', 'Среднее', 'Сложное'];
  const chips = [...host.querySelectorAll('.library-chip')];

  assert.deepEqual(chips.map(c => c.textContent), [...zoneLabels, ...difficultyLabels]);
  assert.equal(zoneLabels.length, 8, '«Все» и семь зон');
  assert.ok(chips.every(c => c.tagName === 'BUTTON' && c.type === 'button' && c.hasAttribute('aria-pressed')));
  assert.deepEqual(pressed(host), ['Все', 'Любая']);
  assert.match(host.textContent, /Найдено: 3/);

  chip(host, 'Ягодицы').click();
  assert.deepEqual(pressed(host), ['Ягодицы', 'Любая']);
  assert.deepEqual(names(host), ['Мост', 'Мост с паузой']);
  assert.match(host.textContent, /Найдено: 2/);

  chip(host, 'Среднее').click();
  assert.deepEqual(pressed(host), ['Ягодицы', 'Среднее']);
  assert.deepEqual(names(host), ['Мост с паузой']);

  // Выбор зоны заменяет прежний, а не добавляется к нему.
  chip(host, 'Ноги').click();
  assert.deepEqual(pressed(host), ['Ноги', 'Среднее']);
  assert.deepEqual(names(host), ['Присед']);

  chip(host, 'Все').click();
  chip(host, 'Любая').click();
  assert.deepEqual(pressed(host), ['Все', 'Любая']);
  assert.deepEqual(names(host), ['Мост', 'Мост с паузой', 'Присед']);
});

test('поле поиска: подпись для диктора, список и счёт следят за вводом, поле остаётся тем же', () => {
  const { host } = mount({
    entries: [strength('a', 'Ёлочка'), strength('b', 'Тяга'), strength('c', 'Жим')],
  });
  const input = host.querySelector('input.library-search');
  assert.equal(input.getAttribute('aria-label'), 'Поиск упражнения');
  assert.match(host.textContent, /Найдено: 3/);

  input.focus();
  type(host, 'ЕЛО');
  assert.deepEqual(names(host), ['Ёлочка']);
  assert.match(host.textContent, /Найдено: 1/);
  assert.equal(host.querySelector('input.library-search'), input);
  assert.equal(input.ownerDocument.activeElement, input, 'перерисовка списка не отбирает фокус у поля');

  type(host, '');
  assert.deepEqual(names(host), ['Ёлочка', 'Тяга', 'Жим']);
});

test('«К сборке» сверху и снизу возвращают назад; внизу — сколько упражнений в тренировке', () => {
  let backs = 0;
  // Записи-заглушки, а не настоящая библиотека: счёт «В тренировке» зависит от
  // типа упражнения (силовое считается, разминка нет), а тип в настоящей таблице
  // правит владелец.
  const { host } = mount({
    entries: [strength('a', 'Тяга'), strength('b', 'Жим'), strength('w', 'Мост лёжа', { slot: 'warmup' })],
    isAdded: key => key === 'a' || key === 'w',
    onBack: () => { backs += 1; },
  });
  const backButtons = [...host.querySelectorAll('button.builder-back')];

  assert.deepEqual(backButtons.map(b => b.textContent), ['← К сборке', 'К сборке']);
  assert.equal(backButtons[0], host.querySelector('.library').firstElementChild, 'верхняя — первая на экране');
  assert.equal(backButtons[1].closest('.library-foot'), host.querySelector('.library-total').closest('.library-foot'));
  // Разминка в счёт не идёт: на экране библиотеки её нет.
  assert.equal(host.querySelector('.library-total').textContent, 'В тренировке: 1');

  backButtons[0].click();
  backButtons[1].click();
  assert.equal(backs, 2);
});

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
  for (const button of [todayVideo, libraryVideo]) {
    assert.equal(document.getElementById(button.getAttribute('aria-controls')), button.nextElementSibling);
  }
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length, 'на странице нет повторяющихся id');
});

test('Escape с фокусом внутри библиотеки закрывает открытое видео и возвращает фокус на кнопку', () => {
  const { document, host } = mount();
  const video = host.querySelector('button.video');
  video.click();
  assert.equal(host.querySelectorAll('.player-shell').length, 1);

  host.querySelector('.player-close').dispatchEvent(
    new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(host.querySelectorAll('.player-shell').length, 0);
  assert.equal(video.getAttribute('aria-expanded'), 'false');
  assert.equal(document.activeElement, video);
});

test('смена фильтра убирает открытое видео вместе с карточкой: iframe не остаётся без хозяина', () => {
  const { host } = mount();
  host.querySelector('button.video').click();
  assert.equal(host.querySelectorAll('iframe').length, 1);

  type(host, 'жим');
  assert.deepEqual(names(host), ['Жим']);
  assert.equal(host.querySelectorAll('iframe').length, 0);
  assert.equal(host.querySelector('button.video').getAttribute('aria-expanded'), 'false');
});
