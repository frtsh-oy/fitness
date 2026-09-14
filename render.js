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

function renderItem(document, block, item, itemIndex) {
  const wrap = el(document, 'article', 'exercise');
  wrap.append(el(document, 'p', 'muscles', item.muscles));
  wrap.append(el(document, 'h3', null, item.name));
  wrap.append(el(document, 'p', 'reps', item.reps));
  wrap.append(el(document, 'p', 'howto', item.text));

  if (item.detail) {
    const details = document.createElement('details');
    details.append(el(document, 'summary', null, item.extra ? 'Техника и прогрессия' : 'Техника'));
    details.append(el(document, 'p', null, item.detail));
    if (item.extra) details.append(el(document, 'p', null, item.extra));
    wrap.append(details);
  }

  if (item.v) {
    const link = el(document, 'a', 'video', `Видео · ${item.v[2]}`);
    link.href = videoUrl(item.v);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    wrap.append(link);
  }

  for (const extra of item.links ?? []) {
    // Форма элемента — [id, start, caption], как у v: workouts/legs-mwf.js
    // хранит подписи уже целиком (например «Как установить длинную резинку · 0:18»),
    // отдельного поля label в данных нет.
    const link = el(document, 'a', 'extra-link', extra[2]);
    link.href = videoUrl(extra);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    wrap.append(link);
  }

  const marks = el(document, 'div', 'marks');
  for (let round = 1; round <= block.rounds; round += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mark = markId(block.id, itemIndex, round);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = block.rounds === 1 ? 'Готово' : `Круг ${round}`;
    marks.append(button);
  }
  wrap.append(marks);
  return wrap;
}

export function renderWorkout(workout, document) {
  const fragment = document.createDocumentFragment();

  for (const block of workout.blocks) {
    const section = el(document, 'section', 'block');
    section.id = block.id;
    const head = el(document, 'header', 'block-head');
    head.append(el(document, 'p', 'block-n', block.n));
    head.append(el(document, 'h2', null, block.title));
    head.append(el(document, 'p', 'block-sub', block.sub));
    head.append(el(document, 'p', 'block-rounds', block.rounds === 1 ? '1 круг' : `${block.rounds} круга`));
    if (block.note) head.append(el(document, 'p', 'block-note', block.note));
    section.append(head);

    block.items.forEach((item, index) => section.append(renderItem(document, block, item, index)));
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
