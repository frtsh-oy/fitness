// Раздел «Конструктор»: вход, ручная сборка из библиотеки, генератор с экраном
// результата, замена упражнения и сохранение. Один модуль, потому что у экранов
// общий черновик: сборка и результат меняют его, библиотека добавляет в него,
// сохранение дописывает название и дни.
// Экраны — отдельные небольшие функции, каждая строит свой корень и ставит его в
// host; состояние живёт только в замыкании renderBuilder.
//
// Черновик — сжатая запись своей тренировки (builder/compact.js), та самая,
// что потом ляжет в хранилище. Показ и счёт идут по ней же: expandWorkout для
// блоков и покрытия, replaceExercise для замены. Так сохранённое не может
// отличаться от того, что человек видел на сборке.
//
// Что считает покрытие и откуда оно берётся — builder/coverage.js. Здесь только
// слова: ни одна граница и ни одно число правил в этом файле не заведено.
import { LIBRARY, SLOT_LABELS, DIFFICULTY_LABELS } from './exercises/index.js';
import { renderLibrary } from './library-view.js';
import { expandWorkout, exerciseCount, NAME_MAX } from './builder/compact.js';
import {
  pickSkeleton, makeRandom, generate, availability, missingGroupsMessage, missingZoneMessage,
} from './builder/generator.js';
import { replaceCandidates, replaceExercise } from './builder/replace.js';
import { zeroGroups, belowFloor } from './builder/coverage.js';
import { groupsPhrase } from './muscles.js';
import { LEVELS, ZONES, MAX_STRENGTH, MAX_ZONES, DEFAULT_DAYS, PLAN_DAYS } from './builder/rules.js';
import { plural, defaultName, GEAR_NAMES } from './builder/texts.js';
import { newWorkoutId, OWN_LIMIT } from './my-workouts.js';

const ENTRY_LEAD = 'Тренировка всегда на всё тело. Собери её сам из библиотеки или получи готовую по правилам, а потом сохрани.';
const MANUAL_NOTE = 'Листай библиотеку упражнений, добавляй нужные и сохрани тренировку.';
const GENERATE_NOTE = 'Выбери уровень и зоны упора — упражнения подберутся по правилам.';
// Четыре шага из макета: то, из чего состоит любая тренировка конструктора, и
// ручная, и подобранная по правилам.
const STEPS = [
  ['Разминка', 'Плавно, без длительных остановок'],
  ['Круговой разогрев', 'Повышает пульс, резинки лёгкие'],
  ['Силовые пары', 'Два упражнения подряд, потом отдых'],
  ['Завершение', '2–3 минуты в спокойном темпе, дыхание'],
];

const ALL_COVERED = 'Все основные группы получают нагрузку';
const NOT_WHOLE_BODY = 'Тренировка пока не на всё тело';
const ONLY_STRENGTH = 'Считаются только силовые упражнения. Сохранить можно и так.';
const ALL_ABOVE_FLOOR = 'Все основные группы не ниже границы уровня.';
const ONE_DAY = 'Один день в неделю — мало: каждую группу лучше нагружать хотя бы дважды в неделю.';
const belowText = groups => `Ниже границы уровня: ${groupsPhrase(groups)}.`;

const GENERATOR_LEAD = 'Подбор упражнений по правилам';
const ZONE_HINT = 'Упор добавит упражнение на каждую выбранную зону, не больше двух. Остальные группы мышц остаются в тренировке.';
// Сложности во множественном числе, как их называет строка уровня: «Упражнения: базовые».
const DIFFICULTY_WORDS = { basic: 'базовые', medium: 'средние', hard: 'сложные' };
const TAG_FOCUS = 'упор';
const TAG_REPLACED = 'заменено';
const EXERCISES = ['упражнение', 'упражнения', 'упражнений'];

// Пар, а не упражнений: человек считает пары, а потолок правил — 18 упражнений.
const MAX_PAIRS = `Не больше ${MAX_STRENGTH / 2} силовых пар — убери упражнение, чтобы добавить другое.`;
const NO_STRENGTH = 'Добавь хотя бы одно силовое упражнение.';
const NAME_EMPTY = 'Введи название, чтобы сохранить.';
const NAME_LONG = `Название не длиннее ${NAME_MAX} знаков.`;
const NO_DAYS = 'Выбери хотя бы один день.';

const LIMIT_REACHED = `Сохранить нельзя: уже ${OWN_LIMIT} своих тренировок. Удали ненужную в разделе «Тренировки».`;
const DEVICE_FAILED = 'Не удалось сохранить: хранилище недоступно. Тренировка осталась здесь — попробуй ещё раз.';
const DISCARD_QUESTION = 'Бросить сборку? Несохранённые изменения пропадут.';

const NO_CANDIDATES = 'Похожих упражнений больше нет: все подходящие уже в тренировке.';
const HINT_STRENGTH = 'Те же целевые мышцы, похожая разметка';
const HINT_OTHER = 'Того же типа';

// Дни недели по ISO (1 — понедельник), как в compact.days.
const DAYS = [[1, 'пн'], [2, 'вт'], [3, 'ср'], [4, 'чт'], [5, 'пт'], [6, 'сб'], [7, 'вс']];

const GEAR = new Map([['none', 'без инвентаря'], ...GEAR_NAMES]);
const gearText = entry => entry.gear.map(id => GEAR.get(id)).join(', ');

const SLOTS = Object.keys(SLOT_LABELS);

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Черновик сравнивается с тем, с чего начался, без времени сборки: оно
// проставляется при сохранении и ни о каких правках человека не говорит.
const snapshot = compact => JSON.stringify({ ...compact, t: 0 });

// Копия записи, у которой с исходной нет общих массивов. Запись плоская: массивы
// и пары упора. structuredClone не годится: в старых WebView (iOS до 15.4) его нет.
const copyCompact = compact => ({
  ...compact,
  days: [...compact.days],
  zones: [...compact.zones],
  warmup: [...compact.warmup],
  circuit: [...compact.circuit],
  strength: [...compact.strength],
  focus: compact.focus.map(pair => [...pair]),
  cooldown: [...compact.cooldown],
});

// Какие упражнения берёт уровень, — по его пулу сложностей, без второй таблицы
// уровней: пул из всех сложностей — «все».
const poolText = pool => (pool.length === Object.keys(DIFFICULTY_LABELS).length
  ? 'все'
  : pool.map(difficulty => DIFFICULTY_WORDS[difficulty]).join(' и '));

// Возвращает { edit(id, compact) }: открыть свою тренировку на правку, подобранную
// на результате, собранную руками на сборке. Обещание, а не void: если начатый
// черновик жалко бросать, edit сперва спрашивает и отвечает, открыл ли он правку.
export function renderBuilder({ host, win, library = LIBRARY, store, confirm, onSaved, seed = () => Date.now(), openLink }) {
  const document = host.ownerDocument;
  const make = (tag, className, text) => el(document, tag, className, text);

  // Черновик и id, под которым он будет сохранён. id заводится вместе с
  // черновиком, а не при сохранении: повтор после отказа хранилища пишет ту же
  // запись, а не плодит вторую.
  let draft = null;
  let draftId = null;
  let startedAs = '';
  // id той, что сохраняется прямо сейчас. Пока идёт запрос, повторный нажать
  // нельзя, а с экрана сохранения не уйти; но это про ту тренировку, а не про
  // весь экран: облако отвечает долго, и человек успевает открыть другую.
  let savingId = null;
  // Выбор на экране генератора: { level, zones } или null, пока экран не
  // открывали. Живёт отдельно от черновика: с результата «Назад» возвращает на
  // генератор с тем же выбором, а черновика к тому времени уже нет.
  let choice = null;
  // Ключи упражнений, поставленных заменой на экране результата. Только этого
  // сеанса: новый подбор, «Другой вариант» и правка начинают с пустого.
  const replaced = new Set();

  const isDirty = () => draft !== null && snapshot(draft) !== startedAs;

  // Смена экрана. Экраны делят один раздел и одну полосу прокрутки, поэтому новый
  // открывается сверху, а фокус переходит на его заголовок: иначе после нажатия
  // на кнопку, которой уже нет в разметке, он оставался бы нигде.
  function show(root, focus = root.querySelector('h2')) {
    host.replaceChildren(root);
    win.scrollTo({ top: 0, behavior: 'instant' });
    focus?.focus();
  }

  function heading(text) {
    const title = make('h2', null, text);
    // Принимает фокус программно, но в порядок обхода Tab не попадает.
    title.tabIndex = -1;
    return title;
  }

  function backButton(text, onClick) {
    const button = make('button', 'builder-back');
    button.type = 'button';
    // Стрелка — украшение: диктор читал бы «стрелка влево».
    const arrow = make('span', null, '←');
    arrow.setAttribute('aria-hidden', 'true');
    button.append(arrow, ` ${text}`);
    button.addEventListener('click', onClick);
    return button;
  }

  // Причина, по которой кнопка недоступна, стоит под ней и видна всегда, пока
  // действует: недоступная кнопка без слов только озадачивает.
  function reasonNote(className = 'builder-reason') {
    const note = make('p', className);
    note.hidden = true;
    return note;
  }

  function setNote(note, text) {
    note.hidden = text === null;
    note.textContent = text ?? '';
  }

  // Сообщение об ошибке: узел с ролью alert стоит в разметке заранее и лишь
  // показывается, иначе диктор не озвучил бы появившееся.
  function alertNote(className) {
    const note = reasonNote(className);
    note.setAttribute('role', 'alert');
    return note;
  }

  // Строка состояния: одна на экран и остаётся тем же узлом, чьё содержимое
  // меняется, — перерисованный заново узел диктор не озвучил бы.
  function statusBox() {
    const box = make('div', 'builder-coverage');
    box.setAttribute('role', 'status');
    return box;
  }

  function paintStatus(box, ok, lines) {
    box.classList.toggle('is-ok', ok);
    box.replaceChildren(...lines.map(line => make('p', null, line)));
  }

  const workoutOf = days => expandWorkout(draftId, { ...draft, days }, library).workout;

  // — Вход ——————————————————————————————————————————————————————————

  function entryScreen() {
    const root = make('div', 'builder builder-entry');
    // Пробел между подписями: имя кнопки для диктора склеивается из них, и без
    // него «самомуЛистай» читалось бы одним словом.
    const path = (title, note, onClick) => {
      const button = make('button', 'builder-path');
      button.type = 'button';
      button.append(make('span', 'builder-path-title', title), ' ', make('span', 'builder-path-note', note));
      button.addEventListener('click', onClick);
      return button;
    };

    const steps = make('ol', 'builder-steps');
    for (const [name, note] of STEPS) {
      const item = make('li');
      item.append(make('strong', null, name), ' ', make('span', null, note));
      steps.append(item);
    }
    root.append(heading('Конструктор'), make('p', 'builder-lead', ENTRY_LEAD),
      path('Собрать самому', MANUAL_NOTE, startManual), path('Сгенерировать', GENERATE_NOTE, startGenerator),
      make('h3', 'builder-steps-title', 'Любая тренировка устроена одинаково'), steps);
    return root;
  }

  function startManual() {
    draft = {
      v: 1, name: defaultName([]), days: [...DEFAULT_DAYS], level: null, zones: [],
      ...pickSkeleton(library, makeRandom(seed())),
      strength: [], focus: [], t: 0,
    };
    draftId = newWorkoutId();
    startedAs = snapshot(draft);
    drawBuild();
  }

  // С входа генератор открывается на выборе по умолчанию, а не на том, что
  // осталось от прошлого раза.
  function startGenerator() {
    choice = null;
    drawGenerator();
  }

  function abandon() {
    draft = null;
    draftId = null;
    show(entryScreen());
  }

  // Брошенный черновик не вернуть, поэтому уходят с него только по согласию: одно
  // нажатие на «Назад» не должно стоить человеку собранного. Без правок
  // спрашивать нечего.
  function leave(next) {
    if (!isDirty()) {
      next();
      return;
    }
    confirm(DISCARD_QUESTION).then(agreed => { if (agreed) next(); });
  }

  // Правка своей тренировки. Черновик — копия записи: сохранить его или бросить,
  // список своих и запись на устройстве от этого не меняются до самого
  // сохранения. Подобранная по правилам открывается на результате, а не на
  // сборке: там замена знает границу её уровня и метку упора, а «Убрать» со
  // сборки стёрло бы упор.
  async function edit(id, compact) {
    if (isDirty() && !await confirm(DISCARD_QUESTION)) return false;
    draft = copyCompact(compact);
    draftId = id;
    startedAs = snapshot(draft);
    replaced.clear();
    if (draft.level === null) {
      drawBuild();
    } else {
      // «Назад» с результата — на генератор, открытый на уровне и зонах этой
      // тренировки. Больше двух зон генератор не принимает, а запись, не
      // сделанная им, могла бы их принести.
      choice = { level: draft.level, zones: draft.zones.slice(0, MAX_ZONES) };
      drawResult();
    }
    return true;
  }

  // — Общее у сборки и результата ——————————————————————————————————————

  // Кнопка в строке упражнения. Кнопок несколько, и по голой подписи диктору их
  // не отличить; видимая подпись стоит в начале имени.
  function itemButton(className, text, item, onClick) {
    const button = make('button', className, text);
    button.type = 'button';
    button.setAttribute('aria-label', `${text}: ${item.name}`);
    button.addEventListener('click', () => onClick(button));
    return button;
  }

  // Строка упражнения: название, метки (их ставит результат), мышцы и кнопка.
  function itemRow(item, button, tags = []) {
    const node = make('div', 'builder-item');
    node.dataset.key = item.key;
    const text = make('div', 'builder-item-text');
    text.append(make('span', 'builder-item-name', item.name));
    if (tags.length > 0) {
      const list = make('span', 'builder-item-tags');
      list.append(...tags.map(([className, label]) => make('span', className, label)));
      text.append(list);
    }
    text.append(make('span', 'builder-item-muscles', item.muscles));
    node.append(text, button);
    return node;
  }

  // Блоки тренировки: заголовок, подпись и строки. Круги у пар показывает только
  // результат: у подобранной они зависят от уровня, у ручной сборки всегда два.
  // Пара узнаётся по id блока, как его строит expandWorkout.
  function blockSections(workout, rowOf, withRounds) {
    return workout.blocks.map(block => {
      const section = make('section', 'builder-block');
      const head = make('div', 'builder-block-head');
      head.append(make('h3', null, block.title));
      if (withRounds && block.id.startsWith('pair')) head.append(make('span', 'builder-block-rounds', `${block.rounds} круга`));
      section.append(head, make('p', 'builder-block-sub', block.sub), ...block.items.map(rowOf));
      return section;
    });
  }

  // Кнопка в строке с этим ключом: после замены фокус возвращается на неё.
  const rowButton = (blocks, key) => [...blocks.querySelectorAll('.builder-item')]
    .find(node => node.dataset.key === key)?.querySelector('button');

  // Шторка замены. Ставится рядом с корнем экрана, а не внутрь него: сборка и
  // результат перерисовываются при каждом изменении, а шторке нельзя пропадать
  // вместе с ними. Что сделать с экраном после выбора, знает onPick(newKey): он
  // обновляет экран и отдаёт кнопку, на которую вернуть фокус.
  function openReplace({ root, slot, key, opener, onPick }) {
    const current = library.find(entry => entry.key === key);
    const backdrop = make('div', 'replace-backdrop');
    const sheet = make('div', 'replace-sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'replace-title');
    sheet.tabIndex = -1;

    const title = make('h3', null, 'Заменить упражнение');
    title.id = 'replace-title';
    const list = make('ul', 'replace-list');

    // После закрытия фокус возвращается туда, откуда шторку открыли (или на
    // кнопку выбранной замены): иначе он остался бы на узле, которого нет.
    function close(focus = opener) {
      backdrop.remove();
      sheet.remove();
      root.removeAttribute('inert');
      if (focus?.isConnected) focus.focus();
    }

    const candidates = replaceCandidates({ compact: draft, slot, key, library });
    for (const entry of candidates) {
      const item = make('li', 'replace-candidate');
      const text = make('div', 'replace-text');
      text.append(make('span', 'replace-name', entry.name), make('span', 'replace-muscles', entry.muscles), make('span', 'replace-gear', gearText(entry)));
      const pick = make('button', 'replace-pick', 'Выбрать');
      pick.type = 'button';
      pick.setAttribute('aria-label', `Выбрать: ${entry.name}`);
      pick.addEventListener('click', () => {
        draft = replaceExercise(draft, slot, key, entry.key);
        close(onPick(entry.key));
      });
      item.append(text, pick);
      list.append(item);
    }

    const closeButton = make('button', 'replace-close', 'Закрыть');
    closeButton.type = 'button';
    closeButton.addEventListener('click', () => close());
    backdrop.addEventListener('click', () => close());
    sheet.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

    sheet.append(title, make('p', 'replace-current', current.name),
      make('p', 'replace-hint', slot === 'strength' ? HINT_STRENGTH : HINT_OTHER));
    if (candidates.length === 0) sheet.append(make('p', 'replace-empty', NO_CANDIDATES));
    else sheet.append(list);
    sheet.append(closeButton);

    root.setAttribute('inert', '');
    host.append(backdrop, sheet);
    sheet.focus();
  }

  // — Сборка ————————————————————————————————————————————————————————

  const addBlocked = () => (draft.strength.length >= MAX_STRENGTH ? MAX_PAIRS : null);

  function drawBuild() {
    const root = make('div', 'builder builder-build');
    const coverage = statusBox();
    const add = make('button', 'builder-add', 'Добавить упражнение');
    add.type = 'button';
    add.addEventListener('click', showLibrary);
    const addReason = reasonNote();
    const blocks = make('div', 'builder-blocks');
    const save = make('button', 'builder-save', 'Сохранить');
    save.type = 'button';
    save.addEventListener('click', drawSave);
    const saveReason = reasonNote();

    // Упражнение и его кнопка: у силовых «Убрать» (замена силового — это убрать
    // и добавить другое из библиотеки), у остальных «Заменить».
    function row(item) {
      const slot = SLOTS.find(name => draft[name].includes(item.key));
      if (slot === 'strength') return itemRow(item, itemButton('builder-remove', 'Убрать', item, () => remove(item.key)));
      return itemRow(item, itemButton('builder-replace', 'Заменить', item,
        opener => openReplace({ root, slot, key: item.key, opener, onPick: picked })));
    }

    function picked(key) {
      refresh();
      return rowButton(blocks, key);
    }

    function remove(key) {
      draft = {
        ...draft,
        strength: draft.strength.filter(other => other !== key),
        focus: draft.focus.filter(([focusKey]) => focusKey !== key),
      };
      refresh();
      // После «Убрать» кнопки, на которой был фокус, нет; ближайшее осмысленное
      // место — «Добавить». preventScroll: страница не должна прыгать наверх.
      add.focus({ preventScroll: true });
    }

    function refresh() {
      // Покрытие считается на дефолтных днях, а не на тех, что в черновике: дни
      // человек выбирает на следующем экране, а ноль подходов в неделю от их
      // числа не зависит — зависело бы лишь «ноль дней», и это не про нагрузку.
      const zero = zeroGroups(workoutOf(DEFAULT_DAYS));
      paintStatus(coverage, zero.length === 0, zero.length === 0
        ? [ALL_COVERED]
        : [NOT_WHOLE_BODY, `Без нагрузки: ${groupsPhrase(zero)}.`, ONLY_STRENGTH]);

      blocks.replaceChildren(...blockSections(expandWorkout(draftId, draft, library).workout, row, false));

      const blocked = addBlocked();
      add.disabled = blocked !== null;
      setNote(addReason, blocked);
      const empty = draft.strength.length === 0;
      save.disabled = empty;
      setNote(saveReason, empty ? NO_STRENGTH : null);
    }

    root.append(backButton('Назад', () => leave(abandon)), heading('Своя тренировка'), coverage, add, addReason, blocks, save, saveReason);
    refresh();
    show(root);
  }

  function showLibrary() {
    renderLibrary({
      host,
      entries: library,
      isAdded: key => draft.strength.includes(key),
      addBlocked,
      onAdd(key) { draft = { ...draft, strength: [...draft.strength, key] }; },
      // Экран сборки заново, а не прежний узел: состав мог измениться, и
      // «Добавить» после возврата должна стать тем, на чём фокус.
      onBack: () => {
        drawBuild();
        host.querySelector('.builder-add').focus();
      },
      openLink,
    });
    win.scrollTo({ top: 0, behavior: 'instant' });
  }

  // — Генератор —————————————————————————————————————————————————————

  // Недоступное помечается, а не отключается: оно остаётся в порядке обхода, и
  // диктор читает, почему его нельзя выбрать.
  const setUnavailable = (node, off) => (off ? node.setAttribute('aria-disabled', 'true') : node.removeAttribute('aria-disabled'));

  function drawGenerator() {
    // Что есть в библиотеке на каждом уровне. Уровень, которому не хватает
    // групп, и зона без опоры для упора не выбираются, а причина стоит на экране.
    const info = Object.fromEntries(Object.keys(LEVELS).map(level => [level, availability(library, level)]));
    const usable = level => info[level].missing.length === 0;
    // Без доступного уровня не выбран ни один: выбирать нечего, а причины видны
    // под каждым уровнем.
    choice ??= { level: Object.keys(LEVELS).find(usable) ?? null, zones: [] };

    const root = make('div', 'builder builder-generator');
    const refusal = alertNote('builder-refusal');
    const generateButton = make('button', 'builder-generate', 'Сгенерировать');
    generateButton.type = 'button';
    generateButton.addEventListener('click', () => runGenerator(choice.level, choice.zones, refusal));

    const levelsTitle = make('h3', 'builder-group-title', 'Уровень');
    levelsTitle.id = 'generator-levels';
    const levels = make('div', 'level-options');
    levels.setAttribute('role', 'radiogroup');
    levels.setAttribute('aria-labelledby', levelsTitle.id);
    const options = Object.entries(LEVELS).map(([id, level]) => {
      const item = make('div', 'level-item');
      const option = make('button', 'level-option');
      option.type = 'button';
      option.setAttribute('role', 'radio');
      // Пробелы между строками — по той же причине, что на входе.
      option.append(make('span', 'level-title', level.label), ' ', make('span', 'level-who', level.who));
      for (const line of [
        `Кругов в паре: ${level.rounds}`,
        `Упражнения: ${poolText(level.pool)}`,
        `Остановка: за ${level.reserve} повтора до отказа`,
      ]) option.append(' ', make('span', 'level-line', line));
      item.append(option);
      if (!usable(id)) {
        setUnavailable(option, true);
        const note = make('p', 'level-missing', missingGroupsMessage(id, info[id].missing));
        note.id = `level-missing-${id}`;
        option.setAttribute('aria-describedby', note.id);
        item.append(note);
      }
      option.addEventListener('click', () => { if (usable(id)) pickLevel(id); });
      levels.append(item);
      return [id, option];
    });

    const zonesTitle = make('h3', 'builder-group-title', 'Зоны упора');
    zonesTitle.id = 'generator-zones';
    const zones = make('div', 'zone-chips');
    zones.setAttribute('role', 'group');
    zones.setAttribute('aria-labelledby', zonesTitle.id);
    const missing = make('div', 'zone-missing');
    const chips = Object.entries(ZONES).map(([id, zone]) => {
      const chip = make('button', 'zone-chip', zone.label);
      chip.type = 'button';
      chip.addEventListener('click', () => toggleZone(id));
      const note = make('p');
      note.id = `zone-missing-${id}`;
      note.hidden = true;
      zones.append(chip);
      missing.append(note);
      return [id, chip, note];
    });

    // Зона без опоры на выбранном уровне; у выбранной уровень её уже допускает.
    const zoneMissing = id => choice.level !== null && !info[choice.level].zones[id];
    // Выбранную зону снять можно всегда; новую — если уровень выбран, зона на нём
    // выполнима и мест ещё не все заняты.
    const zoneOff = id => !choice.zones.includes(id)
      && (choice.level === null || zoneMissing(id) || choice.zones.length >= MAX_ZONES);

    function paint() {
      for (const [id, option] of options) option.setAttribute('aria-checked', String(choice.level === id));
      for (const [id, chip, note] of chips) {
        chip.setAttribute('aria-pressed', String(choice.zones.includes(id)));
        setUnavailable(chip, zoneOff(id));
        const absent = zoneMissing(id);
        note.hidden = !absent;
        note.textContent = absent ? missingZoneMessage(choice.level, id) : '';
        if (absent) chip.setAttribute('aria-describedby', note.id);
        else chip.removeAttribute('aria-describedby');
      }
      generateButton.disabled = choice.level === null;
    }

    // Любая перемена выбора делает прежний отказ неактуальным.
    function change(next) {
      choice = next;
      setNote(refusal, null);
      paint();
    }

    // Смена уровня снимает зоны, которых на новом уровне не выполнить.
    function pickLevel(id) {
      change({ level: id, zones: choice.zones.filter(zone => info[id].zones[zone]) });
    }

    function toggleZone(id) {
      if (zoneOff(id)) return;
      change({ ...choice, zones: choice.zones.includes(id) ? choice.zones.filter(zone => zone !== id) : [...choice.zones, id] });
    }

    root.append(backButton('Назад', abandon), heading('Генератор'), make('p', 'builder-subtitle', GENERATOR_LEAD),
      levelsTitle, levels, zonesTitle, make('p', 'zone-hint', ZONE_HINT), zones, missing, generateButton, refusal);
    paint();
    show(root);
  }

  // Новая тренировка по уровню и зонам: с экрана генератора и по «Другому
  // варианту». Отказ показывается там, откуда просили, а прежнее остаётся как было.
  function runGenerator(level, zones, refusal) {
    const result = generate({ level, zones, seed: seed(), library });
    if (!result.ok) {
      setNote(refusal, result.message);
      return;
    }
    // «Другой вариант» меняет подбор, а не то, что человек уже мог назвать и
    // расписать по дням: название и дни остаются, как и id — сохранение
    // перезапишет ту же тренировку, а не заведёт вторую.
    draft = draft === null ? result.compact : { ...result.compact, name: draft.name, days: [...draft.days] };
    draftId ??= newWorkoutId();
    startedAs = snapshot(draft);
    replaced.clear();
    drawResult();
  }

  // С результата назад — на генератор, выбор в нём прежний. Тренировки там уже
  // нет, и следующая получит свой id.
  function backToGenerator() {
    draft = null;
    draftId = null;
    drawGenerator();
  }

  // — Результат ———————————————————————————————————————————————————————

  function drawResult() {
    const root = make('div', 'builder builder-result');
    const count = exerciseCount(draft);
    const coverage = statusBox();
    const another = make('button', 'builder-variant', 'Другой вариант');
    another.type = 'button';
    const refusal = alertNote('builder-refusal');
    another.addEventListener('click', () => runGenerator(draft.level, draft.zones, refusal));
    const blocks = make('div', 'builder-blocks');
    const save = make('button', 'builder-save', 'Сохранить');
    save.type = 'button';
    save.addEventListener('click', drawSave);

    // Заменить можно любое упражнение, и силовое тоже: «Убрать» ломало бы то, что
    // подобрано под уровень и упор.
    function row(item) {
      const slot = SLOTS.find(name => draft[name].includes(item.key));
      const tags = [];
      if (item.focus) tags.push(['focus-tag', TAG_FOCUS]);
      if (replaced.has(item.key)) tags.push(['replaced-tag', TAG_REPLACED]);
      return itemRow(item, itemButton('builder-replace', 'Заменить', item,
        opener => openReplace({ root, slot, key: item.key, opener, onPick: picked })), tags);
    }

    function picked(key) {
      replaced.add(key);
      refresh();
      return rowButton(blocks, key);
    }

    function refresh() {
      // Граница уровня рассчитана на три дня (PLAN_DAYS). Дни человек выбирает
      // на сохранении, и там та же граница пересчитывается уже при них.
      const below = belowFloor(workoutOf(PLAN_DAYS), LEVELS[draft.level].floor);
      paintStatus(coverage, below.length === 0, [below.length === 0 ? ALL_COVERED : belowText(below)]);
      blocks.replaceChildren(...blockSections(expandWorkout(draftId, draft, library).workout, row, true));
    }

    root.append(backButton('Назад', () => leave(backToGenerator)), heading(defaultName(draft.zones)),
      make('p', 'builder-subtitle', `${LEVELS[draft.level].label} уровень · ${count} ${plural(count, EXERCISES)}`),
      coverage, another, refusal, blocks, save);
    refresh();
    show(root);
  }

  // — Сохранение ————————————————————————————————————————————————————

  function drawSave() {
    const root = make('div', 'builder builder-saving');
    // Назад — туда, откуда пришли: подобранная — на результат, собранная — на сборку.
    const back = draft.level === null ? backButton('К сборке', drawBuild) : backButton('К результату', drawResult);

    const nameLabel = make('label', 'builder-label', 'Название');
    nameLabel.htmlFor = 'save-name';
    const name = make('input', 'save-name');
    name.id = 'save-name';
    name.type = 'text';
    name.autocomplete = 'off';
    // Не длиннее, чем принимает запись. Поле ограничивает ввод пальцем; а
    // значение, поставленное не пальцем, ловит refresh.
    name.setAttribute('maxlength', String(NAME_MAX));
    name.value = draft.name;

    const daysLabel = make('p', 'builder-label', 'Дни недели');
    daysLabel.id = 'save-days';
    const days = make('div', 'day-chips');
    days.setAttribute('role', 'group');
    days.setAttribute('aria-labelledby', 'save-days');
    const chips = DAYS.map(([day, label]) => {
      const chip = make('button', 'day-chip', label);
      chip.type = 'button';
      chip.addEventListener('click', () => {
        const chosen = draft.days.includes(day) ? draft.days.filter(other => other !== day) : [...draft.days, day];
        draft = { ...draft, days: chosen.sort((a, b) => a - b) };
        refresh();
      });
      return [day, chip];
    });
    days.append(...chips.map(([, chip]) => chip));

    const count = exerciseCount(draft);
    const kind = draft.level === null ? 'своя сборка' : `${LEVELS[draft.level].label.toLowerCase()} уровень`;
    const summary = make('p', 'builder-summary', `Что сохранится: ${count} ${plural(count, EXERCISES)}, ${kind}`);
    const status = statusBox();

    const save = make('button', 'builder-save', 'Сохранить тренировку');
    save.type = 'button';
    const saveReason = reasonNote();
    const error = alertNote('builder-error');

    // Покрытие при выбранных днях. У собранной руками уровня нет, и считается
    // только ноль; у подобранной — граница её уровня. Без дней считать нечего:
    // причина названа у кнопки.
    function schedule() {
      if (draft.days.length === 0) return { ok: false, lines: [] };
      const workout = workoutOf(draft.days);
      let ok;
      let lines;
      if (draft.level === null) {
        const zero = zeroGroups(workout);
        ok = zero.length === 0;
        lines = ok ? [ALL_COVERED] : [NOT_WHOLE_BODY, `Без нагрузки: ${groupsPhrase(zero)}.`, ONLY_STRENGTH];
      } else {
        const below = belowFloor(workout, LEVELS[draft.level].floor);
        ok = below.length === 0;
        lines = ok ? [ALL_ABOVE_FLOOR] : [`Ниже границы уровня при этих днях: ${groupsPhrase(below)}.`];
      }
      // Предупреждение про один день не «успокаивается»: плашка с ним не зелёная.
      return draft.days.length === 1 ? { ok: false, lines: [...lines, ONE_DAY] } : { ok, lines };
    }

    function refresh() {
      for (const [day, chip] of chips) chip.setAttribute('aria-pressed', String(draft.days.includes(day)));
      const trimmed = draft.name.trim();
      let reason = null;
      if (trimmed === '') reason = NAME_EMPTY;
      else if (trimmed.length > NAME_MAX) reason = NAME_LONG;
      else if (draft.days.length === 0) reason = NO_DAYS;

      const { ok, lines } = schedule();
      paintStatus(status, ok, lines);
      const busy = savingId !== null && savingId === draftId;
      save.disabled = busy || reason !== null;
      back.disabled = busy;
      setNote(saveReason, reason);
    }

    name.addEventListener('input', () => {
      draft = { ...draft, name: name.value };
      refresh();
    });

    save.addEventListener('click', async () => {
      const compact = { ...draft, name: draft.name.trim(), days: [...draft.days], t: Date.now() };
      const id = draftId;
      setNote(error, null);
      savingId = id;
      refresh();
      let result;
      // store.save реджектится на записи, которую нельзя ни прочитать, ни
      // положить в облако. Для человека это тот же отказ хранилища: кнопка не
      // должна остаться зависшей, а черновик — потеряться.
      try {
        result = await store.save(id, compact);
      } catch {
        result = { ok: false, reason: 'device' };
      }
      if (savingId === id) savingId = null;
      if (!result.ok) {
        refresh();
        setNote(error, result.reason === 'limit' ? LIMIT_REACHED : DEVICE_FAILED);
        return;
      }
      // Пока шёл запрос, на экране мог оказаться черновик другой тренировки:
      // его сбрасывать нельзя. Сравнение по id, а не по объекту: правка названия
      // или дней на этом же экране заменяет объект черновика, а тренировка та же.
      if (draftId === id) abandon();
      onSaved(id, compact, { localOnly: result.localOnly });
    });

    root.append(back, heading('Сохранение'), nameLabel, name, daysLabel, days, summary, status, save, saveReason, error);
    refresh();
    show(root);
  }

  host.replaceChildren(entryScreen());
  return { edit };
}
