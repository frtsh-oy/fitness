// Раздел «Конструктор»: вход, ручная сборка, замена упражнения и сохранение.
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
import { serializeCompact, exerciseCount, NAME_MAX } from '../builder/compact.js';
import { generate } from '../builder/generator.js';
import { CORE_GROUPS, MAX_STRENGTH } from '../builder/rules.js';
import { plural } from '../builder/texts.js';
import { LIBRARY } from '../exercises/index.js';
import { groupsPhrase } from '../muscles.js';
import { TEST_LIBRARY } from './fixtures/test-library.js';

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
function mountScreen(t, { store, library = LIBRARY, confirm = async () => true } = {}) {
  const { window, document } = makeDom('<!doctype html><html><body><div id="host"></div></body></html>');
  t.after(() => window.close());
  window.scrollTo = () => {};
  const root = document.getElementById('host');
  const saved = [];
  const view = renderBuilder({
    host: root, win: window, library, store, confirm, seed: () => 1, openLink() {},
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

test('вход: «Собрать самому» и устройство тренировки; нет слов «ИИ», «персональный», «тренер»', t => {
  const { document, root } = mount(t);
  openBuilder(document);

  assert.equal(root.querySelector('h2').textContent, 'Конструктор');
  assert.equal(root.querySelector('.builder-lead').textContent,
    'Тренировка всегда на всё тело. Собери её сам из библиотеки или получи готовую по правилам, а потом сохрани.');

  const paths = root.querySelectorAll('.builder-path');
  assert.equal(paths.length, 1, 'вторую кнопку добавит генератор вместе со своим экраном');
  assert.equal(paths[0].querySelector('.builder-path-title').textContent, 'Собрать самому');
  assert.equal(paths[0].querySelector('.builder-path-note').textContent,
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

  // В настоящей библиотеке упражнений каждого типа ровно столько, сколько
  // скелет берёт целиком, поэтому набор по блокам известен, а порядок нет.
  const namesOf = block => [...block.querySelectorAll('.builder-item-name')].map(n => n.textContent).sort();
  const library = slot => LIBRARY.filter(e => e.slot === slot).map(e => e.name).sort();
  assert.deepEqual(blocks.map(namesOf), [library('warmup'), library('circuit'), library('cooldown')]);

  assert.equal(root.querySelectorAll('.builder-replace').length, 9);
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

  // В настоящей библиотеке разминок две, и обе уже в тренировке.
  const real = mount(t);
  openBuilder(real.document);
  startManual(real.root);
  const empty = openReplace(real.root, 'Стартовая разминка');
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
  assert.equal(webApp.confirms[0].message, 'Бросить сборку? Несохранённые изменения пропадут.');
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
  assert.equal(webApp.confirms[0].message, 'Бросить сборку? Несохранённые изменения пропадут.');
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
  assert.equal(root.querySelector('h2').textContent, 'Своя тренировка', 'у сгенерированной пока та же сборка');
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
