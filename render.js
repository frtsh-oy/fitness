// Идентификатор отметки строится из устойчивых частей данных: id блока и key
// упражнения. Индекса здесь нет намеренно — по индексу отметки «переезжали» бы
// на соседей при любой вставке упражнения в середину блока. key обязателен
// у каждого упражнения, это сторожит валидатор (workouts/schema.js).
export function markId(blockId, itemKey, round) {
  return `${blockId}-${itemKey}-${round}`;
}

// Ролик в данных — [id, старт в секундах, подпись]; форму сторожит валидатор,
// поэтому подстановки «нет старта — считаем нулём» здесь нет: на
// провалидированных данных она недостижима, а на непровалидированных превратила
// бы поломку данных в тихо неверную ссылку.
export function videoUrl([id, start]) {
  return `https://www.youtube.com/watch?v=${id}&t=${start}s`;
}

// Дни недели по ISO-8601: 1 — понедельник, 7 — воскресенье. Подписи живут
// здесь, а не в данных: в данных лежат номера дней, а как их назвать — вопрос
// показа. Две формы, потому что на странице два разных места: короткая в шапке
// (рядом с названием сайта, где место в одну строку) и полная в подвале.
const WEEKDAYS = {
  1: { short: 'ПН', long: 'Понедельник' },
  2: { short: 'ВТ', long: 'Вторник' },
  3: { short: 'СР', long: 'Среда' },
  4: { short: 'ЧТ', long: 'Четверг' },
  5: { short: 'ПТ', long: 'Пятница' },
  6: { short: 'СБ', long: 'Суббота' },
  7: { short: 'ВС', long: 'Воскресенье' },
};

// Неизвестный день — повод упасть, а не напечатать «undefined · СР · ПТ»:
// номера дней проверяет валидатор, и молчаливая подмена скрыла бы его отказ.
function weekday(day) {
  const label = WEEKDAYS[day];
  if (!label) throw new Error(`Неизвестный день недели: ${day}`);
  return label;
}

export function scheduleShort(days) {
  return days.map(day => weekday(day).short).join(' · ');
}

export function scheduleLong(days) {
  return days.map(day => weekday(day).long).join(' · ');
}

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const SVG_NS = 'http://www.w3.org/2000/svg';

// Значок — путь, а не символ шрифта: «треугольник» и «уголок» системные шрифты
// рисуют каждый по-своему, разного размера и с разными боковыми просветами,
// и подпись рядом с ними съезжала бы от системы к системе.
function renderIcon(document, d) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', d);
  svg.append(path);
  return svg;
}

// Значок play внутри ссылки на видео — как в src-original/app.js (переменная play).
const PLAY_PATH = 'M8 5v14l12-7z';
// Уголок в кнопке «Как выполнять»: смотрит вниз, а в раскрытом виде style.css
// поворачивает его на 180° — по aria-expanded самой кнопки.
const CARET_PATH = 'M12 16 4 8h16z';

// Подпись кнопки, под которой лежат тексты техники. Не «Техника»: кнопка
// отвечает на вопрос, который задают, глядя на незнакомое упражнение.
const HOWTO_LABEL = 'Как выполнять';

function renderItem(document, block, item, itemIndex, expandDescriptions) {
  const article = el(document, 'article', 'exercise');

  const top = el(document, 'div', 'exercise-top');
  top.append(el(document, 'span', 'exercise-index', String(itemIndex + 1).padStart(2, '0')));
  top.append(el(document, 'span', 'muscles', item.muscles));
  article.append(top);

  article.append(el(document, 'h3', null, item.name));
  article.append(el(document, 'p', 'reps', item.reps));

  // Тексты техники — под кнопкой. Карточка упражнения была высотой от 309 до
  // 636px (в середине — 500), и девятнадцать таких карточек растягивали
  // страницу телефона 375×812 на шестнадцать экранов. Техника нужна в первые
  // разы, а по ходу тренировки пользуются названием, повторами, мышцами, видео
  // и отметкой — они и остаются на виду.
  //
  // Идентификатор области — из id блока и key упражнения, как у отметок
  // (markId): он обязан быть уникальным на всю страницу, иначе aria-controls
  // и getElementById привели бы кнопку в чужую карточку, а уникальность именно
  // этой пары сторожит валидатор (workouts/schema.js: id блоков не повторяются,
  // key не повторяется внутри блока). Кнопка есть у каждого упражнения, потому
  // что text — обязательное поле; необязательны только detail и extra.
  const regionId = `howto-${block.id}-${item.key}`;
  const toggle = el(document, 'button', 'howto-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(expandDescriptions));
  toggle.setAttribute('aria-controls', regionId);
  // Имя для диктора называет упражнение — как у ссылки на видео и у каждой
  // отметки ниже: иначе при обходе по кнопкам подряд девятнадцать раз звучит
  // «Как выполнять», и какое из упражнений раскрывается, на слух не отличить.
  // Видимая подпись стоит в начале имени, поэтому голосовое управление по ней
  // кнопку по-прежнему находит.
  toggle.setAttribute('aria-label', `${HOWTO_LABEL}: ${item.name}`);
  const caret = renderIcon(document, CARET_PATH);
  // Класс атрибутом, а не присваиванием в className: у SVG это не строка, а
  // SVGAnimatedString, причём свойство только для чтения, и присваивание в
  // модуле (строгий режим) бросило бы TypeError — то есть уронило бы отрисовку
  // карточки целиком, а не потеряло бы один класс. По этому классу style.css и
  // поворачивает уголок в раскрытом виде.
  caret.setAttribute('class', 'howto-caret');
  toggle.append(el(document, 'span', null, HOWTO_LABEL), caret);

  // Кнопка раскрытия и ссылка на видео — в одну строку: и то и другое
  // справочное, нужное в первые разы. Отметки в эту строку не идут и остаются
  // своей строкой ниже, во всю ширину: ими пользуются между подходами, попасть
  // по ним пальцем должно быть легко, а промах стоит дороже всего.
  //
  // Тремя элементами строка не собирается ни на одной карточке с видео:
  // отметок от одной до трёх, и с подписями «Круг N» трём элементам нужно от
  // 348 до 591px при 317 доступных внутри карточки на экране 375px (замер
  // getBoundingClientRect, см. отчёт задачи).
  const refs = el(document, 'div', 'exercise-refs');
  refs.append(toggle);

  if (item.v) {
    const link = el(document, 'a', 'video');
    link.href = videoUrl(item.v);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Видео: ${item.name}, ${item.v[2]}`);
    link.append(renderIcon(document, PLAY_PATH), document.createTextNode(` Видео · ${item.v[2]}`));
    refs.append(link);
  }
  article.append(refs);

  // Область с текстом — следом за строкой, а не внутри неё: внутри раскрытие
  // разрывало бы строку между кнопкой и видео.
  const howto = el(document, 'div', 'howto-body');
  howto.id = regionId;
  howto.hidden = !expandDescriptions;
  howto.append(el(document, 'p', 'technique', item.text));
  if (item.detail) howto.append(el(document, 'p', null, item.detail));
  if (item.extra) howto.append(el(document, 'p', null, item.extra));
  article.append(howto);

  for (const extra of item.links ?? []) {
    // Форма элемента — [id, start, caption], как у v: workouts/legs-mwf.js
    // хранит подписи уже целиком (например «Как установить длинную резинку · 0:18»),
    // отдельного поля label в данных нет.
    const link = el(document, 'a', 'extra-link', extra[2]);
    link.href = videoUrl(extra);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    article.append(link);
  }

  const checks = el(document, 'div', 'checks');
  for (let round = 1; round <= block.rounds; round += 1) {
    const label = el(document, 'label', 'check');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.mark = markId(block.id, item.key, round);
    input.setAttribute('aria-label', `${item.name}: ${block.rounds === 1 ? 'выполнено' : `круг ${round}`}`);
    label.append(input, el(document, 'span', null, block.rounds === 1 ? 'Готово' : `Круг ${round}`));
    checks.append(label);
  }
  article.append(checks);

  return article;
}

// Вставка перед блоком (например «Как выполнять силовые пары») — как
// в src-original/app.js (pairRules), но по данным блока, а не по его индексу:
// рендерер не знает, какой блок по счёту у какой тренировки первый силовой.
function renderPreamble(document, preamble) {
  const section = el(document, 'section', 'pair-rules');
  section.append(el(document, 'h2', null, preamble.title));
  for (const paragraph of preamble.paragraphs) {
    const p = document.createElement('p');
    for (const part of paragraph) {
      p.append(typeof part === 'string' ? document.createTextNode(part) : el(document, 'strong', null, part.b));
    }
    section.append(p);
  }
  return section;
}

// expandDescriptions — раскрыты ли описания упражнений в момент отрисовки.
// Решает это связывание (app.js) по ширине окна: атрибут раскрытия
// медиазапросом не задать, а сам рендерер про окно ничего не знает. По
// умолчанию свёрнуто — это состояние телефона, под который приложение и сделано.
export function renderWorkout(workout, document, { expandDescriptions = false } = {}) {
  const fragment = document.createDocumentFragment();

  for (const block of workout.blocks) {
    if (block.preamble) fragment.append(renderPreamble(document, block.preamble));

    const section = el(document, 'section', 'workout-block');
    section.id = block.id;

    const heading = el(document, 'div', 'block-heading');
    heading.append(el(document, 'span', 'block-number', block.n));
    const titleBox = document.createElement('div');
    titleBox.append(el(document, 'h2', null, block.title));
    titleBox.append(el(document, 'p', null, block.sub));
    heading.append(titleBox);
    heading.append(el(document, 'span', 'round-tag', block.rounds === 1 ? '1 круг' : `${block.rounds} круга`));
    section.append(heading);

    if (block.note) section.append(el(document, 'p', 'block-note', block.note));

    const cards = el(document, 'div', 'cards');
    block.items.forEach((item, index) =>
      cards.append(renderItem(document, block, item, index, expandDescriptions)));
    section.append(cards);

    fragment.append(section);
  }

  return fragment;
}

// Тексты верхнего уровня тоже живут в данных: держать их ещё и в index.html
// значит рано или поздно получить расхождение между сайтом и тренировкой.
export function renderIntro(workout, document) {
  // По id, а не по классу: .eyebrow на странице не один — тем же классом набран
  // заголовок блока «ДАЛЬШЕ — СИЛЬНЕЕ» в .guide, и выборка по классу работала бы
  // только потому, что интро стоит выше по документу.
  document.getElementById('kicker').textContent = workout.kicker;

  // Разбиение заголовка на строки задаётся данными, а не угадывается по пробелам.
  const [firstLine, ...restLines] = workout.titleLines;
  const h1 = document.querySelector('h1');
  h1.replaceChildren(document.createTextNode(firstLine));
  for (const line of restLines) {
    h1.append(document.createElement('br'), el(document, 'span', null, line));
  }

  document.querySelector('.intro-copy').textContent = workout.lead;

  const facts = document.querySelector('.facts');
  facts.replaceChildren(...workout.stats.map(stat => {
    const box = document.createElement('div');
    box.append(el(document, 'strong', null, stat.v), el(document, 'span', null, stat.l));
    return box;
  }));

  const nav = document.querySelector('.block-nav');
  nav.replaceChildren(...workout.blocks.map(block => {
    const link = el(document, 'a', null, block.nav);
    link.href = `#${block.id}`;
    return link;
  }));

  // Расписание на странице в двух местах, и оба — из данных. Пока эти строки
  // были зашиты в index.html, вторая тренировка (например, ВТ/ЧТ) отрендерилась
  // бы с чужим расписанием сразу в двух местах, и ни один тест бы не заметил.
  document.querySelector('.masthead .schedule').textContent = scheduleShort(workout.days);
  // В подвале расписание — ведущий текстовый узел. Примечание рядом с ним
  // («Между тренировками — день восстановления») остаётся в разметке: оно не
  // про расписание и от дней недели не зависит.
  document.querySelector('footer').firstChild.textContent = scheduleLong(workout.days);

  document.querySelector('.equipment').textContent = workout.equipment;
  document.getElementById('progression-list')
    .replaceChildren(...workout.progression.map(step => el(document, 'li', null, step)));
  document.getElementById('care')
    .replaceChildren(...workout.caution.split('\n\n').map(par => el(document, 'p', null, par)));
}
