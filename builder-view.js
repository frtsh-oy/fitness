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
import { expandWorkout, exerciseCount, NAME_MAX, SKELETON_BLOCK_IDS } from './builder/compact.js';
import { DEFAULT_FORMAT, OPTIONAL_SLOTS, formatOf } from './builder/format.js';
import {
  pickSkeleton, makeRandom, generate, availability, missingGroupsMessage, missingZoneMessage, missingGear, closableGroups,
} from './builder/generator.js';
import { replaceCandidates, replaceExercise, searchCandidates } from './builder/replace.js';
import { zeroGroups, belowFloor } from './builder/coverage.js';
import { groupsPhrase } from './muscles.js';
import { LEVELS, ZONES, MAX_STRENGTH, MAX_ZONES, DEFAULT_DAYS, PLAN_DAYS, CORE_GROUPS } from './builder/rules.js';
import { plural, defaultName } from './builder/texts.js';
import { gearText, gearNames, fitsGear, fitLibrary, unownedGear } from './gear.js';
import { renderGearPicker } from './gear-picker.js';
import { renderFormatPicker } from './format-picker.js';
import { openSheet } from './sheet.js';
import { searchField } from './search-field.js';
import { roundsTag, blockKind, blockNumber, setBlockOpen } from './render.js';
import { icon, loopMeter } from './icons.js';
import { renderHero } from './hero.js';
import { createGearProfile } from './gear-profile.js';
import { newWorkoutId, OWN_LIMIT } from './my-workouts.js';

const ENTRY_LEAD = 'Тренировка всегда на всё тело. Собери её сам из библиотеки или получи готовую по правилам, а потом сохрани.';
const MANUAL_NOTE = 'Листай библиотеку упражнений, добавляй нужные и сохрани тренировку.';
const GENERATE_NOTE = 'Выбери уровень и зоны упора — упражнения подберутся по правилам.';
// Четыре шага из макета: из чего тренировка конструктора состоит по умолчанию, и
// ручная, и подобранная по правилам. Разминку, разогрев и завершение можно
// выключить, а силовые разложить кругом или подходами («Формат занятия»), поэтому
// заголовок говорит «обычно», а не «всегда».
// Третий элемент — тип блока: от него шаг получает цвет, как блок в «Сегодня».
const STEPS = [
  ['Разминка', 'Плавно, без длительных остановок', 'warm'],
  ['Круговой разогрев', 'Повышает пульс, резинки лёгкие', 'circuit'],
  ['Силовая часть', 'Парами, кругом или подходами — на выбор', 'strength'],
  ['Завершение', '2–3 минуты в спокойном темпе, дыхание', 'finish'],
];

const ALL_COVERED = 'Все основные группы получают нагрузку';
const NOT_WHOLE_BODY = 'Тренировка пока не на всё тело';
const ONLY_STRENGTH = 'Считаются только силовые упражнения. Сохранить можно и так.';
const ALL_ABOVE_FLOOR = 'Все основные группы не ниже границы уровня.';
const BELOW_TITLE = 'Часть групп ниже границы уровня';
const belowNote = days => `Расчёт — на ${days} ${plural(days, ['день', 'дня', 'дней'])} в неделю: на сохранении он пересчитается по выбранным.`;
const GROUPS = ['группа', 'группы', 'групп'];
const MANUAL_KIND = 'Своя сборка';
const ONE_DAY = 'Один день в неделю — мало: каждую группу лучше нагружать хотя бы дважды в неделю.';

const GENERATOR_LEAD = 'Подбор упражнений по правилам';
const ZONE_HINT = 'Упор добавит упражнение на каждую выбранную зону, не больше двух. Остальные группы мышц остаются в тренировке.';
// Сложности во множественном числе, как их называет строка уровня: «Упражнения: базовые».
const DIFFICULTY_WORDS = { basic: 'базовые', medium: 'средние', hard: 'сложные' };
const TAG_FOCUS = 'упор';
const TAG_REPLACED = 'заменено';
const EXERCISES = ['упражнение', 'упражнения', 'упражнений'];

// Упражнений, а не пар: в «Круге» и «Подходах» пар нет, а потолок правил один.
const STRENGTH_FULL = `Не больше ${MAX_STRENGTH} силовых упражнений — убери одно, чтобы добавить другое.`;
const NO_STRENGTH = 'Добавь хотя бы одно силовое упражнение.';
const NAME_EMPTY = 'Введи название, чтобы сохранить.';
const NAME_LONG = `Название не длиннее ${NAME_MAX} знаков.`;
const NO_DAYS = 'Выбери хотя бы один день.';

const LIMIT_REACHED = `Сохранить нельзя: уже ${OWN_LIMIT} своих тренировок. Удали ненужную в разделе «Тренировки».`;
const DEVICE_FAILED = 'Не удалось сохранить: хранилище недоступно. Тренировка осталась здесь — попробуй ещё раз.';
const DISCARD_QUESTION = 'Бросить тренировку? Несохранённые изменения пропадут.';

const noFitText = slot => `Для блока «${SLOT_LABELS[slot]}» нет подходящих упражнений.`;
const NO_CANDIDATES = 'Похожих упражнений больше нет: все подходящие уже в тренировке.';
const HINT_STRENGTH = 'Те же целевые мышцы, похожая разметка';
const HINT_OTHER = 'Того же типа';
// Строка кандидата целиком — кнопка, а кнопкой её делает только кружок справа:
// без слов не очевидно, что нажатие и есть замена.
const TAP_TO_REPLACE = 'Нажми на упражнение, чтобы заменить.';

// Дни недели по ISO (1 — понедельник), как в compact.days.
const DAYS = [
  [1, 'пн', 'понедельник'], [2, 'вт', 'вторник'], [3, 'ср', 'среда'], [4, 'чт', 'четверг'],
  [5, 'пт', 'пятница'], [6, 'сб', 'суббота'], [7, 'вс', 'воскресенье'],
];

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
// Формат читается через formatOf: запись без него (сохранённая раньше или
// переданная напрямую) открывается «Парами», и снимок черновика сразу несёт
// поле — выбор тех же «Пар» не станет правкой.
const copyCompact = compact => ({
  ...compact,
  format: formatOf(compact),
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
//
// library — вся библиотека. Что из неё подходит человеку, решает gearProfile
// («Что есть дома»): подбор, скелет ручной сборки и кандидаты на замену идут по
// fitLibrary, а всё, что показывает уже выбранное (expandWorkout, блоки,
// покрытие), — по полной: упражнение не должно пропадать из тренировки оттого,
// что человек снял галочку с инвентаря.
export function renderBuilder({
  host, win, library = LIBRARY, store, confirm, onSaved, seed = () => Date.now(), openLink,
  gearProfile = createGearProfile(null),
}) {
  const document = host.ownerDocument;
  const make = (tag, className, text) => el(document, tag, className, text);
  // По каким правилам и источникам собирается тренировка — статья sources.html.
  const sourcesLink = () => {
    const link = make('a', 'sources-link', 'На чём построены тренировки');
    link.href = 'sources.html';
    return link;
  };

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

  // Цвет страницы на экране «Конструктора»: генератор сиреневый, остальное —
  // масляный цвет вкладки. Красим, только пока раздел на виду: правку открывают и
  // из «Тренировок», когда «Конструктор» ещё скрыт, и чужой цвет там не нужен.
  // Вернувшись во вкладку, раздел зовёт syncTint: sections.js ставит цвет вкладки,
  // а на открытом генераторе он должен остаться сиреневым.
  let screenTint = 'butter';
  function paintTint() {
    if (!host.hidden) document.body.dataset.tint = screenTint;
  }

  // Смена экрана. Экраны делят один раздел и одну полосу прокрутки, поэтому новый
  // открывается сверху, а фокус переходит на его заголовок: иначе после нажатия
  // на кнопку, которой уже нет в разметке, он оставался бы нигде. Экран, который
  // перерисовывается из-за нажатия на нём же (переключатели инвентаря), остаётся
  // там, где был: scroll: false не уводит страницу наверх.
  function show(root, focus = root.querySelector('h1'), { scroll = true } = {}) {
    host.replaceChildren(root);
    screenTint = root.classList.contains('builder-generator') ? 'lilac' : 'butter';
    paintTint();
    if (scroll) win.scrollTo({ top: 0, behavior: 'instant' });
    focus?.focus({ preventScroll: !scroll });
  }

  // Заголовок экрана. Принимает фокус программно, но в порядок обхода Tab не
  // попадает. Длинное название (у подобранной тренировки оно из зон упора)
  // набирается мельче: в 40px оно заняло бы три строки.
  function heading(text) {
    const title = make('h1', null, text);
    title.tabIndex = -1;
    if (text.length > 22) title.dataset.long = '';
    return title;
  }

  function backButton(text, onClick) {
    const button = make('button', 'builder-back');
    button.type = 'button';
    // Стрелка — украшение: диктор читал бы «стрелка влево».
    button.append(icon(document, 'back'), text);
    button.addEventListener('click', onClick);
    return button;
  }

  // Верх внутреннего экрана: «назад», ниже название на бумаге и, если есть,
  // строка под ним (она же .builder-subtitle у генератора и результата).
  function topOf(back, title, lead = null) {
    const bar = make('div', 'appbar');
    bar.append(back);
    const block = make('div', 'page-title');
    block.append(title);
    if (lead) block.append(lead);
    return [bar, block];
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

  // Цвет карточки вокруг строки состояния (.builder-card) меняется вместе со
  // строкой: мятный — всё закрыто, масляный — есть что поправить.
  function paintStatus(box, ok, lines) {
    box.classList.toggle('is-ok', ok);
    box.closest('.builder-card')?.classList.toggle('is-ok', ok);
    box.replaceChildren(...lines.map(line => make('p', null, line)));
  }

  const workoutOf = days => expandWorkout(draftId, { ...draft, days }, library).workout;

  // — Вход ——————————————————————————————————————————————————————————

  function entryScreen() {
    const root = make('div', 'builder builder-entry');
    // Пробел между подписями: имя кнопки для диктора склеивается из них, и без
    // него «самомуЛистай» читалось бы одним словом.
    const path = (kind, iconName, title, note, onClick) => {
      const button = make('button', `builder-path builder-path-${kind}`);
      button.type = 'button';
      const mark = make('span', 'path-ic');
      mark.append(icon(document, iconName));
      const text = make('span', 'path-text');
      text.append(make('span', 'builder-path-title', title), ' ', make('span', 'builder-path-note', note));
      button.append(mark, text, icon(document, 'next', 'ic path-go'));
      button.addEventListener('click', onClick);
      return button;
    };

    const steps = make('ol', 'builder-steps');
    // Номера видны в кружках, и список остаётся списком для диктора и в Safari,
    // который при list-style: none роль списка снимает.
    steps.setAttribute('role', 'list');
    STEPS.forEach(([name, note, kind], index) => {
      const item = make('li');
      item.dataset.kind = kind;
      const text = make('span', 'step-text');
      text.append(make('strong', null, name), ' ', make('span', null, note));
      item.append(make('span', 'step-badge', String(index + 1)), text);
      steps.append(item);
    });

    const paths = make('div', 'builder-paths');
    paths.append(
      path('manual', 'blocks', 'Собрать самому', MANUAL_NOTE, startManual),
      path('generate', 'sparkles', 'Сгенерировать', GENERATE_NOTE, startGenerator),
    );
    const body = make('div', 'wrap');
    body.append(paths, make('h2', 'builder-steps-title', 'Из чего обычно состоит тренировка'), steps, sourcesLink());
    root.append(renderHero(document, { title: 'Конструктор', lead: ENTRY_LEAD, leadClass: 'builder-lead' }), body);
    return root;
  }

  function startManual() {
    draft = {
      v: 1, name: defaultName([]), days: [...DEFAULT_DAYS], level: null, zones: [], format: DEFAULT_FORMAT,
      ...pickSkeleton(fitLibrary(library, gearProfile.get()), makeRandom(seed())),
      strength: [], focus: [], t: 0,
    };
    draftId = newWorkoutId();
    startedAs = snapshot(draft);
    // Сборка открывается на разминке: она первая в списке, и видно, как выглядит
    // раскрытый блок.
    openId = 'start';
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
    openId = '';
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
  // не отличить: имя кнопки — «действие: упражнение». У круглой кнопки (mark —
  // имя значка) подписи на экране нет, имя ей даёт aria-label; у текстовой
  // видимая подпись стоит в начале имени.
  function itemButton(className, text, item, onClick, mark = null) {
    const button = make('button', className);
    button.type = 'button';
    if (mark === null) button.textContent = text;
    else button.append(icon(document, mark));
    button.setAttribute('aria-label', `${text}: ${item.name}`);
    button.addEventListener('click', () => onClick(button));
    return button;
  }

  // Строка упражнения: название, мышцы, метки (их ставит результат) и кнопка.
  function itemRow(item, button, tags = []) {
    const node = make('div', 'builder-item');
    node.dataset.key = item.key;
    const text = make('div', 'builder-item-text');
    text.append(make('span', 'builder-item-name', item.name), make('span', 'builder-item-muscles', item.muscles));
    if (tags.length > 0) {
      const list = make('span', 'builder-item-tags');
      list.append(...tags.map(([className, label]) => make('span', className, label)));
      text.append(list);
    }
    node.append(text, button);
    return node;
  }

  // Какой блок раскрыт на экране сборки и результата. Один на оба: перерисовка
  // (замена, формат) его не сворачивает, а возврат из библиотеки открывает тот
  // блок, куда попало упражнение. Пусто — все свёрнуты.
  let openId = '';

  function applyOpen(container) {
    for (const section of container.querySelectorAll('.builder-block')) {
      setBlockOpen(section, section.dataset.block === openId);
    }
  }

  // Блоки тренировки — раскрывающиеся списки, как в «Сегодня»: шапка-кнопка (номер
  // цвета блока, название, подпись, число упражнений) и тело со строками. Круги
  // (или подходы) у силовых блоков показывает только результат: у подобранной
  // они зависят от уровня, у ручной сборки всегда два. Силовой блок — любой, чей
  // id не из скелета: его имя зависит от формата (pair1, loop, ex1), и по началу
  // id его не узнать.
  function blockSections(workout, rowOf, { rounds, onToggle }) {
    return workout.blocks.map(block => {
      const open = block.id === openId;
      const section = make('section', 'builder-block');
      section.dataset.kind = blockKind(block);
      section.dataset.block = block.id;

      const bodyId = `builder-${block.id}-body`;
      const head = make('button', 'blk-head');
      head.type = 'button';
      head.setAttribute('aria-expanded', String(open));
      head.setAttribute('aria-controls', bodyId);
      const number = make('span', 'block-number', blockNumber(block));
      number.setAttribute('aria-hidden', 'true');
      const text = make('span', 'blk-text');
      text.append(make('span', 'blk-title', block.title), make('span', 'blk-sub builder-block-sub', block.sub));
      const count = make('span', 'blk-prog', String(block.items.length));
      count.append(make('span', 'sr-only', ` ${plural(block.items.length, EXERCISES)}`));
      head.append(number, text, count, icon(document, 'down', 'ic blk-caret'));
      head.addEventListener('click', () => onToggle(block.id));
      const heading = make('h2', 'block-heading');
      heading.append(head);

      const body = make('div', 'blk-body');
      body.id = bodyId;
      body.hidden = !open;
      if (rounds && !SKELETON_BLOCK_IDS.includes(block.id)) {
        const tags = make('div', 'blk-tags');
        tags.append(make('span', 'round-tag builder-block-rounds', roundsTag(block)));
        body.append(tags);
      }
      body.append(...block.items.map(rowOf));

      section.append(heading, body);
      return section;
    });
  }

  // Кнопка в строке с этим ключом: после замены фокус возвращается на неё.
  const rowButton = (blocks, key) => [...blocks.querySelectorAll('.builder-item')]
    .find(node => node.dataset.key === key)?.querySelector('button');

  // Карточка покрытия мышц: петля заполняется по числу основных групп с нагрузкой
  // (в узле — их число, а когда всё в порядке — галочка), справа слова состояния.
  // Строка состояния — один узел на экран, и меняется его содержимое: заново
  // перерисованный узел диктор не озвучил бы. Список групп спрятан за кнопкой
  // «Без нагрузки: 17 групп»: в строку он занимал бы половину экрана. Кнопка и
  // список стоят вне строки состояния: иначе диктор читал бы их при каждой правке.
  function coverCard() {
    const meter = loopMeter(document);
    const knot = make('span', 'cover-knot');
    knot.setAttribute('aria-hidden', 'true');
    const loop = make('div', 'cover-loop');
    loop.append(meter.svg, knot);

    const status = statusBox();
    const list = make('p', 'cover-list');
    list.id = 'cover-list';
    list.hidden = true;
    const more = make('button', 'cover-more');
    more.type = 'button';
    more.setAttribute('aria-controls', list.id);
    more.addEventListener('click', () => {
      list.hidden = !list.hidden;
      more.setAttribute('aria-expanded', String(!list.hidden));
    });

    const text = make('div', 'cover-text');
    text.append(status, more);
    const card = make('section', 'cover');
    card.setAttribute('aria-label', 'Покрытие мышц');
    card.append(loop, text);

    // groups — группы, которым не хватает нагрузки, с подписью кнопки (label).
    function paint({ ok, covered, title, note = null, groups = [], label = '' }) {
      card.classList.toggle('is-ok', ok);
      status.classList.toggle('is-ok', ok);
      meter.set(covered / CORE_GROUPS.length);
      knot.replaceChildren(ok ? icon(document, 'tick', 'ic ic-hand') : String(covered));
      status.replaceChildren(make('p', 'cover-title', title), ...(note === null ? [] : [make('p', 'cover-note', note)]));
      more.hidden = groups.length === 0;
      if (groups.length === 0) {
        list.hidden = true;
      } else {
        more.replaceChildren(`${label}: ${groups.length} ${plural(groups.length, GROUPS)}`, icon(document, 'down'));
        const phrase = groupsPhrase(groups);
        list.textContent = `${phrase[0].toUpperCase()}${phrase.slice(1)}.`;
      }
      more.setAttribute('aria-expanded', String(!list.hidden));
    }
    return { nodes: [card, list], paint };
  }

  // Переключатели «Формат занятия» для текущего экрана. Узел один на экран и
  // живёт, пока он открыт: refresh() перерисовывает блоки и счётчики, но не его,
  // поэтому фокус остаётся на нажатой кнопке. Блок включён, если в нём есть
  // упражнения: выключенный — пустой список, отдельного поля нет.
  function formatPicker(idPrefix, refresh) {
    return renderFormatPicker(document, {
      idPrefix,
      state: () => ({
        blocks: Object.fromEntries(OPTIONAL_SLOTS.map(slot => [slot, draft[slot].length > 0])),
        format: formatOf(draft),
      }),
      onBlock(slot) {
        if (draft[slot].length > 0) {
          draft = { ...draft, [slot]: [] };
        } else {
          // Включённый блок собирается так же, как при старте сборки: те же
          // числа, только из подходящего по «Что есть дома». Подбирается весь
          // скелет, берётся один слот: так правило одно, а не две копии.
          const keys = pickSkeleton(fitLibrary(library, gearProfile.get()), makeRandom(seed()))[slot];
          if (keys.length === 0) return noFitText(slot);
          draft = { ...draft, [slot]: keys };
        }
        refresh();
        return null;
      },
      onFormat(id) {
        draft = { ...draft, format: id };
        refresh();
      },
    });
  }

  // Почему список пуст. Если по полной библиотеке кандидаты есть, дело в
  // инвентаре, и текст называет, какой нужен; иначе их нет вовсе, и текст прежний.
  function noCandidatesText(slot, key, owned) {
    const gear = unownedGear(replaceCandidates({ compact: draft, slot, key, library }), owned);
    return gear.length === 0
      ? NO_CANDIDATES
      : `Похожих упражнений с отмеченным инвентарём больше нет. Есть с инвентарём: ${gearNames(gear)}.`;
  }

  // Шторка замены (sheet.js). Ставится рядом с корнем экрана, а не внутрь него:
  // сборка и результат перерисовываются при каждом изменении, а шторке нельзя
  // пропадать вместе с ними. Что сделать с экраном после выбора, знает
  // onPick(newKey): он обновляет экран и отдаёт кнопку, на которую вернуть фокус.
  // Кандидатов можно искать по названию, мышцам и инвентарю — как в библиотеке.
  function openReplace({ root, slot, key, opener, onPick }) {
    const current = library.find(entry => entry.key === key);
    const { sheet, close, show } = openSheet({
      host, screen: root, labelledBy: 'replace-title', className: 'replace-sheet', scrimClass: 'replace-backdrop', opener,
    });

    const title = make('h2', 'sheet-title', 'Заменить упражнение');
    title.id = 'replace-title';
    const closeButton = make('button', 'icon-btn replace-close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Закрыть');
    closeButton.append(icon(document, 'close'));
    closeButton.addEventListener('click', () => close());
    const head = make('div', 'sheet-head');
    head.append(title, closeButton);

    const now = make('p', 'replace-now');
    now.append('Сейчас: ', make('b', 'replace-current', current.name));
    const hint = make('p', 'replace-hint', `${slot === 'strength' ? HINT_STRENGTH : HINT_OTHER}.`);

    // Подходящие по инвентарю и само заменяемое: replaceCandidates бросает на
    // ключе, которого нет в переданной библиотеке, а в сохранённой тренировке
    // упражнение с неотмеченным инвентарём вполне может стоять. Само оно в
    // кандидаты не попадёт: оно уже в тренировке.
    const owned = gearProfile.get();
    const reachable = library.filter(entry => entry.key === key || fitsGear(entry, owned));
    const candidates = replaceCandidates({ compact: draft, slot, key, library: reachable });

    function candidateRow(entry) {
      const item = make('li', 'replace-candidate');
      // Строка целиком — кнопка выбора: имя ей даёт содержимое, а невидимая
      // подпись в начале говорит, что это за действие.
      const pick = make('button', 'cand replace-pick');
      pick.type = 'button';
      const text = make('span', 'cand-text');
      const sub = make('span', 'cand-sub');
      sub.append(make('span', 'replace-muscles', entry.muscles), ' · ', make('span', 'replace-gear', gearText(entry)));
      text.append(make('span', 'cand-name replace-name', entry.name), sub);
      const ring = make('span', 'cand-ring');
      ring.setAttribute('aria-hidden', 'true');
      pick.append(make('span', 'sr-only', 'Выбрать: '), text, ring);
      pick.addEventListener('click', () => {
        draft = replaceExercise(draft, slot, key, entry.key);
        close(onPick(entry.key));
      });
      item.append(pick);
      return item;
    }

    sheet.append(make('div', 'grab'), head, now, hint);
    if (candidates.length === 0) {
      sheet.append(make('p', 'replace-empty', noCandidatesText(slot, key, owned)));
    } else {
      hint.append(` ${TAP_TO_REPLACE}`);
      const search = searchField(document, { label: 'Найти упражнение', className: 'sheet-search', onChange: () => showMatches() });

      const list = make('ul', 'replace-list');
      // Сколько нашлось — вслух для диктора: список под полем перестраивается на
      // каждую букву, а глазами это видно, на слух — нет.
      const found = make('p', 'sr-only');
      found.setAttribute('role', 'status');
      const empty = make('div', 'cand-empty');
      const showAll = make('button', 'btn text pad0', 'Показать все');
      showAll.type = 'button';
      empty.append(make('p', 'cand-empty-title', 'Ничего не нашлось'), make('p', 'cand-empty-hint', 'Попробуй другое слово или покажи все.'), showAll);

      function showMatches() {
        const matches = searchCandidates(candidates, search.input.value);
        list.replaceChildren(...matches.map(candidateRow));
        empty.hidden = matches.length > 0;
        found.textContent = matches.length > 0 ? `Найдено: ${matches.length}` : 'Ничего не нашлось';
      }
      showAll.addEventListener('click', () => {
        search.set('');
        search.input.focus();
      });

      const scroll = make('div', 'sheet-scroll');
      scroll.append(list, empty, found);
      sheet.append(search.field, scroll);
      showMatches();
    }

    show();
  }

  // — Сборка ————————————————————————————————————————————————————————

  const addBlocked = () => (draft.strength.length >= MAX_STRENGTH ? STRENGTH_FULL : null);

  // Панель с итогом и главной кнопкой «Сохранить»: что получится (или почему
  // сохранить нельзя) и кнопка. Подпись и кнопку держит экран, а менять их
  // умеет refresh: узлы остаются теми же.
  function saveDock() {
    const title = make('b');
    const note = make('span');
    const text = make('p', 'dock-text');
    text.append(title, note);
    const button = make('button', 'builder-save', 'Сохранить');
    button.type = 'button';
    button.addEventListener('click', drawSave);
    const dock = make('div', 'dock');
    dock.append(text, button);
    return { dock, title, note, button };
  }

  function drawBuild() {
    const root = make('div', 'builder builder-build wrap has-dock');
    const cover = coverCard();
    const picker = formatPicker('build-format', () => refresh());
    const blocks = make('div', 'builder-blocks');
    const bar = saveDock();

    // «Добавить упражнение» стоит в списке блоков, там, где у тренировки силовая
    // часть: перед завершением, а без него — в конце.
    const add = make('button', 'addrow builder-add');
    add.type = 'button';
    add.addEventListener('click', showLibrary);
    const addMark = make('span', 'addrow-ic');
    addMark.append(icon(document, 'plus'));
    const addSub = make('span', 'addrow-sub');
    const addText = make('span', 'addrow-text');
    addText.append(make('span', 'addrow-title', 'Добавить упражнение'), ' ', addSub);
    add.append(addMark, addText);
    const addReason = reasonNote();
    const addWrap = make('div', 'builder-addwrap');
    addWrap.append(add, addReason);

    // Упражнение и его кнопка: у силовых «Убрать» (замена силового — это убрать
    // и добавить другое из библиотеки), у остальных «Заменить».
    function row(item) {
      const slot = SLOTS.find(name => draft[name].includes(item.key));
      if (slot === 'strength') return itemRow(item, itemButton('builder-remove', 'Убрать', item, () => remove(item.key)));
      return itemRow(item, itemButton('builder-replace icon-btn', 'Заменить', item,
        opener => openReplace({ root, slot, key: item.key, opener, onPick: picked }), 'swap'));
    }

    function picked(key) {
      refresh();
      return rowButton(blocks, key);
    }

    function toggle(id) {
      openId = openId === id ? '' : id;
      applyOpen(blocks);
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
      const covered = CORE_GROUPS.length - zero.length;
      cover.paint(zero.length === 0
        ? { ok: true, covered, title: ALL_COVERED }
        : { ok: false, covered, title: NOT_WHOLE_BODY, note: ONLY_STRENGTH, groups: zero, label: 'Без нагрузки' });

      const sections = blockSections(expandWorkout(draftId, draft, library).workout, row, { rounds: false, onToggle: toggle });
      const finish = sections.findIndex(section => section.dataset.kind === 'finish');
      sections.splice(finish === -1 ? sections.length : finish, 0, addWrap);
      blocks.replaceChildren(...sections);

      const available = fitLibrary(library, gearProfile.get()).filter(entry => entry.slot === 'strength').length;
      addSub.textContent = `Из библиотеки, ${available} ${plural(available, EXERCISES)}`;
      const blocked = addBlocked();
      add.disabled = blocked !== null;
      setNote(addReason, blocked);

      const count = exerciseCount(draft);
      const empty = draft.strength.length === 0;
      bar.title.textContent = empty ? NO_STRENGTH : `${count} ${plural(count, EXERCISES)}`;
      bar.note.textContent = empty ? '' : MANUAL_KIND;
      bar.button.disabled = empty;
    }

    root.append(...topOf(backButton('Назад', () => leave(abandon)), heading('Своя тренировка')), ...cover.nodes, picker, blocks, bar.dock);
    refresh();
    show(root);
  }

  function showLibrary() {
    renderLibrary({
      host,
      // Вся библиотека: счётчик «ещё M с другим инвентарём» считает скрытое сам.
      entries: library,
      gear: { owned: gearProfile.get(), onChange: owned => gearProfile.set(owned) },
      isAdded: key => draft.strength.includes(key),
      addBlocked,
      onAdd(key) {
        draft = { ...draft, strength: [...draft.strength, key] };
        // Раскрыт блок, куда попало упражнение: вернувшись на сборку, человек
        // увидит его сразу.
        const block = expandWorkout(draftId, draft, library).workout.blocks.find(candidate => candidate.items.some(item => item.key === key));
        openId = block?.id ?? openId;
      },
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

  // Отказ уровня с подсказкой про инвентарь: generate и availability видят
  // только подходящие упражнения, а какой инвентарь и для каких групп помог бы,
  // знает тот, у кого есть полная библиотека.
  const levelMessage = (level, groups, owned) => missingGroupsMessage(level, groups,
    missingGear(library, owned, level, groups), closableGroups(library, owned, level, groups));

  // focusGear — вид инвентаря, чей переключатель только что нажали: экран
  // перерисован целиком, и фокус надо вернуть на ту же кнопку нового экрана.
  function drawGenerator(focusGear = null) {
    // Что есть на каждом уровне среди упражнений, подходящих человеку по
    // инвентарю. Уровень, которому не хватает групп, и зона без опоры для упора
    // не выбираются, а причина стоит на экране.
    const owned = gearProfile.get();
    const info = Object.fromEntries(Object.keys(LEVELS).map(level => [level, availability(fitLibrary(library, owned), level)]));
    const usable = level => info[level].missing.length === 0;
    // Без доступного уровня не выбран ни один: выбирать нечего, а причины видны
    // под каждым уровнем. Выбор приводится к тому, что доступно сейчас: после
    // смены инвентаря уровень или зона могли стать невыполнимыми, и оставить их
    // нажатыми значило бы дать человеку кнопку, которая только откажет. Тот же
    // путь выбирает первый доступный, когда уровней не было, а инвентарь их открыл.
    const first = Object.keys(LEVELS).find(usable) ?? null;
    const selected = choice !== null && choice.level !== null && usable(choice.level) ? choice.level : first;
    choice = {
      level: selected,
      zones: selected === null ? [] : (choice?.zones ?? []).filter(zone => info[selected].zones[zone]),
    };

    const root = make('div', 'builder builder-generator wrap has-dock');
    const refusal = alertNote('builder-refusal');
    const generateButton = make('button', 'builder-generate', 'Сгенерировать');
    generateButton.type = 'button';
    generateButton.addEventListener('click', () => runGenerator(choice.level, choice.zones, refusal));
    // Плавающая панель: что будет сгенерировано, кнопка и отказ над ними.
    const dockTitle = make('b');
    const dockNote = make('span');
    const dockText = make('p', 'dock-text');
    dockText.append(dockTitle, dockNote);

    const levelsTitle = make('h2', 'builder-group-title', 'Уровень');
    levelsTitle.id = 'generator-levels';
    const levels = make('div', 'level-options');
    levels.setAttribute('role', 'radiogroup');
    levels.setAttribute('aria-labelledby', levelsTitle.id);
    const options = Object.entries(LEVELS).map(([id, level]) => {
      const item = make('div', 'level-item');
      const option = make('button', 'level-option');
      option.type = 'button';
      option.setAttribute('role', 'radio');
      // Пробелы между строками — по той же причине, что на входе. Круг слева
      // выбранного — с галочкой: смысл не держится на цвете.
      const radio = make('span', 'radio');
      radio.append(icon(document, 'tick', 'ic ic-hand'));
      const text = make('span', 'level-text');
      const facts = make('span', 'level-facts');
      for (const line of [
        `Подходов на упражнение: ${level.rounds}`,
        `Упражнения: ${poolText(level.pool)}`,
        `Остановка: за ${level.reserve} повтора до отказа`,
      ]) facts.append(' ', make('span', 'level-line', line));
      text.append(make('span', 'level-title', level.label), ' ', make('span', 'level-who', level.who), facts);
      option.append(radio, text);
      item.append(option);
      if (!usable(id)) {
        setUnavailable(option, true);
        const note = make('p', 'level-missing', levelMessage(id, info[id].missing, owned));
        note.id = `level-missing-${id}`;
        option.setAttribute('aria-describedby', note.id);
        item.append(note);
      }
      option.addEventListener('click', () => { if (usable(id)) pickLevel(id); });
      levels.append(item);
      return [id, option];
    });

    const zonesTitle = make('h2', 'builder-group-title', 'Зоны упора');
    zonesTitle.id = 'generator-zones';
    const zones = make('div', 'zone-chips');
    zones.setAttribute('role', 'group');
    zones.setAttribute('aria-labelledby', zonesTitle.id);
    const missing = make('div', 'zone-missing');
    const chips = Object.entries(ZONES).map(([id, zone]) => {
      const chip = make('button', 'zone-chip');
      chip.type = 'button';
      // Галочка слева выбранного чипа, пока не выбран — скрыта (style.css).
      chip.append(icon(document, 'tick', 'ic ic-hand tick'), zone.label);
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
        note.textContent = absent
          ? missingZoneMessage(choice.level, id, missingGear(library, owned, choice.level, ZONES[id].groups))
          : '';
        if (absent) chip.setAttribute('aria-describedby', note.id);
        else chip.removeAttribute('aria-describedby');
      }
      generateButton.disabled = choice.level === null;
      dockTitle.textContent = choice.level === null ? 'Уровень не выбран' : `${LEVELS[choice.level].label} уровень`;
      dockNote.textContent = choice.zones.length === 0
        ? (choice.level === null ? '' : 'Без упора')
        : `Упор: ${choice.zones.map(zone => ZONES[zone].label.toLowerCase()).join(', ')}`;
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

    // Смена инвентаря пересчитывает всё на экране, поэтому он рисуется заново.
    const picker = renderGearPicker(document, {
      owned,
      idPrefix: 'generator-gear',
      onChange(next, id) {
        gearProfile.set(next);
        drawGenerator(id);
      },
    });

    const dock = make('div', 'dock');
    dock.append(refusal, dockText, generateButton);

    root.append(...topOf(backButton('Назад', abandon), heading('Генератор'), make('p', 'lead builder-subtitle', GENERATOR_LEAD)),
      levelsTitle, levels, zonesTitle, make('p', 'zone-hint', ZONE_HINT), zones, missing, picker, dock);
    paint();
    if (focusGear === null) show(root);
    else show(root, root.querySelector(`[data-gear="${focusGear}"]`), { scroll: false });
  }

  // Отказ генератора с подсказкой про инвентарь. generate видит только
  // подходящие упражнения и говорит про «библиотеку»; называет, какого инвентаря
  // не хватает, тот, у кого есть полная. Отказ по потолку — как есть: он не про
  // инвентарь.
  function refusalText(result, level, owned) {
    if (result.reason !== 'missing') return result.message;
    if (result.zone !== undefined) {
      return missingZoneMessage(level, result.zone, missingGear(library, owned, level, ZONES[result.zone].groups));
    }
    return levelMessage(level, result.groups, owned);
  }

  // Новая запись, в которой остаётся то, что человек уже выбрал в старой: название,
  // дни, формат и пустые блоки разминки, разогрева и завершения.
  function keepChoices(next, previous) {
    const off = Object.fromEntries(OPTIONAL_SLOTS.filter(slot => previous[slot].length === 0).map(slot => [slot, []]));
    return { ...next, name: previous.name, days: [...previous.days], format: formatOf(previous), ...off };
  }

  // Новая тренировка по уровню и зонам: с экрана генератора и по «Другому
  // варианту». Отказ показывается там, откуда просили, а прежнее остаётся как было.
  function runGenerator(level, zones, refusal) {
    const owned = gearProfile.get();
    const result = generate({ level, zones, seed: seed(), library: fitLibrary(library, owned) });
    if (!result.ok) {
      setNote(refusal, refusalText(result, level, owned));
      return;
    }
    // «Другой вариант» меняет подбор, а не то, что человек уже мог назвать и
    // расписать по дням: название и дни остаются, как и id — сохранение
    // перезапишет ту же тренировку, а не заведёт вторую. Так же остаются формат
    // и выключенные блоки: нажатие «Другой вариант» не должно включать то, что
    // человек только что убрал.
    draft = draft === null ? result.compact : keepChoices(result.compact, draft);
    draftId ??= newWorkoutId();
    startedAs = snapshot(draft);
    replaced.clear();
    openId = '';
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
    const root = make('div', 'builder builder-result wrap has-dock');
    const subtitle = make('p', 'lead builder-subtitle');
    const cover = coverCard();
    const another = make('button', 'btn builder-variant');
    another.type = 'button';
    another.append(icon(document, 'again', 'ic ic-sm'), 'Другой вариант');
    const refusal = alertNote('builder-refusal');
    // Зоны — из выбора, а не из записи: выбор уже приведён к тому, что принимает
    // генератор (см. edit), а запись могла принести лишнюю зону.
    another.addEventListener('click', () => runGenerator(choice.level, choice.zones, refusal));
    const picker = formatPicker('result-format', () => refresh());
    const blocks = make('div', 'builder-blocks');
    const bar = saveDock();

    // Заменить можно любое упражнение, и силовое тоже: «Убрать» ломало бы то, что
    // подобрано под уровень и упор.
    function row(item) {
      const slot = SLOTS.find(name => draft[name].includes(item.key));
      const tags = [];
      if (item.focus) tags.push(['focus-tag', TAG_FOCUS]);
      if (replaced.has(item.key)) tags.push(['replaced-tag', TAG_REPLACED]);
      return itemRow(item, itemButton('builder-replace icon-btn', 'Заменить', item,
        opener => openReplace({ root, slot, key: item.key, opener, onPick: picked }), 'swap'), tags);
    }

    function picked(key) {
      replaced.add(key);
      refresh();
      return rowButton(blocks, key);
    }

    function toggle(id) {
      openId = openId === id ? '' : id;
      applyOpen(blocks);
    }

    function refresh() {
      // Число упражнений меняется, когда блок включают и выключают.
      const count = exerciseCount(draft);
      const level = `${LEVELS[draft.level].label} уровень`;
      subtitle.textContent = `${level} · ${count} ${plural(count, EXERCISES)}`;
      bar.title.textContent = `${count} ${plural(count, EXERCISES)}`;
      bar.note.textContent = level;
      // Граница уровня рассчитана на три дня (PLAN_DAYS). Дни человек выбирает
      // на сохранении, и там та же граница пересчитывается уже при них.
      const below = belowFloor(workoutOf(PLAN_DAYS), LEVELS[draft.level].floor);
      const covered = CORE_GROUPS.length - below.length;
      cover.paint(below.length === 0
        ? { ok: true, covered, title: ALL_COVERED }
        : { ok: false, covered, title: BELOW_TITLE, note: belowNote(PLAN_DAYS.length), groups: below, label: 'Ниже границы' });
      blocks.replaceChildren(...blockSections(expandWorkout(draftId, draft, library).workout, row, { rounds: true, onToggle: toggle }));
    }

    root.append(...topOf(backButton('Назад', () => leave(backToGenerator)), heading(defaultName(draft.zones)), subtitle),
      ...cover.nodes, another, refusal, picker, blocks, bar.dock);
    refresh();
    show(root);
  }

  // — Сохранение ————————————————————————————————————————————————————

  function drawSave() {
    const root = make('div', 'builder builder-saving wrap has-dock');
    // Назад — туда, откуда пришли: подобранная — на результат, собранная — на сборку.
    const back = draft.level === null ? backButton('К сборке', drawBuild) : backButton('К результату', drawResult);

    const nameLabel = make('label', 'builder-label', 'Название');
    nameLabel.htmlFor = 'save-name';
    const name = make('input', 'save-name');
    name.id = 'save-name';
    name.type = 'text';
    name.autocomplete = 'off';
    name.placeholder = 'Например, «Моя пятница»';
    // Не длиннее, чем принимает запись. Поле ограничивает ввод пальцем; а
    // значение, поставленное не пальцем, ловит refresh.
    name.setAttribute('maxlength', String(NAME_MAX));
    name.value = draft.name;

    const daysLabel = make('p', 'builder-label', 'Дни недели');
    daysLabel.id = 'save-days';
    const days = make('div', 'day-chips');
    days.setAttribute('role', 'group');
    days.setAttribute('aria-labelledby', 'save-days');
    const chips = DAYS.map(([day, label, full]) => {
      const chip = make('button', 'day-chip', label);
      chip.type = 'button';
      // «пн» диктор читает по буквам: полное название — в подписи кнопки.
      chip.setAttribute('aria-label', full);
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

    // Что сохранится и как это ложится на выбранные дни — одна карточка со
    // значком: мятная, пока всё в порядке, масляная, когда есть что поправить.
    const card = make('section', 'builder-card builder-sum');
    card.setAttribute('aria-label', 'Что сохранится');
    const mark = make('span', 'sum-ic');
    mark.append(icon(document, 'tick', 'ic ic-hand sum-ok'), icon(document, 'alert', 'ic sum-warn'));
    const cardText = make('div', 'sum-text');
    cardText.append(summary, status);
    card.append(mark, cardText);

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

    // Кнопка живёт в плавающей панели над нижней: одно главное действие экрана.
    // Причина, по которой она недоступна, стоит в той же панели над кнопкой.
    const dock = make('div', 'dock dock-solo');
    dock.append(saveReason, save);

    root.append(...topOf(back, heading('Сохранение')), nameLabel, name, daysLabel, days, card, error, dock);
    refresh();
    show(root);
  }

  host.replaceChildren(entryScreen());
  return { edit, syncTint: paintTint };
}
