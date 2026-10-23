// Склонение — одно на всё приложение: свой plural здесь разошёлся бы с текстами
// своей тренировки (builder/texts.js).
import { plural } from './builder/texts.js';

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
// показа. Три формы, потому что на странице три разных места: короткая в
// полосе недели в шапке (кружок 38px), полная в подвале и «по средам» в
// подписи полосы для диктора.
const WEEKDAYS = {
  1: { short: 'ПН', long: 'Понедельник', each: 'понедельникам' },
  2: { short: 'ВТ', long: 'Вторник', each: 'вторникам' },
  3: { short: 'СР', long: 'Среда', each: 'средам' },
  4: { short: 'ЧТ', long: 'Четверг', each: 'четвергам' },
  5: { short: 'ПТ', long: 'Пятница', each: 'пятницам' },
  6: { short: 'СБ', long: 'Суббота', each: 'субботам' },
  7: { short: 'ВС', long: 'Воскресенье', each: 'воскресеньям' },
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

// Номер дня недели по ISO для даты: в JS воскресенье — 0, у нас — 7.
export function isoWeekday(date) {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

// Подпись полосы недели для диктора: сама полоса — картинка из семи кружков, и
// без подписи расписание из неё не прочесть. «по понедельникам, средам и
// пятницам»: перечисление склеивается запятыми и «и» перед последним.
function weekLabel(days, today) {
  const each = days.map(day => weekday(day).each);
  const list = each.length > 1 ? `${each.slice(0, -1).join(', ')} и ${each[each.length - 1]}` : each[0];
  const plan = list ? `Тренировки по ${list}.` : 'Дни тренировок не выбраны.';
  return `${plan} Сегодня ${weekday(today).long.toLowerCase()}.`;
}

// Есть ли в расписании два дня подряд, считая воскресенье и понедельник
// соседними: неделя замкнута, а дни по ISO идут от 1 до 7. Нужна подвалу: фраза
// «между тренировками — день восстановления» при таком расписании неправда.
export function hasAdjacentDays(days) {
  return days.some(day => days.includes(day % 7 + 1));
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
// Уголок раскрытия — шеврон линией: смотрит вниз, а в раскрытом виде style.css
// поворачивает его на 180° — по aria-expanded самой кнопки.
const CARET_PATH = 'M6 9l6 6 6-6';

// Уголок раскрытия. Отдельно от renderHowto, потому что тот же уголок нужен
// кнопке «Ещё фильтры» в библиотеке (library-view.js): свой, нарисованный
// символом, вышел бы другого размера, чем у «Как выполнять» рядом.
// Класс атрибутом, а не присваиванием в className: у SVG это не строка, а
// SVGAnimatedString, причём свойство только для чтения, и присваивание в
// модуле (строгий режим) бросило бы TypeError — то есть уронило бы отрисовку
// карточки целиком, а не потеряло бы один класс. По этому классу style.css и
// поворачивает уголок в раскрытом виде.
export function renderCaret(document, className) {
  const caret = renderIcon(document, CARET_PATH);
  caret.setAttribute('class', className);
  return caret;
}

// Подпись кнопки, под которой лежат тексты техники. Не «Техника»: кнопка
// отвечает на вопрос, который задают, глядя на незнакомое упражнение.
const HOWTO_LABEL = 'Как выполнять';

// «Как выполнять» одного упражнения: строка из кнопки раскрытия и ссылки на
// видео, область с текстами техники и дополнительные ролики. Вынесено из
// карточки «Сегодня», чтобы экран библиотеки (library-view.js) строил то же
// самое, а не копию, которая со временем разошлась бы с оригиналом.
//
// Ничего никуда не вставляет, а возвращает части: что и в каком порядке
// класть в карточку (строка, область, дополнительные ролики), решает
// вызывающий. Кнопка раскрытия и ссылка на видео (toggle, video) лежат и в
// строке refs, и отдельно: библиотека кладёт строку целиком, «Сегодня»
// разносит их по разным местам карточки. Отметки и шапка карточки сюда не
// входят — они у «Сегодня» свои.
//
// idPrefix обязан быть уникальным на странице: из него и key упражнения
// строится идентификатор области, а по нему кнопка находит свою область
// (aria-controls и bindHowto). У «Сегодня» это id блока, у библиотеки — свой
// префикс, поэтому одно и то же упражнение в обоих местах не даёт двух
// одинаковых id.
export function renderHowto(document, { idPrefix, item, expanded }) {
  // Тексты техники — под кнопкой. Карточка упражнения была высотой от 309 до
  // 636px (в середине — 500), и девятнадцать таких карточек растягивали
  // страницу телефона 375×812 на шестнадцать экранов. Техника нужна в первые
  // разы, а по ходу тренировки пользуются названием, повторами, мышцами, видео
  // и отметкой — они и остаются на виду.
  //
  // Идентификатор области — из префикса и key упражнения, как у отметок
  // (markId): уникальность этой пары у «Сегодня» сторожит валидатор
  // (workouts/schema.js: id блоков не повторяются, key не повторяется внутри
  // блока), у библиотеки — то, что ключ в ней один на упражнение. Кнопка есть у
  // каждого упражнения, потому что text — обязательное поле; необязательны
  // только detail и extra.
  const regionId = `${idPrefix}-${item.key}`;
  const toggle = el(document, 'button', 'howto-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.setAttribute('aria-controls', regionId);
  // Имя для диктора называет упражнение — как у ссылки на видео и у каждой
  // отметки ниже: иначе при обходе по кнопкам подряд девятнадцать раз звучит
  // «Как выполнять», и какое из упражнений раскрывается, на слух не отличить.
  // Видимая подпись стоит в начале имени, поэтому голосовое управление по ней
  // кнопку по-прежнему находит.
  toggle.setAttribute('aria-label', `${HOWTO_LABEL}: ${item.name}`);
  toggle.append(el(document, 'span', null, HOWTO_LABEL), renderCaret(document, 'howto-caret'));

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

  // Подпись — только время ролика рядом со значком play: слово «Видео» значок
  // говорит сам, а полное имя («Видео: Тяга, 0:04») есть у ссылки для диктора.
  let video = null;
  if (item.v) {
    video = el(document, 'a', 'video');
    video.href = videoUrl(item.v);
    video.target = '_blank';
    video.rel = 'noopener noreferrer';
    video.setAttribute('aria-label', `Видео: ${item.name}, ${item.v[2]}`);
    video.append(renderIcon(document, PLAY_PATH), el(document, 'span', null, item.v[2]));
    refs.append(video);
  }

  // Область с текстом — следом за строкой, а не внутри неё: внутри раскрытие
  // разрывало бы строку между кнопкой и видео.
  const body = el(document, 'div', 'howto-body');
  body.id = regionId;
  body.hidden = !expanded;
  body.append(el(document, 'p', 'technique', item.text));
  if (item.detail) body.append(el(document, 'p', null, item.detail));
  if (item.extra) body.append(el(document, 'p', null, item.extra));

  const links = (item.links ?? []).map(extra => {
    // Форма элемента — [id, start, caption], как у v. Упражнение приходит из
    // библиотеки (exercises/: таблица и импорт), и там подписи хранятся уже
    // целиком (например «Как установить длинную резинку · 0:18»), отдельного
    // поля label в данных нет.
    const link = el(document, 'a', 'extra-link', extra[2]);
    link.href = videoUrl(extra);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  });

  return { refs, toggle, video, body, links };
}

// Раскрытие описания — делегированием на корень: кнопок десятки, и своего
// обработчика каждой не нужно. Кнопку ищем через closest, потому что цель
// события — значок-уголок, когда палец попал в него, а не в подпись.
// Раскрытие одного упражнения не трогает остальные: человек вправе держать
// раскрытыми оба упражнения силовой пары, которые делает одно за другим.
//
// Вешается один раз на корень, живущий столько же, сколько его карточки:
// у «Сегодня» это #workout (карточки перерисовываются внутри него, а сам он
// остаётся), у библиотеки — узел, который она создаёт при каждой отрисовке.
// Повесить второй раз на тот же узел нельзя: два обработчика переключили бы
// область туда и обратно, и кнопка не раскрывала бы ничего.
export function bindHowto(root) {
  root.addEventListener('click', event => {
    const toggle = event.target.closest('.howto-toggle');
    if (!toggle) return;
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    root.ownerDocument.getElementById(toggle.getAttribute('aria-controls')).hidden = !open;
  });
}

// Метка блока с числом повторов: «1 круг», «2 круга», «5 кругов» или, если блок
// считает подходы (unit: 'sets'), «2 подхода». Склоняется по числу: у готовых
// тренировок кругов не больше трёх, но своя может дойти и до пяти. Вынесена из
// renderWorkout, потому что та же метка нужна экрану сборки (builder-view.js)
// у силовых блоков своей тренировки.
export function roundsTag(block) {
  const n = block.rounds;
  const forms = block.unit === 'sets' ? ['подход', 'подхода', 'подходов'] : ['круг', 'круга', 'кругов'];
  return `${n} ${plural(n, forms)}`;
}

// Отметки упражнения. Повторы блока называются кругами или подходами (поле
// unit); блок с одним повтором слова не требует: «Готово». Текст метки — целиком
// («Круг 1»), но на экране остаётся только номер в круге: слово спрятано
// классом check-word (то же, что .sr-only), так что и текст метки, и имя
// чекбокса для диктора полные, а круг 36px вмещает одну цифру.
function renderChecks(document, block, item) {
  const word = block.unit === 'sets' ? 'Подход' : 'Круг';
  const one = block.rounds === 1;
  const checks = el(document, 'div', 'checks');
  for (let round = 1; round <= block.rounds; round += 1) {
    const label = el(document, 'label', one ? 'check check-one' : 'check');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.dataset.mark = markId(block.id, item.key, round);
    input.setAttribute('aria-label', `${item.name}: ${one ? 'выполнено' : `${word.toLowerCase()} ${round}`}`);
    const face = document.createElement('span');
    if (one) {
      face.textContent = 'Готово';
    } else {
      face.append(el(document, 'span', 'check-word', `${word} `), document.createTextNode(String(round)));
    }
    label.append(input, face);
    checks.append(label);
  }
  return checks;
}

// Строка упражнения: название и видео, повторы, мышцы, ряд действий (отметки и
// «Как выполнять»), под ним раскрывающиеся тексты. Порядок в разметке — это и
// порядок обхода Tab: видео, отметки, «Как выполнять».
function renderItem(document, block, item, expandDescriptions) {
  const article = el(document, 'article', 'exercise');

  const { toggle, video, body, links } = renderHowto(document, {
    idPrefix: `howto-${block.id}`,
    item,
    expanded: expandDescriptions,
  });

  const head = el(document, 'div', 'exercise-head');
  head.append(el(document, 'h3', null, item.name));
  if (video) head.append(video);
  article.append(head);

  // Метка «упор» — подпись, а не кнопка: нажимаемого не прибавляет.
  if (item.focus) article.append(el(document, 'span', 'focus-tag', 'упор'));
  article.append(el(document, 'p', 'reps', item.reps), el(document, 'p', 'muscles', item.muscles));

  const actions = el(document, 'div', 'exercise-actions');
  actions.append(renderChecks(document, block, item), toggle);
  article.append(actions, body, ...links);

  return article;
}

// Вставка в начало блока (например «Как выполнять силовые пары») — как
// в src-original/app.js (pairRules), но по данным блока, а не по его индексу:
// рендерер не знает, какой блок по счёту у какой тренировки первый силовой.
// Лежит внутри тела блока, поэтому заголовок — третьего уровня.
function renderPreamble(document, preamble) {
  const section = el(document, 'section', 'pair-rules');
  section.append(el(document, 'h3', null, preamble.title));
  for (const paragraph of preamble.paragraphs) {
    const p = document.createElement('p');
    for (const part of paragraph) {
      p.append(typeof part === 'string' ? document.createTextNode(part) : el(document, 'strong', null, part.b));
    }
    section.append(p);
  }
  return section;
}

// Тип блока — от него красится кружок, метки и отметки: разминка, круг,
// силовые, завершение. Слоты разминки, круга и завершения у готовых и своих
// тренировок называются одинаково (start, circuit, finish), всё остальное
// (legs1, pair1, loop, ex1…) — силовая часть.
export function blockKind(block) {
  if (block.id === 'start') return 'warm';
  if (block.id === 'circuit') return 'circuit';
  if (block.id === 'finish') return 'finish';
  return 'strength';
}

// Раскрытие блока — состояние в разметке (aria-expanded у кнопки и hidden у
// тела), как у «Как выполнять»: так его читает и диктор, и тест.
export function setBlockOpen(section, open) {
  section.querySelector('.blk-head').setAttribute('aria-expanded', String(open));
  section.querySelector('.blk-body').hidden = !open;
}

function renderBlock(document, block, { expandDescriptions, open }) {
  const section = el(document, 'section', 'workout-block');
  section.id = block.id;
  section.dataset.kind = blockKind(block);

  // Шапка блока — кнопка внутри заголовка: заголовок остаётся в оглавлении
  // страницы, а раскрывает блок кнопка. Номер — украшение, диктору он не нужен.
  const bodyId = `${block.id}-body`;
  const head = el(document, 'button', 'blk-head');
  head.type = 'button';
  head.setAttribute('aria-expanded', String(open));
  head.setAttribute('aria-controls', bodyId);
  const number = el(document, 'span', 'block-number', block.n);
  number.setAttribute('aria-hidden', 'true');
  const text = el(document, 'span', 'blk-text');
  text.append(el(document, 'span', 'blk-title', block.title), el(document, 'span', 'blk-sub', block.sub));
  const progress = el(document, 'span', 'blk-prog', `0/${block.items.length * block.rounds}`);
  progress.append(el(document, 'span', 'sr-only', ' отметок'));
  head.append(number, text, progress, renderCaret(document, 'ic blk-caret'));
  const heading = el(document, 'h2', 'block-heading');
  heading.append(head);

  const body = el(document, 'div', 'blk-body');
  body.id = bodyId;
  body.hidden = !open;
  const tags = el(document, 'div', 'blk-tags');
  tags.append(el(document, 'span', 'round-tag', roundsTag(block)));
  body.append(tags);
  if (block.note) body.append(el(document, 'p', 'block-note', block.note));
  if (block.preamble) body.append(renderPreamble(document, block.preamble));
  const cards = el(document, 'div', 'cards');
  for (const item of block.items) cards.append(renderItem(document, block, item, expandDescriptions));
  body.append(cards);

  section.append(heading, body);
  return section;
}

// expandDescriptions — раскрыты ли описания упражнений в момент отрисовки.
// Решает это связывание (app.js) по ширине окна: атрибут раскрытия
// медиазапросом не задать, а сам рендерер про окно ничего не знает. По
// умолчанию свёрнуто — это состояние телефона, под который приложение и сделано.
// open — id блоков, которые рисуются раскрытыми (по умолчанию все свёрнуты).
export function renderWorkout(workout, document, { expandDescriptions = false, open = [] } = {}) {
  const fragment = document.createDocumentFragment();
  const opened = new Set(open);
  for (const block of workout.blocks) {
    fragment.append(renderBlock(document, block, { expandDescriptions, open: opened.has(block.id) }));
  }
  return fragment;
}

// Полоса недели в шапке: семь кружков, дни тренировки на белой подложке, сегодня
// обведён нарисованным кольцом. Подпись для диктора — на самой полосе.
const RING_PATH = 'M22 4.5C32.5 4 40 12 39.5 22.5C39 33 30.5 40 21 39.5C11 39 4.5 31.5 5 21.5C5.5 12 12.5 5.5 23 5.2C27.5 5 31.5 6.5 34 9';

function renderWeek(document, days, today) {
  const week = document.getElementById('week');
  week.setAttribute('aria-label', weekLabel(days, today));
  week.replaceChildren(...[1, 2, 3, 4, 5, 6, 7].map(day => {
    const cell = el(document, 'span', days.includes(day) ? 'day train' : 'day');
    if (day === today) {
      const ring = renderIcon(document, RING_PATH);
      ring.setAttribute('viewBox', '0 0 44 44');
      ring.setAttribute('class', 'ring');
      cell.append(ring);
    }
    cell.append(document.createTextNode(weekday(day).short));
    return cell;
  }));
}

// Тексты верхнего уровня тоже живут в данных: держать их ещё и в index.html
// значит рано или поздно получить расхождение между сайтом и тренировкой.
//
// today — номер сегодняшнего дня по ISO (1–7): обведённый кружок в полосе недели.
// По умолчанию берётся из часов (Date.now, а не new Date(): так время в тестах
// подменяется одним местом).
export function renderIntro(workout, document, { today = isoWeekday(new Date(Date.now())) } = {}) {
  // По id, а не по классу: подпись из данных тренировки — один узел шапки.
  document.getElementById('kicker').textContent = workout.kicker;

  // Разбиение заголовка на строки задаётся данными, а не угадывается по пробелам.
  // Каждая строка — своим блоком (display:block в style.css), без <br>.
  document.querySelector('h1')
    .replaceChildren(...workout.titleLines.map(line => el(document, 'span', null, line)));

  document.querySelector('.intro-copy').textContent = workout.lead;

  const facts = document.querySelector('.facts');
  facts.replaceChildren(...workout.stats.map(stat => {
    const box = document.createElement('div');
    box.append(el(document, 'strong', null, stat.v), el(document, 'span', null, stat.l));
    return box;
  }));

  // Расписание на странице в двух местах, и оба — из данных: полоса недели в
  // шапке и строка в подвале. Пока эти строки были зашиты в index.html, вторая
  // тренировка (например, ВТ/ЧТ) отрендерилась бы с чужим расписанием сразу в
  // двух местах, и ни один тест бы не заметил.
  renderWeek(document, workout.days, today);
  // В подвале расписание — ведущий текстовый узел. Примечание рядом с ним
  // («Между тренировками — день восстановления») остаётся в разметке, но
  // показывается не всегда: при двух днях подряд (своя тренировка может стоять
  // хоть на все семь) оно неправда. Выставляется при каждой отрисовке, а не
  // только при скрытии: со сменой тренировки примечание должно вернуться.
  const note = document.getElementById('schedule-note');
  note.firstChild.textContent = scheduleLong(workout.days);
  note.querySelector('span').hidden = hasAdjacentDays(workout.days);

  document.querySelector('.equipment').textContent = workout.equipment;
  document.getElementById('progression-list')
    .replaceChildren(...workout.progression.map(step => el(document, 'li', null, step)));
  document.getElementById('care')
    .replaceChildren(...workout.caution.split('\n\n').map(par => el(document, 'p', null, par)));
}
