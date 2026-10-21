// Экран библиотеки упражнений: поиск по названию и мышцам, фильтры по зоне,
// сложности, движению и инвентарю, карточки с кнопкой «Добавить». Модуль
// самостоятельный и про конструктор ничего не знает: что значит «добавлено»,
// когда добавлять нельзя и что делать при нажатии, ему сообщает вызывающий
// (isAdded, addBlocked, onAdd, onBack). Так экран проверяется без конструктора,
// а конструктор — без экрана.
import { DIFFICULTY_LABELS, PATTERN_LABELS, toItem } from './exercises/index.js';
import { ZONES } from './builder/rules.js';
import { muscleLabel } from './muscles.js';
import { renderHowto, bindHowto, renderCaret } from './render.js';
import { setupPlayers } from './player.js';
import { fitsGear, gearText } from './gear.js';
import { renderGearPicker } from './gear-picker.js';

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
const NO_GEAR_CHIPS = [[false, 'Любой'], [true, 'Без инвентаря']];

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

// Где ищет поиск: название, подпись мышц с карточки, целевые группы (доля 1,
// как у зоны), движение и инвентарь. Подпись мышц пишут по-разному («Бёдра и
// ягодицы»), а названия групп из словаря одни и те же: по «квадрицепс»
// находится и приседание, у которого в подписи «бёдра». Инвентарь — той же
// подписью, что на карточке: по «петл» находятся упражнения с мини-петлёй, по
// «без инв» — без инвентаря.
function searchText(entry) {
  const targets = Object.keys(entry.load).filter(group => entry.load[group] === 1).map(muscleLabel);
  return normalizeQuery([entry.name, entry.muscles, ...targets, PATTERN_LABELS[entry.pattern], gearText(entry)].join(' '));
}

// На экране только силовые: разминка, разогрев и завершение подбираются
// правилами и в ручную сборку не добавляются. Зона — по целевым группам
// (доля 1, как в генераторе): упражнение, где ягодичные лишь вспомогательные
// (0.5), на «Ягодицы» не годится, и среди найденных по зоне его быть не должно.
// Запрос делится на слова, и найтись должно каждое, в любом порядке: «мост
// петл» — мосты с мини-петлёй.
// owned — что отмечено в «Что есть дома»: null — не фильтровать по инвентарю
// вовсе (экран без переключателей), а пустой массив — «ничего нет», тогда
// остаются только упражнения без инвентаря. noGear — только без инвентаря,
// что бы ни было отмечено: «Что есть дома» — то, что есть вообще, а это — на
// сегодня (в поездке, резинки остались дома).
export function filterEntries(entries, {
  query = '', zone = null, difficulty = null, pattern = null, noGear = false, owned = null,
} = {}) {
  const words = normalizeQuery(query).split(/\s+/).filter(Boolean);
  const groups = zone === null ? null : ZONES[zone].groups;
  return entries.filter(entry => entry.slot === 'strength'
    && (words.length === 0 || words.every(word => searchText(entry).includes(word)))
    && (groups === null || groups.some(group => entry.load[group] === 1))
    && (difficulty === null || entry.difficulty === difficulty)
    && (pattern === null || entry.pattern === pattern)
    && (!noGear || fitsGear(entry, []))
    && (owned === null || fitsGear(entry, owned)));
}

// Возвращает { refresh }: вызывающий зовёт его, когда состав тренировки или
// причина «добавлять нельзя» изменились где-то вне экрана. Сам экран после
// onAdd обновляется без напоминания: нажатая кнопка должна сразу показать, чем
// кончилось, а правду о том, добавилось ли упражнение, говорит isAdded.
// gear — { owned, onChange(owned) } или null. При null инвентарь не фильтрует
// ничего и переключателей нет; иначе entries — вся библиотека (счётчик «ещё M с
// другим инвентарём» считает скрытое сам), а выбор человека хранит вызывающий.
export function renderLibrary({ host, entries, isAdded, addBlocked, onAdd, onBack, openLink, gear = null }) {
  const document = host.ownerDocument;
  const strengthEntries = entries.filter(entry => entry.slot === 'strength');
  const state = {
    query: '', zone: null, difficulty: null, pattern: null, noGear: false,
    owned: gear === null ? null : [...gear.owned],
  };

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
  search.placeholder = 'Название или мышца';
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
  // В панели у группы видимый заголовок, и группа называется по нему
  // (aria-labelledby), как «Что есть дома» в gear-picker.js: так диктор не
  // читает одно название дважды.
  const titledGroup = (label, key, options) => {
    const title = el(document, 'h3', 'builder-group-title', label);
    title.id = `library-${key}-title`;
    const group = chipGroup(label, key, options);
    group.removeAttribute('aria-label');
    group.setAttribute('aria-labelledby', title.id);
    return [title, group];
  };

  // Инвентарь не сбрасывается: это не фильтр поиска, а то, что есть у человека
  // дома, и «Сбросить» не должно возвращать ему упражнения, которых он не сделает.
  // «Только без инвентаря» — фильтр на сегодня, его сброс снимает.
  function resetFilters() {
    state.query = '';
    state.zone = null;
    state.difficulty = null;
    state.pattern = null;
    state.noGear = false;
    search.value = '';
    syncChips();
    drawList();
  }

  // Реже нужные фильтры — под кнопкой «Ещё фильтры»: на 375px зоны, сложность и
  // «Что есть дома» вместе занимали весь первый экран, и от карточек виднелся
  // один заголовок. Поиск и зона остаются на виду: с них начинают. Свёрнутая
  // кнопка говорит, сколько фильтров внутри включено, — иначе короткий список
  // казался бы загадкой.
  const panel = el(document, 'div', 'library-more-panel');
  panel.id = 'library-more';
  const more = el(document, 'button', 'library-more');
  more.type = 'button';
  more.setAttribute('aria-controls', panel.id);
  const moreCount = el(document, 'span', 'library-more-count');
  // Уголок — украшение (aria-hidden): раскрыто или нет, диктору скажет aria-expanded.
  more.append('Ещё фильтры', moreCount, renderCaret(document, 'library-more-caret'));
  const setPanel = open => {
    panel.hidden = !open;
    more.setAttribute('aria-expanded', String(open));
  };
  setPanel(false);
  more.addEventListener('click', () => setPanel(panel.hidden));

  // «Сбросить» рядом с кнопкой панели — всегда тем же узлом, только прячется,
  // когда сбрасывать нечего: часть фильтров свёрнута, и снять их все разом
  // иначе было бы нечем, пока список не опустеет.
  const reset = el(document, 'button', 'library-reset', 'Сбросить');
  reset.type = 'button';
  reset.setAttribute('aria-label', 'Сбросить фильтры');
  reset.addEventListener('click', resetFilters);
  const tools = el(document, 'div', 'library-tools');
  tools.append(more, reset);

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
      // Инвентарь называется на карточке всегда, и с переключателями, и без них:
      // той же подписью, что в шторке замены.
      el(document, 'span', 'library-gear', gearText(entry)),
      el(document, 'span', 'muscles', entry.muscles),
    );
    // «Добавить» — в строке названия, справа: полоса во всю ширину под каждой
    // карточкой перебивала в списке сами упражнения.
    const add = el(document, 'button', 'library-add');
    add.type = 'button';
    add.addEventListener('click', () => {
      onAdd(entry.key);
      refresh();
    });
    addButtons.set(entry.key, { button: add, name: entry.name });
    const head = el(document, 'div', 'library-card-head');
    head.append(el(document, 'h3', null, entry.name), add);
    article.append(top, head);

    const { refs, body, links } = renderHowto(document, {
      idPrefix: HOWTO_ID_PREFIX,
      item: toItem(entry),
      expanded: false,
    });
    article.append(refs, body, ...links);
    return article;
  }

  // Поиск, зона, сложность, движение или «только без инвентаря»: то, что
  // «Сбросить фильтры» умеет снять. «Что есть дома» сюда не входит, он сбросом
  // не трогается.
  const panelFilters = () => [state.difficulty !== null, state.pattern !== null, state.noGear].filter(Boolean).length;
  const hasFilters = () => normalizeQuery(state.query) !== '' || state.zone !== null || panelFilters() > 0;

  // byGear — сколько упражнений скрыл инвентарь при тех же поиске, зоне и
  // сложности. Если они есть, пусто из-за инвентаря, а не запроса, и подсказка
  // говорит об этом; «Сбросить фильтры» предлагается, только когда есть что
  // сбрасывать: без фильтров сброс ничего бы не изменил.
  // «Что есть дома» лежит в свёрнутой панели, поэтому подсказка про инвентарь
  // ведёт туда кнопкой: раскрывает панель и ставит фокус на первый переключатель.
  function emptyContent(byGear) {
    const reset = el(document, 'button', 'library-chip', 'Сбросить фильтры');
    reset.type = 'button';
    reset.addEventListener('click', resetFilters);
    const title = el(document, 'p', 'library-empty-title', 'Ничего не найдено');
    if (byGear === 0) {
      return [title, el(document, 'p', 'library-empty-hint', 'Измени запрос или сбрось фильтры.'), reset];
    }
    const toPicker = el(document, 'button', 'library-chip', 'Открыть «Что есть дома»');
    toPicker.type = 'button';
    toPicker.addEventListener('click', () => {
      setPanel(true);
      picker.querySelector('button').focus();
    });
    const filtered = hasFilters();
    const hint = `С отмеченным инвентарём ничего не нашлось. Отметь инвентарь в «Что есть дома»${filtered ? ' или сбрось фильтры' : ''}.`;
    return [title, el(document, 'p', 'library-empty-hint', hint), toPicker, ...(filtered ? [reset] : [])];
  }

  // Перерисовывается только список: поле поиска и чипы остаются теми же узлами,
  // иначе набор текста терял бы фокус на каждой букве. Открытое видео уходит
  // вместе со своей карточкой, а плеер нового списка ставится заново.
  function drawList() {
    const shown = filterEntries(entries, state);
    // «Ещё M» — сколько прошло бы по тем же поиску, зоне и сложности без
    // фильтра инвентаря: человек видит, что дело в инвентаре, а не в запросе.
    const hidden = state.owned === null ? 0 : filterEntries(entries, { ...state, owned: null }).length - shown.length;
    found.textContent = `Найдено: ${shown.length}${hidden > 0 ? ` · ещё ${hidden} с другим инвентарём` : ''}`;
    const active = panelFilters();
    moreCount.textContent = active > 0 ? ` · ${active}` : '';
    reset.hidden = !hasFilters();
    addButtons.clear();
    list.replaceChildren(...shown.map(card));
    emptyBox.className = shown.length === 0 ? 'library-empty' : '';
    emptyBox.replaceChildren(...(shown.length === 0 ? emptyContent(hidden) : []));
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
      // Уже добавленное выглядит иначе, чем недоступное по другой причине: оба
      // disabled, и по одному атрибуту стиль их не различил бы.
      button.classList.toggle('is-added', added);
    }
    total.textContent = `В тренировке: ${strengthEntries.filter(entry => isAdded(entry.key)).length}`;
  }

  const foot = el(document, 'div', 'library-foot');
  foot.append(total, backButton(false));

  // Переключатели — один и тот же узел на всё время экрана: перерисовывается
  // только список, и нажатая кнопка остаётся в фокусе.
  const picker = gear && renderGearPicker(document, {
    owned: state.owned,
    idPrefix: 'library-gear',
    onChange(owned) {
      state.owned = owned;
      gear.onChange(owned);
      drawList();
    },
  });

  // Движение — только те, что есть среди силовых, и только если их больше
  // одного: чип, который ничего не отсеивает, лишь занимает место. По той же
  // причине «Без инвентаря» — только когда есть и такие упражнения, и другие, и
  // только с переключателями: без них экран про инвентарь не говорит вовсе.
  const patterns = new Set(strengthEntries.map(entry => entry.pattern));
  const patternChips = [[null, 'Любое'], ...Object.entries(PATTERN_LABELS).filter(([id]) => patterns.has(id))];
  const bare = strengthEntries.filter(entry => fitsGear(entry, [])).length;
  panel.append(
    ...titledGroup('Сложность', 'difficulty', DIFFICULTY_CHIPS),
    ...(patterns.size > 1 ? titledGroup('Движение', 'pattern', patternChips) : []),
    ...(picker && bare > 0 && bare < strengthEntries.length ? titledGroup('Инвентарь', 'noGear', NO_GEAR_CHIPS) : []),
    ...(picker ? [picker] : []),
  );

  root.append(
    backButton(true),
    search,
    chipGroup('Зона', 'zone', ZONE_CHIPS),
    tools,
    panel,
    found,
    emptyBox,
    list,
    foot,
  );
  syncChips();
  drawList();

  return { refresh };
}
