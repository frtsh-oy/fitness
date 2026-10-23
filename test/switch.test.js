// Переключение тренировок: карточка в «Тренировках» делает тренировку текущей,
// «Сегодня» перерисовывается без перезагрузки, а то, что не должно пострадать
// при смене (отметки, таймер), остаётся на месте. Монтируем на настоящем
// index.html, как test/app.test.js: так тест заодно сторожит узлы, за которые
// цепляется app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { startApp, CURRENT_KEY } from '../app.js';
import { recordKey } from '../my-workouts.js';
import { storageKey, currentDay } from '../storage.js';
import { serializeCompact, expandWorkout, exerciseCount } from '../builder/compact.js';
import { LIBRARY } from '../exercises/index.js';
import { countMarks } from '../workouts/schema.js';
import { scheduleShort, markId } from '../render.js';
import { weeklySets } from '../weekly.js';
import { regionSummary } from '../volume.js';
import { warmupOnlyGroups, idleGroups } from '../bodymap.js';
import { groupsPhrase } from '../muscles.js';
import legs from '../workouts/legs-mwf.js';
import { WORKOUTS } from '../workouts/index.js';

const PAGE = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

const OWN_ID = 'my-test0001';
const OTHER_ID = 'my-test0002';
// Ручная сборка по вторникам и четвергам: дни и состав нарочно не такие, как у
// готовой, чтобы недельная нагрузка и карта у двух тренировок различались.
const OWN = {
  v: 1, name: 'Мой тест', days: [2, 4], level: null, zones: [], format: 'pairs',
  warmup: ['pelvic-tilt', 'thoracic-rotation'], circuit: ['chinese-squat', 'knee-raise'],
  strength: ['rdl', 'adduction', 'glute-bridge', 'leg-press'], focus: [],
  cooldown: ['hip-flexor', 'breathing'], t: 1760000000000,
};
// Подобранная по уровню, и позже первой: «Мои» идут от новой к старой.
const OTHER = { ...OWN, name: 'Вторая моя', level: 'beginner', t: 1760000001000 };
const ownWorkout = expandWorkout(OWN_ID, OWN).workout;

// То, что лежит на устройстве до запуска: запись своей тренировки.
const onDevice = (id = OWN_ID, compact = OWN) => ({ [recordKey(id)]: serializeCompact(compact) });
// В h1 строки заголовка склеены без пробела (между ними <br>), в карточке — как в данных.
const LEGS_H1 = legs.titleLines.join('');
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

function mount(t, { preload = {}, url, webApp = null, library, beforeStart } = {}) {
  const { window, document } = makeDom(PAGE, { url });
  t.after(() => window.close());
  // В jsdom прокрутки нет, а показ раздела её просит: без заглушки каждый
  // тест сыплет «Not implemented» в вывод.
  window.scrollTo = () => {};
  for (const [key, value] of Object.entries(preload)) window.localStorage.setItem(key, value);
  if (webApp) window.Telegram = { WebApp: webApp };
  beforeStart?.(window);
  return { window, document, app: startApp(window, { library }) };
}

// Клиент Telegram ровно в том объёме, в каком его трогают telegram.js и app.js:
// облако, и вопрос, который клиент задаёт человеку (ответ отдаёт тест).
function fakeWebApp({ cloud = null } = {}) {
  const confirms = [];
  return {
    confirms,
    CloudStorage: cloud,
    initDataUnsafe: {},
    isVersionAtLeast: () => true,
    showConfirm(message, answer) { confirms.push({ message, answer }); },
  };
}

// Облако, которое не отвечает никогда: ни одного колбэка.
const silentCloud = { getItem() {}, setItem() {}, removeItem() {}, getKeys() {}, getItems() {}, removeItems() {} };

// Облако отвечает сразу, но принимать записи отказывается.
function refusingCloud(data = {}) {
  return {
    getItem: (key, cb) => cb(null, data[key] ?? ''),
    setItem: (key, value, cb) => cb(new Error('отказ облака')),
    removeItem: (key, cb) => cb(null, true),
    removeItems: (keys, cb) => cb(null, true),
    getKeys: cb => cb(null, Object.keys(data)),
    getItems: (keys, cb) => cb(null, Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]]))),
  };
}

// Опрос молчащего облака ждёт таймаут в пять секунд, и без этого файл тестов
// держал бы процесс живым лишние пять секунд после последнего теста.
function unrefCloudTimeouts(t) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...args) => {
    const timer = real(fn, ms, ...args);
    if (ms === 5000) timer.unref();
    return timer;
  };
  t.after(() => { globalThis.setTimeout = real; });
}

const shown = d => [...d.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);
const heading = d => d.querySelector('h1').textContent;
const openWorkouts = d => d.querySelector('[data-section="workouts"]').click();
const cardOf = (d, title) => [...d.querySelectorAll('#screen-workouts .workout-card')]
  .find(card => card.querySelector('.workout-card-title').textContent === title);
const kickerOf = (d, title) => cardOf(d, title).querySelector('.workout-card-kicker').textContent;
const pick = (d, title) => { openWorkouts(d); cardOf(d, title).click(); };
const boxes = d => [...d.querySelectorAll('#workout input[data-mark]')];

test('карточка своей тренировки делает её текущей и открывает «Сегодня»', async t => {
  const { window, document, app } = mount(t, { preload: onDevice() });
  await settle(0);
  assert.equal(heading(document), LEGS_H1, 'сначала открыта готовая по умолчанию');
  assert.equal(app.workout.id, 'legs-mwf');
  assert.deepEqual(app.store.peek(OWN_ID), OWN, 'хранилище своих отдаётся наружу');

  pick(document, OWN.name);

  assert.equal(heading(document), OWN.name);
  assert.equal(document.getElementById('kicker').textContent, ownWorkout.kicker);
  const trained = [...document.querySelectorAll('#week .day.train')].map(day => day.textContent);
  assert.equal(trained.join(' · '), scheduleShort(OWN.days), 'полоса недели показывает дни своей тренировки');
  assert.equal(document.querySelectorAll('#workout .exercise').length, exerciseCount(OWN));
  assert.deepEqual(shown(document), ['screen-today']);
  assert.equal(window.localStorage.getItem(CURRENT_KEY), OWN_ID);
  assert.equal(app.workout.id, OWN_ID);

  // Раздел рисуется заново при каждом показе: отметка «сейчас» уехала на свою.
  openWorkouts(document);
  assert.equal(cardOf(document, OWN.name).getAttribute('aria-current'), 'true');
  assert.match(cardOf(document, OWN.name).textContent, /Сейчас в «Сегодня»/);
  assert.equal(cardOf(document, legs.title).hasAttribute('aria-current'), false);
  assert.doesNotMatch(cardOf(document, legs.title).textContent, /Сейчас в «Сегодня»/);
});

test('выбор переживает перезапуск', async t => {
  const first = mount(t, { preload: onDevice() });
  await settle(0);
  pick(first.document, OWN.name);

  // Устройство то же, окно новое: переносим всё, что лежит в localStorage.
  const device = Object.fromEntries(Object.keys(first.window.localStorage)
    .map(key => [key, first.window.localStorage.getItem(key)]));
  const second = mount(t, { preload: device });

  // Сразу, не дожидаясь ни списка, ни отметок.
  assert.equal(heading(second.document), OWN.name);
  assert.equal(second.app.workout.id, OWN_ID);
});

test('?w= важнее запомненного; неизвестный ?w= не мешает запомненному', t => {
  const remembered = { ...onDevice(), [CURRENT_KEY]: OWN_ID };

  const linked = mount(t, { preload: remembered, url: 'https://example.test/?w=legs-mwf' });
  assert.equal(heading(linked.document), LEGS_H1);
  assert.equal(linked.window.localStorage.getItem(CURRENT_KEY), OWN_ID, 'ссылка запомненное не перезаписывает');

  const unknown = mount(t, { preload: remembered, url: 'https://example.test/?w=нет-такой' });
  assert.equal(heading(unknown.document), OWN.name);
});

test('запомненной своей тренировки на устройстве уже нет — открывается готовая по умолчанию', t => {
  const { document } = mount(t, { preload: { [CURRENT_KEY]: OWN_ID } });
  assert.equal(heading(document), LEGS_H1);
});

// Запись есть в облаке и потому в «Мои», а на устройстве её нет: localStorage
// отказывает в записи (место кончилось), и копия не легла. Раньше тап по такой
// карточке молча ничего не делал: открывать тренировку приходилось с устройства.
test('своей тренировки нет на устройстве, а в списке «Мои» она есть — карточка открывает её из списка', async t => {
  const { document, app } = mount(t, {
    webApp: fakeWebApp({ cloud: refusingCloud(onDevice()) }),
    beforeStart: window => {
      window.Storage.prototype.setItem = () => { throw new Error('место на устройстве кончилось'); };
    },
  });
  await settle(20);
  assert.equal(app.store.peek(OWN_ID), null, 'условие теста: на устройстве записи нет');
  assert.equal(heading(document), LEGS_H1);

  pick(document, OWN.name);

  assert.equal(heading(document), OWN.name);
  assert.equal(app.workout.id, OWN_ID);
  assert.equal(document.querySelectorAll('#workout .exercise').length, exerciseCount(OWN));
  assert.deepEqual(shown(document), ['screen-today']);
});

test('отметки разных тренировок не смешиваются', async t => {
  const { window, document, app } = mount(t, { preload: onDevice() });
  await app.ready;
  const marks = app.marks;
  const legsMark = boxes(document)[0].dataset.mark;
  boxes(document)[0].click();
  assert.deepEqual([...app.marks], [legsMark]);

  pick(document, OWN.name);
  await app.ready;
  assert.equal(app.marks.size, 0, 'у своей тренировки отметок ещё нет');
  assert.equal(app.total, countMarks(ownWorkout));
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 0 из ${app.total} отметок`);
  assert.equal(boxes(document).filter(box => box.checked).length, 0);
  const ownMark = boxes(document)[0].dataset.mark;
  boxes(document)[0].click();

  pick(document, legs.title);
  await app.ready;
  assert.deepEqual([...app.marks], [legsMark], 'отметка прежней тренировки на месте');
  assert.equal(boxes(document).filter(box => box.checked).length, 1);
  assert.equal(app.marks, marks, 'набор отметок один на всё время работы');

  const legsKey = storageKey('legs-mwf', currentDay());
  const ownKey = storageKey(OWN_ID, currentDay());
  assert.notEqual(legsKey, ownKey);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(legsKey)), [legsMark]);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(ownKey)), [ownMark]);
});

test('отложенная отметка уходит под прежнюю тренировку при переключении', async t => {
  const { window, document } = mount(t, { preload: onDevice() });
  await settle(0);
  const legsKey = storageKey('legs-mwf', currentDay());
  const ownKey = storageKey(OWN_ID, currentDay());

  const mark = boxes(document)[0].dataset.mark;
  boxes(document)[0].click();          // запись отложена на полсекунды
  pick(document, OWN.name);            // и тут же переключили
  assert.deepEqual(JSON.parse(window.localStorage.getItem(legsKey)), [mark], 'отметка ушла сразу, под прежним id');

  // Таймер отложенной записи не должен пережить смену: он записал бы пустой
  // набор уже под id новой тренировки.
  await settle(700);
  assert.equal(window.localStorage.getItem(ownKey), null);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(legsKey)), [mark]);
});

test('таймер отдыха не сбрасывается при переключении', async t => {
  const { document, app } = mount(t, { preload: onDevice() });
  await settle(0);
  document.getElementById('timer-toggle').click();
  await settle(1100);                  // настоящие часы: отсчёт ушёл от шестидесяти
  const before = app.timer.remaining;
  assert.ok(app.timer.running && before < 60, 'отсчёт идёт');

  pick(document, OWN.name);
  assert.equal(app.timer.running, true);
  assert.equal(app.timer.remaining, before, 'остаток не сбросился');
  assert.equal(document.getElementById('timer-open').dataset.running, 'true');

  pick(document, legs.title);
  assert.equal(app.timer.running, true, 'и при возврате тоже');
});

test('недельная нагрузка считает только текущую тренировку', async t => {
  const { document } = mount(t, { preload: onDevice() });
  await settle(0);
  const quads = () => [...document.querySelectorAll('.weekly-row')]
    .find(row => row.querySelector('.weekly-name').textContent === 'Квадрицепсы')
    .querySelector('.weekly-main').textContent;
  const expected = workout => String(weeklySets([workout]).get('quads').comparable);
  assert.notEqual(expected(legs), expected(ownWorkout), 'без различия между тренировками тест ничего не докажет');

  document.querySelector('.weekly-toggle').click();
  assert.equal(quads(), expected(legs));

  pick(document, OWN.name);            // раскрытая — перерисована
  assert.equal(quads(), expected(ownWorkout));

  document.querySelector('.weekly-toggle').click();   // свернули
  pick(document, legs.title);
  document.querySelector('.weekly-toggle').click();   // и раскрыли: рисуется уже для новой
  assert.equal(quads(), expected(legs));
});

// Среди полигонов обоих видов ищем тот, чей подбор начинается с нужной области:
// другого способа адресовать область чужой библиотеки нет (см. то же в
// test/bodymap-section.test.js).
function pickByTitle(d, window, startsWith) {
  const polygons = [...d.querySelectorAll('.bodymap-anterior polygon'), ...d.querySelectorAll('.bodymap-posterior polygon')];
  for (const polygon of polygons) {
    polygon.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const title = d.querySelector('.bodymap-pick h3')?.textContent ?? '';
    if (title.startsWith(startsWith)) return title;
  }
  return null;
}

// Разгибатели поясницы: у готовой три силовых подхода, у своей один.
const BACK = 'Разгибатели поясницы';
const backTitle = workout => `${BACK} — ${regionSummary(workout, ['strength']).get('lower-back').sets} подх.`;
const ownNotes = `Только в разминке и заминке: ${groupsPhrase(warmupOnlyGroups(ownWorkout))}. `
  + `Светлым — то, чего нет в разметке: ${groupsPhrase(idleGroups(ownWorkout))}.`;

test('подписи под картой и подбор относятся к новой тренировке', async t => {
  const { window, document } = mount(t, { preload: onDevice() });
  await settle(0);
  document.querySelector('.bodymap-toggle').click();
  assert.equal(pickByTitle(document, window, BACK), backTitle(legs));
  assert.equal(document.querySelector('.bodymap-groups').textContent,
    'Только в разминке и заминке: сгибатели бедра, задняя дельта.');

  pick(document, OWN.name);

  assert.equal(document.querySelector('.bodymap-pick').children.length, 0, 'подбор прежней тренировки убран');
  assert.equal(document.querySelector('.bodymap-groups').textContent, ownNotes);
  assert.equal(document.querySelector('.bodymap-toggle').getAttribute('aria-expanded'), 'true', 'карта осталась раскрытой');
  // Карта построена заново, а не осталась прежней.
  assert.equal(pickByTitle(document, window, BACK), backTitle(ownWorkout));
});

test('карта, свёрнутая при смене тренировки, раскрывается уже для новой', async t => {
  const { window, document } = mount(t, { preload: onDevice() });
  await settle(0);
  const toggle = document.querySelector('.bodymap-toggle');
  toggle.click();                      // построена для готовой
  toggle.click();                      // и свёрнута

  pick(document, OWN.name);
  assert.equal(document.querySelector('.bodymap-groups').textContent, ownNotes, 'подписи пересчитаны и у свёрнутой');
  toggle.click();
  assert.equal(pickByTitle(document, window, BACK), backTitle(ownWorkout));
});

test('своя тренировка показывается сразу, даже если облако молчит', t => {
  unrefCloudTimeouts(t);
  const webApp = fakeWebApp({ cloud: silentCloud });
  const { document, app } = mount(t, { preload: { ...onDevice(), [CURRENT_KEY]: OWN_ID }, webApp });

  // Синхронно после запуска: ни ответа облака, ни списка никто не ждал.
  assert.equal(heading(document), OWN.name);
  assert.equal(document.querySelectorAll('#workout .exercise').length, exerciseCount(OWN));
  assert.equal(app.workout.id, OWN_ID);
});

test('убранное из библиотеки упражнение — пропуск с пометкой, а не падение', t => {
  const library = LIBRARY.filter(e => e.key !== 'rdl');
  const { document } = mount(t, { preload: { ...onDevice(), [CURRENT_KEY]: OWN_ID }, library });

  const note = document.getElementById('removed-note');
  assert.equal(note.hidden, false);
  assert.equal(note.textContent, 'Убрано из библиотеки и пропущено упражнений: 1.');
  assert.equal(document.querySelectorAll('#workout .exercise').length, exerciseCount(OWN) - 1);

  openWorkouts(document);
  cardOf(document, legs.title).click();
  assert.equal(note.hidden, true, 'у готовой тренировки пометки нет');
  assert.equal(note.textContent, '');
});

test('в «Мои» число упражнений — то, что человек увидит в «Сегодня», без убранных из библиотеки', async t => {
  const library = LIBRARY.filter(e => e.key !== 'rdl');
  const { document } = mount(t, { preload: onDevice(), library });
  await settle(0);
  openWorkouts(document);
  const shownCount = exerciseCount(OWN) - 1;
  assert.match(kickerOf(document, OWN.name), new RegExp(` · ${shownCount} упражнений$`));

  // Открыли — и на экране ровно столько же карточек упражнений.
  cardOf(document, OWN.name).click();
  assert.equal(document.querySelectorAll('#workout .exercise').length, shownCount);
});

// Удаление: кнопка в карточке своей тренировки. Клиент Telegram задаёт вопрос,
// ответ приходит позже и из теста (confirms[i].answer).
async function mountWithTwoOwn(t) {
  const webApp = fakeWebApp();
  const mounted = mount(t, {
    preload: { ...onDevice(), ...onDevice(OTHER_ID, OTHER), [CURRENT_KEY]: OWN_ID },
    webApp,
  });
  await settle(0);
  openWorkouts(mounted.document);
  const deleteOf = title => cardOf(mounted.document, title).closest('.workout-item').querySelector('.workout-delete');
  return { ...mounted, webApp, deleteOf };
}

test('«Удалить» спрашивает: пока не ответили «да», тренировка на месте', async t => {
  const { window, document, webApp, deleteOf } = await mountWithTwoOwn(t);

  deleteOf(OTHER.name).click();
  assert.equal(webApp.confirms.length, 1);
  assert.equal(webApp.confirms[0].message, `Удалить тренировку «${OTHER.name}»?`);
  assert.ok(window.localStorage.getItem(recordKey(OTHER_ID)), 'до ответа тренировка на месте');

  webApp.confirms[0].answer(false);
  await settle(0);
  assert.ok(window.localStorage.getItem(recordKey(OTHER_ID)), 'после «нет» тоже');
  assert.ok(cardOf(document, OTHER.name));

  deleteOf(OTHER.name).click();
  webApp.confirms[1].answer(true);
  await settle(0);
  assert.equal(window.localStorage.getItem(recordKey(OTHER_ID)), null);
  assert.equal(cardOf(document, OTHER.name), undefined);
});

test('удалили текущую — текущей становится готовая по умолчанию; удалили другую — текущая прежняя', async t => {
  const { window, document, webApp, deleteOf } = await mountWithTwoOwn(t);

  deleteOf(OTHER.name).click();
  webApp.confirms[0].answer(true);
  await settle(0);
  assert.equal(heading(document), OWN.name, 'удалена не текущая — текущая прежняя');
  assert.equal(window.localStorage.getItem(CURRENT_KEY), OWN_ID);

  deleteOf(OWN.name).click();
  webApp.confirms[1].answer(true);
  await settle(0);
  assert.equal(window.localStorage.getItem(recordKey(OWN_ID)), null);
  assert.equal(heading(document), LEGS_H1);
  assert.equal(window.localStorage.getItem(CURRENT_KEY), 'legs-mwf');
  assert.deepEqual(shown(document), ['screen-workouts'], 'раздел остался открытым');
  assert.equal(document.querySelectorAll('#screen-workouts .workout-delete').length, 0);
  assert.equal(cardOf(document, legs.title).getAttribute('aria-current'), 'true');
});

test('в «Мои» пометка «только на этом устройстве» у неподтверждённой', async t => {
  // Облако отвечает, но записи не принимает: досылка своей не подтверждена.
  // Вторая лежит и в облаке, и на устройстве — у неё пометки быть не должно.
  const cloud = refusingCloud(onDevice(OTHER_ID, OTHER));
  const preload = { ...onDevice(), [`${recordKey(OWN_ID)}:pending`]: '1', ...onDevice(OTHER_ID, OTHER) };
  const { document } = mount(t, { preload, webApp: fakeWebApp({ cloud }) });
  await settle(20);
  openWorkouts(document);

  assert.match(kickerOf(document, OWN.name), / · только на этом устройстве$/);
  assert.doesNotMatch(kickerOf(document, OTHER.name), /только на этом устройстве/);
});

test('«Мои» пусто — подсказка про «Конструктор»', async t => {
  const { document } = mount(t);
  await settle(0);
  openWorkouts(document);

  const screen = document.getElementById('screen-workouts');
  assert.deepEqual([...screen.querySelectorAll('h2')].map(h => h.textContent), ['Мои', 'Готовые']);
  assert.equal(screen.querySelector('.workouts-empty-title').textContent, 'Своих тренировок пока нет');
  assert.equal(screen.querySelector('.workouts-empty-hint').textContent, 'Собери первую в «Конструкторе».');
  assert.equal(screen.querySelectorAll('.workout-delete').length, 0);

  // Пустота — приглашение: кнопка сразу ведёт в «Конструктор».
  const build = screen.querySelector('.workouts-build');
  assert.equal(build.textContent, 'Собрать тренировку');
  build.click();
  assert.deepEqual(shown(document), ['screen-builder']);
});

test('карточка готовой тренировки: название, описание, строка с днями; у текущей пометка с галочкой', async t => {
  const { document } = mount(t);
  await settle(0);
  openWorkouts(document);

  const card = cardOf(document, legs.title);
  assert.equal(card.querySelector('.workout-card-lead').textContent, legs.lead);
  assert.equal(kickerOf(document, legs.title), `${legs.kicker} · ПН · СР · ПТ`);
  const now = card.querySelector('.workout-card-now');
  assert.equal(now.textContent, 'Сейчас в «Сегодня»');
  assert.ok(now.querySelector('svg.ic-hand'), 'у пометки галочка: смысл не держится на одном цвете');

  const other = cardOf(document, WORKOUTS['core-arms-legs'].title);
  assert.equal(other.querySelector('.workout-card-now'), null, 'пометка только у текущей');
  assert.equal(other.hasAttribute('aria-current'), false);
});

test('карточка своей тренировки: название, уровень или «Своя сборка», дни и число упражнений', async t => {
  const { document } = mount(t, { preload: { ...onDevice(), ...onDevice(OTHER_ID, OTHER) } });
  await settle(0);
  openWorkouts(document);

  assert.equal(kickerOf(document, OWN.name), `Своя сборка · ВТ · ЧТ · ${exerciseCount(OWN)} упражнений`);
  assert.equal(kickerOf(document, OTHER.name), `Начальный уровень · ВТ · ЧТ · ${exerciseCount(OTHER)} упражнений`);
  const titles = [...document.querySelectorAll('#screen-workouts .workout-item .workout-card-title')].map(n => n.textContent);
  assert.deepEqual(titles, [OTHER.name, OWN.name], 'новая выше старой');
});

test('после смены тренировки раскрыт первый блок новой, а не выбор прежней', async t => {
  const { document } = mount(t, { preload: onDevice() });
  await settle(0);
  const ids = workout => workout.blocks.map(block => block.id);
  const openIds = () => [...document.querySelectorAll('#workout .workout-block')]
    .filter(section => section.querySelector('.blk-head').getAttribute('aria-expanded') === 'true')
    .map(section => section.id);
  assert.deepEqual([...document.querySelectorAll('#workout .workout-block')].map(s => s.id), ids(legs));

  // Человек раскрыл другой блок прежней тренировки; новая открывается с первого.
  document.querySelector('#legs2 .blk-head').click();
  assert.deepEqual(openIds(), ['legs2']);

  pick(document, OWN.name);
  assert.deepEqual([...document.querySelectorAll('#workout .workout-block')].map(s => s.id), ids(ownWorkout));
  assert.deepEqual(openIds(), [ids(ownWorkout)[0]], 'блоков прежней тренировки на экране нет, раскрыт первый новой');
});

// Облако, у которого чтение отметок отвечает не сразу: за это время человек
// успевает переключиться. Свою запись и список ключей отдаёт сразу — иначе
// список «Мои» стёр бы свою тренировку как «удалённую на другом устройстве».
// Значение для ответа снимается в момент запроса, как у настоящего облака: запись,
// сделанная пока ответ в пути, в него не попадает.
const cloudWith = (data, getItem) => ({
  getItem,
  setItem: (key, value, cb) => { data[key] = value; cb(null, true); },
  removeItem: (key, cb) => { delete data[key]; cb(null, true); },
  removeItems: (keys, cb) => cb(null, true),
  getKeys: cb => cb(null, Object.keys(data)),
  getItems: (keys, cb) => cb(null, Object.fromEntries(keys.filter(key => key in data).map(key => [key, data[key]]))),
});

function slowMarksCloud(data, delay) {
  return cloudWith(data, (key, cb) => {
    const value = data[key] ?? '';
    setTimeout(() => cb(null, value), delay);
  });
}

// Ответы на чтение отметок выпускает тест: release(ключ).
function heldMarksCloud(data) {
  const held = [];
  const cloud = cloudWith(data, (key, cb) => {
    const value = data[key] ?? '';
    held.push({ key, answer: () => cb(null, value) });
  });
  cloud.release = key => {
    const index = held.findIndex(call => call.key === key);
    assert.notEqual(index, -1, `чтение ${key} не запрашивалось`);
    held.splice(index, 1)[0].answer();
  };
  return cloud;
}

test('отметки, пришедшие из хранилища после смены тренировки, к новой не относятся', async t => {
  // Первое упражнение первого блока у обеих тренировок одно, и id отметки у
  // них совпадает: сверка с экраном новой тренировки чужую отметку не отсеет.
  const shared = markId('start', 'pelvic-tilt', 1);
  const data = { ...onDevice(), [storageKey('legs-mwf', currentDay())]: JSON.stringify([shared]) };
  const { document, app } = mount(t, { preload: onDevice(), webApp: fakeWebApp({ cloud: slowMarksCloud(data, 40) }) });
  await settle(0);

  pick(document, OWN.name);            // отметки готовой ещё в пути
  await settle(150);
  assert.equal(app.marks.size, 0, 'опоздавший ответ прежней тренировки отброшен');
  assert.equal(boxes(document).filter(box => box.checked).length, 0);

  // Данные были на месте: вернувшись, человек видит свою отметку.
  pick(document, legs.title);
  await app.ready;
  assert.deepEqual([...app.marks], [shared]);
});

test('ответ списка своих в фоне перерисовывает уже открытый раздел', async t => {
  const { document } = mount(t, { preload: { ...onDevice(), section: 'workouts' } });

  // Список ещё не пришёл: раздел не утверждает, что своих нет.
  const screen = document.getElementById('screen-workouts');
  assert.deepEqual(shown(document), ['screen-workouts']);
  assert.doesNotMatch(screen.textContent, /Своих тренировок пока нет/);
  assert.equal(cardOf(document, OWN.name), undefined);

  await settle(0);
  assert.ok(cardOf(document, OWN.name), 'пришёл список — карточка появилась без нажатий');
});

test('другая тренировка открывается сверху, а та же — на прежнем месте', async t => {
  const { window, document } = mount(t, { preload: onDevice() });
  await settle(0);
  const scrolls = [];
  window.scrollTo = options => scrolls.push(options);
  window.scrollY = 900;

  pick(document, legs.title);          // та же, что открыта
  assert.deepEqual(scrolls.at(-1), { top: 900, behavior: 'instant' });

  pick(document, OWN.name);
  assert.deepEqual(scrolls.at(-1), { top: 0, behavior: 'instant' });
});

// Опоздавший ответ прежней тренировки: экран и набор новой он не трогает, но
// ранние отметки, которые при смене уже ушли в хранилище одни, он обязан
// вернуть вместе с сохранёнными — иначе они затёрты.
const LEGS_SAVED = [markId('start', 'pelvic-tilt', 1), markId('start', 'thoracic-rotation', 1)];
const LEGS_EARLY = markId('circuit', 'chinese-squat', 1);

async function mountWithHeldMarks(t) {
  unrefCloudTimeouts(t);
  const legsKey = storageKey('legs-mwf', currentDay());
  const data = { ...onDevice(), [legsKey]: JSON.stringify(LEGS_SAVED) };
  const cloud = heldMarksCloud(data);
  const mounted = mount(t, { preload: onDevice(), webApp: fakeWebApp({ cloud }) });
  await settle(0);
  return { ...mounted, cloud, data, legsKey, ownKey: storageKey(OWN_ID, currentDay()) };
}

test('опоздавший ответ прежней тренировки возвращает в хранилище ранние отметки вместе с сохранёнными', async t => {
  const { window, document, app, cloud, data, legsKey, ownKey } = await mountWithHeldMarks(t);

  boxes(document).find(box => box.dataset.mark === LEGS_EARLY).click();
  pick(document, OWN.name);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(legsKey)), [LEGS_EARLY],
    'при смене ушла одна ранняя отметка: ответа по готовой ещё нет');

  cloud.release(legsKey);
  await settle(0);
  const union = [...LEGS_SAVED, LEGS_EARLY].sort();
  assert.deepEqual(JSON.parse(window.localStorage.getItem(legsKey)).sort(), union);
  assert.deepEqual(JSON.parse(data[legsKey]).sort(), union, 'и в облаке');

  // Экран новой тренировки не изменился.
  assert.equal(heading(document), OWN.name);
  assert.equal(app.marks.size, 0);
  assert.equal(boxes(document).filter(box => box.checked).length, 0);
  cloud.release(ownKey);
  await settle(0);
  assert.equal(window.localStorage.getItem(ownKey), null, 'под id новой ничего не записано');
});

test('сброс до ответа прежней тренировки: опоздавший ответ сохранённое не возвращает', async t => {
  const { window, document, cloud, legsKey } = await mountWithHeldMarks(t);

  document.getElementById('reset').click();      // отметок нет, поэтому без вопроса
  boxes(document).find(box => box.dataset.mark === LEGS_EARLY).click();
  pick(document, OWN.name);

  cloud.release(legsKey);
  await settle(0);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(legsKey)), [LEGS_EARLY], 'сброшенное не вернулось');
});

test('опоздавший ответ прежней тренировки без ранних отметок ничего не пишет', async t => {
  const { window, document, cloud, data, legsKey } = await mountWithHeldMarks(t);

  pick(document, OWN.name);                      // отметок не ставили
  cloud.release(legsKey);
  await settle(0);
  assert.equal(window.localStorage.getItem(legsKey), null, 'на устройство ничего не легло');
  assert.deepEqual(JSON.parse(data[legsKey]), LEGS_SAVED, 'облако не тронуто');
});

test('Escape слушается на document один раз, сколько бы раз ни переключали тренировку', async t => {
  const keydowns = [];
  const { window, document } = mount(t, {
    preload: onDevice(),
    // Считаем обработчики keydown, повешенные на document, по тому, сколько
    // из них отзовётся на одну клавишу.
    beforeStart(win) {
      const add = win.document.addEventListener.bind(win.document);
      win.document.addEventListener = (type, handler, ...rest) =>
        add(type, type === 'keydown' ? event => { keydowns.push(event.key); handler(event); } : handler, ...rest);
    },
  });
  await settle(0);
  pick(document, OWN.name);
  pick(document, legs.title);
  pick(document, OWN.name);

  // Плеер новой тренировки по-прежнему закрывается Escape.
  document.querySelector('#workout button.video').click();
  assert.ok(document.querySelector('.player-shell'), 'плеер открылся');
  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(keydowns.length, 1);
  assert.equal(document.querySelector('.player-shell'), null);
});
