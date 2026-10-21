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
  gear,
  document = makeDom('<!doctype html><html><body><div id="host"></div></body></html>').document,
} = {}) {
  const host = document.getElementById('host');
  const view = renderLibrary({ host, entries, isAdded, addBlocked, onAdd, onBack, openLink, gear });
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
  // Добавленное отличается от недоступного по другой причине классом: оба disabled.
  assert.deepEqual(adds.map(b => b.classList.contains('is-added')), [false, true, false]);
  // Кнопка стоит в строке названия, а не полосой под карточкой.
  assert.ok(adds.every((b, i) => b.parentElement === cards[i].querySelector('h3').parentElement),
    'кнопка — рядом с названием');
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

// — «Что есть дома» ————————————————————————————————————————————————————

const gearChip = (host, id) => host.querySelector(`.gear-picker [data-gear="${id}"]`);
const ownedChips = host => [...host.querySelectorAll('.gear-chip[aria-pressed="true"]')].map(b => b.dataset.gear);
const foundText = host => host.querySelector('.library-found').textContent;

// Записи с инвентарём. Ягодицы — три упражнения с разным инвентарём, приседы —
// одно с гантелями: так видно и «ещё M» в зоне, и вне её.
const gearEntries = () => [
  strength('bridge', 'Мост', { gear: ['none'], load: { glutes: 1 } }),
  strength('bridge-band', 'Мост с резинкой', { gear: ['band_long'], load: { glutes: 1 } }),
  strength('bridge-db', 'Мост с гантелями', { gear: ['dumbbells'], load: { glutes: 1 } }),
  strength('bridge-both', 'Мост с гирей и гантелями', { gear: ['dumbbells', 'kettlebell'], load: { glutes: 1 } }),
  strength('squat-db', 'Присед с гантелями', { gear: ['dumbbells'], load: { quads: 1 } }),
];

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

test('с gear: упражнения с неотмеченным инвентарём скрыты, отметка в переключателе возвращает их', () => {
  const calls = [];
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: ['band_long'], onChange: owned => calls.push(owned) },
  });
  assert.deepEqual(names(host), ['Мост', 'Мост с резинкой']);

  gearChip(host, 'dumbbells').click();
  assert.deepEqual(names(host), ['Мост', 'Мост с резинкой', 'Мост с гантелями', 'Присед с гантелями']);
  assert.deepEqual(calls, [['band_long', 'dumbbells']]);

  gearChip(host, 'kettlebell').click();
  assert.deepEqual(names(host), ['Мост', 'Мост с резинкой', 'Мост с гантелями', 'Мост с гирей и гантелями', 'Присед с гантелями']);
  assert.deepEqual(calls.at(-1), ['band_long', 'dumbbells', 'kettlebell']);

  // Снять всё: остаётся только «без инвентаря».
  for (const id of ['band_long', 'dumbbells', 'kettlebell']) gearChip(host, id).click();
  assert.deepEqual(names(host), ['Мост']);
  assert.deepEqual(calls.at(-1), []);
  assert.equal(calls.length, 5, 'по одному вызову на нажатие');
});

test('с gear: переключатели — последними в панели «Ещё фильтры», после сложности, со своим id', () => {
  const { host } = mount({ gear: { owned: ['band_long', 'loop_short'], onChange: () => {} } });
  const root = host.querySelector('.library');
  const groups = [...root.querySelectorAll('.library-filters')];
  const picker = root.querySelector('.gear-picker');
  const panel = root.querySelector('#library-more');

  assert.equal(groups.length, 2, 'зона и сложность на месте');
  assert.equal(picker.parentElement, panel, 'в панели');
  assert.equal(picker.previousElementSibling, groups[1], 'сразу после сложности');
  assert.equal(picker.nextElementSibling, null, 'последним');
  assert.equal(panel.nextElementSibling, root.querySelector('.library-found'), 'панель — сразу перед «Найдено»');
  assert.equal(picker.querySelector('h3').id, 'library-gear-title');
  assert.deepEqual(ownedChips(host), ['band_long', 'loop_short']);
  // Чипы фильтров библиотеки остались своими: переключатели в их выборку не попали.
  assert.equal(root.querySelectorAll('.library-chip').length, 8 + 4);
  assert.equal(pressed(host).length, 2);
});

test('с gear: сколько скрыто, считается по тем же поиску, зоне и сложности', () => {
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: [], onChange: () => {} },
  });
  // Из пяти силовых без инвентаря подходит одно, четыре скрыты.
  assert.equal(foundText(host), 'Найдено: 1 · ещё 4 с другим инвентарём');

  // Зона «Ягодицы»: подходит «Мост», скрыты три моста; присед в зону не входит и
  // в «ещё» не попадает.
  chip(host, 'Ягодицы').click();
  assert.equal(foundText(host), 'Найдено: 1 · ещё 3 с другим инвентарём');

  // Поиск вместе с зоной: «гантел» находит два моста с гантелями, оба скрыты.
  type(host, 'гантел');
  assert.deepEqual(names(host), []);
  assert.equal(foundText(host), 'Найдено: 0 · ещё 2 с другим инвентарём');
  assert.match(host.textContent, /Ничего не найдено/);

  // Отметили гантели: «Мост с гантелями» вернулся, скрытым остаётся «с гирей и гантелями».
  gearChip(host, 'dumbbells').click();
  assert.deepEqual(names(host), ['Мост с гантелями']);
  assert.equal(foundText(host), 'Найдено: 1 · ещё 1 с другим инвентарём');

  // Отмечено всё нужное: скрытого нет, остаётся одно «Найдено: N».
  gearChip(host, 'kettlebell').click();
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
  assert.equal(foundText(host), 'Найдено: 1 · ещё 2 с другим инвентарём', 'разминка не в счёте');
  chip(host, 'Сложное').click();
  assert.equal(foundText(host), 'Найдено: 0 · ещё 1 с другим инвентарём');
  chip(host, 'Базовое').click();
  assert.equal(foundText(host), 'Найдено: 1 · ещё 1 с другим инвентарём');
});

test('с gear: если скрывать нечего, строка «Найдено» прежняя', () => {
  const { host } = mount({
    entries: [strength('a', 'Тяга', { gear: ['none'] }), strength('b', 'Жим', { gear: ['band_long'] })],
    gear: { owned: ['band_long'], onChange: () => {} },
  });
  assert.equal(foundText(host), 'Найдено: 2');
});

test('«Сбросить фильтры» инвентарь не трогает', () => {
  const calls = [];
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: ['dumbbells'], onChange: owned => calls.push(owned) },
  });
  chip(host, 'Ноги').click();
  type(host, 'нет такого');
  assert.deepEqual(names(host), []);
  chip(host, 'Сбросить фильтры').click();

  assert.deepEqual(ownedChips(host), ['dumbbells'], 'переключатель остался отмеченным');
  assert.deepEqual(names(host), ['Мост', 'Мост с гантелями', 'Присед с гантелями'], 'и список всё ещё по инвентарю');
  assert.equal(foundText(host), 'Найдено: 3 · ещё 2 с другим инвентарём');
  assert.deepEqual(calls, [], 'сброс наружу про инвентарь не сообщает');
});

const emptyHint = host => host.querySelector('.library-empty-hint')?.textContent;
const BY_GEAR = 'С отмеченным инвентарём ничего не нашлось. Отметь инвентарь в «Что есть дома»';

test('пусто из-за инвентаря, фильтров нет: подсказка про «Что есть дома», кнопки сброса нет', () => {
  const { host } = mount({
    entries: gearEntries().filter(entry => entry.gear[0] !== 'none'),
    gear: { owned: [], onChange: () => {} },
  });

  assert.deepEqual(names(host), []);
  assert.equal(foundText(host), 'Найдено: 0 · ещё 4 с другим инвентарём');
  assert.equal(host.querySelector('.library-empty-title').textContent, 'Ничего не найдено');
  assert.equal(emptyHint(host), `${BY_GEAR}.`);
  assert.equal(chip(host, 'Сбросить фильтры'), undefined, 'сбрасывать нечего: сброс не поменял бы ничего');

  // Отметили нужное: подсказка уходит вместе с пустотой.
  gearChip(host, 'dumbbells').click();
  assert.deepEqual(names(host), ['Мост с гантелями', 'Присед с гантелями']);
  assert.equal(host.querySelector('.library-empty-hint'), null);
});

test('запрос из одних пробелов фильтром не считается: сброс не предлагается', () => {
  const { host } = mount({
    entries: gearEntries().filter(entry => entry.gear[0] !== 'none'),
    gear: { owned: [], onChange: () => {} },
  });
  type(host, '   ');
  assert.equal(emptyHint(host), `${BY_GEAR}.`);
  assert.equal(chip(host, 'Сбросить фильтры'), undefined);
});

test('пусто из-за инвентаря при поиске, зоне или сложности: подсказка называет и фильтры, сброс есть и инвентарь не трогает', () => {
  const entries = [
    strength('a', 'Мост', { gear: ['none'], difficulty: 'basic', load: { glutes: 1 } }),
    strength('b', 'Присед с гантелями', { gear: ['dumbbells'], difficulty: 'hard', load: { quads: 1 } }),
  ];
  const cases = [
    ['поиск', host => type(host, 'присед')],
    ['зона', host => chip(host, 'Ноги').click()],
    ['сложность', host => chip(host, 'Сложное').click()],
  ];
  for (const [what, setFilter] of cases) {
    const calls = [];
    const { host } = mount({ entries, gear: { owned: [], onChange: owned => calls.push(owned) } });
    setFilter(host);

    assert.deepEqual(names(host), [], what);
    assert.equal(foundText(host), 'Найдено: 0 · ещё 1 с другим инвентарём', what);
    assert.equal(emptyHint(host), `${BY_GEAR} или сбрось фильтры.`, what);
    const reset = chip(host, 'Сбросить фильтры');
    assert.equal(reset.type, 'button', what);

    // После сброса инвентарь тот же (пустой): «Мост» без инвентаря найден, пустоты нет.
    reset.click();
    assert.deepEqual(names(host), ['Мост'], what);
    assert.equal(host.querySelector('.library-empty-hint'), null, what);
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
  assert.equal(emptyHint(host), 'Измени запрос или сбрось фильтры.');
  assert.equal(chip(host, 'Сбросить фильтры').type, 'button');
  assert.doesNotMatch(host.querySelector('.library-empty').textContent, /инвентар/);
});

test('без gear пустой экран прежний: подсказка про фильтры и сброс, про инвентарь ни слова', () => {
  const { host } = mount({ entries: gearEntries() });
  type(host, 'нет такого');
  assert.equal(emptyHint(host), 'Измени запрос или сбрось фильтры.');
  assert.ok(chip(host, 'Сбросить фильтры'));
  assert.doesNotMatch(host.textContent, /инвентар/);
});

test('смена инвентаря не пересобирает переключатели и поле поиска: фокус остаётся на нажатой кнопке', () => {
  const { document, host } = mount({
    entries: gearEntries(),
    gear: { owned: [], onChange: () => {} },
  });
  const picker = host.querySelector('.gear-picker');
  const button = gearChip(host, 'dumbbells');
  const input = host.querySelector('input.library-search');

  button.focus();
  button.click();
  assert.equal(host.querySelector('.gear-picker'), picker);
  assert.equal(gearChip(host, 'dumbbells'), button);
  assert.equal(document.activeElement, button);
  assert.equal(host.querySelector('input.library-search'), input);
});

test('с gear: «В тренировке» считает добавленное, даже когда его скрыл инвентарь', () => {
  const { host } = mount({
    entries: gearEntries(),
    isAdded: key => key === 'bridge-db',
    gear: { owned: [], onChange: () => {} },
  });
  assert.deepEqual(names(host), ['Мост'], 'упражнения с гантелями не видно');
  assert.equal(host.querySelector('.library-total').textContent, 'В тренировке: 1');
});

test('без gear: переключателей нет, ничего не фильтруется, «Найдено» без «ещё»', () => {
  const lib = gearEntries();
  const { host } = mount({ entries: lib });
  assert.equal(host.querySelector('.gear-picker'), null);
  assert.equal(host.querySelector('[data-gear]'), null);
  assert.equal(names(host).length, lib.length);
  assert.equal(foundText(host), 'Найдено: 5');

  // gear: null — то же, что не передать совсем.
  const nulled = mount({ entries: lib, gear: null });
  assert.equal(nulled.host.querySelector('.gear-picker'), null);
  assert.equal(foundText(nulled.host), 'Найдено: 5');
});

test('повторная отрисовка на том же узле оставляет одни переключатели', () => {
  const { document, host } = mount({ gear: { owned: [], onChange: () => {} } });
  mount({ document, gear: { owned: ['dumbbells'], onChange: () => {} } });
  assert.equal(host.querySelectorAll('.gear-picker').length, 1);
  assert.deepEqual(ownedChips(host), ['dumbbells'], 'новый экран — со своим выбором');
});

test('инвентарь на карточке: той же подписью, что в шторке замены, в верхней строке', () => {
  const { host } = mount({
    entries: [
      strength('a', 'Тяга', { gear: ['band_handles', 'dumbbells'], muscles: 'Спина' }),
      strength('b', 'Мост', { gear: ['none'] }),
      strength('c', 'Присед', { gear: ['kettlebell'] }),
    ],
  });
  const cards = [...host.querySelectorAll('.library-card')];
  assert.deepEqual(cards.map(c => c.querySelector('.library-gear').textContent),
    ['резинка с ручками, гантели', 'без инвентаря', 'гиря']);

  const top = cards[0].querySelector('.exercise-top');
  assert.deepEqual([...top.children].map(c => c.className), ['library-level', 'library-gear', 'muscles'],
    'сложность, инвентарь и мышцы в одной верхней строке');
  assert.equal(top.querySelector('.muscles').textContent, 'Спина');
});

test('инвентарь на карточке есть и при переключателях, и после смены выбора', () => {
  const { host } = mount({
    entries: gearEntries(),
    gear: { owned: ['dumbbells'], onChange: () => {} },
  });
  const gearOf = () => [...host.querySelectorAll('.library-card .library-gear')].map(s => s.textContent);
  assert.deepEqual(gearOf(), ['без инвентаря', 'гантели', 'гантели']);
  gearChip(host, 'kettlebell').click();
  assert.deepEqual(gearOf(), ['без инвентаря', 'гантели', 'гантели, гиря', 'гантели']);
});

// — Поиск по мышцам, движение, «без инвентаря», панель «Ещё фильтры» ——————————

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

const panelOf = host => host.querySelector('#library-more');
const moreButton = host => host.querySelector('button.library-more');
const resetButton = host => host.querySelector('button.library-reset');

test('«Ещё фильтры»: свёрнута при открытии, раскрывается и сворачивается, на виду поиск и зоны', () => {
  const { host } = mount({ gear: { owned: [], onChange: () => {} } });
  const panel = panelOf(host);
  const more = moreButton(host);

  assert.equal(more.type, 'button');
  assert.equal(more.textContent, 'Ещё фильтры');
  assert.equal(more.querySelector('svg').getAttribute('aria-hidden'), 'true');
  assert.equal(more.getAttribute('aria-controls'), panel.id);
  assert.equal(more.getAttribute('aria-expanded'), 'false');
  assert.equal(panel.hidden, true);
  // Зоны и поиск — не в панели; сложность и «Что есть дома» — в ней.
  assert.equal(panel.contains(host.querySelector('input.library-search')), false);
  assert.equal(panel.contains(chip(host, 'Ноги')), false);
  assert.ok(panel.contains(chip(host, 'Сложное')));
  assert.ok(panel.contains(host.querySelector('.gear-picker')));

  more.click();
  assert.equal(panel.hidden, false);
  assert.equal(more.getAttribute('aria-expanded'), 'true');
  more.click();
  assert.equal(panel.hidden, true);
  assert.equal(more.getAttribute('aria-expanded'), 'false');
});

test('группы панели названы видимым заголовком: aria-labelledby, а не второй aria-label', () => {
  const { host } = mount({ entries: gearEntries(), gear: { owned: [], onChange: () => {} } });
  for (const [label, firstChip] of [['Сложность', 'Любая'], ['Инвентарь', 'Любой']]) {
    const group = chip(host, firstChip).parentElement;
    assert.equal(group.getAttribute('role'), 'group', label);
    assert.equal(group.hasAttribute('aria-label'), false, label);
    const title = host.querySelector(`#${group.getAttribute('aria-labelledby')}`);
    assert.equal(title.textContent, label);
    assert.equal(title.nextElementSibling, group, `${label}: заголовок прямо над чипами`);
  }
  // Зона снаружи панели — по-прежнему с aria-label.
  assert.equal(chip(host, 'Все').parentElement.getAttribute('aria-label'), 'Зона');
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
  const group = chip(host, 'Любое').parentElement;
  assert.deepEqual([...group.children].map(c => c.textContent), ['Любое', 'Наклон от таза', 'Присед', 'Тяга']);

  chip(host, 'Наклон от таза').click();
  assert.deepEqual(names(host), ['Мост', 'Мост на одной ноге']);
  assert.ok(pressed(host).includes('Наклон от таза'));
  chip(host, 'Любое').click();
  assert.equal(names(host).length, 4);

  const single = mount({ entries: [strength('a', 'Мост'), strength('b', 'Мост с паузой')] });
  assert.equal(chip(single.host, 'Любое'), undefined, 'одно движение — отсеивать нечего');
});

test('«Без инвентаря»: только с переключателями и когда есть и такие, и другие', () => {
  const { host } = mount({ entries: gearEntries(), gear: { owned: ['dumbbells'], onChange: () => {} } });
  assert.deepEqual(names(host), ['Мост', 'Мост с гантелями', 'Присед с гантелями']);
  chip(host, 'Без инвентаря').click();
  assert.deepEqual(names(host), ['Мост']);
  // Скрыто фильтром, а не инвентарём: «ещё M» не появляется.
  assert.equal(foundText(host), 'Найдено: 1');
  chip(host, 'Любой').click();
  assert.equal(names(host).length, 3);

  const bareOnly = gearEntries().filter(entry => entry.gear[0] === 'none');
  assert.equal(chip(mount({ entries: bareOnly, gear: { owned: [], onChange: () => {} } }).host, 'Без инвентаря'), undefined);
  const withGear = gearEntries().filter(entry => entry.gear[0] !== 'none');
  assert.equal(chip(mount({ entries: withGear, gear: { owned: [], onChange: () => {} } }).host, 'Без инвентаря'), undefined);
  assert.equal(chip(mount({ entries: gearEntries() }).host, 'Без инвентаря'), undefined, 'без gear про инвентарь ни слова');
});

test('счёт на «Ещё фильтры» — включённые фильтры панели; инвентарь и зона не в счёте', () => {
  const lib = [
    ...gearEntries(),
    strength('pull', 'Тяга', { pattern: 'pull', gear: ['none'], difficulty: 'medium', load: { lats: 1 } }),
  ];
  const { host } = mount({ entries: lib, gear: { owned: [], onChange: () => {} } });
  const count = () => host.querySelector('.library-more-count').textContent;
  assert.equal(count(), '');

  chip(host, 'Ноги').click();
  host.querySelector('.gear-picker [data-gear="dumbbells"]').click();
  assert.equal(count(), '', 'зона на виду, а инвентарь — не фильтр');
  chip(host, 'Среднее').click();
  assert.equal(count(), ' · 1');
  chip(host, 'Тяга').click();
  chip(host, 'Без инвентаря').click();
  assert.equal(count(), ' · 3');
  assert.equal(moreButton(host).textContent, 'Ещё фильтры · 3');
  chip(host, 'Любая').click();
  assert.equal(count(), ' · 2');
});

test('«Сбросить» рядом с панелью: виден только с фильтрами, снимает все, «Что есть дома» не трогает', () => {
  const calls = [];
  const lib = [
    ...gearEntries(),
    strength('pull', 'Тяга', { pattern: 'pull', gear: ['none'], difficulty: 'medium', load: { lats: 1 } }),
  ];
  const { host } = mount({ entries: lib, gear: { owned: ['dumbbells'], onChange: owned => calls.push(owned) } });
  const reset = resetButton(host);
  assert.equal(reset.type, 'button');
  assert.equal(reset.getAttribute('aria-label'), 'Сбросить фильтры');
  assert.equal(reset.hidden, true, 'сбрасывать нечего');

  type(host, '   ');
  assert.equal(reset.hidden, true, 'пробелы — не запрос');
  type(host, 'тяга');
  assert.equal(reset.hidden, false);
  chip(host, 'Спина').click();
  chip(host, 'Среднее').click();
  chip(host, 'Тяга').click();
  chip(host, 'Без инвентаря').click();
  assert.deepEqual(names(host), ['Тяга']);

  reset.click();
  assert.equal(resetButton(host), reset, 'тот же узел');
  assert.equal(reset.hidden, true);
  assert.equal(host.querySelector('input.library-search').value, '');
  assert.deepEqual(pressed(host), ['Все', 'Любая', 'Любое', 'Любой']);
  assert.equal(host.querySelector('.library-more-count').textContent, '');
  assert.deepEqual(ownedChips(host), ['dumbbells']);
  assert.deepEqual(names(host), ['Мост', 'Мост с гантелями', 'Присед с гантелями', 'Тяга']);
  assert.deepEqual(calls, []);
});

test('пусто из-за инвентаря: «Открыть «Что есть дома»» раскрывает панель и ставит фокус на переключатель', () => {
  const { document, host } = mount({
    entries: gearEntries().filter(entry => entry.gear[0] !== 'none'),
    gear: { owned: [], onChange: () => {} },
  });
  assert.equal(panelOf(host).hidden, true);
  const open = chip(host, 'Открыть «Что есть дома»');
  assert.equal(open.type, 'button');
  open.click();
  assert.equal(panelOf(host).hidden, false);
  assert.equal(moreButton(host).getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, host.querySelector('.gear-picker button'));

  // Пусто не из-за инвентаря — кнопки нет.
  const other = mount({ entries: gearEntries(), gear: { owned: ['dumbbells', 'kettlebell', 'band_long'], onChange: () => {} } });
  type(other.host, 'нет такого');
  assert.equal(chip(other.host, 'Открыть «Что есть дома»'), undefined);
});

test('поле поиска подсказывает, что ищет и по мышцам', () => {
  const { host } = mount();
  assert.equal(host.querySelector('input.library-search').placeholder, 'Название или мышца');
});
