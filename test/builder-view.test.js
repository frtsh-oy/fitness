// Раздел «Конструктор»: вход, ручная сборка, генератор с результатом, замена
// упражнения и сохранение.
// Большинство тестов монтируют приложение на настоящем index.html (как
// test/switch.test.js): так заодно проверено, что раздел встал на страницу и
// что сохранённая тренировка доходит до «Тренировок» и «Сегодня». Там, где
// нужно управлять хранилищем (ответ, которого приходится ждать, отказ-исключение),
// экран монтируется отдельно, с подставным store.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { startApp, CURRENT_KEY } from '../app.js';
import { renderBuilder } from '../builder-view.js';
import { recordKey, OWN_LIMIT } from '../my-workouts.js';
import { serializeCompact, exerciseCount, expandWorkout, NAME_MAX } from '../builder/compact.js';
import { generate, availability, missingGroupsMessage } from '../builder/generator.js';
import { replaceCandidates } from '../builder/replace.js';
import { createGearProfile, GEAR_KEY } from '../gear-profile.js';
import { belowFloor } from '../builder/coverage.js';
import { CORE_GROUPS, LEVELS, MAX_STRENGTH, SKELETON } from '../builder/rules.js';
import { plural } from '../builder/texts.js';
import { LIBRARY } from '../exercises/index.js';
import { groupsPhrase } from '../muscles.js';
import { TEST_LIBRARY, singlesOnly, variant, withoutTargets } from './fixtures/test-library.js';

const PAGE = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

// Ручная сборка, уже лежащая на устройстве: четыре силовых, чтобы в ней было что
// убрать и что оставить.
const OWN_ID = 'my-test0001';
const OWN = {
  v: 1, name: 'Мой тест', days: [2, 4], level: null, zones: [],
  warmup: ['pelvic-tilt', 'thoracic-rotation'], circuit: ['chinese-squat', 'knee-raise'],
  strength: ['rdl', 'adduction', 'glute-bridge', 'leg-press'], focus: [],
  cooldown: ['hip-flexor', 'breathing'], t: 1760000000000,
};
const onDevice = (id = OWN_ID, compact = OWN) => ({ [recordKey(id)]: serializeCompact(compact) });

// Клиент Telegram в том объёме, в каком его трогают telegram.js и app.js: без
// облака, и вопрос, ответ на который отдаёт тест.
function fakeWebApp() {
  const confirms = [];
  return {
    confirms,
    CloudStorage: null,
    initDataUnsafe: {},
    isVersionAtLeast: () => true,
    showConfirm(message, answer) { confirms.push({ message, answer }); },
  };
}

function mount(t, { library, preload = {}, webApp = null, denyStorage = false } = {}) {
  const { window, document } = makeDom(PAGE);
  t.after(() => window.close());
  // В jsdom прокрутки нет, а смена экрана её просит.
  window.scrollTo = () => {};
  for (const [key, value] of Object.entries(preload)) window.localStorage.setItem(key, value);
  if (denyStorage) {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('данные сайтов запрещены'); },
      configurable: true,
    });
  }
  if (webApp) window.Telegram = { WebApp: webApp };
  const app = startApp(window, { library });
  return { window, document, app, root: document.getElementById('screen-builder') };
}

// Экран отдельно от приложения, со своим store. Возвращает корень и то, что
// экран отдал наружу.
function mountScreen(t, { store, library = LIBRARY, confirm = async () => true, seed = () => 1, gearProfile } = {}) {
  const { window, document } = makeDom('<!doctype html><html><body><div id="host"></div></body></html>');
  t.after(() => window.close());
  window.scrollTo = () => {};
  const root = document.getElementById('host');
  const saved = [];
  const view = renderBuilder({
    host: root, win: window, library, store, confirm, seed, openLink() {}, gearProfile,
    onSaved: (...args) => saved.push(args),
  });
  return { window, document, root, saved, view };
}

const openBuilder = document => document.querySelector('[data-section="builder"]').click();
const openWorkouts = document => document.querySelector('[data-section="workouts"]').click();
const shown = document => [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);

const startManual = root => root.querySelector('.builder-path').click();
const openLibrary = root => root.querySelector('.builder-add').click();
const back = root => root.querySelector('.builder-back').click();
const toSave = root => root.querySelector('.builder-save').click();
const nameOf = (key, library = LIBRARY) => library.find(entry => entry.key === key).name;

function addFromLibrary(root, name) {
  const button = [...root.querySelectorAll('.library-add')].find(b => b.getAttribute('aria-label') === `Добавить: ${name}`);
  assert.ok(button, `в библиотеке нет кнопки «Добавить: ${name}»`);
  button.click();
}

// Собрать: вход → сборка → библиотека → добавить → обратно на сборку.
function assemble(root, names) {
  startManual(root);
  openLibrary(root);
  for (const name of names) addFromLibrary(root, name);
  back(root);
}

const rows = root => [...root.querySelectorAll('.builder-item-name')].map(n => n.textContent);
const coverage = root => [...root.querySelectorAll('.builder-coverage p')].map(p => p.textContent);
const reasons = root => [...root.querySelectorAll('.builder-reason')].filter(p => !p.hidden).map(p => p.textContent);
const errorOf = root => root.querySelector('.builder-error');
const pressedDays = root => [...root.querySelectorAll('.day-chip[aria-pressed="true"]')].map(c => c.textContent);
const dayChip = (root, label) => [...root.querySelectorAll('.day-chip')].find(c => c.textContent === label);

function typeName(root, text) {
  const input = root.querySelector('.save-name');
  input.value = text;
  input.dispatchEvent(new input.ownerDocument.defaultView.Event('input', { bubbles: true }));
}

const rowOf = (root, name) => [...root.querySelectorAll('.builder-item')]
  .find(row => row.querySelector('.builder-item-name').textContent === name);

// Нажимает «Заменить» у первой строки блока с этим заголовком.
function openReplace(root, blockTitle) {
  const block = [...root.querySelectorAll('.builder-block')].find(b => b.querySelector('h3').textContent === blockTitle);
  block.querySelector('.builder-replace').click();
  return root.querySelector('.replace-sheet');
}

// Генератор: второй путь на входе, выбор уровня и зон, результат.
const startGenerator = root => root.querySelectorAll('.builder-path')[1].click();
const generateNow = root => root.querySelector('.builder-generate').click();
const otherVariant = root => root.querySelector('.builder-variant').click();
const levelOption = (root, label) => [...root.querySelectorAll('.level-option')]
  .find(option => option.querySelector('.level-title').textContent === label);
// Чипы зон. У переключателей инвентаря, блоков и формата тот же класс .zone-chip
// (внешний вид у них общий), поэтому зоны отличаются отсутствием .gear-chip,
// .block-chip и .format-chip.
const zoneChips = root => [...root.querySelectorAll('.zone-chip:not(.gear-chip):not(.block-chip):not(.format-chip)')];
const zoneChip = (root, label) => zoneChips(root).find(chip => chip.textContent === label);
const pressedZones = root => zoneChips(root).filter(chip => chip.getAttribute('aria-pressed') === 'true').map(chip => chip.textContent);
const checkedLevels = root => [...root.querySelectorAll('.level-option[aria-checked="true"]')]
  .map(option => option.querySelector('.level-title').textContent);
const tagsIn = (row, className) => [...row.querySelectorAll(`.${className}`)].map(tag => tag.textContent);
// Зерно, которое каждый раз новое: «Другой вариант» без него вернул бы ту же тренировку.
const counter = () => {
  let n = 0;
  return () => { n += 1; return n; };
};

// Нажимает «Заменить» у упражнения и выбирает кандидата по ключам тестовой библиотеки.
function replaceWith(root, fromKey, toKey) {
  rowOf(root, nameOf(fromKey, TEST_LIBRARY)).querySelector('.builder-replace').click();
  const candidate = [...root.querySelectorAll('.replace-candidate')]
    .find(item => item.querySelector('.replace-name').textContent === nameOf(toKey, TEST_LIBRARY));
  assert.ok(candidate, `среди кандидатов нет «${toKey}»`);
  candidate.querySelector('.replace-pick').click();
}

test('вход: «Собрать самому» и устройство тренировки; нет слов «ИИ», «персональный», «тренер»', t => {
  const { document, root } = mount(t);
  openBuilder(document);

  assert.equal(root.querySelector('h2').textContent, 'Конструктор');
  assert.equal(root.querySelector('.builder-lead').textContent,
    'Тренировка всегда на всё тело. Собери её сам из библиотеки или получи готовую по правилам, а потом сохрани.');

  const [manual] = root.querySelectorAll('.builder-path');
  assert.equal(manual.querySelector('.builder-path-title').textContent, 'Собрать самому');
  assert.equal(manual.querySelector('.builder-path-note').textContent,
    'Листай библиотеку упражнений, добавляй нужные и сохрани тренировку.');

  assert.equal(root.querySelector('.builder-steps-title').textContent, 'Из чего обычно состоит тренировка');
  const steps = [...root.querySelectorAll('.builder-steps li')]
    .map(li => [li.querySelector('strong').textContent, li.querySelector('span').textContent]);
  assert.deepEqual(steps, [
    ['Разминка', 'Плавно, без длительных остановок'],
    ['Круговой разогрев', 'Повышает пульс, резинки лёгкие'],
    ['Силовая часть', 'Парами, кругом или подходами — на выбор'],
    ['Завершение', '2–3 минуты в спокойном темпе, дыхание'],
  ]);

  assert.doesNotMatch(root.textContent, /(^|[^а-яё])ИИ([^а-яё]|$)|персональн|тренер/i);
});

test('ручная сборка: разминка, разогрев и завершение заполнены сразу, предупреждение называет все 17 групп', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  startManual(root);

  assert.equal(root.querySelector('h2').textContent, 'Своя тренировка');
  const blocks = [...root.querySelectorAll('.builder-block')];
  assert.deepEqual(blocks.map(b => b.querySelector('h3').textContent),
    ['Стартовая разминка', 'Круговой разогрев', 'Завершение']);

  // Скелет берёт из библиотеки «сколько есть, но не больше»: в каждом блоке
  // разные упражнения своего типа, и их столько, сколько позволяют оба.
  const namesOf = block => [...block.querySelectorAll('.builder-item-name')].map(n => n.textContent);
  const library = slot => LIBRARY.filter(e => e.slot === slot).map(e => e.name);
  const slots = ['warmup', 'circuit', 'cooldown'];
  blocks.forEach((block, i) => {
    const names = namesOf(block);
    const slot = slots[i];
    assert.equal(names.length, Math.min(SKELETON[slot].count, library(slot).length), `сколько упражнений в «${slot}»`);
    assert.equal(new Set(names).size, names.length, `без повторов в «${slot}»`);
    assert.ok(names.every(name => library(slot).includes(name)), `в «${slot}» только упражнения своего типа`);
  });

  assert.equal(root.querySelectorAll('.builder-replace').length,
    slots.reduce((sum, slot) => sum + Math.min(SKELETON[slot].count, library(slot).length), 0));
  assert.equal(root.querySelectorAll('.builder-remove').length, 0);

  assert.equal(root.querySelector('.builder-coverage').getAttribute('role'), 'status');
  assert.deepEqual(coverage(root), [
    'Тренировка пока не на всё тело',
    `Без нагрузки: ${groupsPhrase(CORE_GROUPS)}.`,
    'Считаются только силовые упражнения. Сохранить можно и так.',
  ]);
});

test('добавление из библиотеки пересчитывает «Без нагрузки», убрать — возвращает группу', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  startManual(root);
  const save = () => root.querySelector('.builder-save');
  assert.equal(save().disabled, true, 'без силовых сохранять нечего');
  assert.deepEqual(reasons(root), ['Добавь хотя бы одно силовое упражнение.']);

  openLibrary(root);
  assert.ok(root.querySelector('.library'), 'кнопка ведёт на экран библиотеки');
  addFromLibrary(root, nameOf('glute-bridge'));
  back(root);

  assert.ok(root.querySelector('.builder-coverage'), 'вернулись на сборку');
  assert.ok(rows(root).includes(nameOf('glute-bridge')));
  assert.ok([...root.querySelectorAll('.builder-block h3')].some(h => h.textContent === 'Пара 1'),
    'силовое упражнение стоит в паре');
  assert.equal(coverage(root)[1], `Без нагрузки: ${groupsPhrase(CORE_GROUPS.filter(g => g !== 'glutes'))}.`);
  assert.equal(save().disabled, false);
  assert.deepEqual(reasons(root), []);

  root.querySelector('.builder-remove').click();
  assert.equal(rows(root).includes(nameOf('glute-bridge')), false);
  assert.equal(coverage(root)[1], `Без нагрузки: ${groupsPhrase(CORE_GROUPS)}.`);
  assert.equal(save().disabled, true);
});

test('закрыты все группы — «Все основные группы получают нагрузку»', t => {
  const { document, root } = mount(t, { library: TEST_LIBRARY });
  openBuilder(document);
  startManual(root);
  openLibrary(root);
  const nameFor = key => nameOf(key, TEST_LIBRARY);
  // Девять упражнений закрывают все 17 групп: шесть многосуставных, пресс, икры
  // и бицепс — две последние группы многосуставные не задевают целиком.
  const keys = ['squat-a', 'hinge-a', 'lunge-a', 'row-a', 'press-a', 'overhead-a', 'crunch-a', 'calves-1'];
  for (const key of keys) addFromLibrary(root, nameFor(key));
  back(root);
  assert.equal(coverage(root)[1], `Без нагрузки: ${groupsPhrase(['biceps'])}.`);

  openLibrary(root);
  addFromLibrary(root, nameFor('biceps-1'));
  back(root);
  assert.deepEqual(coverage(root), ['Все основные группы получают нагрузку']);
  assert.equal(root.querySelector('.builder-coverage').textContent, 'Все основные группы получают нагрузку');
});

test('замена разминки: кандидаты того же типа; нечем заменить — «Похожих упражнений больше нет»', t => {
  const { document, root } = mount(t, { library: TEST_LIBRARY });
  openBuilder(document);
  startManual(root);

  // По одному заведомо свободному кандидату на тип: в тестовой библиотеке трёх
  // разминок скелет берёт две, пяти разогревов четыре, четырёх завершений три.
  for (const [title, slot, hint] of [
    ['Стартовая разминка', 'warmup', 'Того же типа'],
    ['Круговой разогрев', 'circuit', 'Того же типа'],
    ['Завершение', 'cooldown', 'Того же типа'],
  ]) {
    const block = [...root.querySelectorAll('.builder-block')].find(b => b.querySelector('h3').textContent === title);
    const inBlock = [...block.querySelectorAll('.builder-item-name')].map(n => n.textContent);
    const sheet = openReplace(root, title);
    assert.equal(sheet.getAttribute('role'), 'dialog');
    assert.equal(sheet.querySelector('h3').textContent, 'Заменить упражнение');
    assert.equal(sheet.querySelector('.replace-current').textContent, inBlock[0]);
    assert.equal(sheet.querySelector('.replace-hint').textContent, hint);

    const free = TEST_LIBRARY.filter(e => e.slot === slot && !rows(root).includes(e.name));
    const candidates = [...sheet.querySelectorAll('.replace-candidate')];
    assert.deepEqual(candidates.map(c => c.querySelector('.replace-name').textContent), free.map(e => e.name),
      `кандидаты на замену в «${title}» — только упражнения своего типа`);
    assert.equal(candidates[0].querySelector('.replace-muscles').textContent, 'Заглушка');
    assert.equal(candidates[0].querySelector('.replace-gear').textContent, 'без инвентаря');
    sheet.querySelector('.replace-close').click();
  }

  // Выбор: упражнение стало другим, прежнего в тренировке больше нет, а в
  // кандидатах оно теперь есть.
  const before = rows(root);
  const sheet = openReplace(root, 'Стартовая разминка');
  const current = sheet.querySelector('.replace-current').textContent;
  const [pick] = sheet.querySelectorAll('.replace-candidate');
  const picked = pick.querySelector('.replace-name').textContent;
  pick.querySelector('.replace-pick').click();
  assert.equal(root.querySelector('.replace-sheet'), null, 'после выбора шторка закрыта');
  assert.equal(rows(root).includes(current), false);
  assert.deepEqual(rows(root).sort(), before.map(name => (name === current ? picked : name)).sort());
  const again = openReplace(root, 'Стартовая разминка');
  assert.ok([...again.querySelectorAll('.replace-name')].some(n => n.textContent === current),
    'заменённое упражнение снова свободно');

  // Разминок ровно столько, сколько берёт скелет: все уже в тренировке.
  const warmups = TEST_LIBRARY.filter(e => e.slot === 'warmup').slice(0, SKELETON.warmup.count);
  const tight = mount(t, { library: TEST_LIBRARY.filter(e => e.slot !== 'warmup' || warmups.includes(e)) });
  openBuilder(tight.document);
  startManual(tight.root);
  const empty = openReplace(tight.root, 'Стартовая разминка');
  assert.equal(empty.querySelector('.replace-empty').textContent,
    'Похожих упражнений больше нет: все подходящие уже в тренировке.');
  assert.equal(empty.querySelectorAll('.replace-pick').length, 0);
});

test('шторка замены закрывается крестиком, Escape и нажатием на фон; тренировка при этом не меняется', t => {
  const { document, root } = mount(t, { library: TEST_LIBRARY });
  openBuilder(document);
  startManual(root);
  const before = rows(root);

  const sheet = openReplace(root, 'Стартовая разминка');
  assert.equal(sheet.getAttribute('aria-modal'), 'true');
  assert.ok(sheet.contains(document.activeElement), 'фокус внутри шторки');
  sheet.querySelector('.replace-close').click();
  assert.equal(root.querySelector('.replace-sheet'), null);

  openReplace(root, 'Круговой разогрев');
  root.querySelector('.replace-sheet').dispatchEvent(
    new document.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(root.querySelector('.replace-sheet'), null);

  openReplace(root, 'Завершение');
  root.querySelector('.replace-backdrop').click();
  assert.equal(root.querySelector('.replace-sheet'), null);
  assert.equal(root.querySelector('.replace-backdrop'), null);

  assert.deepEqual(rows(root), before);
});

test('экран сохранения: название по умолчанию, дни пн, ср, пт и строка «Что сохранится»', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);

  assert.equal(root.querySelector('h2').textContent, 'Сохранение');
  assert.equal(root.querySelector('.save-name').value, 'Всё тело');
  assert.deepEqual([...root.querySelectorAll('.day-chip')].map(c => c.textContent),
    ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']);
  assert.deepEqual(pressedDays(root), ['пн', 'ср', 'пт']);
  const count = 10;
  assert.equal(root.querySelector('.builder-summary').textContent,
    `Что сохранится: ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}, своя сборка`);
  assert.equal(root.querySelector('.builder-save').textContent, 'Сохранить тренировку');
});

test('пустое или из пробелов название — сохранить нельзя, причина на экране', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  const save = () => root.querySelector('.builder-save');

  typeName(root, '');
  assert.equal(save().disabled, true);
  assert.deepEqual(reasons(root), ['Введи название, чтобы сохранить.']);

  typeName(root, '   ');
  assert.equal(save().disabled, true, 'пробелы — это пусто');
  assert.deepEqual(reasons(root), ['Введи название, чтобы сохранить.']);

  typeName(root, 'Ноги');
  assert.equal(save().disabled, false);
  assert.deepEqual(reasons(root), []);
});

test('название длиннее 60 не вводится: у поля maxlength 60', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);

  assert.equal(NAME_MAX, 60);
  assert.equal(root.querySelector('.save-name').getAttribute('maxlength'), '60');

  // Поле ограничивает ввод пальцем, но не значение, поставленное программно, и
  // запись длиннее шестидесяти хранилище не примет: экран не даёт отправить её.
  typeName(root, 'я'.repeat(NAME_MAX + 1));
  assert.equal(root.querySelector('.builder-save').disabled, true);
  assert.deepEqual(reasons(root), ['Название не длиннее 60 знаков.']);
  typeName(root, 'я'.repeat(NAME_MAX));
  assert.equal(root.querySelector('.builder-save').disabled, false);
});

test('без дней — нельзя; один день — предупреждение, но можно', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  const warning = 'Один день в неделю — мало: каждую группу лучше нагружать хотя бы дважды в неделю.';
  const save = () => root.querySelector('.builder-save');
  const status = () => root.querySelector('.builder-coverage').textContent;

  assert.doesNotMatch(status(), /Один день/, 'три дня — предупреждения нет');

  dayChip(root, 'ср').click();
  assert.equal(dayChip(root, 'ср').getAttribute('aria-pressed'), 'false');
  assert.doesNotMatch(status(), /Один день/, 'два дня — ещё не мало');

  dayChip(root, 'пт').click();
  assert.deepEqual(pressedDays(root), ['пн']);
  assert.match(status(), new RegExp(warning));
  assert.equal(save().disabled, false, 'один день — предупреждение, а не запрет');

  dayChip(root, 'пн').click();
  assert.deepEqual(pressedDays(root), []);
  assert.equal(save().disabled, true);
  assert.deepEqual(reasons(root), ['Выбери хотя бы один день.']);
  assert.doesNotMatch(status(), /Один день/);
  assert.doesNotMatch(status(), /Без нагрузки/, 'без дней нагрузка не считается: причина — в кнопке');

  dayChip(root, 'сб').click();
  assert.deepEqual(pressedDays(root), ['сб']);
  assert.equal(save().disabled, false);
});

test('сохранённая появляется в «Мои» с отметкой «Тренировка сохранена» и открывается в «Сегодня»', async t => {
  const { window, document, app, root } = mount(t);
  await settle(0);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge'), nameOf('rdl')]);
  toSave(root);
  typeName(root, 'Ягодицы и спина');
  dayChip(root, 'вт').click();
  root.querySelector('.builder-save').click();
  await settle(0);

  assert.deepEqual(shown(document), ['screen-workouts']);
  const note = document.querySelector('#screen-workouts .workouts-saved');
  assert.ok(note, 'над списком есть пометка о сохранении');
  assert.equal(note.textContent, 'Тренировка сохранена');
  const cards = [...document.querySelectorAll('#screen-workouts .workout-card')];
  const card = cards.find(c => c.querySelector('.workout-card-title').textContent === 'Ягодицы и спина');
  assert.ok(card, 'в «Мои» есть новая тренировка');

  const [{ id, compact }] = await app.store.list();
  assert.deepEqual(compact.days, [1, 2, 3, 5]);
  assert.equal(compact.level, null);
  assert.deepEqual(compact.strength.sort(), ['glute-bridge', 'rdl']);
  assert.match(id, /^my-[a-z0-9]{8}$/);

  assert.equal(root.querySelector('.builder-path') !== null, true, 'конструктор вернулся на вход');
  openBuilder(document);
  startManual(root);
  assert.equal(root.querySelector('.builder-remove'), null, 'черновик сброшен: силовых нет');

  openWorkouts(document);
  assert.equal(document.querySelector('#screen-workouts .workouts-saved'), null, 'плашка показывается один раз');
  [...document.querySelectorAll('#screen-workouts .workout-card')]
    .find(c => c.querySelector('.workout-card-title').textContent === 'Ягодицы и спина').click();
  assert.deepEqual(shown(document), ['screen-today']);
  assert.equal(document.querySelector('h1').textContent, 'Ягодицы и спина');
  assert.equal(window.localStorage.getItem(CURRENT_KEY), id);
});

test('название с кавычками и эмодзи сохраняется как есть', async t => {
  const { document, app, root } = mount(t);
  await settle(0);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, '  «Ноги» "быстро" 🍑 & <b>  ');
  root.querySelector('.builder-save').click();
  await settle(0);

  const [{ compact }] = await app.store.list();
  assert.equal(compact.name, '«Ноги» "быстро" 🍑 & <b>', 'внутри — как есть, пробелы по краям — не название');
  const card = document.querySelector('#screen-workouts .workout-card-title');
  assert.equal(card.textContent, '«Ноги» "быстро" 🍑 & <b>');
});

test('пятьдесят первую сохранить нельзя — экран говорит почему', async t => {
  const preload = {};
  for (let i = 1; i <= OWN_LIMIT; i += 1) {
    Object.assign(preload, onDevice(`my-lim${String(i).padStart(5, '0')}`, { ...OWN, name: `Тренировка ${i}`, t: OWN.t + i }));
  }
  const { document, app, root } = mount(t, { preload });
  await settle(0);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, 'Пятьдесят первая');
  root.querySelector('.builder-save').click();
  await settle(0);

  assert.equal(errorOf(root).hidden, false);
  assert.equal(errorOf(root).getAttribute('role'), 'alert');
  assert.equal(errorOf(root).textContent,
    'Сохранить нельзя: уже 50 своих тренировок. Удали ненужную в разделе «Тренировки».');
  assert.equal(root.querySelector('.save-name').value, 'Пятьдесят первая', 'черновик остался');
  assert.deepEqual(shown(document), ['screen-builder']);
  assert.equal((await app.store.list()).length, OWN_LIMIT);
});

test('не удалось записать никуда — сообщение, черновик остаётся на экране', async t => {
  // localStorage бросает, облака нет: сохранять некуда.
  const { document, root } = mount(t, { denyStorage: true });
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, 'Некуда');
  root.querySelector('.builder-save').click();
  await settle(0);

  assert.ok(errorOf(root), 'экран сохранения остался, и на нём есть сообщение об ошибке');
  assert.equal(errorOf(root).hidden, false);
  assert.equal(errorOf(root).textContent,
    'Не удалось сохранить: хранилище недоступно. Тренировка осталась здесь — попробуй ещё раз.');
  assert.equal(root.querySelector('.save-name').value, 'Некуда');
  assert.equal(root.querySelector('.builder-save').disabled, false, 'попробовать ещё раз можно');
  assert.deepEqual(shown(document), ['screen-builder']);
  assert.equal(document.querySelector('.workouts-saved'), null);
});

test('повторное «Сохранить тренировку», пока идёт сохранение, не запускает второе', async t => {
  const calls = [];
  let release;
  const store = {
    save(id, compact) {
      calls.push({ id, compact });
      return new Promise(resolve => { release = resolve; });
    },
  };
  const { root, saved } = mountScreen(t, { store });
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);

  const button = root.querySelector('.builder-save');
  button.click();
  button.click();
  assert.equal(calls.length, 1);
  assert.equal(button.disabled, true, 'на время запроса кнопка недоступна');
  assert.equal(root.querySelector('.builder-back').disabled, true, 'уйти с экрана посреди сохранения нельзя');

  release({ ok: false, reason: 'device' });
  await settle(0);
  assert.equal(calls.length, 1);
  assert.equal(root.querySelector('.builder-save').disabled, false, 'черновик остался — кнопка снова доступна');
  assert.equal(root.querySelector('.builder-back').disabled, false);
  assert.equal(saved.length, 0);

  // Та же тренировка под тем же id: повтор после отказа не плодит записей.
  root.querySelector('.builder-save').click();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].id, calls[0].id);
  release({ ok: true, localOnly: true });
  await settle(0);
  assert.equal(saved.length, 1);
  assert.equal(saved[0][0], calls[0].id);
  assert.deepEqual(saved[0][2], { localOnly: true });
});

test('сохранение, которое реджектится, не оставляет кнопку зависшей: сообщение и черновик на месте', async t => {
  const store = { async save() { throw new Error('Тренировка не прошла проверку формата'); } };
  const { root, saved } = mountScreen(t, { store });
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, 'Не примут');
  root.querySelector('.builder-save').click();
  await settle(0);

  assert.equal(errorOf(root).textContent,
    'Не удалось сохранить: хранилище недоступно. Тренировка осталась здесь — попробуй ещё раз.');
  assert.equal(root.querySelector('.builder-save').disabled, false);
  assert.equal(root.querySelector('.save-name').value, 'Не примут');
  assert.equal(saved.length, 0);
});

// Облако отвечает до пяти секунд, и за это время человек успевает нажать «Изменить»
// у другой тренировки. Ответ первой сохраняет её и больше ничего не трогает.
test('«Изменить» у другой тренировки, пока идёт сохранение: ответ не сбрасывает новый черновик', async t => {
  let release;
  const store = { save: () => new Promise(resolve => { release = resolve; }) };
  const { root, saved, view } = mountScreen(t, { store });
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, 'Первая');
  root.querySelector('.builder-save').click();

  assert.equal(await view.edit('my-other001', { ...OWN, name: 'Вторая' }), true);
  release({ ok: true, localOnly: false });
  await settle(0);

  assert.equal(root.querySelector('.builder-path'), null, 'сборка не сброшена на вход');
  assert.equal(root.querySelector('h2').textContent, 'Своя тренировка');
  assert.equal(rows(root).length, exerciseCount(OWN), 'на экране упражнения второй тренировки');
  assert.equal(saved.length, 1, 'первая при этом сохранена');
});

test('сохранение одной тренировки не блокирует «Сохранить» у другой, открытой поверх', async t => {
  const calls = [];
  const releases = [];
  const store = {
    save(id) {
      calls.push(id);
      return new Promise(resolve => releases.push(resolve));
    },
  };
  const { root, saved, view } = mountScreen(t, { store });
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, 'Первая');
  root.querySelector('.builder-save').click();
  await view.edit('my-other001', { ...OWN, name: 'Вторая' });
  toSave(root);

  assert.equal(root.querySelector('.builder-save').disabled, false, 'ответ первой ещё не пришёл, но это другая тренировка');
  assert.equal(root.querySelector('.builder-back').disabled, false);
  releases[0]({ ok: true, localOnly: false });
  await settle(0);
  assert.equal(root.querySelector('h2').textContent, 'Сохранение', 'экран второй остался на месте');

  root.querySelector('.builder-save').click();
  releases[1]({ ok: true, localOnly: false });
  await settle(0);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], 'my-other001');
  assert.deepEqual(saved.map(([id]) => id), calls, 'каждая сохранена под своим id');
  assert.equal(root.querySelector('h2').textContent, 'Конструктор', 'после сохранения второй — вход');
});

test('«Изменить» открывает копию: сохранённая запись не делит массивы с переданной', async t => {
  const store = { save: async () => ({ ok: true, localOnly: false }) };
  const { root, saved, view } = mountScreen(t, { store });
  const given = { ...OWN, zones: ['glutes'], focus: [['rdl', 'glutes']] };
  const before = JSON.parse(JSON.stringify(given));
  await view.edit(OWN_ID, given);
  toSave(root);
  root.querySelector('.builder-save').click();
  await settle(0);

  const [, result] = saved[0];
  // У записи, переданной без format, формат читается как «Пары» и сохраняется.
  assert.deepEqual(result, { ...before, format: 'pairs', t: result.t }, 'содержимое то же, формат дописан');
  assert.deepEqual(given, before, 'переданная запись не изменилась');
  for (const field of ['zones', 'warmup', 'circuit', 'strength', 'cooldown']) {
    assert.notEqual(result[field], given[field], `${field}: свой массив`);
  }
  assert.notEqual(result.focus[0], given.focus[0], 'пара упора тоже своя');
});

test('«Изменить» у собранной руками открывает сборку с её упражнениями; сохранение перезаписывает', async t => {
  const { document, app, root } = mount(t, { preload: onDevice() });
  await settle(0);
  openWorkouts(document);
  const item = document.querySelector('#screen-workouts .workout-item');
  const edit = item.querySelector('.workout-edit');
  assert.equal(edit.textContent, 'Изменить');
  assert.equal(edit.getAttribute('aria-label'), `Изменить: ${OWN.name}`);
  edit.click();
  await settle(0);

  assert.deepEqual(shown(document), ['screen-builder']);
  assert.equal(root.querySelector('h2').textContent, 'Своя тренировка');
  assert.deepEqual(rows(root).sort(), [...OWN.warmup, ...OWN.circuit, ...OWN.strength, ...OWN.cooldown].map(key => nameOf(key)).sort());

  rowOf(root, nameOf('leg-press')).querySelector('.builder-remove').click();
  toSave(root);
  assert.equal(root.querySelector('.save-name').value, OWN.name, 'название — прежнее');
  assert.deepEqual(pressedDays(root), ['вт', 'чт'], 'дни — прежние');
  typeName(root, 'Мой тест, правка');
  dayChip(root, 'пт').click();

  // Пока не сохранено, правка — только черновик: список своих и запись на
  // устройстве остаются прежними.
  openWorkouts(document);
  assert.equal(document.querySelector('#screen-workouts .workout-card-title').textContent, OWN.name);
  assert.equal(app.store.peek(OWN_ID).strength.length, 4);
  openBuilder(document);
  root.querySelector('.builder-save').click();
  await settle(0);

  const list = await app.store.list();
  assert.equal(list.length, 1, 'это та же тренировка, а не вторая');
  assert.equal(list[0].id, OWN_ID);
  assert.equal(list[0].compact.name, 'Мой тест, правка');
  assert.deepEqual(list[0].compact.strength, ['rdl', 'adduction', 'glute-bridge']);
  assert.deepEqual(list[0].compact.days, [2, 4, 5]);
  assert.ok(list[0].compact.t > OWN.t, 'время сборки обновлено');
  assert.deepEqual(shown(document), ['screen-workouts']);
  assert.equal(document.querySelectorAll('#screen-workouts .workout-item').length, 1);
});

test('сохранённая раньше, чем пришёл список своих, не пропадает, когда он приходит', async t => {
  const data = { [recordKey(OWN_ID)]: serializeCompact(OWN) };
  const answers = [];
  const cloud = {
    getItem: (key, done) => done(null, data[key] ?? ''),
    setItem: (key, value, done) => { data[key] = value; done(null, true); },
    removeItem: (key, done) => { delete data[key]; done(null, true); },
    removeItems: (keys, done) => done(null, true),
    getItems: (keys, done) => done(null, Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]]))),
    // Список ключей снят до сохранения, а приходит после: так отвечает облако,
    // которое занято. Ответ задерживается, пока тест не отпустит его сам.
    getKeys(done) {
      const keys = Object.keys(data);
      answers.push(() => done(null, keys));
    },
  };
  const webApp = fakeWebApp();
  webApp.CloudStorage = cloud;
  const { document, root } = mount(t, { webApp, preload: onDevice() });
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, 'Ранняя');
  root.querySelector('.builder-save').click();
  await settle(0);
  assert.deepEqual(shown(document), ['screen-workouts']);

  for (const answer of answers) answer();
  await settle(10);
  const titles = [...document.querySelectorAll('#screen-workouts .workout-item .workout-card-title')].map(n => n.textContent);
  assert.deepEqual(titles, ['Ранняя', OWN.name], 'в «Мои» обе, новая сверху');
});

test('сохранение правки текущей тренировки перерисовывает «Сегодня»', async t => {
  const { document, root } = mount(t, { preload: { ...onDevice(), [CURRENT_KEY]: OWN_ID } });
  await settle(0);
  assert.equal(document.querySelector('h1').textContent, OWN.name);
  assert.equal(document.querySelectorAll('#workout .exercise').length, exerciseCount(OWN));

  openWorkouts(document);
  document.querySelector('#screen-workouts .workout-edit').click();
  rowOf(root, nameOf('leg-press')).querySelector('.builder-remove').click();
  toSave(root);
  typeName(root, 'Другое имя');
  root.querySelector('.builder-save').click();
  await settle(0);

  document.querySelector('[data-section="today"]').click();
  assert.equal(document.querySelector('h1').textContent, 'Другое имя');
  assert.equal(document.querySelectorAll('#workout .exercise').length, exerciseCount(OWN) - 1);
});

test('силовых не больше девяти пар: «Добавить» недоступна и причина названа, убрать — снова можно', t => {
  const { document, root } = mount(t, { library: TEST_LIBRARY });
  openBuilder(document);
  startManual(root);
  openLibrary(root);
  const strength = TEST_LIBRARY.filter(e => e.slot === 'strength').slice(0, MAX_STRENGTH);
  const reason = 'Не больше 9 силовых пар — убери упражнение, чтобы добавить другое.';

  for (const entry of strength.slice(0, MAX_STRENGTH - 1)) addFromLibrary(root, entry.name);
  assert.equal(root.querySelector('.library-blocked'), null, 'на семнадцатом ещё можно');
  addFromLibrary(root, strength.at(-1).name);
  const blocked = root.querySelector('.library-blocked');
  assert.ok(blocked, 'на девятой паре библиотека объясняет, почему добавить нельзя');
  assert.equal(blocked.textContent, reason);
  assert.ok([...root.querySelectorAll('.library-add')].every(button => button.disabled));
  back(root);

  assert.equal(root.querySelector('.builder-add').disabled, true);
  assert.deepEqual(reasons(root), [reason]);
  assert.equal(root.querySelectorAll('.builder-remove').length, MAX_STRENGTH);

  root.querySelector('.builder-remove').click();
  assert.equal(root.querySelector('.builder-add').disabled, false);
  assert.deepEqual(reasons(root), []);
});

test('«Назад» со сборки: без изменений уходит сразу, с изменениями спрашивает и при отказе остаётся', async t => {
  const webApp = fakeWebApp();
  const { document, root } = mount(t, { webApp });
  openBuilder(document);

  startManual(root);
  back(root);
  assert.ok(root.querySelector('.builder-path'), 'ничего не менялось — вопроса нет');
  assert.equal(webApp.confirms.length, 0);

  assemble(root, [nameOf('glute-bridge')]);
  back(root);
  assert.equal(webApp.confirms.length, 1);
  assert.equal(webApp.confirms[0].message, 'Бросить тренировку? Несохранённые изменения пропадут.');
  webApp.confirms[0].answer(false);
  await settle(0);
  assert.ok(rows(root).includes(nameOf('glute-bridge')), 'отказ — сборка на месте');

  back(root);
  webApp.confirms[1].answer(true);
  await settle(0);
  assert.ok(root.querySelector('.builder-path'));
  startManual(root);
  assert.equal(rows(root).includes(nameOf('glute-bridge')), false, 'черновик брошен');
});

test('«Назад» с сохранения возвращает на сборку, название и дни остаются в черновике', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);
  toSave(root);
  typeName(root, 'Моё название');
  dayChip(root, 'вт').click();
  back(root);

  assert.ok(root.querySelector('.builder-coverage'), 'это сборка');
  assert.ok(rows(root).includes(nameOf('glute-bridge')));
  toSave(root);
  assert.equal(root.querySelector('.save-name').value, 'Моё название');
  assert.deepEqual(pressedDays(root), ['пн', 'вт', 'ср', 'пт']);
});

test('«Изменить» при начатой сборке спрашивает: отказ оставляет сборку, согласие открывает правку', async t => {
  const webApp = fakeWebApp();
  const { document, root } = mount(t, { webApp, preload: onDevice() });
  await settle(0);
  openBuilder(document);
  assemble(root, [nameOf('glute-bridge')]);

  openWorkouts(document);
  document.querySelector('#screen-workouts .workout-edit').click();
  assert.equal(webApp.confirms.length, 1);
  assert.equal(webApp.confirms[0].message, 'Бросить тренировку? Несохранённые изменения пропадут.');
  webApp.confirms[0].answer(false);
  await settle(0);
  assert.deepEqual(shown(document), ['screen-workouts'], 'отказ — остаёмся в «Тренировках»');
  openBuilder(document);
  assert.ok(rows(root).includes(nameOf('glute-bridge')) && !rows(root).includes(nameOf('leg-press')), 'начатая сборка цела');

  openWorkouts(document);
  document.querySelector('#screen-workouts .workout-edit').click();
  webApp.confirms[1].answer(true);
  await settle(0);
  assert.deepEqual(shown(document), ['screen-builder']);
  assert.ok(rows(root).includes(nameOf('leg-press')), 'открыта правка своей тренировки');
  assert.equal(rows(root).length, exerciseCount(OWN));
});

test('у подобранной по правилам на сохранении — уровень и граница уровня при выбранных днях', async t => {
  const result = generate({ level: 'beginner', zones: [], seed: 7, library: TEST_LIBRARY, now: () => OWN.t });
  assert.equal(result.ok, true);
  const generated = result.compact;
  const { document, app, root } = mount(t, { library: TEST_LIBRARY, preload: onDevice('my-gen00001', generated) });
  await settle(0);
  openWorkouts(document);
  document.querySelector('#screen-workouts .workout-edit').click();
  toSave(root);

  const count = exerciseCount(generated);
  assert.equal(root.querySelector('.builder-summary').textContent,
    `Что сохранится: ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}, начальный уровень`);
  assert.deepEqual([...root.querySelectorAll('.builder-coverage p')].map(p => p.textContent),
    ['Все основные группы не ниже границы уровня.'], 'на трёх днях подобранная держит границу');

  dayChip(root, 'ср').click();
  dayChip(root, 'пт').click();
  assert.deepEqual(coverage(root).slice(0, 1),
    [`Ниже границы уровня при этих днях: ${groupsPhrase(CORE_GROUPS)}.`],
    'на одном дне ни одна группа не дотягивает до пяти подходов');
  assert.match(root.querySelector('.builder-coverage').textContent, /Один день в неделю — мало/);

  dayChip(root, 'ср').click();
  dayChip(root, 'пт').click();
  assert.deepEqual(coverage(root), ['Все основные группы не ниже границы уровня.']);

  // Уровень в записи сохраняется: правка не превращает подобранную в ручную.
  root.querySelector('.builder-save').click();
  await settle(0);
  assert.equal(app.store.peek('my-gen00001').level, 'beginner');
});

test('выбранная замена попадает в сохранённую запись под своим ключом', async t => {
  const { document, app, root } = mount(t, { library: TEST_LIBRARY });
  openBuilder(document);
  assemble(root, [nameOf('squat-a', TEST_LIBRARY)]);
  const [candidate] = openReplace(root, 'Стартовая разминка').querySelectorAll('.replace-candidate');
  const picked = TEST_LIBRARY.find(e => e.name === candidate.querySelector('.replace-name').textContent);
  candidate.querySelector('.replace-pick').click();
  toSave(root);
  root.querySelector('.builder-save').click();
  await settle(0);

  const [{ compact }] = await app.store.list();
  assert.ok(compact.warmup.includes(picked.key), 'в записи — ключ выбранного упражнения');
  assert.equal(compact.warmup.length, 2, 'замена, а не добавление');
  assert.deepEqual(compact.strength, ['squat-a']);
});

test('на входе два пути: «Собрать самому» и «Сгенерировать»', t => {
  const { document, root } = mount(t);
  openBuilder(document);

  const paths = [...root.querySelectorAll('.builder-path')];
  assert.deepEqual(paths.map(path => path.querySelector('.builder-path-title').textContent),
    ['Собрать самому', 'Сгенерировать']);
  assert.equal(paths[1].querySelector('.builder-path-note').textContent,
    'Выбери уровень и зоны упора — упражнения подберутся по правилам.');

  paths[1].click();
  assert.equal(root.querySelector('h2').textContent, 'Генератор');
  assert.equal(root.querySelector('.builder-subtitle').textContent, 'Подбор упражнений по правилам');
  back(root);
  assert.equal(root.querySelectorAll('.builder-path').length, 2, 'с генератора «Назад» ведёт на вход');
});

// Что экран генератора обязан показать про уровни данной библиотеки. Ожидания
// выводятся из availability, а не из того, каких групп сейчас нет в таблице:
// владелец дополняет её, и набор не должен краснеть от того, что стало лучше.
// Недоступный уровень помечен и несёт причину, на которую указывает
// aria-describedby; доступный — без пометки и без причины; выбран первый из
// доступных, а если доступных нет, не выбран ни один.
function expectLevels(root, library) {
  const levels = Object.keys(LEVELS);
  const options = [...root.querySelectorAll('.level-option')];
  assert.deepEqual(options.map(option => option.querySelector('.level-title').textContent),
    ['Начальный', 'Средний', 'Продвинутый']);
  const missing = levels.map(level => availability(library, level).missing);
  levels.forEach((level, index) => {
    const option = options[index];
    assert.equal(option.getAttribute('role'), 'radio', level);
    if (missing[index].length === 0) {
      assert.equal(option.hasAttribute('aria-disabled'), false, `${level}: доступный уровень не помечен недоступным`);
      assert.equal(option.hasAttribute('aria-describedby'), false, `${level}: у доступного нет причины`);
      assert.equal(option.nextElementSibling, null, `${level}: под доступным причины нет`);
      return;
    }
    assert.equal(option.getAttribute('aria-disabled'), 'true', level);
    assert.equal(option.getAttribute('aria-checked'), 'false', level);
    const note = option.nextElementSibling;
    assert.equal(note.textContent, missingGroupsMessage(level, missing[index]), `${level}: причина стоит сразу под уровнем`);
    assert.equal(option.getAttribute('aria-describedby'), note.id, `${level}: причина привязана к уровню для диктора`);
  });
  const first = missing.findIndex(list => list.length === 0);
  assert.deepEqual(checkedLevels(root), first === -1 ? [] : [LEVELS[levels[first]].label]);
  return missing;
}

// Когда недоступны все уровни, выбирать нечего: уровень не выбирается, кнопка
// выключена, зоны выбрать нельзя.
function expectNothingSelectable(root) {
  root.querySelector('.level-option').click();
  assert.deepEqual(checkedLevels(root), [], 'недоступный уровень не выбирается');
  const generateButton = root.querySelector('.builder-generate');
  assert.equal(generateButton.disabled, true);
  generateButton.click();
  assert.equal(root.querySelector('h2').textContent, 'Генератор');
  assert.ok(zoneChips(root).every(chip => chip.getAttribute('aria-disabled') === 'true'),
    'без выбранного уровня зоны выбрать нельзя');
}

test('настоящая библиотека: уровни и причины на экране совпадают с availability', t => {
  const { document, root } = mount(t);
  openBuilder(document);
  startGenerator(root);

  const missing = expectLevels(root, LIBRARY);
  if (missing.every(list => list.length > 0)) expectNothingSelectable(root);
});

test('библиотека без упражнений на бицепс: все уровни недоступны и называют причину', t => {
  const library = withoutTargets(['biceps']);
  const { root } = mountScreen(t, { library });
  startGenerator(root);

  // Условие теста: недоступны именно все три уровня, и по одной и той же группе.
  assert.deepEqual(Object.keys(LEVELS).map(level => availability(library, level).missing), [['biceps'], ['biceps'], ['biceps']]);
  expectLevels(root, library);
  assert.deepEqual([...root.querySelectorAll('.level-missing')].map(note => note.textContent), [
    'Для начального уровня в библиотеке пока нет базовых упражнений на: бицепс.',
    'Для среднего уровня в библиотеке пока нет базовых и средних упражнений на: бицепс.',
    'Для продвинутого уровня в библиотеке пока нет упражнений на: бицепс.',
  ]);
  expectNothingSelectable(root);
});

test('недоступен только начальный уровень: причина у него одного, выбран первый из доступных', t => {
  // Базовых упражнений на икроножные нет, средние и сложные есть: у начального
  // пула группы нет, у остальных есть.
  const library = TEST_LIBRARY.filter(entry => !['calves-1', 'calves-2'].includes(entry.key));
  const { root } = mountScreen(t, { library });
  startGenerator(root);

  assert.deepEqual(Object.keys(LEVELS).map(level => availability(library, level).missing), [['calves'], [], []]);
  expectLevels(root, library);
  assert.deepEqual([...root.querySelectorAll('.level-missing')].map(note => note.textContent),
    ['Для начального уровня в библиотеке пока нет базовых упражнений на: икроножные.']);
  assert.deepEqual(checkedLevels(root), ['Средний']);

  levelOption(root, 'Начальный').click();
  assert.deepEqual(checkedLevels(root), ['Средний'], 'недоступный уровень выбрать нельзя');
  levelOption(root, 'Продвинутый').click();
  assert.deepEqual(checkedLevels(root), ['Продвинутый'], 'доступный выбирается');
});

test('генерация: тренировка на всё тело с меткой «упор» у упражнения зоны', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: () => 1 });
  startGenerator(root);

  const described = [...root.querySelectorAll('.level-option')].map(option => [
    option.querySelector('.level-title').textContent,
    option.querySelector('.level-who').textContent,
    ...[...option.querySelectorAll('.level-line')].map(line => line.textContent),
  ]);
  assert.deepEqual(described, [
    ['Начальный', 'Занятий не было или перерыв в несколько лет',
      'Подходов на упражнение: 2', 'Упражнения: базовые', 'Остановка: за 3–4 повтора до отказа'],
    ['Средний', 'Около полугода регулярных занятий',
      'Подходов на упражнение: 2', 'Упражнения: базовые и средние', 'Остановка: за 2–3 повтора до отказа'],
    ['Продвинутый', 'Годы регулярных занятий',
      'Подходов на упражнение: 3', 'Упражнения: все', 'Остановка: за 1–2 повтора до отказа'],
  ]);
  assert.deepEqual(checkedLevels(root), ['Начальный'], 'выбран первый из доступных');
  assert.equal(root.querySelector('.zone-hint').textContent,
    'Упор добавит упражнение на каждую выбранную зону, не больше двух. Остальные группы мышц остаются в тренировке.');
  assert.deepEqual(zoneChips(root).map(chip => chip.textContent),
    ['Ноги', 'Ягодицы', 'Спина', 'Грудь', 'Плечи', 'Руки', 'Пресс и кор']);

  zoneChip(root, 'Ягодицы').click();
  assert.equal(zoneChip(root, 'Ягодицы').getAttribute('aria-pressed'), 'true');
  generateNow(root);

  const expected = generate({ level: 'beginner', zones: ['glutes'], seed: 1, library: TEST_LIBRARY }).compact;
  const count = exerciseCount(expected);
  assert.equal(root.querySelector('h2').textContent, 'Всё тело. Упор: ягодицы');
  assert.equal(root.querySelector('.builder-subtitle').textContent,
    `Начальный уровень · ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}`);
  assert.deepEqual(coverage(root), ['Все основные группы получают нагрузку']);
  assert.deepEqual(rows(root).sort(),
    [...expected.warmup, ...expected.circuit, ...expected.strength, ...expected.cooldown].map(key => nameOf(key, TEST_LIBRARY)).sort());

  // Круги — у пар и только у них.
  for (const block of root.querySelectorAll('.builder-block')) {
    const rounds = tagsIn(block, 'builder-block-rounds');
    assert.deepEqual(rounds, block.querySelector('h3').textContent.startsWith('Пара ') ? ['2 круга'] : []);
  }

  const [[focusKey]] = expected.focus;
  assert.deepEqual(tagsIn(root, 'focus-tag'), ['упор'], 'метка одна — у упражнения зоны');
  assert.deepEqual(tagsIn(rowOf(root, nameOf(focusKey, TEST_LIBRARY)), 'focus-tag'), ['упор']);
  assert.equal(root.querySelectorAll('.replaced-tag').length, 0);
  assert.equal(root.querySelectorAll('.builder-replace').length, count, 'заменить можно любое, и силовое тоже');
  assert.equal(root.querySelectorAll('.builder-remove').length, 0);
});

test('третья зона недоступна', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY });
  startGenerator(root);

  zoneChip(root, 'Ноги').click();
  zoneChip(root, 'Спина').click();
  assert.deepEqual(pressedZones(root), ['Ноги', 'Спина']);
  const third = zoneChip(root, 'Грудь');
  assert.equal(third.getAttribute('aria-disabled'), 'true');
  assert.equal(zoneChip(root, 'Ноги').getAttribute('aria-disabled'), null, 'выбранные остаются доступными');
  third.click();
  assert.deepEqual(pressedZones(root), ['Ноги', 'Спина'], 'третья зона не выбирается');

  zoneChip(root, 'Ноги').click();
  assert.deepEqual(pressedZones(root), ['Спина']);
  assert.equal(third.getAttribute('aria-disabled'), null, 'место освободилось — остальные снова доступны');
  third.click();
  generateNow(root);
  assert.equal(root.querySelector('h2').textContent, 'Всё тело. Упор: спина и грудь');
  assert.equal(root.querySelectorAll('.focus-tag').length, 2);
});

test('смена уровня снимает зоны, недоступные на новом; причина названа под зонами', t => {
  // Грудь на начальном уровне держится на одном базовом упражнении: упору нужно
  // второе, и зона недоступна; на среднем есть среднее упражнение, и она открыта.
  const library = TEST_LIBRARY.map(entry => (['press-a', 'press-b', 'chest-2'].includes(entry.key)
    ? variant(entry, { difficulty: 'hard' }) : entry));
  const { root } = mountScreen(t, { library });
  startGenerator(root);
  const note = () => [...root.querySelectorAll('.zone-missing p')].filter(p => !p.hidden).map(p => p.textContent);

  assert.deepEqual(note(), ['Для упора на зону «Грудь» на начальном уровне в библиотеке пока не хватает упражнений: нужно второе упражнение на ту же группу.']);
  assert.equal(zoneChip(root, 'Грудь').getAttribute('aria-disabled'), 'true');

  levelOption(root, 'Средний').click();
  assert.deepEqual(checkedLevels(root), ['Средний']);
  assert.deepEqual(note(), []);
  zoneChip(root, 'Грудь').click();
  assert.deepEqual(pressedZones(root), ['Грудь']);

  levelOption(root, 'Начальный').click();
  assert.deepEqual(pressedZones(root), [], 'на начальном уровне грудь недоступна — выбор снят');
  assert.equal(note().length, 1);
  zoneChip(root, 'Грудь').click();
  assert.deepEqual(pressedZones(root), [], 'недоступную зону не выбрать');
});

test('отказ генератора остаётся на его экране: причина названа, выбор не сброшен', t => {
  // Одни односуставные упражнения: две зоны упора не умещаются в девять пар.
  const library = singlesOnly();
  const { root } = mountScreen(t, { library });
  startGenerator(root);
  zoneChip(root, 'Ноги').click();
  zoneChip(root, 'Руки').click();
  const refusal = root.querySelector('.builder-refusal');
  assert.equal(refusal.hidden, true, 'пока отказа нет, плашка скрыта');

  generateNow(root);
  assert.equal(root.querySelector('h2').textContent, 'Генератор');
  assert.equal(refusal.getAttribute('role'), 'alert');
  assert.equal(refusal.hidden, false);
  assert.match(refusal.textContent, /^Не получилось уложиться в 9 силовых пар: ниже границы остались /);
  assert.equal(refusal.textContent, generate({ level: 'beginner', zones: ['legs', 'arms'], seed: 1, library }).message);
  assert.deepEqual(checkedLevels(root), ['Начальный']);
  assert.deepEqual(pressedZones(root), ['Ноги', 'Руки']);

  zoneChip(root, 'Руки').click();
  assert.equal(refusal.hidden, true, 'выбор изменили — прежний отказ уже не про него');
});

test('«Другой вариант» меняет тренировку: те же уровень и зоны, замены сброшены', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: counter() });
  startGenerator(root);
  levelOption(root, 'Средний').click();
  zoneChip(root, 'Ягодицы').click();
  generateNow(root);
  const first = rows(root);
  const [[firstFocus]] = generate({ level: 'intermediate', zones: ['glutes'], seed: 1, library: TEST_LIBRARY }).compact.focus;

  openReplace(root, 'Стартовая разминка').querySelector('.replace-pick').click();
  assert.deepEqual(tagsIn(root, 'replaced-tag'), ['заменено']);

  otherVariant(root);
  const second = generate({ level: 'intermediate', zones: ['glutes'], seed: 2, library: TEST_LIBRARY }).compact;
  assert.notDeepEqual(rows(root).sort(), first.sort(), 'тренировка другая');
  assert.deepEqual(rows(root).sort(),
    [...second.warmup, ...second.circuit, ...second.strength, ...second.cooldown].map(key => nameOf(key, TEST_LIBRARY)).sort(),
    'новая тренировка — по следующему зерну, замена прежней не перенесена');
  assert.equal(root.querySelector('h2').textContent, 'Всё тело. Упор: ягодицы');
  assert.match(root.querySelector('.builder-subtitle').textContent, /^Средний уровень · /);
  assert.deepEqual(tagsIn(root, 'focus-tag'), ['упор']);
  assert.notEqual(second.focus[0][0], firstFocus, 'и упор достался другому упражнению');
  assert.equal(root.querySelectorAll('.replaced-tag').length, 0, 'метки «заменено» сброшены');
});

test('замена в сгенерированной: кандидаты из пула уровня; сломала нижнюю границу — предупреждение сразу', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: () => 1 });
  startGenerator(root);
  generateNow(root);
  assert.deepEqual(rows(root).filter(name => name === nameOf('press-b', TEST_LIBRARY)).length, 1, 'исходная тренировка с жимом');
  const status = root.querySelector('.builder-coverage');
  assert.deepEqual(coverage(root), ['Все основные группы получают нагрузку']);

  // Начальный уровень берёт базовые: среднее упражнение на трицепс есть в библиотеке, но не в списке.
  rowOf(root, nameOf('press-b', TEST_LIBRARY)).querySelector('.builder-replace').click();
  const sheet = root.querySelector('.replace-sheet');
  assert.equal(sheet.querySelector('.replace-hint').textContent, 'Те же целевые мышцы, похожая разметка');
  const names = [...sheet.querySelectorAll('.replace-name')].map(n => n.textContent);
  assert.ok(names.length > 0);
  assert.ok(names.every(name => TEST_LIBRARY.find(e => e.name === name).difficulty === 'basic'),
    'на начальном уровне замена — только из базовых');
  assert.equal(names.includes(nameOf('triceps-3', TEST_LIBRARY)), false);
  assert.equal(TEST_LIBRARY.find(e => e.key === 'triceps-3').difficulty, 'medium');
  sheet.querySelector('.replace-close').click();

  // Трицепс жим заменить может, а грудные после этого без подходов: предупреждение сразу.
  replaceWith(root, 'press-b', 'triceps-1');
  assert.equal(root.querySelector('.replace-sheet'), null);
  assert.equal(rowOf(root, nameOf('press-b', TEST_LIBRARY)), undefined);
  assert.deepEqual(tagsIn(rowOf(root, nameOf('triceps-1', TEST_LIBRARY)), 'replaced-tag'), ['заменено']);
  assert.equal(root.querySelector('.builder-coverage'), status, 'строка состояния — тот же узел: диктор услышит перемену');
  assert.deepEqual(coverage(root), [`Ниже границы уровня: ${groupsPhrase(['chest'])}.`]);
  assert.equal(status.classList.contains('is-ok'), false);
});

test('сохранение с двумя днями показывает группы ниже границы уровня ещё до сохранения', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: () => 1 });
  startGenerator(root);
  generateNow(root);
  const compact = generate({ level: 'beginner', zones: [], seed: 1, library: TEST_LIBRARY }).compact;
  const workoutAt = days => expandWorkout('my-check001', { ...compact, days }, TEST_LIBRARY).workout;
  toSave(root);

  assert.equal(root.querySelector('h2').textContent, 'Сохранение');
  const count = exerciseCount(compact);
  assert.equal(root.querySelector('.builder-summary').textContent,
    `Что сохранится: ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}, начальный уровень`);
  assert.deepEqual(coverage(root), ['Все основные группы не ниже границы уровня.']);

  dayChip(root, 'пт').click();
  assert.deepEqual(pressedDays(root), ['пн', 'ср']);
  const below = belowFloor(workoutAt([1, 3]), LEVELS.beginner.floor);
  assert.ok(below.length > 0, 'на двух днях кому-то подходов не хватает');
  assert.deepEqual(coverage(root), [`Ниже границы уровня при этих днях: ${groupsPhrase(below)}.`]);

  // Результат оценивает тренировку на трёх днях: дни выбираются только на сохранении.
  const backButton = root.querySelector('.builder-back');
  assert.match(backButton.textContent, /К результату/);
  backButton.click();
  assert.equal(root.querySelector('h2').textContent, 'Всё тело');
  assert.deepEqual(coverage(root), ['Все основные группы получают нагрузку']);
  toSave(root);
  assert.deepEqual(pressedDays(root), ['пн', 'ср'], 'выбранные дни остались в черновике');
});

test('«Назад» с результата: без замен сразу на генератор с тем же выбором, после замены спрашивает', async t => {
  const questions = [];
  const confirm = question => new Promise(resolve => questions.push({ question, answer: resolve }));
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: counter(), confirm });
  startGenerator(root);
  levelOption(root, 'Продвинутый').click();
  zoneChip(root, 'Плечи').click();
  generateNow(root);

  back(root);
  assert.equal(questions.length, 0, 'ничего не меняли — вопроса нет');
  assert.equal(root.querySelector('h2').textContent, 'Генератор');
  assert.deepEqual(checkedLevels(root), ['Продвинутый']);
  assert.deepEqual(pressedZones(root), ['Плечи']);

  generateNow(root);
  openReplace(root, 'Стартовая разминка').querySelector('.replace-pick').click();
  back(root);
  assert.equal(questions.length, 1);
  assert.equal(questions[0].question, 'Бросить тренировку? Несохранённые изменения пропадут.');
  questions[0].answer(false);
  await settle(0);
  assert.equal(root.querySelector('.builder-variant') !== null, true, 'отказ — результат на месте');
  assert.equal(root.querySelectorAll('.replaced-tag').length, 1);

  back(root);
  questions[1].answer(true);
  await settle(0);
  assert.equal(root.querySelector('h2').textContent, 'Генератор');
  assert.deepEqual(checkedLevels(root), ['Продвинутый']);
});

test('«Изменить» у сгенерированной открывает результат', async t => {
  const generated = generate({ level: 'intermediate', zones: ['glutes'], seed: 7, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  const { document, root } = mount(t, { library: TEST_LIBRARY, preload: onDevice('my-gen00001', generated) });
  await settle(0);
  openWorkouts(document);
  document.querySelector('#screen-workouts .workout-edit').click();
  await settle(0);

  assert.deepEqual(shown(document), ['screen-builder']);
  assert.equal(root.querySelector('h2').textContent, 'Всё тело. Упор: ягодицы');
  assert.ok(root.querySelector('.builder-variant'), 'это результат, а не сборка');
  assert.equal(root.querySelector('.builder-remove'), null);
  assert.equal(root.querySelectorAll('.builder-replace').length, exerciseCount(generated));
  const [[focusKey]] = generated.focus;
  assert.deepEqual(tagsIn(rowOf(root, nameOf(focusKey, TEST_LIBRARY)), 'focus-tag'), ['упор'], 'упор в записи сохранился');
  assert.equal(root.querySelectorAll('.replaced-tag').length, 0, 'заменено — только то, что заменили в этом сеансе');

  back(root);
  assert.deepEqual(checkedLevels(root), ['Средний'], 'генератор открывается на уровне и зонах этой тренировки');
  assert.deepEqual(pressedZones(root), ['Ягодицы']);
});

test('экраны генератора и результата без слов «ИИ», «персональный», «тренер»', t => {
  const forbidden = /(^|[^а-яё])ИИ([^а-яё]|$)|персональн|тренер/i;

  // С настоящей библиотекой — экран выбора уровня как есть, с тестовой — выбор и результат.
  const real = mount(t);
  openBuilder(real.document);
  startGenerator(real.root);
  assert.match(real.root.textContent, /Генератор/);
  assert.doesNotMatch(real.root.textContent, forbidden);

  const { root } = mountScreen(t, { library: TEST_LIBRARY });
  startGenerator(root);
  zoneChip(root, 'Грудь').click();
  assert.doesNotMatch(root.textContent, forbidden);
  generateNow(root);
  assert.match(root.textContent, /Другой вариант/);
  assert.doesNotMatch(root.textContent, forbidden);
});

test('отказ при «Другом варианте» показан на результате, прежняя тренировка остаётся', t => {
  const library = [...TEST_LIBRARY];
  const { root } = mountScreen(t, { library, seed: counter() });
  startGenerator(root);
  generateNow(root);
  const before = rows(root);
  assert.equal(root.querySelector('.builder-refusal').hidden, true);

  // Пока результат на экране, из библиотеки пропали все упражнения на бицепс:
  // второй подбор уже невозможен.
  for (let i = library.length - 1; i >= 0; i -= 1) {
    if (library[i].load.biceps === 1) library.splice(i, 1);
  }
  otherVariant(root);

  const refusal = root.querySelector('.builder-refusal');
  assert.equal(refusal.getAttribute('role'), 'alert');
  assert.equal(refusal.hidden, false);
  assert.equal(refusal.textContent, `Для начального уровня в библиотеке пока нет базовых упражнений на: ${groupsPhrase(['biceps'])}.`);
  assert.ok(root.querySelector('.builder-variant'), 'результат остался на экране');
  assert.deepEqual(rows(root), before, 'прежняя тренировка не тронута');
});

test('«Другой вариант» у открытой на правку тренировки оставляет её название, дни и id', async t => {
  const generated = {
    ...generate({ level: 'intermediate', zones: ['glutes'], seed: 7, library: TEST_LIBRARY, now: () => OWN.t }).compact,
    name: 'Моя ягодичная', days: [2, 4],
  };
  const store = { save: async () => ({ ok: true, localOnly: false }) };
  const { root, saved, view } = mountScreen(t, { library: TEST_LIBRARY, store, seed: () => 99 });
  await view.edit('my-gen00001', generated);
  const before = rows(root);

  otherVariant(root);
  assert.notDeepEqual(rows(root).sort(), before.sort(), 'подбор другой');
  toSave(root);
  assert.equal(root.querySelector('.save-name').value, 'Моя ягодичная');
  assert.deepEqual(pressedDays(root), ['вт', 'чт']);
  root.querySelector('.builder-save').click();
  await settle(0);

  const [[id, compact]] = saved;
  assert.equal(id, 'my-gen00001', 'сохранение перезаписывает ту же тренировку');
  assert.deepEqual([compact.level, compact.zones, compact.name, compact.days],
    ['intermediate', ['glutes'], 'Моя ягодичная', [2, 4]]);
});

test('«Другой вариант» у записи с тремя зонами берёт две: не падает, а подбирает заново', async t => {
  // Генератор принимает не больше двух зон, а запись, сделанная не им, могла принести три.
  const three = {
    ...generate({ level: 'beginner', zones: ['legs', 'glutes'], seed: 7, library: TEST_LIBRARY, now: () => OWN.t }).compact,
    zones: ['legs', 'glutes', 'back'],
  };
  const { root, view } = mountScreen(t, { library: TEST_LIBRARY, seed: () => 99 });
  await view.edit('my-gen00001', three);
  assert.equal(root.querySelector('h2').textContent, 'Всё тело. Упор: ноги, ягодицы и спина');

  otherVariant(root);
  assert.equal(root.querySelector('h2').textContent, 'Всё тело. Упор: ноги и ягодицы', 'подобрана новая тренировка по двум зонам');
  assert.equal(root.querySelectorAll('.focus-tag').length, 2);
});

test('«Изменить» другой подобранной сбрасывает метки «заменено»', async t => {
  const { root, view } = mountScreen(t, { library: TEST_LIBRARY, seed: () => 1 });
  startGenerator(root);
  generateNow(root);
  replaceWith(root, 'warm-1', 'warm-3');
  assert.deepEqual(tagsIn(rowOf(root, nameOf('warm-3', TEST_LIBRARY)), 'replaced-tag'), ['заменено']);

  // В открываемой тренировке та же разминка: без сброса метка перешла бы на неё.
  const other = generate({ level: 'beginner', zones: [], seed: 2, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  assert.ok(other.warmup.includes('warm-3'));
  assert.equal(await view.edit('my-gen00002', other), true);
  assert.ok(rowOf(root, nameOf('warm-3', TEST_LIBRARY)), 'открыта другая тренировка, и разминка в ней есть');
  assert.equal(root.querySelectorAll('.replaced-tag').length, 0);
});

// — «Что есть дома» ————————————————————————————————————————————————————
// Записи свои: у тестовой библиотеки весь инвентарь «без инвентаря», нужное для
// проверки ставится поверх. variant замораживает копию, как и сама фикстура.
const needing = (gear, keys, library = TEST_LIBRARY) => library.map(entry => (keys.includes(entry.key) ? variant(entry, { gear }) : entry));
const BICEPS = ['biceps-1', 'biceps-2', 'biceps-3', 'biceps-4'];
// Все упражнения на грудь, кроме одного: с гантелями грудь выбирается как упор
// (есть второе упражнение), без них у зоны одна опора, и упор невозможен, хотя
// сама группа закрыта.
const CHEST_EXCEPT_ONE = TEST_LIBRARY.filter(entry => entry.load.chest === 1 && entry.key !== 'chest-1').map(entry => entry.key);

const profileOf = (...owned) => {
  const profile = createGearProfile(null);
  profile.set(owned);
  return profile;
};
const gearChip = (root, id) => root.querySelector(`.gear-chip[data-gear="${id}"]`);
const pressedGear = root => [...root.querySelectorAll('.gear-chip[aria-pressed="true"]')].map(chip => chip.dataset.gear);
const levelNotes = root => [...root.querySelectorAll('.level-missing')].map(note => note.textContent);
const zoneNotes = root => [...root.querySelectorAll('.zone-missing p')].filter(p => !p.hidden).map(p => p.textContent);
const refusalOf = root => root.querySelector('.builder-refusal');
const namesIn = block => [...block.querySelectorAll('.builder-item-name')].map(node => node.textContent);
const blockOf = (root, title) => [...root.querySelectorAll('.builder-block')].find(block => block.querySelector('h3').textContent === title);
const candidateNames = sheet => [...sheet.querySelectorAll('.replace-name')].map(node => node.textContent);

// Ручная тренировка из ключей тестовой библиотеки: что лежит «на устройстве» у
// человека, у которого могло быть и другое «Что есть дома».
const MANUAL = {
  v: 1, name: 'Ручная', days: [1, 3, 5], level: null, zones: [],
  warmup: ['warm-1', 'warm-2'], circuit: ['circ-1', 'circ-2', 'circ-3', 'circ-4'],
  strength: ['squat-a', 'hinge-a', 'row-a', 'press-a'], focus: [],
  cooldown: ['stretch-1', 'stretch-2', 'breathing'], t: 1760000000000,
};

test('генератор: переключатели «Что есть дома» между подзаголовком и уровнями, по умолчанию отмечены резинки', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY });
  startGenerator(root);

  const picker = root.querySelector('.gear-picker');
  assert.ok(picker, 'блок есть на экране генератора');
  assert.equal(root.querySelector('.builder-subtitle').nextElementSibling, picker);
  assert.equal(picker.nextElementSibling, root.querySelector('#generator-levels'));
  assert.equal(picker.querySelector('h3').id, 'generator-gear-title');
  assert.deepEqual(pressedGear(root), ['band_long', 'loop_short']);
  assert.equal(root.querySelector('[data-gear="none"]'), null, '«без инвентаря» среди переключателей нет');
});

test('снятие инвентаря делает уровень недоступным: выбор переходит на первый доступный, причина называет инвентарь', t => {
  // Базовых упражнений на бицепс два, и обоим нужны гантели; среднее и сложное
  // без инвентаря. С гантелями доступны все уровни, без них начальный отпадает.
  const library = needing(['dumbbells'], ['biceps-1', 'biceps-2']);
  const profile = profileOf('dumbbells');
  const { root } = mountScreen(t, { library, gearProfile: profile });
  startGenerator(root);
  assert.deepEqual(checkedLevels(root), ['Начальный']);
  assert.deepEqual(levelNotes(root), []);

  gearChip(root, 'dumbbells').click();
  assert.deepEqual(profile.get(), [], 'выбор записан в профиль');
  assert.deepEqual(pressedGear(root), []);
  assert.deepEqual(checkedLevels(root), ['Средний'], 'выбранный уровень стал недоступен — выбран первый доступный');
  assert.deepEqual(levelNotes(root),
    ['Для начального уровня с отмеченным инвентарём нет базовых упражнений на: бицепс. Есть с инвентарём: гантели.']);
  assert.equal(levelOption(root, 'Начальный').getAttribute('aria-disabled'), 'true');
  assert.equal(root.querySelector('.builder-generate').disabled, false);

  // Вернули инвентарь: начальный снова доступен, а выбор человека не прыгает назад.
  gearChip(root, 'dumbbells').click();
  assert.deepEqual(levelNotes(root), []);
  assert.deepEqual(checkedLevels(root), ['Средний']);
  levelOption(root, 'Начальный').click();
  assert.deepEqual(checkedLevels(root), ['Начальный']);
});

test('снятие инвентаря снимает зону упора, которую уже не выполнить; причина зоны называет инвентарь', t => {
  const library = needing(['dumbbells'], CHEST_EXCEPT_ONE);
  const profile = profileOf('dumbbells');
  const { root } = mountScreen(t, { library, gearProfile: profile });
  startGenerator(root);
  zoneChip(root, 'Грудь').click();
  zoneChip(root, 'Спина').click();
  assert.deepEqual(pressedZones(root), ['Спина', 'Грудь'], 'чипы идут в порядке зон, а не нажатий');

  gearChip(root, 'dumbbells').click();
  // Уровень на месте: сама группа «грудь» закрыта упражнением без инвентаря.
  assert.deepEqual(checkedLevels(root), ['Начальный']);
  assert.deepEqual(pressedZones(root), ['Спина'], 'Грудь снята, Спина осталась');
  assert.equal(zoneChip(root, 'Грудь').getAttribute('aria-disabled'), 'true');
  assert.equal(zoneChip(root, 'Грудь').getAttribute('aria-pressed'), 'false');
  assert.deepEqual(zoneNotes(root), ['Для упора на зону «Грудь» на начальном уровне с отмеченным инвентарём не хватает упражнений: нужно второе упражнение на ту же группу. Есть с инвентарём: гантели.']);

  // Зона снова доступна, но сама не выбирается.
  gearChip(root, 'dumbbells').click();
  assert.deepEqual(zoneNotes(root), []);
  assert.equal(zoneChip(root, 'Грудь').getAttribute('aria-disabled'), null);
  assert.deepEqual(pressedZones(root), ['Спина']);
});

test('после смены инвентаря фокус на той же кнопке нового экрана, страница не прыгает наверх', t => {
  const { window, document, root } = mountScreen(t, { library: TEST_LIBRARY });
  const scrolls = [];
  startGenerator(root);
  window.scrollTo = (...args) => scrolls.push(args);

  const before = gearChip(root, 'dumbbells');
  before.click();
  const after = gearChip(root, 'dumbbells');
  assert.notEqual(after, before, 'экран перерисован целиком');
  assert.equal(before.isConnected, false);
  assert.equal(document.activeElement, after);
  assert.equal(after.getAttribute('aria-pressed'), 'true');
  assert.deepEqual(scrolls, [], 'перерисовка из-за нажатия на этом же экране не прокручивает страницу');

  // Работает и во второй раз, и на другой кнопке.
  after.click();
  assert.equal(document.activeElement, gearChip(root, 'dumbbells'));
  assert.equal(gearChip(root, 'dumbbells').getAttribute('aria-pressed'), 'false');
  gearChip(root, 'kettlebell').click();
  assert.equal(document.activeElement, gearChip(root, 'kettlebell'));
  assert.deepEqual(pressedGear(root), ['band_long', 'loop_short', 'kettlebell']);
});

test('смена инвентаря не сбрасывает уровень и зоны, которые остались доступны', t => {
  const { document, root } = mountScreen(t, { library: TEST_LIBRARY });
  startGenerator(root);
  levelOption(root, 'Продвинутый').click();
  zoneChip(root, 'Ноги').click();
  gearChip(root, 'kettlebell').click();
  // Перерисовка берёт выбор из памяти экрана, а не из разметки.
  assert.deepEqual(checkedLevels(root), ['Продвинутый']);
  assert.deepEqual(pressedZones(root), ['Ноги']);
  assert.notEqual(document.activeElement, root.querySelector('h2'), 'фокус на переключателе, а не на заголовке');
});

test('отмечено пусто: всё без инвентаря работает, переключатели сняты, а «без инвентаря» не отключить', t => {
  const profile = profileOf();
  const { root } = mountScreen(t, { library: TEST_LIBRARY, gearProfile: profile, seed: () => 1 });
  startGenerator(root);

  assert.deepEqual(pressedGear(root), []);
  assert.equal(root.querySelectorAll('.gear-chip').length, 5);
  assert.equal(root.querySelector('[data-gear="none"]'), null);
  assert.deepEqual(checkedLevels(root), ['Начальный']);
  assert.deepEqual(levelNotes(root), []);
  generateNow(root);

  const expected = generate({ level: 'beginner', zones: [], seed: 1, library: TEST_LIBRARY }).compact;
  assert.equal(root.querySelector('h2').textContent, 'Всё тело');
  assert.deepEqual(rows(root).sort(),
    [...expected.warmup, ...expected.circuit, ...expected.strength, ...expected.cooldown].map(key => nameOf(key, TEST_LIBRARY)).sort());
});

test('отмечено пусто, а упражнениям на группу нужны гантели: все уровни недоступны и называют их; отметка открывает', t => {
  const library = needing(['dumbbells'], BICEPS);
  const profile = profileOf();
  const { root } = mountScreen(t, { library, gearProfile: profile });
  startGenerator(root);

  assert.deepEqual(levelNotes(root), [
    'Для начального уровня с отмеченным инвентарём нет базовых упражнений на: бицепс. Есть с инвентарём: гантели.',
    'Для среднего уровня с отмеченным инвентарём нет базовых и средних упражнений на: бицепс. Есть с инвентарём: гантели.',
    'Для продвинутого уровня с отмеченным инвентарём нет упражнений на: бицепс. Есть с инвентарём: гантели.',
  ]);
  assert.deepEqual(checkedLevels(root), []);
  assert.equal(root.querySelector('.builder-generate').disabled, true);
  assert.ok(zoneChips(root).every(chip => chip.getAttribute('aria-disabled') === 'true'));

  gearChip(root, 'dumbbells').click();
  assert.deepEqual(levelNotes(root), []);
  assert.deepEqual(checkedLevels(root), ['Начальный'], 'уровней не было, инвентарь их открыл — выбран первый доступный');
  assert.equal(root.querySelector('.builder-generate').disabled, false);
});

test('уровень недоступен и из-за инвентаря, и из-за пустоты библиотеки: причина делит группы, отметка гантелей открывает не всё', async t => {
  // Бицепс есть только с гантелями, трицепса нет вовсе: отметка гантелей группу
  // трицепса не закроет, и текст не должен обещать обратного.
  const library = needing(['dumbbells'], BICEPS, withoutTargets(['triceps']));
  const profile = profileOf();
  const { root } = mountScreen(t, { library, gearProfile: profile });
  startGenerator(root);

  assert.deepEqual(levelNotes(root), [
    'Для начального уровня с отмеченным инвентарём нет базовых упражнений на: бицепс. Есть с инвентарём: гантели. В библиотеке пока нет базовых упражнений на: трицепс.',
    'Для среднего уровня с отмеченным инвентарём нет базовых и средних упражнений на: бицепс. Есть с инвентарём: гантели. В библиотеке пока нет базовых и средних упражнений на: трицепс.',
    'Для продвинутого уровня с отмеченным инвентарём нет упражнений на: бицепс. Есть с инвентарём: гантели. В библиотеке пока нет упражнений на: трицепс.',
  ]);

  // Отметили гантели: бицепс закрыт, остался только трицепс, и текст про него прежний.
  gearChip(root, 'dumbbells').click();
  assert.deepEqual(levelNotes(root), [
    'Для начального уровня в библиотеке пока нет базовых упражнений на: трицепс.',
    'Для среднего уровня в библиотеке пока нет базовых и средних упражнений на: трицепс.',
    'Для продвинутого уровня в библиотеке пока нет упражнений на: трицепс.',
  ]);
  assert.deepEqual(checkedLevels(root), []);
});

test('«Другой вариант»: отказ уровня делит группы так же, как причина под уровнем', async t => {
  const generated = generate({ level: 'beginner', zones: [], seed: 3, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  // Упражнения на трицепс остаются в библиотеке, но целью он у них уже не является.
  const library = needing(['dumbbells'], BICEPS).map(entry => (entry.load.triceps === 1 ? variant(entry, { load: { forearms: 1 } }) : entry));
  const { root, view } = mountScreen(t, { library, gearProfile: profileOf() });
  await view.edit('my-gear0010', generated);

  otherVariant(root);
  assert.equal(refusalOf(root).textContent,
    'Для начального уровня с отмеченным инвентарём нет базовых упражнений на: бицепс. Есть с инвентарём: гантели. В библиотеке пока нет базовых упражнений на: трицепс.');
});

test('«Другой вариант» у тренировки, чей уровень при нынешнем инвентаре недоступен: отказ называет инвентарь, прежняя остаётся', async t => {
  const generated = generate({ level: 'beginner', zones: [], seed: 3, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  const library = needing(['dumbbells'], BICEPS);
  const { root, view } = mountScreen(t, { library, gearProfile: profileOf() });
  await view.edit('my-gear0001', generated);
  const before = rows(root);

  otherVariant(root);
  assert.equal(refusalOf(root).hidden, false);
  assert.equal(refusalOf(root).textContent,
    'Для начального уровня с отмеченным инвентарём нет базовых упражнений на: бицепс. Есть с инвентарём: гантели.');
  assert.deepEqual(rows(root), before, 'прежняя тренировка осталась на экране');

  // С результата назад: уровня на генераторе уже нет, а экран цел.
  back(root);
  assert.equal(root.querySelector('h2').textContent, 'Генератор');
  assert.deepEqual(checkedLevels(root), []);
  assert.equal(root.querySelector('.builder-generate').disabled, true);
});

test('«Другой вариант» у тренировки с упором, которого инвентарь не позволяет: отказ по зоне называет инвентарь', async t => {
  const generated = generate({ level: 'beginner', zones: ['chest'], seed: 1, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  const library = needing(['dumbbells'], CHEST_EXCEPT_ONE);
  const { root, view } = mountScreen(t, { library, gearProfile: profileOf() });
  await view.edit('my-gear0002', generated);

  otherVariant(root);
  assert.equal(refusalOf(root).textContent,
    'Для упора на зону «Грудь» на начальном уровне с отмеченным инвентарём не хватает упражнений: нужно второе упражнение на ту же группу. Есть с инвентарём: гантели.');

  // С гантелями «Другой вариант» работает.
  const withDumbbells = mountScreen(t, { library, gearProfile: profileOf('dumbbells'), seed: () => 2 });
  await withDumbbells.view.edit('my-gear0002', generated);
  otherVariant(withDumbbells.root);
  assert.equal(refusalOf(withDumbbells.root).hidden, true);
});

test('отказ, когда нужных упражнений нет и с другим инвентарём, остаётся прежним: про библиотеку, без «Есть с инвентарём»', async t => {
  // Упражнения на бицепс остались, но целью бицепс у них уже не является: ни с
  // каким инвентарём группу не закрыть.
  const library = TEST_LIBRARY.map(entry => (BICEPS.includes(entry.key) ? variant(entry, { load: { forearms: 1 } }) : entry));
  const generated = generate({ level: 'beginner', zones: [], seed: 3, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  const { root, view } = mountScreen(t, { library, gearProfile: profileOf() });
  await view.edit('my-gear0003', generated);

  otherVariant(root);
  assert.equal(refusalOf(root).textContent, 'Для начального уровня в библиотеке пока нет базовых упражнений на: бицепс.');
});

test('замена в сохранённой ручной тренировке с неотмеченным инвентарём не падает, и тренировка ничего не теряет', async t => {
  // warm-1 нужны гантели, у человека их нет; warm-3 подходит и свободна.
  const library = needing(['dumbbells'], ['warm-1']);
  const { root, view } = mountScreen(t, { library });
  await view.edit('my-gear0004', MANUAL);
  const before = rows(root);
  assert.ok(before.includes(nameOf('warm-1', TEST_LIBRARY)), 'упражнение с неотмеченным инвентарём в тренировке на месте');
  assert.deepEqual(before.sort(),
    [...MANUAL.warmup, ...MANUAL.circuit, ...MANUAL.strength, ...MANUAL.cooldown].map(key => nameOf(key, TEST_LIBRARY)).sort());

  rowOf(root, nameOf('warm-1', TEST_LIBRARY)).querySelector('.builder-replace').click();
  const sheet = root.querySelector('.replace-sheet');
  assert.ok(sheet, 'шторка открылась');
  assert.equal(sheet.querySelector('.replace-current').textContent, nameOf('warm-1', TEST_LIBRARY));
  assert.deepEqual(candidateNames(sheet), [nameOf('warm-3', TEST_LIBRARY)]);
  sheet.querySelector('.replace-pick').click();

  const after = rows(root);
  assert.ok(!after.includes(nameOf('warm-1', TEST_LIBRARY)));
  assert.deepEqual(after.sort(), before.map(name => (name === nameOf('warm-1', TEST_LIBRARY) ? nameOf('warm-3', TEST_LIBRARY) : name)).sort());
});

test('покрытие и экран сохранения считают и упражнения с неотмеченным инвентарём: выбор человека тренировку не урезает', async t => {
  const generated = generate({ level: 'beginner', zones: [], seed: 1, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  const count = exerciseCount(generated);
  // Всем силовым нужны гантели, которых человек не отметил. Если бы покрытие
  // считалось по подходящим, силовых в тренировке «не осталось» бы.
  const library = needing(['dumbbells'], generated.strength);
  const { root, view } = mountScreen(t, { library });
  await view.edit('my-gear0009', generated);

  assert.deepEqual(coverage(root), ['Все основные группы получают нагрузку']);
  assert.equal(root.querySelector('.builder-subtitle').textContent,
    `Начальный уровень · ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}`);
  assert.deepEqual(rows(root).sort(),
    [...generated.warmup, ...generated.circuit, ...generated.strength, ...generated.cooldown].map(key => nameOf(key, TEST_LIBRARY)).sort());

  toSave(root);
  assert.deepEqual(coverage(root), ['Все основные группы не ниже границы уровня.']);
  assert.equal(root.querySelector('.builder-summary').textContent,
    `Что сохранится: ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}, начальный уровень`);

  // И у ручной: предупреждение «Без нагрузки» не должно называть группы,
  // которые закрывают упражнения с неотмеченным инвентарём.
  const manual = mountScreen(t, { library: needing(['dumbbells'], MANUAL.strength) });
  const plain = mountScreen(t, { library: TEST_LIBRARY });
  await manual.view.edit('my-gear0009', MANUAL);
  await plain.view.edit('my-gear0009', MANUAL);
  assert.deepEqual(coverage(manual.root), coverage(plain.root));
  assert.match(coverage(manual.root)[0], /^Тренировка пока не на всё тело$/);
});

test('шторка замены не предлагает упражнение с неотмеченным инвентарём; пусто из-за него — текст называет инвентарь', async t => {
  // Свободные разминки: warm-1 с гантелями и warm-3 с гирей. Первую заменяем на
  // вторую нельзя: гири нет. Вторая и первая в обратном порядке словаря.
  const library = needing(['kettlebell'], ['warm-3'], needing(['dumbbells'], ['warm-1']));
  const compact = { ...MANUAL, warmup: ['warm-2', 'circ-5'] };
  const { root, view } = mountScreen(t, { library });
  await view.edit('my-gear0005', { ...compact, warmup: ['warm-2'] });

  rowOf(root, nameOf('warm-2', TEST_LIBRARY)).querySelector('.builder-replace').click();
  const sheet = root.querySelector('.replace-sheet');
  assert.equal(sheet.querySelectorAll('.replace-candidate').length, 0);
  assert.equal(sheet.querySelector('.replace-empty').textContent,
    'Похожих упражнений с отмеченным инвентарём больше нет. Есть с инвентарём: гантели, гиря.');
  assert.equal(sheet.querySelectorAll('.replace-pick').length, 0);

  // Часть инвентаря отмечена — называется только остальное.
  sheet.querySelector('.replace-close').click();
  const dumbbells = mountScreen(t, { library, gearProfile: profileOf('dumbbells') });
  await dumbbells.view.edit('my-gear0005', { ...compact, warmup: ['warm-2'] });
  rowOf(dumbbells.root, nameOf('warm-2', TEST_LIBRARY)).querySelector('.builder-replace').click();
  const partial = dumbbells.root.querySelector('.replace-sheet');
  assert.deepEqual(candidateNames(partial), [nameOf('warm-1', TEST_LIBRARY)]);
});

test('шторка замены: кандидатов нет вовсе — прежний текст, инвентарь не упоминается', async t => {
  // Разминок две, обе в тренировке, одной нужны гантели: других нет и по
  // полной библиотеке.
  const library = needing(['dumbbells'], ['warm-1'], TEST_LIBRARY.filter(e => e.slot !== 'warmup' || ['warm-1', 'warm-2'].includes(e.key)));
  const { root, view } = mountScreen(t, { library });
  await view.edit('my-gear0006', MANUAL);

  rowOf(root, nameOf('warm-2', TEST_LIBRARY)).querySelector('.builder-replace').click();
  assert.equal(root.querySelector('.replace-empty').textContent, 'Похожих упражнений больше нет: все подходящие уже в тренировке.');
});

test('замена силового в подобранной тренировке с неотмеченным инвентарём: не падает, чужие гантели не предлагаются', async t => {
  const generated = generate({ level: 'beginner', zones: [], seed: 1, library: TEST_LIBRARY, now: () => OWN.t }).compact;
  const key = generated.strength[0];
  // Двойник: упражнение, которым key заменялось бы, если бы не гантели.
  const twin = replaceCandidates({ compact: generated, slot: 'strength', key, library: TEST_LIBRARY })[0].key;
  const library = needing(['dumbbells'], [key, twin]);
  const { root, view } = mountScreen(t, { library });
  await view.edit('my-gear0007', generated);
  const status = coverage(root);
  const before = rows(root);
  assert.ok(before.includes(nameOf(key, TEST_LIBRARY)));

  rowOf(root, nameOf(key, TEST_LIBRARY)).querySelector('.builder-replace').click();
  const sheet = root.querySelector('.replace-sheet');
  assert.ok(sheet);
  assert.equal(sheet.querySelector('.replace-current').textContent, nameOf(key, TEST_LIBRARY));
  const expected = replaceCandidates({ compact: generated, slot: 'strength', key, library: TEST_LIBRARY })
    .filter(entry => entry.key !== twin).map(entry => entry.name);
  assert.ok(expected.length > 0, 'условие теста: кроме двойника кандидаты есть');
  assert.deepEqual(candidateNames(sheet), expected);

  sheet.querySelector('.replace-close').click();
  assert.deepEqual(rows(root), before, 'закрыли шторку — тренировка та же');
  assert.deepEqual(coverage(root), status);
});

test('ручная сборка: разминка, разогрев и завершение берутся только из подходящего по инвентарю', t => {
  // Из трёх разминок одна с гантелями, из пяти разогревов две, из трёх растяжек
  // одна: скелет берёт две, четыре и три, и без неподходящих их набирается ровно.
  const library = needing(['dumbbells'], ['warm-1', 'circ-1', 'circ-2', 'stretch-1']);
  const { root } = mountScreen(t, { library, seed: counter() });
  for (let round = 0; round < 10; round += 1) {
    startManual(root);
    assert.deepEqual(namesIn(blockOf(root, 'Стартовая разминка')).sort(), ['Разминка 2', 'Разминка 3'], `заход ${round}`);
    const circuit = namesIn(blockOf(root, 'Круговой разогрев'));
    assert.ok(!circuit.includes('Разогрев 1') && !circuit.includes('Разогрев 2'), `заход ${round}: ${circuit}`);
    assert.ok(!namesIn(blockOf(root, 'Завершение')).includes('Растяжка 1'), `заход ${round}`);
    back(root);
  }

  // С гантелями неподходящих нет: «Разминка 1» попадает в скелет.
  const own = mountScreen(t, { library, seed: counter(), gearProfile: profileOf('dumbbells') });
  const seen = new Set();
  for (let round = 0; round < 10; round += 1) {
    startManual(own.root);
    for (const name of namesIn(blockOf(own.root, 'Стартовая разминка'))) seen.add(name);
    back(own.root);
  }
  assert.ok(seen.has('Разминка 1'));
});

test('библиотека в конструкторе: скрывает неподходящее, считает «ещё M», выбор идёт в профиль и виден на генераторе', t => {
  const library = needing(['dumbbells'], BICEPS);
  const profile = profileOf('band_long');
  const { root } = mountScreen(t, { library, gearProfile: profile });
  const strength = library.filter(entry => entry.slot === 'strength').length;
  startManual(root);
  openLibrary(root);

  const found = () => root.querySelector('.library-found').textContent;
  assert.equal(found(), `Найдено: ${strength - BICEPS.length} · ещё ${BICEPS.length} с другим инвентарём`);
  assert.deepEqual(pressedGear(root), ['band_long']);
  assert.equal(root.querySelector('.gear-picker h3').id, 'library-gear-title');

  gearChip(root, 'dumbbells').click();
  assert.equal(found(), `Найдено: ${strength}`);
  assert.deepEqual(profile.get(), ['band_long', 'dumbbells'], 'выбор в библиотеке записан в профиль');

  // Обратно на сборку, на вход и на генератор: там тот же выбор.
  root.querySelector('.library-foot .builder-back').click();
  back(root);
  startGenerator(root);
  assert.deepEqual(pressedGear(root), ['band_long', 'dumbbells']);
});

test('приложение отдаёт конструктору профиль на localStorage: выбор читается оттуда и туда же пишется', t => {
  const { window, document, root } = mount(t, { preload: { [GEAR_KEY]: '["dumbbells"]' } });
  openBuilder(document);
  startGenerator(root);
  assert.deepEqual(pressedGear(root), ['dumbbells']);

  gearChip(root, 'dumbbells').click();
  gearChip(root, 'kettlebell').click();
  assert.equal(window.localStorage.getItem(GEAR_KEY), '["kettlebell"]');

  // Выбор переживает уход с экрана и из раздела.
  back(root);
  openWorkouts(document);
  openBuilder(document);
  startGenerator(root);
  assert.deepEqual(pressedGear(root), ['kettlebell']);
});

test('приложение без доступа к localStorage: выбор инвентаря живёт в памяти до закрытия', t => {
  const { document, root } = mount(t, { denyStorage: true });
  openBuilder(document);
  startGenerator(root);
  assert.deepEqual(pressedGear(root), ['band_long', 'loop_short'], 'по умолчанию');

  gearChip(root, 'band_long').click();
  assert.deepEqual(pressedGear(root), ['loop_short']);
  back(root);
  startGenerator(root);
  assert.deepEqual(pressedGear(root), ['loop_short']);
});

test('своя тренировка с неотмеченным инвентарём открывается в «Сегодня» целиком: выбор человека её не фильтрует', async t => {
  const library = needing(['dumbbells'], ['warm-1']);
  const id = 'my-gear0008';
  const { document } = mount(t, { library, preload: { ...onDevice(id, MANUAL), [CURRENT_KEY]: id } });
  await settle(0);

  assert.deepEqual(shown(document), ['screen-today']);
  const today = document.getElementById('screen-today');
  for (const key of [...MANUAL.warmup, ...MANUAL.strength]) {
    assert.ok(today.textContent.includes(nameOf(key, TEST_LIBRARY)), `в «Сегодня» нет «${nameOf(key, TEST_LIBRARY)}»`);
  }
});

// — Формат занятия ———————————————————————————————————————————————————————
const blockChip = (root, slot) => root.querySelector(`.block-chip[data-block="${slot}"]`);
const formatChip = (root, id) => root.querySelector(`.format-chip[data-format="${id}"]`);
const pressedBlocks = root => [...root.querySelectorAll('.block-chip[aria-pressed="true"]')].map(chip => chip.dataset.block);
const pressedFormat = root => [...root.querySelectorAll('.format-chip[aria-pressed="true"]')].map(chip => chip.dataset.format);
const formatReason = root => root.querySelector('.format-reason');
const blockTitles = root => [...root.querySelectorAll('.builder-block h3')].map(h => h.textContent);
const roundsTags = root => [...root.querySelectorAll('.builder-block-rounds')].map(tag => tag.textContent);
const okStore = { save: async () => ({ ok: true, localOnly: false }) };
const ASK = 'Бросить тренировку? Несохранённые изменения пропадут.';

// Сохраняет открытый черновик и отдаёт запись, ушедшую в store.
async function saveDraft(root, saved) {
  toSave(root);
  root.querySelector('.builder-save').click();
  await settle(0);
  return saved.at(-1)[1];
}

test('сборка: все три блока нажаты, выбраны «Пары»; переключатели между причиной «Добавить» и списком блоков', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY });
  startManual(root);

  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
  assert.deepEqual(pressedFormat(root), ['pairs']);
  assert.equal(root.querySelectorAll('.format-picker').length, 1);
  const picker = root.querySelector('.format-picker');
  assert.equal(picker.querySelector('h3').textContent, 'Формат занятия');
  assert.equal(picker.querySelector('h3').id, 'build-format-title');

  const add = root.querySelector('.builder-add');
  const addReason = add.nextElementSibling;
  assert.ok(addReason.classList.contains('builder-reason'), 'причина «Добавить» стоит сразу за ней');
  assert.equal(addReason.nextElementSibling, picker);
  assert.equal(picker.nextElementSibling, root.querySelector('.builder-blocks'));
  assert.equal(picker.querySelector('.format-hint').textContent, 'Два упражнения по очереди, отдых после пары.');
  // Новые кнопки не принимаются за чипы зон и не появляются на генераторе.
  assert.equal(zoneChips(root).length, 0);
});

test('на генераторе переключателей формата нет: формат не меняет, какие упражнения подобраны', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY });
  startGenerator(root);
  assert.equal(root.querySelector('.format-picker'), null);
  assert.equal(zoneChips(root).length, 7);
});

test('«Разогрев» выкл: секции нет, «Назад» спрашивает; вкл: секция вернулась, до 4 упражнений и все подходят по «Что есть дома»', async t => {
  // Из пяти разогревов два с гантелями: при отмеченных резинках подходят три.
  const library = needing(['dumbbells'], ['circ-1', 'circ-2']);
  const asked = [];
  const { root } = mountScreen(t, { library, seed: counter(), confirm: async question => { asked.push(question); return false; } });
  startManual(root);
  assert.deepEqual(blockTitles(root), ['Стартовая разминка', 'Круговой разогрев', 'Завершение']);

  blockChip(root, 'circuit').click();
  assert.deepEqual(pressedBlocks(root), ['warmup', 'cooldown']);
  assert.deepEqual(blockTitles(root), ['Стартовая разминка', 'Завершение'], 'секции «Круговой разогрев» нет');
  assert.equal(formatReason(root).hidden, true);

  back(root);
  await settle(0);
  assert.deepEqual(asked, [ASK], 'блок выключен — это правка');
  assert.ok(root.querySelector('.format-picker'), 'отказ — сборка на месте');

  blockChip(root, 'circuit').click();
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
  assert.deepEqual(blockTitles(root), ['Стартовая разминка', 'Круговой разогрев', 'Завершение']);
  const circuit = namesIn(blockOf(root, 'Круговой разогрев'));
  assert.ok(circuit.length > 0 && circuit.length <= SKELETON.circuit.count, `упражнений в разогреве: ${circuit.length}`);
  assert.deepEqual(circuit.toSorted(), ['Разогрев 3', 'Разогрев 4', 'Разогрев 5'], 'неподходящие по инвентарю не взяты');
});

test('все три блока выключаются и включаются, остальное в сборке не меняется', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: counter() });
  assemble(root, [nameOf('squat-a', TEST_LIBRARY), nameOf('row-a', TEST_LIBRARY)]);
  const strength = () => namesIn(blockOf(root, 'Пара 1')).sort();
  const before = strength();

  for (const slot of ['warmup', 'circuit', 'cooldown']) blockChip(root, slot).click();
  assert.deepEqual(pressedBlocks(root), []);
  assert.deepEqual(blockTitles(root), ['Пара 1']);
  assert.deepEqual(strength(), before);

  for (const slot of ['warmup', 'circuit', 'cooldown']) blockChip(root, slot).click();
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
  assert.deepEqual(blockTitles(root), ['Стартовая разминка', 'Круговой разогрев', 'Пара 1', 'Завершение']);
  assert.equal(namesIn(blockOf(root, 'Стартовая разминка')).length, SKELETON.warmup.count);
  assert.equal(namesIn(blockOf(root, 'Завершение')).length, SKELETON.cooldown.count);
});

test('включить блок, для которого нет подходящих упражнений, нельзя: кнопка не нажата, причина названа, следующее нажатие её снимает', t => {
  const library = needing(['dumbbells'], ['circ-1', 'circ-2', 'circ-3', 'circ-4', 'circ-5']);
  const { root } = mountScreen(t, { library });
  startManual(root);
  // С отмеченными резинками разогрева нет с самого начала: блок выключен.
  assert.deepEqual(pressedBlocks(root), ['warmup', 'cooldown']);
  assert.deepEqual(blockTitles(root), ['Стартовая разминка', 'Завершение']);

  blockChip(root, 'circuit').click();
  assert.equal(blockChip(root, 'circuit').getAttribute('aria-pressed'), 'false');
  assert.equal(formatReason(root).hidden, false);
  assert.equal(formatReason(root).textContent, 'Для блока «Разогрев» нет подходящих упражнений.');
  assert.deepEqual(blockTitles(root), ['Стартовая разминка', 'Завершение'], 'тренировка не изменилась');

  formatChip(root, 'sets').click();
  assert.equal(formatReason(root).hidden, true);
  assert.equal(formatReason(root).textContent, '');
});

test('нет подходящих упражнений после того, как блок выключили: причина называет слот, а выбор человека остаётся', t => {
  const library = needing(['dumbbells'], ['stretch-1', 'stretch-2', 'stretch-3', 'breathing']);
  const profile = profileOf('band_long', 'dumbbells');
  const { root } = mountScreen(t, { library, gearProfile: profile });
  startManual(root);
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);

  blockChip(root, 'cooldown').click();
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit']);
  profile.set(['band_long']);
  blockChip(root, 'cooldown').click();
  assert.equal(formatReason(root).textContent, 'Для блока «Завершение» нет подходящих упражнений.');
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit']);

  profile.set(['band_long', 'dumbbells']);
  blockChip(root, 'cooldown').click();
  assert.equal(formatReason(root).hidden, true);
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
});

test('фокус остаётся на нажатой кнопке: переключатели не перерисовываются вместе с блоками', t => {
  const { document, root } = mountScreen(t, { library: TEST_LIBRARY });
  startManual(root);
  const chip = blockChip(root, 'warmup');
  chip.focus();
  chip.click();
  assert.equal(document.activeElement, chip);
  assert.ok(chip.isConnected);
  const sets = formatChip(root, 'sets');
  sets.focus();
  sets.click();
  assert.equal(document.activeElement, sets);
  assert.equal(formatChip(root, 'sets'), sets, 'тот же узел');
});

test('смена формата или блока — правка; тот же формат, а также смена и возврат — нет', async t => {
  const asked = [];
  const { root } = mountScreen(t, { library: TEST_LIBRARY, confirm: async question => { asked.push(question); return true; } });

  startManual(root);
  formatChip(root, 'pairs').click();
  back(root);
  assert.ok(root.querySelector('.builder-path'), 'то же «Пары» — не правка, ушли сразу');

  startManual(root);
  formatChip(root, 'loop').click();
  formatChip(root, 'pairs').click();
  back(root);
  assert.ok(root.querySelector('.builder-path'), 'вернули «Пары» — как было');
  assert.deepEqual(asked, []);

  startManual(root);
  formatChip(root, 'loop').click();
  back(root);
  await settle(0);
  startManual(root);
  blockChip(root, 'cooldown').click();
  back(root);
  await settle(0);
  assert.deepEqual(asked, [ASK, ASK], 'смена формата и выключенный блок спрашивают');
});

test('сборка: формат меняет блоки силовой части, кругов у блоков на сборке нет', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY });
  assemble(root, ['squat-a', 'hinge-a', 'row-a', 'press-a'].map(key => nameOf(key, TEST_LIBRARY)));
  const strengthTitles = () => blockTitles(root).filter(title => !['Стартовая разминка', 'Круговой разогрев', 'Завершение'].includes(title));
  assert.deepEqual(strengthTitles(), ['Пара 1', 'Пара 2']);

  formatChip(root, 'loop').click();
  assert.deepEqual(strengthTitles(), ['Силовой круг']);
  assert.equal(namesIn(blockOf(root, 'Силовой круг')).length, 4);
  assert.equal(blockOf(root, 'Силовой круг').querySelector('.builder-block-sub').textContent, '4 упражнения подряд');

  formatChip(root, 'sets').click();
  assert.deepEqual(strengthTitles(), ['Упражнение 1', 'Упражнение 2', 'Упражнение 3', 'Упражнение 4']);
  assert.equal(root.querySelector('.format-hint').textContent, 'Все подходы одного упражнения, потом следующее.');
  assert.deepEqual(roundsTags(root), [], 'круги и подходы показывает только результат');

  // Все упражнения остались, как были.
  assert.deepEqual(rows(root).filter(name => /^Многосуставное/.test(name)).sort(),
    ['squat-a', 'hinge-a', 'row-a', 'press-a'].map(key => nameOf(key, TEST_LIBRARY)).sort());
});

test('результат: «Подходы» — блок на упражнение, метка «2 подхода»; сохранение пишет format, правка открывает с «Подходами»', async t => {
  const { root, saved, view } = mountScreen(t, { library: TEST_LIBRARY, store: okStore, seed: () => 1 });
  startGenerator(root);
  generateNow(root);
  const expected = generate({ level: 'beginner', zones: [], seed: 1, library: TEST_LIBRARY }).compact;

  // Порядок на экране: «Другой вариант», отказ, переключатели, блоки.
  const picker = root.querySelector('.format-picker');
  assert.equal(picker.querySelector('h3').id, 'result-format-title');
  assert.equal(root.querySelector('.builder-variant').nextElementSibling, root.querySelector('.builder-refusal'));
  assert.equal(root.querySelector('.builder-refusal').nextElementSibling, picker);
  assert.equal(picker.nextElementSibling, root.querySelector('.builder-blocks'));
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
  assert.deepEqual(pressedFormat(root), ['pairs']);

  formatChip(root, 'sets').click();
  const titles = blockTitles(root);
  const exercises = titles.filter(title => title.startsWith('Упражнение '));
  assert.deepEqual(exercises, expected.strength.map((_, index) => `Упражнение ${index + 1}`));
  assert.ok(!titles.some(title => title.startsWith('Пара ')));
  assert.deepEqual(roundsTags(root), expected.strength.map(() => '2 подхода'));

  const compact = await saveDraft(root, saved);
  assert.equal(compact.format, 'sets');
  assert.deepEqual(compact.strength, expected.strength, 'упражнения те же');

  await view.edit(saved[0][0], compact);
  assert.deepEqual(pressedFormat(root), ['sets']);
  assert.ok(blockTitles(root).includes('Упражнение 1'));
  assert.deepEqual(roundsTags(root), expected.strength.map(() => '2 подхода'));
});

test('результат: у «Круга» метка «2 круга», у продвинутого три — «3 круга» у пар и круга, «3 подхода» у подходов', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: () => 1 });
  startGenerator(root);
  levelOption(root, 'Продвинутый').click();
  generateNow(root);
  const strength = generate({ level: 'advanced', zones: [], seed: 1, library: TEST_LIBRARY }).compact.strength;

  assert.ok(roundsTags(root).every(tag => tag === '3 круга'));
  formatChip(root, 'loop').click();
  assert.deepEqual(roundsTags(root), ['3 круга']);
  assert.ok(blockTitles(root).includes('Силовой круг'));
  formatChip(root, 'sets').click();
  assert.deepEqual(roundsTags(root), strength.map(() => '3 подхода'));
});

test('результат: счёт упражнений в подзаголовке следует за блоками', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: () => 1 });
  startGenerator(root);
  generateNow(root);
  const expected = generate({ level: 'beginner', zones: [], seed: 1, library: TEST_LIBRARY }).compact;
  const subtitle = count => `Начальный уровень · ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}`;
  const total = exerciseCount(expected);
  assert.equal(root.querySelector('.builder-subtitle').textContent, subtitle(total));

  blockChip(root, 'circuit').click();
  assert.equal(root.querySelector('.builder-subtitle').textContent, subtitle(total - expected.circuit.length));
  blockChip(root, 'circuit').click();
  assert.equal(root.querySelector('.builder-subtitle').textContent, subtitle(total));
  assert.equal(root.querySelectorAll('.builder-subtitle').length, 1);
});

test('результат: смена формата и блока — правка, «Назад» спрашивает', async t => {
  const asked = [];
  const { root } = mountScreen(t, { library: TEST_LIBRARY, confirm: async question => { asked.push(question); return false; } });
  startGenerator(root);
  generateNow(root);
  back(root);
  assert.ok(root.querySelector('.builder-generate'), 'без правок — сразу на генератор');

  generateNow(root);
  formatChip(root, 'loop').click();
  back(root);
  await settle(0);
  assert.deepEqual(asked, [ASK]);
  assert.deepEqual(pressedFormat(root), ['loop'], 'отказ — результат на месте');

  formatChip(root, 'pairs').click();
  blockChip(root, 'warmup').click();
  back(root);
  await settle(0);
  assert.equal(asked.length, 2);
});

test('«Другой вариант» при «Круге» и выключенном «Завершении» сохраняет оба, остальные блоки собирает заново', async t => {
  const { root, saved } = mountScreen(t, { library: TEST_LIBRARY, store: okStore, seed: counter() });
  startGenerator(root);
  generateNow(root);
  formatChip(root, 'loop').click();
  blockChip(root, 'cooldown').click();

  otherVariant(root);
  assert.deepEqual(pressedFormat(root), ['loop']);
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit']);
  const titles = blockTitles(root);
  assert.ok(titles.includes('Силовой круг'));
  assert.ok(!titles.includes('Завершение'));

  const compact = await saveDraft(root, saved);
  assert.equal(compact.format, 'loop');
  assert.deepEqual(compact.cooldown, []);
  assert.equal(compact.warmup.length, SKELETON.warmup.count);
  assert.equal(compact.circuit.length, SKELETON.circuit.count);
});

test('«Другой вариант» при «Подходах» и всех выключенных блоках: формат и пустые блоки остаются, силовая часть другая', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: counter() });
  startGenerator(root);
  generateNow(root);
  formatChip(root, 'sets').click();
  for (const slot of ['warmup', 'circuit', 'cooldown']) blockChip(root, slot).click();
  assert.deepEqual(pressedBlocks(root), []);

  otherVariant(root);
  assert.deepEqual(pressedFormat(root), ['sets']);
  assert.deepEqual(pressedBlocks(root), []);
  assert.ok(blockTitles(root).every(title => title.startsWith('Упражнение ')), blockTitles(root).join());
});

test('«Другой вариант» без правок формата оставляет «Пары» и все блоки', t => {
  const { root } = mountScreen(t, { library: TEST_LIBRARY, seed: counter() });
  startGenerator(root);
  generateNow(root);
  otherVariant(root);
  assert.deepEqual(pressedFormat(root), ['pairs']);
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
});

test('«Изменить» у записи без format открывает «Пары»; без правок «Назад» не спрашивает, сохранение пишет format: pairs', async t => {
  const asked = [];
  const { root, saved, view } = mountScreen(t, { library: TEST_LIBRARY, store: okStore, confirm: async question => { asked.push(question); return true; } });
  assert.ok(!('format' in MANUAL), 'запись сохранена до появления формата');

  await view.edit('my-old00001', MANUAL);
  assert.deepEqual(pressedFormat(root), ['pairs']);
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
  formatChip(root, 'pairs').click();
  back(root);
  assert.ok(root.querySelector('.builder-path'));
  assert.deepEqual(asked, []);

  await view.edit('my-old00001', MANUAL);
  const compact = await saveDraft(root, saved);
  assert.equal(compact.format, 'pairs');
  assert.deepEqual(compact.strength, MANUAL.strength);
});

test('«Изменить» открывает запись с её форматом и выключенными блоками', async t => {
  const own = { ...MANUAL, format: 'sets', circuit: [], cooldown: [] };
  const { root, saved, view } = mountScreen(t, { library: TEST_LIBRARY, store: okStore });
  await view.edit('my-fmt00001', own);

  assert.deepEqual(pressedFormat(root), ['sets']);
  assert.deepEqual(pressedBlocks(root), ['warmup']);
  assert.deepEqual(blockTitles(root), ['Стартовая разминка', 'Упражнение 1', 'Упражнение 2', 'Упражнение 3', 'Упражнение 4']);

  const compact = await saveDraft(root, saved);
  assert.deepEqual([compact.format, compact.circuit, compact.cooldown], ['sets', [], []]);
});

test('приложение: «Изменить» у записи без format на устройстве открывает «Пары»', async t => {
  const { document, root } = mount(t, { library: TEST_LIBRARY, preload: onDevice('my-old00002', MANUAL) });
  await settle(0);
  openWorkouts(document);
  document.querySelector('#screen-workouts .workout-edit').click();
  await settle(0);

  assert.deepEqual(shown(document), ['screen-builder']);
  assert.deepEqual(pressedFormat(root), ['pairs']);
  assert.deepEqual(pressedBlocks(root), ['warmup', 'circuit', 'cooldown']);
});

test('приложение: своя тренировка в «Подходах» в «Сегодня» — отметки «Подход N», метка «2 подхода», вступление к подходам', async t => {
  const { window, document, app, root } = mount(t, { library: TEST_LIBRARY });
  await settle(0);
  openBuilder(document);
  assemble(root, ['squat-a', 'row-a'].map(key => nameOf(key, TEST_LIBRARY)));
  formatChip(root, 'sets').click();
  toSave(root);
  typeName(root, 'Подходами');
  root.querySelector('.builder-save').click();
  await settle(0);

  const [{ id, compact }] = await app.store.list();
  assert.equal(compact.format, 'sets');
  [...document.querySelectorAll('#screen-workouts .workout-card')]
    .find(card => card.querySelector('.workout-card-title').textContent === 'Подходами').click();
  assert.deepEqual(shown(document), ['screen-today']);
  assert.equal(window.localStorage.getItem(CURRENT_KEY), id);

  const today = document.getElementById('screen-today');
  const block = number => today.querySelector(`#ex${number}`);
  assert.deepEqual([...block(1).querySelectorAll('label.check')].map(label => label.textContent), ['Подход 1', 'Подход 2']);
  assert.match(block(1).querySelector('input[data-mark]').getAttribute('aria-label'), /: подход 1$/);
  assert.equal(block(1).querySelector('.round-tag').textContent, '2 подхода');
  assert.equal(block(2).querySelector('.round-tag').textContent, '2 подхода');
  assert.equal(today.querySelector('#circuit .round-tag').textContent, '3 круга');
  assert.deepEqual([...today.querySelectorAll('#circuit .exercise')[0].querySelectorAll('label.check')].map(label => label.textContent),
    ['Круг 1', 'Круг 2', 'Круг 3']);
  assert.deepEqual([...today.querySelectorAll('.pair-rules h2')].map(h => h.textContent), ['Как выполнять подходы']);
  assert.equal(today.querySelector('.facts').textContent.includes('подхода на упражнение'), true);
});
