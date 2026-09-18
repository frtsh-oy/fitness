// Дорисовка фигуры поверх схемы библиотеки: стопы, кисти и голова со спины.
// Здесь — контракт самого figure.js: что он кладёт в svg и куда. Что
// дорисованное возвращается после каждой отрисовки библиотеки и что в
// поднятый бокс всё влезает без обрезки — в test/bodymap.test.js, на настоящей
// карте.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { decorate, VIEW_BOX } from '../figure.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Библиотека красит через inline style.fill, а jsdom (как и любой браузер)
// отдаёт его обратно уже в виде rgb(...), а не исходным hex.
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// Пустой svg с несколькими детьми: так выглядит схема сразу после отрисовки
// библиотекой — набор полигонов прямо в svg, без всяких групп.
function freshSvg(childCount = 2) {
  const { document } = makeDom();
  const svg = document.createElementNS(SVG_NS, 'svg');
  const before = [];
  for (let i = 0; i < childCount; i++) {
    const polygon = document.createElementNS(SVG_NS, 'polygon');
    polygon.setAttribute('points', `${i},${i} ${i + 1},${i} ${i},${i + 1}`);
    svg.appendChild(polygon);
    before.push(polygon);
  }
  return { document, svg, before };
}

function pointsOf(svg) {
  return [...svg.querySelectorAll('polygon')].map(p => p.getAttribute('points'));
}

function numbersOf(shape) {
  if (shape.tagName === 'ellipse') {
    const num = name => Number(shape.getAttribute(name));
    const [cx, cy, rx, ry] = [num('cx'), num('cy'), num('rx'), num('ry')];
    return [[cx - rx, cy - ry], [cx + rx, cy + ry]];
  }
  const flat = shape.getAttribute('points').trim().split(/[\s,]+/).map(Number);
  const pairs = [];
  for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]]);
  return pairs;
}

test('дорисованное складывается в одну группу вместе с тем, что уже нарисовано', () => {
  const { svg, before } = freshSvg(3);
  decorate(svg, { type: 'anterior', fill: '#cdd8e5' });

  // Ровно один ребёнок: группа. Полигоны библиотеки обязаны переехать в неё, а
  // не остаться рядом — сдвиг переднего вида двигает фигуру целиком, и
  // оставленные снаружи мышцы оторвались бы от стоп.
  assert.equal(svg.childNodes.length, 1, 'в svg должна остаться одна группа');
  const layer = svg.firstChild;
  assert.equal(layer.tagName, 'g');
  for (const [i, node] of before.entries()) {
    assert.equal(node.parentNode, layer, `полигон ${i} не переехал в группу`);
  }
  // Дорисованное переднего вида — после переехавшего: в svg порядок детей и
  // есть порядок наложения, а стопы и кисти обязаны лежать ПОВЕРХ полигонов
  // библиотеки. Помеченного under у переднего вида нет вовсе — эллипс головы
  // дорисовывается только со спины, и там он как раз уходит под полигоны
  // (следующий тест).
  const children = [...layer.childNodes];
  for (const [i, node] of before.entries()) {
    assert.equal(children[i], node, 'дорисованное встало перед схемой библиотеки');
  }
  assert.ok(children.length > before.length, 'дорисованного нет вовсе');
});

test('голова со спины дорисовывается ПОД полигонами библиотеки, стопы и кисти — поверх', () => {
  const { svg, before } = freshSvg(2);
  decorate(svg, { type: 'posterior', fill: '#cdd8e5' });
  const children = [...svg.firstChild.childNodes];

  // Эллипс головы заходит на задние трапеции. Последним ребёнком он закрашивал
  // 14.6 ед² — 2.2% их площади, серый клин у основания шеи поверх цвета
  // нагрузки (замерено растеризацией). Первым — не закрывает ничего, а высоту
  // головы не теряет: у трапеций посередине вырез под шею.
  assert.equal(children[0].tagName, 'ellipse', 'эллипс головы обязан идти первым ребёнком');
  for (const [i, node] of before.entries()) {
    assert.equal(children[i + 1], node, 'полигоны библиотеки обязаны идти сразу за эллипсом');
  }
  // Стопы и кисти дорисовывают силуэт там, где у библиотеки ничего нет, и
  // остаются поверх.
  assert.equal(children.length, before.length + 5);
  for (const node of children.slice(before.length + 1)) {
    assert.equal(node.tagName, 'polygon', 'поверх схемы библиотеки лежат только стопы и кисти');
  }
});

test('дорисованное не перехватывает клики', () => {
  // Своих слушателей у этих фигур нет, но кисти заходят на предплечья (1.35 ед²,
  // 0.29% их площади), а эллипс головы — на трапеции: без pointer-events там
  // была бы мёртвая зона, по которой мышца не выбирается и курсор-рука не
  // показывается. Сам промах в jsdom не проверить — там клик рассылается прямо
  // по узлу, — поэтому тест сторожит атрибут.
  for (const type of ['anterior', 'posterior']) {
    const { svg, before } = freshSvg(1);
    decorate(svg, { type, fill: '#cdd8e5' });
    const extras = [...svg.firstChild.childNodes].filter(node => !before.includes(node));
    assert.ok(extras.length > 0, `${type}: дорисованного нет вовсе`);
    for (const shape of extras) {
      assert.equal(shape.getAttribute('pointer-events'), 'none', `${type}/${shape.tagName} перехватывает клик`);
    }
    // А полигонам библиотеки атрибут не приписан: их кликабельность — её дело.
    for (const node of before) {
      assert.equal(node.getAttribute('pointer-events'), null, `${type}: полигон библиотеки перестал быть кликабельным`);
    }
  }
});

test('передний вид: сдвинут на 11 вниз, задний не сдвинут', () => {
  const anterior = freshSvg().svg;
  decorate(anterior, { type: 'anterior', fill: '#cdd8e5' });
  assert.equal(anterior.firstChild.getAttribute('transform'), 'translate(0,11)');

  const posterior = freshSvg().svg;
  decorate(posterior, { type: 'posterior', fill: '#cdd8e5' });
  assert.equal(posterior.firstChild.getAttribute('transform'), 'translate(0,0)');
});

// Координаты сняты с геометрии библиотеки и согласованы макетом. Тест держит
// именно их: правка любой цифры — это правка формы человечка, и она обязана
// быть осознанной, а не побочным следствием чего-то ещё.
test('стопы и кисти переднего вида — ровно по согласованным координатам', () => {
  const { svg, before } = freshSvg(1);
  decorate(svg, { type: 'anterior', fill: '#cdd8e5' });
  assert.deepEqual(pointsOf(svg).slice(before.length), [
    '20.8,195.5 26.9,195.5 28.4,202.5 26.8,208.8 19.4,208.8 17.8,202.5',
    '79.2,195.5 72.7,195.5 71.2,202.5 72.8,208.8 80.2,208.8 81.8,202.5',
    '0.4,98.9 6.6,102.1 5.0,107.5 0.3,113.5 -5.3,110.5 -3.5,103.5',
    '99.6,98.9 93.4,102.1 95.0,107.5 99.7,113.5 105.3,110.5 103.5,103.5',
  ]);
  assert.equal(svg.querySelectorAll('ellipse').length, 0, 'голову спереди библиотека рисует сама, дорисовывать её нечем');
});

test('стопы, кисти и голова заднего вида — ровно по согласованным координатам', () => {
  const { svg, before } = freshSvg(1);
  decorate(svg, { type: 'posterior', fill: '#cdd8e5' });
  assert.deepEqual(pointsOf(svg).slice(before.length), [
    '27.5,213 33.5,213 34.5,222 33.0,230.5 27.8,230.5 26.3,222',
    '72.5,213 66.5,213 65.5,222 67.0,230.5 72.2,230.5 73.7,222',
    '0.4,106.4 6.6,109.6 5.0,115.0 0.3,121.0 -5.3,118.0 -3.5,111.0',
    '99.6,106.4 93.4,109.6 95.0,115.0 99.7,121.0 105.3,118.0 103.5,111.0',
  ]);
  const ellipses = [...svg.querySelectorAll('ellipse')];
  assert.equal(ellipses.length, 1, 'голова со спины дорисовывается одним эллипсом');
  const [head] = ellipses;
  assert.deepEqual(
    ['cx', 'cy', 'rx', 'ry'].map(name => head.getAttribute(name)),
    ['50', '12.6', '9.6', '12.6'],
  );
});

// Тест про цвет здесь ровно один и обещает ровно одно: что переданный цвет
// доходит до каждой дорисованной фигуры. Что это именно цвет незатронутой
// мышцы, отсюда не видно — цвет тут свой же литерал, — поэтому связь с
// IDLE_COLOR из bodymap.js сторожит тест на уровне карты («дорисованное залито
// тем же серым...» в test/bodymap.test.js). До него мутация «красить
// дорисованное в #ff0000» оставляла все 359 тестов зелёными.
test('дорисованное залито переданным цветом', () => {
  const { svg, before } = freshSvg(1);
  decorate(svg, { type: 'posterior', fill: '#cdd8e5' });
  const extras = [...svg.firstChild.childNodes].filter(node => !before.includes(node));
  assert.equal(extras.length, 5, 'у заднего вида дорисовано две стопы, две кисти и голова');
  for (const shape of extras) {
    assert.equal(shape.style.fill, hexToRgb('#cdd8e5'), `${shape.tagName} без заливки`);
  }
});

test('бокс отрисовки вмещает всё дорисованное с запасом', () => {
  // Смысл подъёма бокса: у библиотеки он `0 0 100 200`, и кисти (до x=-5.3 и
  // x=105.3) со стопами (до y=230.5) в него не влезают. Проверяем не строку, а
  // то, ради чего она такая.
  const [minX, minY, width, height] = VIEW_BOX.split(' ').map(Number);
  assert.equal(VIEW_BOX, '-8 0 116 232');
  // Соотношение сторон библиотеки (1:2) сохранено: от него зависит высота
  // схемы на странице, потому что у svg задана только ширина.
  assert.equal(height / width, 2);

  for (const type of ['anterior', 'posterior']) {
    const { svg, before } = freshSvg(1);
    decorate(svg, { type, fill: '#cdd8e5' });
    const shift = Number(svg.firstChild.getAttribute('transform').match(/translate\(0,(-?[\d.]+)\)/)[1]);
    const extras = [...svg.firstChild.childNodes].filter(node => !before.includes(node));
    for (const shape of extras) {
      for (const [x, y] of numbersOf(shape)) {
        assert.ok(x >= minX && x <= minX + width, `${type}: x=${x} вне бокса по горизонтали`);
        assert.ok(y + shift >= minY && y + shift <= minY + height, `${type}: y=${y + shift} вне бокса по вертикали`);
      }
    }
  }
});
