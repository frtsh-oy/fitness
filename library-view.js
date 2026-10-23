// Экран библиотеки упражнений: поиск по названию и мышцам, чипы групп мышц,
// шторка фильтров (сложность, движение, инвентарь, «Что есть дома») и ряды
// упражнений с круглой кнопкой «Добавить». Модуль самостоятельный и про
// конструктор ничего не знает: что значит «добавлено», когда добавлять нельзя и
// что делать при нажатии, ему сообщает вызывающий (isAdded, addBlocked, onAdd,
// onBack). Так экран проверяется без конструктора, а конструктор — без экрана.
import { DIFFICULTY_LABELS, PATTERN_LABELS, toItem } from './exercises/index.js';
import { ZONES } from './builder/rules.js';
import { normalizeQuery, matchesQuery } from './builder/search.js';
import { plural } from './builder/texts.js';
import { renderHowto } from './render.js';
import { setupPlayers } from './player.js';
import { fitsGear, gearText } from './gear.js';
import { renderGearPicker } from './gear-picker.js';
import { icon } from './icons.js';
import { openSheet } from './sheet.js';
import { searchField } from './search-field.js';

// Начало id панелей плеера библиотеки. Свой, а не общий с «Сегодня»: панель
// получает id при открытии ролика, и без различия обе назвали бы первую
// панель одинаково.
const VIDEO_ID_PREFIX = 'library-video';
// Начало id областей «Как выполнять» (см. renderHowto): по нему же область
// библиотеки не путается с областью того же упражнения в «Сегодня».
const HOWTO_ID_PREFIX = 'lib';

// Варианты фильтров: [значение, подпись]. Первый в каждой группе — «без
// фильтра» (null или false), он и выбран при открытии экрана.
const ZONE_CHIPS = [[null, 'Все'], ...Object.entries(ZONES).map(([id, zone]) => [id, zone.label])];
const DIFFICULTY_OPTIONS = [[null, 'Любая'], ...Object.entries(DIFFICULTY_LABELS)];
const NO_GEAR_OPTIONS = [[false, 'Любой'], [true, 'Без инвентаря']];
const EXERCISES = ['упражнение', 'упражнения', 'упражнений'];

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Поиск — общий с шторкой замены (builder/search.js); нормализация запроса
// остаётся доступной отсюда: на неё ссылаются тесты экрана.
export { normalizeQuery };

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
  const groups = zone === null ? null : ZONES[zone].groups;
  return entries.filter(entry => entry.slot === 'strength'
    && matchesQuery(entry, query)
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

  // Весь экран — в своём узле, а не прямо в host: при повторной отрисовке на том
  // же host старый корень уходит вместе со своими обработчиками.
  const root = el(document, 'div', 'library wrap has-dock');
  host.replaceChildren(root);

  let closeVideo = () => {};
  // Escape закрывает открытое видео, пока фокус внутри экрана (на кнопке
  // ролика или в подвале плеера). Слушатель — на корне, а не на document: он
  // уходит вместе с корнем, а общий Escape приложения про плеер библиотеки не
  // знает.
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeVideo();
  });

  const back = el(document, 'button', 'builder-back');
  back.type = 'button';
  // Стрелка — украшение: диктор читал бы «стрелка влево, к сборке».
  back.append(icon(document, 'back'), 'К сборке');
  back.addEventListener('click', () => onBack());
  const bar = el(document, 'div', 'appbar');
  bar.append(back);

  // Название принимает фокус программно: после смены экрана диктор начинает с
  // него. Счёт под названием — и подпись, и живая область: он меняется с каждой
  // буквой поиска, а на слух это иначе не слышно.
  const title = el(document, 'h1', null, 'Библиотека');
  title.tabIndex = -1;
  const found = el(document, 'p', 'lead library-found');
  found.setAttribute('aria-live', 'polite');
  const heading = el(document, 'div', 'page-title');
  heading.append(title, found);

  const search = searchField(document, {
    label: 'Найти упражнение',
    onChange(value) {
      state.query = value;
      drawList();
    },
  });

  // Нажатые чипы и сегменты — по состоянию, а не по тому, на что нажали:
  // «Сбросить» тоже меняет состояние, и подсветка обязана следовать за ним.
  const options = [];
  const syncOptions = () => {
    for (const { button, key, value } of options) button.setAttribute('aria-pressed', String(state[key] === value));
  };
  const makeOption = (button, key, value) => {
    button.type = 'button';
    button.addEventListener('click', () => {
      state[key] = value;
      syncOptions();
      drawList();
    });
    options.push({ button, key, value });
    return button;
  };
  // Чип — кнопка с галочкой слева у нажатого (тот же .zone-chip, что у зон
  // упора): выбранное читается не только по цвету.
  const chip = (key, value, text) => {
    const button = el(document, 'button', 'zone-chip');
    button.append(icon(document, 'tick', 'ic ic-hand tick'), text);
    return makeOption(button, key, value);
  };
  const segment = (key, choices) => {
    const group = el(document, 'div', 'seg');
    group.append(...choices.map(([value, text]) => makeOption(el(document, 'button', null, text), key, value)));
    return group;
  };

  const zones = el(document, 'div', 'chiprow library-zones');
  zones.setAttribute('role', 'group');
  zones.setAttribute('aria-label', 'Группа мышц');
  zones.append(...ZONE_CHIPS.map(([value, text]) => chip('zone', value, text)));

  const filterButton = el(document, 'button', 'icon-btn library-filter');
  filterButton.type = 'button';
  filterButton.setAttribute('aria-haspopup', 'dialog');
  filterButton.setAttribute('aria-expanded', 'false');
  // Точка у значка — в шторке что-то включено; число — в имени кнопки.
  const dot = el(document, 'span', 'dot');
  dot.hidden = true;
  filterButton.append(icon(document, 'filters'), dot);
  filterButton.addEventListener('click', () => openFilters(filterButton));

  const find = el(document, 'div', 'library-find');
  find.append(search.field, filterButton);
  const tools = el(document, 'section', 'library-tools');
  tools.setAttribute('aria-label', 'Поиск и фильтры');
  tools.append(find, zones);

  // Пометка о причине создаётся, когда добавлять нельзя, и убирается, когда
  // можно: пустой role="status" в разметке только занимал бы место.
  let blockedNote = null;
  const emptyBox = el(document, 'div', 'library-empty');
  emptyBox.hidden = true;
  const list = el(document, 'ul', 'library-list');
  list.setAttribute('role', 'list');

  // Кнопки «Добавить» нынешнего списка по ключу упражнения.
  const addButtons = new Map();

  // Ряд: название, мышцы и «Базовое · длинная резинка» — одна кнопка, она
  // раскрывает «Как выполнять» (текст, видео, ссылки); справа круглая «Добавить».
  function row(entry) {
    const item = el(document, 'li', 'library-row');
    const how = el(document, 'div', 'library-how');
    how.id = `library-how-${entry.key}`;
    how.hidden = true;

    // Инвентарь называется в ряду всегда, и с переключателями, и без них: той же
    // подписью, что в шторке замены. Текст в одном узле, а уголок отдельно: во
    // флекс-строке пробелы вокруг «·» стёрлись бы.
    const kind = el(document, 'span');
    kind.append(el(document, 'span', 'library-level', DIFFICULTY_LABELS[entry.difficulty]), ' · ',
      el(document, 'span', 'library-gear', gearText(entry)));
    const meta = el(document, 'span', 'library-meta');
    meta.append(kind, icon(document, 'down'));
    const main = el(document, 'button', 'library-main');
    main.type = 'button';
    main.setAttribute('aria-expanded', 'false');
    main.setAttribute('aria-controls', how.id);
    // Пробелы между строками — имя кнопки для диктора склеивается из них.
    main.append(el(document, 'span', 'row-title', entry.name), ' ', el(document, 'span', 'row-sub muscles', entry.muscles), ' ',
      meta, ' ', el(document, 'span', 'sr-only', 'Как выполнять'));
    main.addEventListener('click', () => {
      const open = main.getAttribute('aria-expanded') !== 'true';
      main.setAttribute('aria-expanded', String(open));
      how.hidden = !open;
    });

    const add = el(document, 'button', 'library-add');
    add.type = 'button';
    // Плюс, а у добавленного — галочка: смысл не держится на цвете кружка.
    add.append(icon(document, 'plus', 'ic ic-plus'), icon(document, 'tick', 'ic ic-hand ic-check'));
    add.addEventListener('click', () => {
      onAdd(entry.key);
      refresh();
    });
    addButtons.set(entry.key, { button: add, name: entry.name });

    const howto = renderHowto(document, { idPrefix: HOWTO_ID_PREFIX, item: toItem(entry), expanded: true });
    how.append(el(document, 'span', 'cap', 'Как выполнять'), howto.body, ...(howto.video ? [howto.video] : []), ...howto.links);

    const line = el(document, 'div', 'library-line');
    line.append(main, add);
    item.append(line, how);
    return item;
  }

  // Поиск, зона, сложность, движение или «только без инвентаря»: то, что
  // «Показать все» умеет снять. «Что есть дома» сюда не входит, оно сбросом не
  // трогается.
  const panelFilters = () => [state.difficulty !== null, state.pattern !== null, state.noGear].filter(Boolean).length;
  const hasFilters = () => normalizeQuery(state.query) !== '' || state.zone !== null || panelFilters() > 0;

  // Инвентарь не сбрасывается: это не фильтр поиска, а то, что есть у человека
  // дома, и «Показать все» не должно возвращать ему упражнения, которых он не
  // сделает. «Только без инвентаря» — фильтр на сегодня, его сброс снимает.
  function resetFilters() {
    state.zone = null;
    state.difficulty = null;
    state.pattern = null;
    state.noGear = false;
    syncOptions();
    // Очистка поля сама перерисовывает список.
    search.set('');
  }

  // Только то, что внутри шторки: сложность, движение и «без инвентаря». Поиск
  // и группа мышц остаются на экране под шторкой, и сбрасывать их отсюда не надо.
  function resetPanel() {
    state.difficulty = null;
    state.pattern = null;
    state.noGear = false;
    syncOptions();
    drawList();
  }

  // byGear — сколько упражнений скрыл инвентарь при тех же поиске, группе и
  // сложности. Если они есть, пусто из-за инвентаря, а не запроса, и подсказка
  // говорит об этом; «Показать все» предлагается, только когда есть что
  // сбрасывать. «Что есть дома» лежит в шторке, поэтому подсказка про инвентарь
  // ведёт туда кнопкой: открывает шторку и ставит фокус на первый переключатель.
  function emptyContent(byGear) {
    const reset = el(document, 'button', 'btn text pad0', 'Показать все');
    reset.type = 'button';
    reset.addEventListener('click', resetFilters);
    const title = el(document, 'p', 'library-empty-title', 'Ничего не нашлось');
    if (byGear === 0) {
      return [title, el(document, 'p', 'library-empty-hint', 'Попробуй другое слово или покажи все.'), reset];
    }
    const toPicker = el(document, 'button', 'btn text pad0', 'Открыть «Что есть дома»');
    toPicker.type = 'button';
    toPicker.addEventListener('click', () => {
      openFilters(toPicker);
      picker.querySelector('button').focus();
    });
    const filtered = hasFilters();
    const hint = `С отмеченным инвентарём ничего не нашлось. Отметь инвентарь в «Что есть дома»${filtered ? ' или покажи все' : ''}.`;
    return [title, el(document, 'p', 'library-empty-hint', hint), toPicker, ...(filtered ? [reset] : [])];
  }

  // Перерисовывается только список: поле поиска и чипы остаются теми же узлами,
  // иначе набор текста терял бы фокус на каждой букве. Открытое видео уходит
  // вместе со своим рядом, а плеер нового списка ставится заново.
  function drawList() {
    const shown = filterEntries(entries, state);
    // «Ещё M» — сколько прошло бы по тем же поиску, группе и сложности без
    // фильтра инвентаря: человек видит, что дело в инвентаре, а не в запросе.
    const hidden = state.owned === null ? 0 : filterEntries(entries, { ...state, owned: null }).length - shown.length;
    const count = hasFilters() ? `Найдено: ${shown.length}` : `${shown.length} ${plural(shown.length, EXERCISES)}`;
    found.textContent = `${count}${hidden > 0 ? ` · ещё ${hidden} с другим инвентарём` : ''}`;
    const active = panelFilters();
    dot.hidden = active === 0;
    filterButton.setAttribute('aria-label', active > 0 ? `Фильтры, выбрано: ${active}` : 'Фильтры');
    showButton.textContent = shown.length > 0 ? `Показать ${shown.length}` : 'Закрыть';
    addButtons.clear();
    list.replaceChildren(...shown.map(row));
    emptyBox.hidden = shown.length > 0;
    emptyBox.replaceChildren(...(shown.length === 0 ? emptyContent(hidden) : []));
    closeVideo = setupPlayers(list, openLink, { idPrefix: VIDEO_ID_PREFIX });
    refresh();
  }

  // Плавающая панель: сколько упражнений уже в тренировке и обратный ход. Живёт
  // в разметке всегда и лишь прячется, пока в тренировке нет силовых: живая
  // область, которой не было, число не озвучила бы.
  const dockCount = el(document, 'span', 'hand');
  const dockTitle = el(document, 'b');
  dockTitle.append('В тренировке: ', dockCount);
  const dockText = el(document, 'p', 'dock-text library-total');
  dockText.setAttribute('aria-live', 'polite');
  dockText.append(dockTitle);
  const dockGo = el(document, 'button', 'btn main dock-go', 'К сборке');
  dockGo.type = 'button';
  dockGo.addEventListener('click', () => onBack());
  const dock = el(document, 'div', 'dock library-dock');
  dock.hidden = true;
  dock.append(dockText, dockGo);

  // Меняется только то, что зависит от состава тренировки, — ряды не
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
        tools.after(blockedNote);
      }
      blockedNote.textContent = reason;
    }

    for (const [key, { button, name }] of addButtons) {
      const added = isAdded(key);
      // Подпись называет упражнение: таких кнопок много, и по голой подписи
      // диктору их не отличить.
      button.setAttribute('aria-label', `${added ? 'В тренировке' : 'Добавить'}: ${name}`);
      button.disabled = added || reason !== null;
      // Добавленное выглядит иначе, чем недоступное по другой причине: оба
      // disabled, и по одному атрибуту стиль их не различил бы.
      button.classList.toggle('is-added', added);
    }
    const inWorkout = strengthEntries.filter(entry => isAdded(entry.key)).length;
    dockCount.textContent = String(inWorkout);
    dock.hidden = inWorkout === 0;
  }

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

  // Шторка фильтров. Содержимое собрано один раз и каждый раз ложится в новую
  // шторку тем же узлом: выбор и фокус переключателей живут столько же, сколько
  // экран. Движение — только те, что есть среди силовых, и только если их
  // больше одного: чип, который ничего не отсеивает, лишь занимает место. По
  // той же причине «Без инвентаря» — только когда есть и такие упражнения, и
  // другие, и только с переключателями: без них экран про инвентарь не говорит.
  const patterns = new Set(strengthEntries.map(entry => entry.pattern));
  const bare = strengthEntries.filter(entry => fitsGear(entry, [])).length;
  const group = (key, label, control) => {
    const caption = el(document, 'span', 'label', label);
    caption.id = `library-${key}-label`;
    control.setAttribute('role', 'group');
    control.setAttribute('aria-labelledby', caption.id);
    const node = el(document, 'div', 'library-grp');
    node.append(caption, control);
    return node;
  };
  const patternChips = el(document, 'div', 'library-chips');
  patternChips.append(...[[null, 'Любое'], ...Object.entries(PATTERN_LABELS).filter(([id]) => patterns.has(id))]
    .map(([value, text]) => chip('pattern', value, text)));

  const filterBody = el(document, 'div', 'library-sheet-body');
  filterBody.append(
    group('difficulty', 'Сложность', segment('difficulty', DIFFICULTY_OPTIONS)),
    ...(patterns.size > 1 ? [group('pattern', 'Движение', patternChips)] : []),
    ...(picker && bare > 0 && bare < strengthEntries.length ? [group('noGear', 'Инвентарь', segment('noGear', NO_GEAR_OPTIONS))] : []),
    ...(picker ? [(() => {
      const node = el(document, 'div', 'library-grp library-gear-grp');
      node.append(picker);
      return node;
    })()] : []),
  );

  const resetButton = el(document, 'button', 'btn text', 'Сбросить');
  resetButton.type = 'button';
  resetButton.setAttribute('aria-label', 'Сбросить фильтры');
  resetButton.addEventListener('click', resetPanel);
  const showButton = el(document, 'button', 'btn main', 'Показать');
  showButton.type = 'button';
  const filterFoot = el(document, 'div', 'library-sheet-foot');
  filterFoot.append(resetButton, showButton);

  function openFilters(opener) {
    const { sheet, close, show } = openSheet({
      host,
      screen: root,
      labelledBy: 'library-sheet-title',
      className: 'library-sheet',
      scrimClass: 'library-backdrop',
      opener,
      onClose: () => filterButton.setAttribute('aria-expanded', 'false'),
    });
    const sheetTitle = el(document, 'h2', 'sheet-title', 'Фильтры');
    sheetTitle.id = 'library-sheet-title';
    const closeButton = el(document, 'button', 'icon-btn library-sheet-close');
    closeButton.type = 'button';
    closeButton.setAttribute('aria-label', 'Закрыть фильтры');
    closeButton.append(icon(document, 'close'));
    closeButton.addEventListener('click', () => close());
    showButton.onclick = () => close();
    const head = el(document, 'div', 'sheet-head');
    head.append(sheetTitle, closeButton);
    sheet.append(el(document, 'div', 'grab'), head, filterBody, filterFoot);
    filterButton.setAttribute('aria-expanded', 'true');
    show();
  }

  root.append(bar, heading, tools, list, emptyBox, dock);
  syncOptions();
  drawList();
  title.focus({ preventScroll: true });

  return { refresh };
}
