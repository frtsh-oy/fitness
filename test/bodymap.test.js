import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { createBodyMap, PALETTE, SELECTED_COLOR, warmupOnlyGroups, idleGroups, isMode, MODE_KINDS } from '../bodymap.js';
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
//
// Отдаём не узел, а цвет, снятый ДО клика. Клик выбирает область, а карта сразу
// заливает выбранную синим и заменяет все полигоны новыми, — значит по
// найденному узлу цвет невыбранной области уже не прочитать: он отсоединён от
// документа и остался с прежним style.fill. Прежний он именно потому, что
// querySelectorAll отдаёт снимок: все полигоны перебора — из той отрисовки,
// которая была на экране до первого клика по этому виду. Цвет выбранной
// области проверяется отдельно, по живой разметке (blueCount ниже).
function findByRegion(hosts, picks, region) {
  for (const host of hosts) {
    const win = host.ownerDocument.defaultView;
    for (const polygon of host.querySelectorAll('polygon')) {
      const fill = polygon.style.fill;
      picks.length = 0;
      polygon.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
      if (picks[0]?.region === region) return { fill };
    }
  }
  return null;
}

// Сколько полигонов вида залито цветом выбора прямо сейчас.
function blueCount(host) {
  return [...host.querySelectorAll('polygon')]
    .filter(polygon => polygon.style.fill === hexToRgb(SELECTED_COLOR)).length;
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

test('незадействованные группы перечислены отдельно: у legs-mwf таких больше нет', () => {
  // Икроножные с Task 7 размечены вспомогательными в четырёх упражнениях,
  // предплечья с Task 11 — хватом резинки в семи (см. docs/muscle-map.md).
  // Список неразмеченных групп для этой тренировки опустел: все 19 групп
  // словаря встречаются хотя бы в одном load. Что функция при этом остаётся
  // рабочей, а не превращается в вечную константу [], проверяет тест на
  // синтетической тренировке в test/bodymap-section.test.js («списки групп в
  // подписи — из разметки открытой тренировки»): там idleGroups(fixture)
  // непуст.
  assert.deepEqual(idleGroups(legs).sort(), []);
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
  // И заливка выбора появляется: она состояние самой картинки, а не ответ
  // слушателю, поэтому от onPick не зависит. Первый полигон переднего вида —
  // грудные (см. комментарий к тесту выше), их там два, а на заднем виде этой
  // области нет вовсе. Без этой проверки условие в handle можно было бы
  // вернуть к прежнему виду (`!onPick || !KNOWN_REGIONS.has(muscle)`), и ни
  // один тест бы не заметил — проверено мутацией.
  assert.equal(blueCount(a), 2, 'клик без onPick обязан залить выбранную область');
  assert.equal(blueCount(b), 0, 'грудных на заднем виде нет — заливать там нечего');
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
  assert.equal(target.fill, hexToRgb(PALETTE[PALETTE_STEPS - 1]), 'на верхней границе объёма должен быть последний оттенок палитры');
});

test('клик по незадействованной мышце даёт пустой результат и цвет фона мышц', () => {
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  // back-deltoids (задняя дельта) — единственный регион без силового объёма в
  // legs-mwf по умолчанию (силовой режим): её единственное упражнение,
  // «Разведение резинки над головой», разминочное. С Task 11 это последний
  // оставшийся пример региона, отсутствующего в сводке режима, — предплечья
  // получили хват резинки и своего региона больше не освобождают ни в одном
  // режиме (idleGroups(legs) пуст). Ищем по обоим видам стилистически, как и
  // раньше, хотя сам регион рисуется только сзади.
  const target = findByRegion([a, b], picks, 'back-deltoids');
  assert.ok(target, 'регион back-deltoids должен быть кликабелен хотя бы на одном виде');
  assert.equal(picks[0].sets, 0);
  assert.deepEqual(picks[0].exercises, []);
  // '#cdd8e5' — значение IDLE_COLOR в bodymap.js; наружу константа не экспортирована.
  assert.equal(target.fill, hexToRgb('#cdd8e5'), 'незадействованная в этом режиме мышца должна быть в цвете фона мышц');
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
  assert.equal(findByRegion([a], picks, 'calves').fill, hexToRgb(PALETTE[1]));
  map.setMode('all');
  assert.equal(findByRegion([a], picks, 'calves').fill, hexToRgb(PALETTE[4]));
  map.setMode('strength');
  assert.equal(findByRegion([a], picks, 'calves').fill, hexToRgb(PALETTE[1]),
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
  assert.equal(chest.fill, hexToRgb(PALETTE[0]), 'пол-подхода — это первый оттенок, а не цвет фона');

  const biceps = findByRegion([a, b], picks, 'biceps');
  assert.ok(biceps, 'регион biceps должен быть кликабелен');
  assert.equal(picks[0].sets, 1.5);
  assert.equal(biceps.fill, hexToRgb(PALETTE[1]), '1.5 подхода округляется вверх, до второго оттенка');
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
  // Заодно это опора для объяснения шкалы в README: «самый тёмный означает
  // шесть и больше, то есть уже с 5,5». Подписью под картой этот текст был
  // раньше, с экрана его убрали по просьбе владельца программы, и
  // test/bodymap-section.test.js теперь прямо запрещает ему там появиться.
  assert.equal(findByRegion([b], picks, 'back-deltoids').fill, hexToRgb('#cdd8e5'));
  assert.equal(findByRegion([b], picks, 'upper-back').fill, hexToRgb(PALETTE[4]));

  map.setMode('all');
  assert.equal(findByRegion([b], picks, 'back-deltoids').fill, hexToRgb(PALETTE[2]),
    'задний вид остался в цветах силового режима: задняя дельта серая при трёх подходах');
  assert.equal(findByRegion([b], picks, 'upper-back').fill, hexToRgb(PALETTE[PALETTE_STEPS - 1]),
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

// Ниже — заливка выбора и дорисованная фигура (Task 10).
//
// Выбранную область заливаем, а не обводим: на экране 375px обводка почти не
// видна. Сделано седьмым цветом палитры, который библиотека берёт по частоте 7,
// потому что правкой style.fill у полигонов было бы нельзя — какой полигон
// какая мышца, из разметки не видно, data-* библиотека не ставит.

// Столько полигонов библиотека рисует на каждый вид: 33 спереди и 33 сзади
// (замерено по её моделям). Дорисованное их не подменяет, а добавляется.
const LIBRARY_POLYGONS = 33;

// Те же координаты, что в test/figure.test.js, — здесь они нужны, чтобы
// отличить «дорисованное вернулось» от «в разметке появились четыре
// каких-нибудь полигона».
const EXTRAS = {
  anterior: [
    '20.8,195.5 26.9,195.5 28.4,202.5 26.8,208.8 19.4,208.8 17.8,202.5',
    '79.2,195.5 72.7,195.5 71.2,202.5 72.8,208.8 80.2,208.8 81.8,202.5',
    '0.4,98.9 6.6,102.1 5.0,107.5 0.3,113.5 -5.3,110.5 -3.5,103.5',
    '99.6,98.9 93.4,102.1 95.0,107.5 99.7,113.5 105.3,110.5 103.5,103.5',
  ],
  posterior: [
    '27.5,213 33.5,213 34.5,222 33.0,230.5 27.8,230.5 26.3,222',
    '72.5,213 66.5,213 65.5,222 67.0,230.5 72.2,230.5 73.7,222',
    '0.4,106.4 6.6,109.6 5.0,115.0 0.3,121.0 -5.3,118.0 -3.5,111.0',
    '99.6,106.4 93.4,109.6 95.0,115.0 99.7,121.0 105.3,118.0 103.5,111.0',
  ],
};

// Границы всего нарисованного в виде, в единицах бокса и уже со сдвигом
// группы, — то есть то, что видно на экране, а не то, что записано в
// координатах фигур.
function drawnBounds(host) {
  const layer = host.querySelector('svg > g');
  const shift = Number(layer.getAttribute('transform').match(/^translate\(0,(-?[\d.]+)\)$/)[1]);
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const add = (x, y) => {
    box.minX = Math.min(box.minX, x);
    box.maxX = Math.max(box.maxX, x);
    box.minY = Math.min(box.minY, y + shift);
    box.maxY = Math.max(box.maxY, y + shift);
  };
  for (const polygon of layer.querySelectorAll('polygon')) {
    const flat = polygon.getAttribute('points').trim().split(/[\s,]+/).map(Number);
    for (let i = 0; i < flat.length; i += 2) add(flat[i], flat[i + 1]);
  }
  for (const ellipse of layer.querySelectorAll('ellipse')) {
    const num = name => Number(ellipse.getAttribute(name));
    add(num('cx') - num('rx'), num('cy') - num('ry'));
    add(num('cx') + num('rx'), num('cy') + num('ry'));
  }
  return box;
}

test('выбранная область заливается синим — на всех своих полигонах и на обоих видах', () => {
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  assert.equal(blueCount(a) + blueCount(b), 0, 'до клика выбранной области нет');

  // Икроножные библиотека рисует и спереди, и сзади, по четыре полигона на вид:
  // заливка обязана появиться на обеих схемах целиком, а не на одном полигоне.
  assert.ok(findByRegion([a], picks, 'calves'), 'регион calves должен быть кликабелен');
  assert.equal(picks[0].region, 'calves');
  assert.equal(blueCount(a), 4, 'на переднем виде залиты не все полигоны икроножных');
  assert.equal(blueCount(b), 4, 'задний вид не залился вовсе');
});

test('выбранная область без нагрузки в этом режиме тоже заливается', () => {
  // back-deltoids — единственный регион без силового объёма в legs-mwf по
  // умолчанию (см. предыдущий тест), поэтому его нет в сводке силового режима.
  // Записи для библиотеки на него не находится, и без отдельной её добавки
  // выбранная задняя дельта осталась бы серой: клик по ней показывал бы
  // подбор с нулём подходов, а на карте не было бы видно, куда человек попал.
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  assert.ok(findByRegion([a, b], picks, 'back-deltoids'), 'регион back-deltoids должен быть кликабелен');
  assert.equal(picks[0].sets, 0, 'проверка опирается на регион без нагрузки в этом режиме');
  // Регион рисуется только на заднем виде (два полигона) — на переднем его
  // не существует вовсе, заливать там нечего.
  assert.equal(blueCount(a), 0, 'на переднем виде задней дельты нет');
  assert.equal(blueCount(b), 2, 'задняя дельта заднего вида не залилась');
});

test('объём выше шкалы красится последним оттенком, а не цветом выбора', () => {
  // Библиотека берёт цвет как LIBRARY_COLORS[min(len-1, частота-1)], а в
  // палитре теперь семь цветов — значит без ограничения частоты шестёркой
  // любая область с семью и больше подходами получила бы индекс 6, то есть
  // синий, и выглядела бы выбранной. У квадрицепсов в режиме всей нагрузки
  // 12.5 подхода.
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p), mode: 'all' });
  assert.equal(blueCount(a) + blueCount(b), 0, 'до первого клика синей области быть не может');

  const quads = findByRegion([a], picks, 'quadriceps');
  assert.ok(quads, 'регион quadriceps должен быть кликабелен на переднем виде');
  assert.equal(picks[0].sets, 12.5, 'проверка опирается на объём выше шкалы палитры');
  assert.equal(quads.fill, hexToRgb(PALETTE[PALETTE_STEPS - 1]),
    'объём выше шкалы обязан остаться последним оттенком объёма, а не стать цветом выбора');
});

test('смена режима снимает выбор', () => {
  // Подбор под картой app.js при смене режима убирает: в новом режиме у области
  // и число подходов, и список упражнений другие. Залитая синим область без
  // подбора осталась бы ответом на вопрос, которого уже нет на экране.
  const { a, b } = hosts();
  const picks = [];
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  assert.ok(findByRegion([a], picks, 'calves'), 'регион calves должен быть кликабелен');
  assert.equal(blueCount(a) + blueCount(b), 8, 'выбор не залился — проверять снятие нечего');
  map.setMode('all');
  assert.equal(blueCount(a) + blueCount(b), 0, 'после смены режима залитая область осталась');
});

// Главная опасность этой правки: библиотека при каждой отрисовке заменяет
// содержимое своей схемы целиком (S(i, g) в vendor/body-highlighter.esm.js),
// поэтому стопы, кисти и голова со спины исчезли бы при первом же переключении
// режима. Тест смотрит в разметку ПОСЛЕ setMode, а не на факт вызова функции:
// мутации «дорисовать только при создании» и «дорисовать до update(), а не
// после» обязаны его ронять.
test('дорисованные стопы, кисти и голова остаются в разметке после смены режима', () => {
  const { a, b } = hosts();
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b });
  const views = [[a, 'anterior'], [b, 'posterior']];

  for (const mode of ['all', 'strength', 'all']) {
    map.setMode(mode);
    for (const [host, type] of views) {
      const svg = host.querySelector('svg');
      const points = [...svg.querySelectorAll('polygon')].map(p => p.getAttribute('points'));
      assert.equal(points.length, LIBRARY_POLYGONS + EXTRAS[type].length,
        `${mode}/${type}: в разметке не столько полигонов, сколько рисуют библиотека и дорисовка вместе`);
      assert.deepEqual(points.slice(-EXTRAS[type].length), EXTRAS[type],
        `${mode}/${type}: после смены режима дорисованных стоп и кистей в разметке нет`);
      assert.equal(svg.querySelectorAll('svg > g').length, 1,
        `${mode}/${type}: группа со сдвигом либо пропала, либо появилась второй`);
    }
    assert.equal(b.querySelectorAll('ellipse').length, 1,
      `${mode}: после смены режима голова со спины снова сплющена — эллипса нет`);
    assert.equal(a.querySelectorAll('ellipse').length, 0,
      `${mode}: голову спереди библиотека рисует сама, дорисовывать её нечем`);
  }
});

test('выбор области не теряет дорисованное', () => {
  // Клик тоже перерисовывает схему библиотекой (заливка выбора идёт через её
  // данные), значит дорисованное надо возвращать и после него.
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });
  assert.ok(findByRegion([a], picks, 'calves'), 'регион calves должен быть кликабелен');
  for (const [host, type] of [[a, 'anterior'], [b, 'posterior']]) {
    const points = [...host.querySelectorAll('polygon')].map(p => p.getAttribute('points'));
    assert.deepEqual(points.slice(-EXTRAS[type].length), EXTRAS[type], `${type}: клик снёс дорисованное`);
  }
  assert.equal(b.querySelectorAll('ellipse').length, 1, 'клик снёс дорисованную голову со спины');
});

test('дорисованное залито тем же серым, которым библиотека красит незатронутую мышцу', () => {
  // Обещание про цвет было единственным незакрытым во всей правке: мутация
  // «передать в decorate #ff0000» оставляла все 359 тестов зелёными, потому что
  // цвет проверялся только в test/figure.test.js — против литерала, который тот
  // же тест и передавал. Режим отказа — человечек с красными стопами.
  // Поэтому здесь оба цвета берутся из живой разметки и сравниваются друг с
  // другом, а не с записанной в тест константой.
  //
  // Нужен регион, гарантированно незатронутый нагрузкой, на ПЕРЕДНЕМ виде —
  // с ним и сравниваются цвета library-полигонов оттуда же. В legs-mwf такого
  // региона с Task 11 больше нет ни при каком режиме карты (idleGroups(legs)
  // пуст, а единственный оставшийся «регион без объёма по умолчанию» —
  // back-deltoids — существует только на заднем виде, см. тесты выше).
  // Поэтому здесь синтетическая тренировка с одной размеченной группой:
  // все остальные, включая предплечья, заведомо не задействованы нигде.
  const workout = {
    blocks: [{ rounds: 1, items: [{ kind: 'strength', load: { chest: 1 }, name: 'Силовое', key: 's' }] }],
  };
  const { a, b } = hosts();
  const picks = [];
  createBodyMap({ workout, anteriorHost: a, posteriorHost: b, onPick: p => picks.push(p) });

  // Всё до единого клика: цвета первой отрисовки, в ней выбранного нет.
  const drawn = [
    ...[...a.querySelectorAll('polygon')].slice(-4),
    ...[...b.querySelectorAll('polygon')].slice(-4),
    ...b.querySelectorAll('ellipse'),
  ].map(shape => shape.style.fill);
  assert.equal(drawn.length, 9, 'дорисовано не девять фигур: четыре стопы, четыре кисти и голова');
  const libraryFills = [...a.querySelectorAll('polygon')].slice(0, -4).map(p => p.style.fill);

  // forearm — один из незатронутых регионов синтетической тренировки выше
  // (размечена только грудь), то есть гарантированно окрашенный цветом фона
  // мышц. Цвет снимаем через findByRegion, потому что он тоже берёт его до
  // клика.
  const idle = findByRegion([a], picks, 'forearm');
  assert.ok(idle, 'регион forearm должен быть кликабелен на переднем виде');
  assert.ok(libraryFills.includes(idle.fill), 'цвет незатронутой мышцы снят не с полигона библиотеки');
  // Иначе проверка была бы слепой: на схеме, залитой одним цветом целиком,
  // совпадение ничего не значило бы.
  assert.ok(libraryFills.some(fill => fill !== idle.fill),
    'на переднем виде нет ни одной окрашенной мышцы — сравнивать не с чем');

  for (const fill of drawn) {
    assert.equal(fill, idle.fill, 'дорисованное залито не цветом незатронутой мышцы');
  }
});

test('бокс отрисовки поднят на обоих видах и остаётся поднятым после смены режима', () => {
  const { a, b } = hosts();
  const map = createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b });
  for (const host of [a, b]) {
    assert.equal(host.querySelector('svg').getAttribute('viewBox'), '-8 0 116 232');
  }
  map.setMode('all');
  for (const host of [a, b]) {
    assert.equal(host.querySelector('svg').getAttribute('viewBox'), '-8 0 116 232',
      'после смены режима бокс вернулся к библиотечному, и низ ноги снова обрезан');
  }
});

test('в бокс влезает вся фигура, включая ту часть, которую библиотека обрезала', () => {
  const { a, b } = hosts();
  createBodyMap({ workout: legs, anteriorHost: a, posteriorHost: b });
  const boxes = {};
  for (const [host, type] of [[a, 'anterior'], [b, 'posterior']]) {
    const svg = host.querySelector('svg');
    const [minX, minY, width, height] = svg.getAttribute('viewBox').split(' ').map(Number);
    const drawn = drawnBounds(host);
    assert.ok(drawn.minX >= minX, `${type}: слева обрезано (${drawn.minX} < ${minX})`);
    assert.ok(drawn.maxX <= minX + width, `${type}: справа обрезано (${drawn.maxX} > ${minX + width})`);
    assert.ok(drawn.minY >= minY, `${type}: сверху обрезано (${drawn.minY} < ${minY})`);
    assert.ok(drawn.maxY <= minY + height, `${type}: снизу обрезано (${drawn.maxY} > ${minY + height})`);
    boxes[type] = drawn;
  }
  // Без этих двух проверка была бы слепой: у библиотечного бокса `0 0 100 200`
  // обрезаны были именно кисти (они уходят за x=0 и x=100) и низ задней ноги
  // (полигоны голени идут до y=220, а сзади дорисована ещё и стопа).
  assert.ok(boxes.anterior.minX < 0 && boxes.anterior.maxX > 100,
    'кисти не выходят за библиотечный бокс — проверять обрезку по бокам нечем');
  assert.ok(boxes.posterior.maxY > 200,
    'задний вид не рисует ниже библиотечного бокса — проверять обрезку снизу нечем');
  // И оба вида стоят на одной высоте: передний вид у библиотеки короче заднего,
  // и без сдвига на двух схемах рядом получались бы люди разного роста.
  const center = box => (box.minY + box.maxY) / 2;
  assert.ok(Math.abs(center(boxes.anterior) - center(boxes.posterior)) < 0.2,
    `середины фигур разошлись: ${center(boxes.anterior)} против ${center(boxes.posterior)}`);
});
