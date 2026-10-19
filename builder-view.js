// Раздел «Конструктор»: вход, ручная сборка из библиотеки, замена упражнения и
// сохранение. Один модуль, потому что у экранов общий черновик: сборка меняет
// его, библиотека добавляет в него, сохранение дописывает название и дни.
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
import { LIBRARY, SLOT_LABELS } from './exercises/index.js';
import { renderLibrary } from './library-view.js';
import { expandWorkout, exerciseCount, NAME_MAX } from './builder/compact.js';
import { pickSkeleton, makeRandom } from './builder/generator.js';
import { replaceCandidates, replaceExercise } from './builder/replace.js';
import { zeroGroups, belowFloor } from './builder/coverage.js';
import { groupsPhrase } from './muscles.js';
import { LEVELS, MAX_STRENGTH, DEFAULT_DAYS } from './builder/rules.js';
import { plural, defaultName, GEAR_NAMES } from './builder/texts.js';
import { newWorkoutId, OWN_LIMIT } from './my-workouts.js';

const ENTRY_LEAD = 'Тренировка всегда на всё тело. Собери её сам из библиотеки или получи готовую по правилам, а потом сохрани.';
const MANUAL_NOTE = 'Листай библиотеку упражнений, добавляй нужные и сохрани тренировку.';
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

// Возвращает { edit(id, compact) }: открыть сборку своей тренировки на правку.
// Обещание, а не void: если начатую сборку жалко бросать, edit сперва спрашивает
// и отвечает, открыл ли он правку.
export function renderBuilder({ host, win, library = LIBRARY, store, confirm, onSaved, seed = () => Date.now(), openLink }) {
  const document = host.ownerDocument;
  const make = (tag, className, text) => el(document, tag, className, text);

  // Черновик и id, под которым он будет сохранён. id заводится вместе с
  // черновиком, а не при сохранении: повтор после отказа хранилища пишет ту же
  // запись, а не плодит вторую.
  let draft = null;
  let draftId = null;
  let startedAs = '';
  // Идёт ли запрос на сохранение: пока идёт, повторный нажать нельзя, а с
  // экрана сохранения не уйти.
  let saving = false;

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
    const manual = make('button', 'builder-path');
    manual.type = 'button';
    // Пробел между подписями: имя кнопки для диктора склеивается из них, и без
    // него «самомуЛистай» читалось бы одним словом.
    manual.append(make('span', 'builder-path-title', 'Собрать самому'), ' ', make('span', 'builder-path-note', MANUAL_NOTE));
    manual.addEventListener('click', startManual);

    const steps = make('ol', 'builder-steps');
    for (const [name, note] of STEPS) {
      const item = make('li');
      item.append(make('strong', null, name), ' ', make('span', null, note));
      steps.append(item);
    }
    root.append(heading('Конструктор'), make('p', 'builder-lead', ENTRY_LEAD), manual,
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

  function abandon() {
    draft = null;
    draftId = null;
    show(entryScreen());
  }

  // Начатую сборку бросают только по согласию: одно нажатие на «Назад» не должно
  // стоить человеку собранного. Без правок спрашивать нечего.
  function leaveBuild() {
    if (!isDirty()) {
      abandon();
      return;
    }
    confirm(DISCARD_QUESTION).then(agreed => { if (agreed) abandon(); });
  }

  // Правка своей тренировки. Черновик — копия записи: сохранить его или бросить,
  // список своих и запись на устройстве от этого не меняются до самого
  // сохранения. Сгенерированная в этой версии тоже открывается на сборке: экран
  // результата появляется вместе с генератором, и именно здесь его место.
  async function edit(id, compact) {
    if (isDirty() && !await confirm(DISCARD_QUESTION)) return false;
    draft = structuredClone(compact);
    draftId = id;
    startedAs = snapshot(draft);
    drawBuild();
    return true;
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
      const node = make('div', 'builder-item');
      node.dataset.key = item.key;
      const text = make('div', 'builder-item-text');
      text.append(make('span', 'builder-item-name', item.name), make('span', 'builder-item-muscles', item.muscles));

      const action = make('button', slot === 'strength' ? 'builder-remove' : 'builder-replace', slot === 'strength' ? 'Убрать' : 'Заменить');
      action.type = 'button';
      // Кнопок несколько, и по голой подписи диктору их не отличить; видимая
      // подпись стоит в начале имени.
      action.setAttribute('aria-label', `${action.textContent}: ${item.name}`);
      action.addEventListener('click', slot === 'strength' ? () => remove(item.key) : () => openReplace(slot, item.key, action));
      node.append(text, action);
      return node;
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

      blocks.replaceChildren(...expandWorkout(draftId, draft, library).workout.blocks.map(block => {
        const section = make('section', 'builder-block');
        section.append(make('h3', null, block.title), make('p', 'builder-block-sub', block.sub), ...block.items.map(row));
        return section;
      }));

      const blocked = addBlocked();
      add.disabled = blocked !== null;
      setNote(addReason, blocked);
      const empty = draft.strength.length === 0;
      save.disabled = empty;
      setNote(saveReason, empty ? NO_STRENGTH : null);
    }

    // Шторка замены. Ставится рядом с корнем сборки, а не внутрь него: сборка
    // перерисовывается при каждом изменении, а шторке нельзя пропадать вместе с ней.
    function openReplace(slot, key, opener) {
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
          refresh();
          close([...blocks.querySelectorAll('.builder-item')].find(node => node.dataset.key === entry.key)?.querySelector('button'));
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

    root.append(backButton('Назад', leaveBuild), heading('Своя тренировка'), coverage, add, addReason, blocks, save, saveReason);
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

  // — Сохранение ————————————————————————————————————————————————————

  function drawSave() {
    const root = make('div', 'builder builder-saving');
    const back = backButton('К сборке', drawBuild);

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
    const summary = make('p', 'builder-summary', `Что сохранится: ${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}, ${kind}`);
    const status = statusBox();

    const save = make('button', 'builder-save', 'Сохранить тренировку');
    save.type = 'button';
    const saveReason = reasonNote();
    const error = reasonNote('builder-error');
    error.setAttribute('role', 'alert');

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
      save.disabled = saving || reason !== null;
      back.disabled = saving;
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
      saving = true;
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
      saving = false;
      if (!result.ok) {
        refresh();
        setNote(error, result.reason === 'limit' ? LIMIT_REACHED : DEVICE_FAILED);
        return;
      }
      abandon();
      onSaved(id, compact, { localOnly: result.localOnly });
    });

    root.append(back, heading('Сохранение'), nameLabel, name, daysLabel, days, summary, status, save, saveReason, error);
    refresh();
    show(root);
  }

  host.replaceChildren(entryScreen());
  return { edit };
}
