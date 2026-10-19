// Экран библиотеки упражнений: поиск по названию, фильтры по зоне и сложности,
// карточки с кнопкой «Добавить». Модуль самостоятельный и про конструктор ничего
// не знает: что значит «добавлено», когда добавлять нельзя и что делать при
// нажатии, ему сообщает вызывающий (isAdded, addBlocked, onAdd, onBack). Так
// экран проверяется без конструктора, а конструктор — без экрана.
import { DIFFICULTY_LABELS, toItem } from './exercises/index.js';
import { ZONES } from './builder/rules.js';
import { renderHowto, bindHowto } from './render.js';
import { setupPlayers } from './player.js';

// Начало id панелей плеера библиотеки. Свой, а не общий с «Сегодня»: панель
// получает id при открытии ролика, и без различия обе назвали бы первую
// панель одинаково.
const VIDEO_ID_PREFIX = 'library-video';
// Начало id областей «Как выполнять» (см. renderHowto): по нему же область
// библиотеки не путается с областью той же карточки в «Сегодня».
const HOWTO_ID_PREFIX = 'lib';

// Чипы: [значение фильтра, подпись]. Первый в каждой группе — «без фильтра»
// (значение null), он и выбран при открытии экрана.
const ZONE_CHIPS = [[null, 'Все'], ...Object.entries(ZONES).map(([id, zone]) => [id, zone.label])];
const DIFFICULTY_CHIPS = [[null, 'Любая'], ...Object.entries(DIFFICULTY_LABELS)];

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Запрос и название сравниваются в одном виде: без регистра, «ё» как «е» (на
// телефоне «ё» набирают редко, и «Ёлочка» должна находиться по «елоч»), без
// пробелов по краям (клавиатура телефона любит дописать пробел после слова).
export function normalizeQuery(text) {
  return text.toLowerCase().replaceAll('ё', 'е').trim();
}

// На экране только силовые: разминка, разогрев и завершение подбираются
// правилами и в ручную сборку не добавляются. Зона — по целевым группам
// (доля 1, как в генераторе): упражнение, где ягодичные лишь вспомогательные
// (0.5), на «Ягодицы» не годится, и среди найденных по зоне его быть не должно.
export function filterEntries(entries, { query = '', zone = null, difficulty = null } = {}) {
  const needle = normalizeQuery(query);
  const groups = zone === null ? null : ZONES[zone].groups;
  return entries.filter(entry => entry.slot === 'strength'
    && normalizeQuery(entry.name).includes(needle)
    && (groups === null || groups.some(group => entry.load[group] === 1))
    && (difficulty === null || entry.difficulty === difficulty));
}

// Возвращает { refresh }: вызывающий зовёт его, когда состав тренировки или
// причина «добавлять нельзя» изменились где-то вне экрана. Сам экран после
// onAdd обновляется без напоминания: нажатая кнопка должна сразу показать, чем
// кончилось, а правду о том, добавилось ли упражнение, говорит isAdded.
export function renderLibrary({ host, entries, isAdded, addBlocked, onAdd, onBack, openLink }) {
  const document = host.ownerDocument;
  const strengthEntries = entries.filter(entry => entry.slot === 'strength');
  const state = { query: '', zone: null, difficulty: null };

  // Весь экран — в своём узле, а не прямо в host. Обработчик раскрытия «Как
  // выполнять» вешается на корень (bindHowto) и живёт ровно столько же, сколько
  // корень: при повторной отрисовке на том же host старый корень уходит вместе
  // со своим обработчиком. Повесь его на сам host — и каждая отрисовка добавляла
  // бы второй, а два обработчика раскрывают область и тут же сворачивают.
  const root = el(document, 'div', 'library');
  host.replaceChildren(root);
  bindHowto(root);

  let closeVideo = () => {};
  // Escape закрывает открытое видео, пока фокус внутри экрана (на кнопке
  // ролика или в подвале плеера). Слушатель — на корне, а не на document: он
  // уходит вместе с корнем, а общий Escape приложения про плеер библиотеки не
  // знает.
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeVideo();
  });

  const backButton = withArrow => {
    const button = el(document, 'button', 'builder-back');
    button.type = 'button';
    if (withArrow) {
      // Стрелка — украшение: диктор читал бы «стрелка влево, к сборке».
      const arrow = el(document, 'span', null, '←');
      arrow.setAttribute('aria-hidden', 'true');
      button.append(arrow, ' К сборке');
    } else {
      button.textContent = 'К сборке';
    }
    button.addEventListener('click', () => onBack());
    return button;
  };

  const search = el(document, 'input', 'library-search');
  search.type = 'search';
  search.autocomplete = 'off';
  search.placeholder = 'Название упражнения';
  search.setAttribute('aria-label', 'Поиск упражнения');
  search.addEventListener('input', () => {
    state.query = search.value;
    drawList();
  });

  // Нажатые чипы — по состоянию, а не по тому, на что нажали: «Сбросить
  // фильтры» тоже меняет состояние, и подсветка обязана следовать за ним.
  const chips = [];
  const chipGroup = (label, key, options) => {
    const group = el(document, 'div', 'library-filters');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const button = el(document, 'button', 'library-chip', text);
      button.type = 'button';
      button.addEventListener('click', () => {
        state[key] = value;
        syncChips();
        drawList();
      });
      chips.push({ button, key, value });
      group.append(button);
    }
    return group;
  };
  const syncChips = () => {
    for (const { button, key, value } of chips) button.setAttribute('aria-pressed', String(state[key] === value));
  };

  function resetFilters() {
    state.query = '';
    state.zone = null;
    state.difficulty = null;
    search.value = '';
    syncChips();
    drawList();
  }

  // Пометка о причине создаётся, когда добавлять нельзя, и убирается, когда
  // можно: пустой role="status" в разметке только занимал бы место.
  let blockedNote = null;
  const found = el(document, 'p', 'library-found');
  found.setAttribute('aria-live', 'polite');
  const emptyBox = el(document, 'div');
  const list = el(document, 'div', 'cards library-list');
  const total = el(document, 'p', 'library-total');

  // Кнопки «Добавить» нынешнего списка по ключу упражнения.
  const addButtons = new Map();

  function card(entry) {
    const article = el(document, 'article', 'exercise library-card');
    const top = el(document, 'div', 'exercise-top');
    top.append(
      el(document, 'span', 'library-level', DIFFICULTY_LABELS[entry.difficulty]),
      el(document, 'span', 'muscles', entry.muscles),
    );
    article.append(top, el(document, 'h3', null, entry.name));

    const { refs, body, links } = renderHowto(document, {
      idPrefix: HOWTO_ID_PREFIX,
      item: toItem(entry),
      expanded: false,
    });
    article.append(refs, body, ...links);

    const add = el(document, 'button', 'library-add');
    add.type = 'button';
    add.addEventListener('click', () => {
      onAdd(entry.key);
      refresh();
    });
    addButtons.set(entry.key, { button: add, name: entry.name });
    article.append(add);
    return article;
  }

  function emptyContent() {
    const reset = el(document, 'button', 'library-chip', 'Сбросить фильтры');
    reset.type = 'button';
    reset.addEventListener('click', resetFilters);
    return [
      el(document, 'p', 'library-empty-title', 'Ничего не найдено'),
      el(document, 'p', 'library-empty-hint', 'Измени запрос или сбрось фильтры.'),
      reset,
    ];
  }

  // Перерисовывается только список: поле поиска и чипы остаются теми же узлами,
  // иначе набор текста терял бы фокус на каждой букве. Открытое видео уходит
  // вместе со своей карточкой, а плеер нового списка ставится заново.
  function drawList() {
    const shown = filterEntries(entries, state);
    found.textContent = `Найдено: ${shown.length}`;
    addButtons.clear();
    list.replaceChildren(...shown.map(card));
    emptyBox.className = shown.length === 0 ? 'library-empty' : '';
    emptyBox.replaceChildren(...(shown.length === 0 ? emptyContent() : []));
    closeVideo = setupPlayers(list, openLink, { idPrefix: VIDEO_ID_PREFIX });
    refresh();
  }

  // Меняется только то, что зависит от состава тренировки, — карточки не
  // пересобираются. Раскрытая техника и открытое видео остаются на месте, а
  // нажатая кнопка — тем же узлом (у пересобранной фокус терялся бы).
  function refresh() {
    const reason = addBlocked();
    if (reason === null) {
      blockedNote?.remove();
      blockedNote = null;
    } else {
      if (!blockedNote) {
        blockedNote = el(document, 'p', 'library-blocked');
        blockedNote.setAttribute('role', 'status');
        found.before(blockedNote);
      }
      blockedNote.textContent = reason;
    }

    for (const [key, { button, name }] of addButtons) {
      const added = isAdded(key);
      button.textContent = added ? 'В тренировке' : 'Добавить';
      // Подпись называет упражнение: таких кнопок много, и по голой подписи
      // диктору их не отличить.
      button.setAttribute('aria-label', `${button.textContent}: ${name}`);
      button.disabled = added || reason !== null;
    }
    total.textContent = `В тренировке: ${strengthEntries.filter(entry => isAdded(entry.key)).length}`;
  }

  const foot = el(document, 'div', 'library-foot');
  foot.append(total, backButton(false));

  root.append(
    backButton(true),
    search,
    chipGroup('Зона', 'zone', ZONE_CHIPS),
    chipGroup('Сложность', 'difficulty', DIFFICULTY_CHIPS),
    found,
    emptyBox,
    list,
    foot,
  );
  syncChips();
  drawList();

  return { refresh };
}
