export function markId(blockId, itemIndex, round) {
  return `${blockId}-${itemIndex}-${round}`;
}

export function videoUrl([id, start = 0]) {
  return `https://www.youtube.com/watch?v=${id}&t=${start}s`;
}

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Значок play внутри ссылки на видео — как в src-original/app.js (переменная play).
function renderPlayIcon(document) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M8 5v14l12-7z');
  svg.append(path);
  return svg;
}

function renderItem(document, block, item, itemIndex) {
  const article = el(document, 'article', 'exercise');

  const top = el(document, 'div', 'exercise-top');
  top.append(el(document, 'span', 'exercise-index', String(itemIndex + 1).padStart(2, '0')));
  top.append(el(document, 'span', 'muscles', item.muscles));
  article.append(top);

  article.append(el(document, 'h3', null, item.name));
  article.append(el(document, 'p', 'reps', item.reps));
  article.append(el(document, 'p', 'technique', item.text));

  if (item.detail || item.extra) {
    const details = document.createElement('details');
    details.append(el(document, 'summary', null, item.extra ? 'Техника и прогрессия' : 'Техника'));
    if (item.detail) details.append(el(document, 'p', null, item.detail));
    if (item.extra) details.append(el(document, 'p', null, item.extra));
    article.append(details);
  }

  if (item.v) {
    const link = el(document, 'a', 'video');
    link.href = videoUrl(item.v);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `Видео: ${item.name}, ${item.v[2]}`);
    link.append(renderPlayIcon(document), document.createTextNode(` Видео · ${item.v[2]}`));
    article.append(link);
  }

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
    input.dataset.mark = markId(block.id, itemIndex, round);
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

export function renderWorkout(workout, document) {
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
    block.items.forEach((item, index) => cards.append(renderItem(document, block, item, index)));
    section.append(cards);

    fragment.append(section);
  }

  return fragment;
}

// Тексты верхнего уровня тоже живут в данных: держать их ещё и в index.html
// значит рано или поздно получить расхождение между сайтом и тренировкой.
export function renderIntro(workout, document) {
  document.querySelector('.eyebrow').textContent = workout.kicker;

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

  document.querySelector('.equipment').textContent = workout.gear;
  document.getElementById('progression-list')
    .replaceChildren(...workout.progression.map(step => el(document, 'li', null, step)));
  document.getElementById('care')
    .replaceChildren(...workout.caution.split('\n\n').map(par => el(document, 'p', null, par)));
}
