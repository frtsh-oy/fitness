// Значки интерфейса: контурные, на сетке 24×24, линию и размер задаёт .ic в
// style.css. Это пути, а не символы шрифта: системные шрифты рисуют «галочку»,
// «крестик» и «уголок» каждый по-своему, разного размера и с разными боковыми
// просветами, и подпись рядом с ними съезжала бы от системы к системе. Все
// значки — украшение (aria-hidden): имя кнопке даёт подпись или aria-label.
import { hasOwn } from './own.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

const path = d => ['path', { d }];

// Контур петли резинки: по нему рисуются и знак приложения, и петля-счётчик.
const LOOP_PATH = 'M66 36C66 36 52 9 32 9C15 9 6 22 6 36C6 50 15 63 32 63C52 63 66 36 66 36C66 36 80 9 100 9C117 9 126 22 126 36C126 50 117 63 100 63C80 63 66 36 66 36Z';

const ICONS = {
  // Галочка нарисована от руки, с лёгким наклоном: ей же красятся выбранные
  // чипы, пометка «Сейчас в «Сегодня»» и кружки «сделано».
  tick: { shapes: [path('M5.5 12.8c1.4 1.3 2.7 2.7 3.8 4.4C11.6 12.6 15 8.4 19 5.8')] },
  back: { shapes: [path('M15 6l-6 6 6 6')] },
  next: { shapes: [path('M9 6l6 6-6 6')] },
  down: { shapes: [path('M6 9l6 6 6-6')] },
  close: { shapes: [path('M6 6l12 12M18 6L6 18')] },
  plus: { shapes: [path('M12 5v14M5 12h14')] },
  search: { shapes: [['circle', { cx: 11, cy: 11, r: 6.5 }], path('M16 16l4.5 4.5')] },
  filters: { shapes: [path('M4 7h9M17 7h3M4 17h3M11 17h9'), ['circle', { cx: 15, cy: 7, r: 2 }], ['circle', { cx: 9, cy: 17, r: 2 }]] },
  blocks: {
    shapes: [
      ['rect', { x: 3.5, y: 3.5, width: 7, height: 7, rx: 2 }],
      ['rect', { x: 13.5, y: 3.5, width: 7, height: 7, rx: 2 }],
      ['rect', { x: 3.5, y: 13.5, width: 7, height: 7, rx: 2 }],
      path('M17 13.5v7M13.5 17h7'),
    ],
  },
  alert: { shapes: [path('M12 6.5v7M12 17.5h.01')] },
  swap: { shapes: [path('M7 4L4 7l3 3M4 7h12a4 4 0 0 1 4 4M17 20l3-3-3-3M20 17H8a4 4 0 0 1-4-4')] },
  again: { shapes: [path('M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4')] },
  sparkles: {
    shapes: [
      path('M10 3.5l1.9 5.1 5.1 1.9-5.1 1.9L10 17.5l-1.9-5.1L3 10.5l5.1-1.9z'),
      path('M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z'),
    ],
  },
  book: { shapes: [path('M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 0 7.5 23H19')] },
  // Волна под шапкой вкладки: тянется на всю ширину (stretch), а не вписывается.
  wave: { box: '0 0 375 30', stretch: true, shapes: [path('M0 30V15C48 3 108 0 170 9C232 18 304 28 375 9V30Z')] },
  // Петля резинки — знак приложения; её сетка шире остальных значков.
  loop: { box: '0 0 132 72', shapes: [path(LOOP_PATH)] },
};

// Класс атрибутом, а не присваиванием в className: у SVG это не строка, а
// SVGAnimatedString, причём свойство только для чтения, и присваивание в
// модуле (строгий режим) бросило бы TypeError — уронило бы отрисовку экрана.
export function icon(document, name, className = 'ic') {
  if (!hasOwn(ICONS, name)) throw new Error(`Нет значка «${name}»`);
  const { box = '0 0 24 24', stretch = false, shapes } = ICONS[name];
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', box);
  if (stretch) svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const [tag, attributes] of shapes) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    svg.append(shape);
  }
  return svg;
}

// Петля-счётчик: дорожка и штрих поверх неё. Штрих — доля от сотни (pathLength=100),
// как у петли в шапке «Сегодня» (index.html, app.js); set(0..1) задаёт долю.
// Пустой штрих скрыт совсем: со скруглённым концом нулевая длина рисовала бы точку.
export function loopMeter(document, className = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 132 72');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const stroke = name => {
    const node = document.createElementNS(SVG_NS, 'path');
    node.setAttribute('class', name);
    node.setAttribute('pathLength', '100');
    node.setAttribute('d', LOOP_PATH);
    svg.append(node);
    return node;
  };
  stroke('loop-track');
  const fill = stroke('loop-fill');
  return {
    svg,
    set(share) {
      const length = Math.round(Math.min(1, Math.max(0, share)) * 100);
      fill.style.strokeDasharray = `${length} 100`;
      fill.style.opacity = length > 0 ? '1' : '0';
    },
  };
}
