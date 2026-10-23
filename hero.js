// Шапка вкладки: знак и название приложения, крупный рукописный заголовок,
// пояснение в одну-две строки и волна внизу. Цвет шапки — ведущий цвет вкладки
// (body[data-tint], style.css). «Сегодня» рисует свою шапку в index.html: у неё
// неделя, петля прогресса и «дальше»; эта — для «Тренировок» и входа в
// «Конструктор». Заголовок принимает фокус программно (tabindex -1): после смены
// экрана «Конструктора» фокус переходит на него, а в порядок обхода Tab он не
// попадает.
import { icon } from './icons.js';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function renderHero(document, { title, lead, leadClass = '' }) {
  const header = el(document, 'header', 'hero compact');
  const wrap = el(document, 'div', 'wrap');

  const brand = el(document, 'span', 'brand');
  // Без класса .ic: размер и линию знака задаёт .brand svg.
  brand.append(icon(document, 'loop', ''), 'моя тренировка');
  const top = el(document, 'div', 'hero-top');
  top.append(brand);

  const heading = el(document, 'h1', null, title);
  heading.tabIndex = -1;
  wrap.append(top, heading, el(document, 'p', `intro-copy ${leadClass}`.trim(), lead));

  header.append(wrap, icon(document, 'wave', 'wave'));
  return header;
}
