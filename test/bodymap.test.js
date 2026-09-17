import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { createBodyMap, PALETTE, warmupOnlyGroups, idleGroups, isMode, MODE_KINDS } from '../bodymap.js';
import { PALETTE_STEPS, setsByRegion } from '../volume.js';
import { MUSCLES } from '../muscles.js';
import legs from '../workouts/legs-mwf.js';
import { KINDS } from '../workouts/schema.js';

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

// Адресовать регион можно только перебором: библиотека не ставит на полигоны
// никаких data-* (см. комментарий к тесту про клик ниже), поэтому ищем тот,
// клик по которому отдал в onPick нужный регион. picks — общий с вызывающим
// тестом список, чтобы после находки в нём лежал pick именно этого полигона.
function findByRegion(hosts, picks, region) {
  for (const host of hosts) {
    const win = host.ownerDocument.defaultView;
    for (const polygon of host.querySelectorAll('polygon')) {
      picks.length = 0;
      polygon.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      if (picks[0]?.region === region) return polygon;
    }
  }
  return null;
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
  // Предплечья — единственная группа без разметки: хват резинки есть в шести
  // упражнениях, но в load он не учитывается (см. docs/muscle-map.md).
  // Икроножные с Task 7 размечены вспомогательными в четырёх упражнениях и
  // сюда больше не попадают.
  assert.deepEqual(idleGroups(legs).sort(), ['forearms']);
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
  // gluteal — регион с максимальным для этой тренировки силовым объёмом, ровно
  // PALETTE_STEPS (см. volume.test.js). Только на границе видно, действительно
  // ли до библиотеки доходят все PALETTE_STEPS оттенков, а не только первые:
  // на меньшем объёме усечённый по ошибке хвост палитры ничем себя не выдаст.
  const target = findByRegion([b], picks, 'gluteal');
  assert.ok(target, 'регион gluteal должен быть кликабелен на заднем виде');
  assert.equal(picks[0].sets, PALETTE_STEPS, 'проверка границы палитры опирается на регион с максимальным объёмом');
  assert.equal(target.style.fill, hexToRgb(PALETTE[PALETTE_STEPS - 1]), 'на верхней границе объёма должен быть последний оттенок палитры');
});

test('клик по незадействованной мышце даёт пустой результат и цвет фона мышц', () => {
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  // forearm — единственный регион без нагрузки любого типа в legs-mwf
  // (idleGroups выше). Ищем по обоим видам: на каком из них библиотека рисует
  // предплечья, для этой проверки неважно.
  const target = findByRegion([a, b], picks, 'forearm');
  assert.ok(target, 'регион forearm должен быть кликабелен хотя бы на одном виде');
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

// Ниже — режимы карты (Task 7). Силовой режим отвечает на вопрос «что тут
// нагружается по программе», режим всей нагрузки — «что эта тренировка вообще
// задевает»; разница между ними видна на икроножных: 2 подхода против 5.

test('режим карты: известны ровно два, силовые и вся нагрузка', () => {
  assert.deepEqual(Object.keys(MODE_KINDS), ['strength', 'all']);
  assert.deepEqual(MODE_KINDS.strength, ['strength']);
  assert.deepEqual([...MODE_KINDS.all].sort(), ['cooldown', 'strength', 'warmup']);
  // И то же самое, но привязкой к схеме, а не к повтору литерала: «вся
  // нагрузка» обязана означать ВСЕ типы упражнений. Появится в схеме четвёртый
  // тип — этот режим, подпись «разминка, силовые и заминка вместе» (app.js) и
  // idleGroups перестанут быть правдой, и упадёт вот эта строка, а не
  // пользователь.
  assert.deepEqual([...MODE_KINDS.all].sort(), [...KINDS].sort());
  for (const kind of MODE_KINDS.strength) {
    assert.ok(KINDS.includes(kind), `${kind} — не тип упражнения из схемы`);
  }
  assert.ok(isMode('strength') && isMode('all'));
  assert.ok(!isMode('нет-такого'), 'чужое значение режимом быть не должно');
  assert.ok(!isMode(null), 'отсутствие значения режимом быть не должно');
});

test('неизвестный режим — ошибка, а не бледная карта без единого упражнения', () => {
  const { a, b } = hosts();
  assert.throws(
    () => createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, mode: 'нет-такого' }),
    /Неизвестный режим карты: нет-такого/,
  );
});

test('в режиме всей нагрузки клик отдаёт подходы и упражнения всех типов', () => {
  const { a, b } = hosts();
  const picks = [];
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });

  assert.ok(findByRegion([a], picks, 'calves'), 'регион calves должен быть кликабелен');
  assert.equal(picks[0].sets, 2, 'силовой режим — только мост и жим ногами');
  assert.deepEqual(picks[0].exercises, ['Ягодичный мост', 'Жим двумя ногами лёжа']);

  map.setMode('all');
  assert.ok(findByRegion([a], picks, 'calves'), 'после смены режима регион calves должен остаться кликабельным');
  // 1.5 + 1.5 + 1 + 1 = 5, а не 2+2+1+1=6: округляет только цвет, а не число.
  assert.equal(picks[0].sets, 5);
  assert.deepEqual(picks[0].exercises, [
    '«Китайское» приседание с подъёмом таза и разворотом',
    'Подъём колена с лёгкой резинкой',
    'Ягодичный мост',
    'Жим двумя ногами лёжа',
  ]);
});

test('смена режима меняет цвет области', () => {
  const { a, b } = hosts();
  const picks = [];
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  // Икроножные: 2 подхода в силовом режиме — второй оттенок палитры, 5 во всей
  // нагрузке — пятый. Цвет считается от округлённой точной суммы, поэтому пятый,
  // а не последний: сумма округлений по упражнениям дала бы 6 и последний
  // оттенок, и икры выглядели бы как квадрицепсы с их 12.5.
  // Полигон после update() другой, поэтому ищем заново.
  assert.equal(findByRegion([a], picks, 'calves').style.fill, hexToRgb(PALETTE[1]));
  map.setMode('all');
  assert.equal(findByRegion([a], picks, 'calves').style.fill, hexToRgb(PALETTE[4]));
  map.setMode('strength');
  assert.equal(findByRegion([a], picks, 'calves').style.fill, hexToRgb(PALETTE[1]),
    'возврат в силовой режим обязан вернуть и цвет');
});

// Главная проверка правки раунда 1, но уже через саму карту: число, которое
// человек видит по клику, обязано совпадать с объёмом, посчитанным по правилу
// docs/muscle-map.md (setsByRegion), — по КАЖДОМУ региону в КАЖДОМ режиме, а
// не на одной показательной мышце.
// Раньше число приходило из аккумулятора библиотеки, который складывал частоты,
// округлённые по каждому упражнению: в режиме всей нагрузки расходилась
// половина регионов (восемь из шестнадцати — например, пресс 7 вместо 6,5 и
// косые 5 вместо 4), в силовом — ни один, потому что там все вклады целые.
test('в обоих режимах клик отдаёт точный объём по каждому региону, а не сумму округлений', () => {
  const { a, b } = hosts();
  const picks = [];
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });

  for (const [mode, kinds] of Object.entries(MODE_KINDS)) {
    map.setMode(mode);
    const expected = new Map();
    for (const kind of kinds) {
      for (const [region, value] of setsByRegion(legs, kind)) {
        expected.set(region, (expected.get(region) ?? 0) + value);
      }
    }
    // Проходим все полигоны обоих видов: другого способа адресовать регион у
    // нас нет, а так заодно видно, что до onPick доходит каждый из них.
    const seen = new Map();
    for (const host of [a, b]) {
      const win = host.ownerDocument.defaultView;
      for (const polygon of host.querySelectorAll('polygon')) {
        picks.length = 0;
        polygon.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
        if (picks[0]) seen.set(picks[0].region, picks[0].sets);
      }
    }
    assert.ok(expected.size > 10, `${mode}: слишком мало регионов, проверять почти нечего`);
    for (const [region, exact] of expected) {
      assert.equal(seen.get(region), exact, `${mode}: регион ${region}`);
    }
  }

  // Без дробных объёмов эта проверка не отличила бы точную сумму от округлённой.
  map.setMode('all');
  const fractional = [...setsByRegion(legs, 'warmup')].some(([, v]) => !Number.isInteger(v));
  assert.ok(fractional, 'в разминке обязаны быть дробные объёмы — иначе проверка слепа к округлению');
});

// Единственное округление в проекте живёт теперь здесь — в подготовке данных
// для библиотеки, — и у него две границы, каждая со своей ловушкой.
test('дробный объём региона округляется до целого: 0.5 красится, 1.5 даёт второй оттенок', () => {
  // Нижняя граница: 0.5 за один круг. Ловушка в том, что цветом её не
  // проверить — библиотека считает `frequency || 1`, поэтому и честный
  // Math.round(0.5)=1, и ошибочный ноль дали бы один и тот же первый оттенок.
  // Что проверяет цвет на самом деле: что запись вообще дошла до библиотеки, а
  // регион не выпал из данных и не остался цветом фона.
  // Вторая граница, 1.5 → 2, отличает round от floor: floor дал бы первый
  // оттенок вместо второго.
  const workout = {
    blocks: [
      { rounds: 1, items: [{ kind: 'strength', load: { chest: 0.5 }, name: 'Половина подхода', key: 'a' }] },
      { rounds: 3, items: [{ kind: 'strength', load: { biceps: 0.5 }, name: 'Полтора подхода', key: 'b' }] },
    ],
  };
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });

  const chest = findByRegion([a, b], picks, 'chest');
  assert.ok(chest, 'регион chest должен быть кликабелен');
  assert.equal(picks[0].sets, 0.5, 'в подборе — точный объём, без округления');
  assert.equal(chest.style.fill, hexToRgb(PALETTE[0]), 'пол-подхода — это первый оттенок, а не цвет фона');

  const biceps = findByRegion([a, b], picks, 'biceps');
  assert.ok(biceps, 'регион biceps должен быть кликабелен');
  assert.equal(picks[0].sets, 1.5);
  assert.equal(biceps.style.fill, hexToRgb(PALETTE[1]), '1.5 подхода округляется вверх, до второго оттенка');
});

// Тест утверждает ЦВЕТ полигонов заднего вида, и это принципиально. Первая его
// версия сверяла число из подбора и была беззубой: число приходит из summary в
// замыкании, оно обновляется в setMode до цикла по видам, поэтому клик по
// НЕ перерисованному полигону всё равно отдавал верное число. Мутация
// «обновлять только views[0]» оставляла все 310 тестов зелёными, хотя весь
// задний силуэт оставался в цветах прежнего режима — задняя дельта серая при
// трёх подходах. Цвет живёт только в отрисованном полигоне, подделать его
// нечем.
test('смена режима перерисовывает и задний вид, а не только передний', () => {
  const { a, b } = hosts();
  const picks = [];
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });

  // Обе области живут на заднем виде, и обе меняют оттенок вместе с режимом.
  // Задняя дельта: силовой нагрузки нет вовсе (разведение резинки — разминка),
  // поэтому цвет фона мышц; во всей нагрузке 3 подхода — третий оттенок.
  // '#cdd8e5' — значение IDLE_COLOR в bodymap.js, наружу оно не экспортировано.
  // Верх спины: 5 подходов в силовом — пятый оттенок; 5.5 во всей нагрузке, и
  // это последний оттенок, потому что цвет берётся от округлённого числа.
  // Заодно это опора для подписи под картой: «самый тёмный — 6 и больше, то
  // есть уже с 5,5» (см. test/bodymap-section.test.js).
  assert.equal(findByRegion([b], picks, 'back-deltoids').style.fill, hexToRgb('#cdd8e5'));
  assert.equal(findByRegion([b], picks, 'upper-back').style.fill, hexToRgb(PALETTE[4]));

  map.setMode('all');
  assert.equal(findByRegion([b], picks, 'back-deltoids').style.fill, hexToRgb(PALETTE[2]),
    'задний вид остался в цветах силового режима: задняя дельта серая при трёх подходах');
  assert.equal(findByRegion([b], picks, 'upper-back').style.fill, hexToRgb(PALETTE[PALETTE_STEPS - 1]),
    '5.5 подхода округляется до шести, то есть до последнего оттенка');
});

test('смена режима перерисовывает те же виды, а не добавляет вторые', () => {
  // Перерисовка через destroy()/createBodyMap() выглядела бы так же на одном
  // переключении, но силуэт пересоздавался бы целиком; а вставка второго вида
  // рядом с первым — это ровно то, что библиотека делает при повторном
  // createBodyHighlighter в тот же контейнер (см. тест про повторное раскрытие
  // в test/bodymap-section.test.js).
  const { a, b } = hosts();
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b });
  map.setMode('all');
  map.setMode('strength');
  assert.equal(a.querySelectorAll('svg').length, 1);
  assert.equal(b.querySelectorAll('svg').length, 1);
});
