import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { createBodyMap, PALETTE, warmupOnlyGroups, idleGroups } from '../bodymap.js';
import { PALETTE_STEPS } from '../volume.js';
import { MUSCLES } from '../muscles.js';
import legs from '../workouts/legs-mwf.js';

function hosts() {
  const { document } = makeDom('<!doctype html><html><body><div id="a"></div><div id="b"></div></body></html>');
  return { document, a: document.getElementById('a'), b: document.getElementById('b') };
}

// Библиотека красит через inline style.fill, а jsdom (как и любой браузер)
// отдаёт его обратно уже в виде rgb(...), а не исходным hex — сравнивать
// приходится в этом же виде.
function hexToRgb(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

// Клик — обычное DOM-событие: исключение внутри слушателя (как и в настоящем
// браузере) не долетает до dispatchEvent(), а уходит через error на window.
// assert.doesNotThrow вокруг dispatchEvent ничего не доказывает — ловить нужно
// здесь.
function clickAndCollectErrors(win, run) {
  const errors = [];
  const onError = e => errors.push(e.message);
  win.addEventListener('error', onError);
  try {
    run();
  } finally {
    win.removeEventListener('error', onError);
  }
  return errors;
}

test('палитра ровно на число уровней объёма', () => {
  assert.equal(PALETTE.length, PALETTE_STEPS);
  for (const color of PALETTE) assert.match(color, /^#[0-9a-f]{6}$/i);
});

test('рисуются оба вида', () => {
  const { a, b } = hosts();
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b });
  assert.ok(a.querySelector('svg'), 'передний вид не отрисован');
  assert.ok(b.querySelector('svg'), 'задний вид не отрисован');
});

test('группы, которые греются только в разминке, перечислены отдельно', () => {
  const only = warmupOnlyGroups(legs);
  assert.ok(only.includes('hip_flexors'), 'сгибатели бедра грузятся только в разминке');
  assert.ok(only.includes('delts_rear'), 'задняя дельта грузится только в разминке');
  assert.ok(!only.includes('glutes'), 'ягодичные есть и в силовых');
});

test('незадействованные группы перечислены отдельно', () => {
  assert.deepEqual(idleGroups(legs).sort(), ['calves', 'forearms']);
});

// Кликает первый попавшийся полигон переднего вида, без выбора региона:
// проверяется форма ответа onPick, а не конкретная мышца. Раньше здесь стоял
// `a.querySelector('[data-muscle="gluteal"]') ?? a.querySelector('polygon')`,
// и первый операнд не совпадал никогда — библиотека не ставит на полигоны
// никаких data-* (h() в vendor/body-highlighter.esm.js:377-381 задаёт только
// points, style.cursor, style.fill и слушатель клика), так что всю работу
// делал запасной вариант, а селектор обещал ягодичные, которых тест не касался.
// Непустой список упражнений тест вправе требовать только потому, что первый
// полигон переднего вида — грудные, а они в силовых есть. Если библиотека
// когда-нибудь переставит полигоны и первым окажется регион без силовой
// нагрузки, тест упадёт — тогда адресовать регион перебором, как это сделано
// ниже в тестах про gluteal и calves. Пустой список сам по себе не дефект: он
// проверен отдельным тестом «клик по незадействованной мышце даёт пустой
// результат и цвет фона мышц».
test('клик по мышце отдаёт её упражнения и русское название региона', () => {
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  const target = a.querySelector('polygon');
  assert.ok(target, 'в отрисованном виде нет кликабельных элементов');
  target.dispatchEvent(new a.ownerDocument.defaultView.MouseEvent('click', { bubbles: true }));
  assert.equal(picks.length, 1, 'обработчик клика не вызвался');
  assert.ok(Array.isArray(picks[0].exercises));
  assert.ok(picks[0].exercises.length > 0, 'список упражнений пуст');
  assert.match(picks[0].label, /[А-Яа-я]/, 'название региона не по-русски');
});

test('destroy убирает разметку и не бросает при повторном вызове', () => {
  // У bodymap.js нет своего флага «уже уничтожен»: мутацией показано, что он
  // ничем не отличался бы от его отсутствия. Повторный вызов не бросает
  // благодаря идемпотентности destroy() самой библиотеки (S(i, []) и
  // removeChild — оба no-op на уже пустом/отсоединённом узле), поэтому этот
  // тест теперь сторожит именно её — свойство чужого кода, на которое мы
  // опираемся. Если библиотека когда-нибудь его потеряет, тест упадёт, и
  // тогда флаг возвращаем осознанно.
  const { a, b } = hosts();
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b });
  map.destroy();
  assert.equal(a.querySelector('svg'), null);
  assert.doesNotThrow(() => map.destroy());
});

// Ниже — тесты, добавленные сверх брифа методом мутации: для каждого случая
// сначала было показано, что поломка соответствующего места в bodymap.js не
// роняла ни один из тестов брифа (то есть место было проверкой лишь на вид).

test('группа, задействованная только в заминке, не теряется ни в одной из функций', () => {
  // В legs-mwf каждая группа заминки — это ещё и группа разминки или силовых,
  // поэтому одним только legs-mwf не отличить учёт заминки от его отсутствия:
  // тест на warmupOnlyGroups/idleGroups выше проходит даже если 'cooldown'
  // вычеркнуть из обеих функций. Нужна тренировка, где заминка — единственное
  // место, где встречается группа.
  const workout = {
    blocks: [
      { rounds: 1, items: [{ kind: 'strength', load: { chest: 1 }, name: 'Силовое', key: 's' }] },
      { rounds: 1, items: [{ kind: 'cooldown', load: { calves: 1 }, name: 'Заминка', key: 'c' }] },
    ],
  };
  assert.ok(warmupOnlyGroups(workout).includes('calves'), 'группа только из заминки должна попасть в warmupOnlyGroups');
  assert.ok(!idleGroups(workout).includes('calves'), 'группа из заминки не должна считаться незадействованной');
});

test('клик работает, даже если onPick не передан', () => {
  const { a, b } = hosts();
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b });
  const win = a.ownerDocument.defaultView;
  const target = a.querySelector('polygon');
  const errors = clickAndCollectErrors(win, () => {
    target.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  });
  assert.deepEqual(errors, [], 'клик без onPick не должен бросать исключение внутри обработчика');
});

test('цвет мышцы на верхней границе объёма — последний оттенок палитры', () => {
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  const win = b.ownerDocument.defaultView;
  // gluteal — регион с максимальным для этой тренировки объёмом, ровно
  // PALETTE_STEPS (см. volume.test.js). Только на границе видно, действительно
  // ли до библиотеки доходят все PALETTE_STEPS оттенков, а не только первые:
  // на меньшем объёме усечённый по ошибке хвост палитры ничем себя не выдаст.
  let target;
  for (const polygon of b.querySelectorAll('polygon')) {
    picks.length = 0;
    polygon.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    if (picks[0]?.region === 'gluteal') { target = polygon; break; }
  }
  assert.ok(target, 'регион gluteal должен быть кликабелен на заднем виде');
  assert.equal(picks[0].sets, PALETTE_STEPS, 'проверка границы палитры опирается на регион с максимальным объёмом');
  assert.equal(target.style.fill, hexToRgb(PALETTE[PALETTE_STEPS - 1]), 'на верхней границе объёма должен быть последний оттенок палитры');
});

test('клик по незадействованной мышце даёт пустой результат и цвет фона мышц', () => {
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  const win = a.ownerDocument.defaultView;
  // calves — регион без силовой нагрузки в legs-mwf (idleGroups выше).
  let target;
  for (const polygon of a.querySelectorAll('polygon')) {
    picks.length = 0;
    polygon.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
    if (picks[0]?.region === 'calves') { target = polygon; break; }
  }
  assert.ok(target, 'регион calves должен быть кликабелен на переднем виде');
  assert.equal(picks[0].sets, 0);
  assert.deepEqual(picks[0].exercises, []);
  // '#cdd8e5' — значение IDLE_COLOR в bodymap.js; наружу константа не экспортирована.
  assert.equal(target.style.fill, hexToRgb('#cdd8e5'), 'незадействованная мышца должна быть в цвете фона мышц');
});

test('клик по анатомии вне модели (шея, голова, колени, камбаловидная) не бросает и не долетает до onPick', () => {
  // Библиотека рисует весь свой силуэт, а не только наши 17 регионов: у неё
  // есть шея, голова, колени и обе половины камбаловидной, для которых в
  // MUSCLES нет ни одной группы. regionLabel на них осмысленно бросает —
  // но до него в принципе не должно доходить: клик по этим частям тела на
  // экране ничем не отличается от клика по обычной мышце.
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  const win = a.ownerDocument.defaultView;

  const errors = clickAndCollectErrors(win, () => {
    for (const host of [a, b]) {
      for (const polygon of host.querySelectorAll('polygon')) {
        polygon.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      }
    }
  });

  assert.deepEqual(errors, [], 'клик по не отслеживаемой библиотекой части тела бросил исключение внутри обработчика');
  const seenRegions = new Set(picks.map(p => p.region));
  const knownRegions = new Set(Object.values(MUSCLES).map(m => m.region));
  assert.deepEqual(seenRegions, knownRegions, 'onPick должен сработать ровно на регионах из MUSCLES — не больше и не меньше');
});
