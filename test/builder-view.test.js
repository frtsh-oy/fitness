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
function mountScreen(t, { store, library = LIBRARY, confirm = async () => true, seed = () => 1 } = {}) {
  const { window, document } = makeDom('<!doctype html><html><body><div id="host"></div></body></html>');
  t.after(() => window.close());
  window.scrollTo = () => {};
  const root = document.getElementById('host');
  const saved = [];
  const view = renderBuilder({
    host: root, win: window, library, store, confirm, seed, openLink() {},
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
const zoneChip = (root, label) => [...root.querySelectorAll('.zone-chip')].find(chip => chip.textContent === label);
const pressedZones = root => [...root.querySelectorAll('.zone-chip[aria-pressed="true"]')].map(chip => chip.textContent);
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

  assert.equal(root.querySelector('.builder-steps-title').textContent, 'Любая тренировка устроена одинаково');
  const steps = [...root.querySelectorAll('.builder-steps li')]
    .map(li => [li.querySelector('strong').textContent, li.querySelector('span').textContent]);
  assert.deepEqual(steps, [
    ['Разминка', 'Плавно, без длительных остановок'],
    ['Круговой разогрев', 'Повышает пульс, резинки лёгкие'],
    ['Силовые пары', 'Два упражнения подряд, потом отдых'],
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
  assert.deepEqual(result, { ...before, t: result.t }, 'содержимое то же');
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
  assert.ok([...root.querySelectorAll('.zone-chip')].every(chip => chip.getAttribute('aria-disabled') === 'true'),
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
      'Кругов в паре: 2', 'Упражнения: базовые', 'Остановка: за 3–4 повтора до отказа'],
    ['Средний', 'Около полугода регулярных занятий',
      'Кругов в паре: 2', 'Упражнения: базовые и средние', 'Остановка: за 2–3 повтора до отказа'],
    ['Продвинутый', 'Годы регулярных занятий',
      'Кругов в паре: 3', 'Упражнения: все', 'Остановка: за 1–2 повтора до отказа'],
  ]);
  assert.deepEqual(checkedLevels(root), ['Начальный'], 'выбран первый из доступных');
  assert.equal(root.querySelector('.zone-hint').textContent,
    'Упор добавит упражнение на каждую выбранную зону, не больше двух. Остальные группы мышц остаются в тренировке.');
  assert.deepEqual([...root.querySelectorAll('.zone-chip')].map(chip => chip.textContent),
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
