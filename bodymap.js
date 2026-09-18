// Слой между расчётом объёма и чужой библиотекой. Не знает ни про конкретную
// тренировку, ни про разметку страницы: получает объект тренировки и два
// контейнера.
import createBodyHighlighter, { ModelType } from './vendor/body-highlighter.esm.js';
import { regionSummary, setsByGroup } from './volume.js';
import { MUSCLES, regionLabel } from './muscles.js';
import { decorate, VIEW_BOX } from './figure.js';

// Шесть оттенков от бледного к насыщенному. Библиотека выбирает цвет как
// LIBRARY_COLORS[min(len-1, частота-1)], поэтому порядок здесь и есть шкала.
// Длина обязана равняться PALETTE_STEPS из volume.js — это держит тест
// «палитра ровно на число уровней объёма».
export const PALETTE = ['#eaf6cb', '#ddf0a8', '#d2ec86', '#c6e765', '#a9d248', '#8ab82f'];

// Цвет выбранной области — брендовый синий страницы. Выбор именно заливается, а
// не обводится: на экране 375px обводка почти не видна.
export const SELECTED_COLOR = '#193d6a';

// Что уходит в библиотеку: шкала объёма плюс синий выбора седьмым цветом.
// Красит она сама, полигоны нам не адресуемы (какой из них какая мышца, из
// разметки не видно, data-* она не ставит) — поэтому цвет выбора задаётся
// через ту же палитру и частоту, а не правкой style.fill у полигона.
const LIBRARY_COLORS = [...PALETTE, SELECTED_COLOR];

// Частота, по которой библиотека берёт последний цвет палитры: она красит
// область как LIBRARY_COLORS[min(len-1, frequency-1)] (b() в
// vendor/body-highlighter.esm.js), значит седьмой цвет достаётся частоте 7.
const SELECTED_FREQUENCY = LIBRARY_COLORS.length;

// Мышцы без нагрузки в выбранном режиме: заметно светлее фона секции, но не
// белые — они есть на схеме, просто не работают.
const IDLE_COLOR = '#cdd8e5';

// Библиотека рисует целиком весь силуэт своей анатомии — включая шею, голову,
// колени и обе половины камбаловидной, — а не только наши 17 регионов. Ни одна
// наша группа туда не ведёт, regionLabel на них бросает (это её контракт, не
// баг), а кликабельны они наравне со всеми: клик по шее или колену на карте —
// обычное попадание пальцем, а не край случая. Проверяем регион до вызова
// regionLabel, а не оборачиваем клик в try/catch: так неотслеживаемый регион
// просто не долетает до onPick, а не долетает туда же следом за пойманной
// ошибкой.
const KNOWN_REGIONS = new Set(Object.values(MUSCLES).map(m => m.region));

// Два режима карты и типы упражнений, которые каждый считает. Ключи уходят
// наружу как есть: app.js кладёт их в localStorage и в data-mode кнопок, —
// поэтому список режимов живёт здесь, рядом с картой, а не дублируется в
// разметке страницы.
export const MODE_KINDS = {
  strength: ['strength'],
  all: ['warmup', 'strength', 'cooldown'],
};

// Режим по умолчанию: карта показывает силовые подходы, как и до появления
// переключателя.
export const DEFAULT_MODE = 'strength';

// Для вызывающего кода, который берёт режим из ненадёжного источника
// (localStorage переживает и смену версии приложения, и правку руками).
export function isMode(mode) {
  return Object.hasOwn(MODE_KINDS, mode);
}

function kindsOfMode(mode) {
  // Молча отдать пустой набор типов было бы хуже всего: карта нарисовалась бы
  // целиком бледной, будто тренировка ничего не нагружает. Как и в muscles.js,
  // неизвестное значение — повод упасть.
  if (!isMode(mode)) throw new Error(`Неизвестный режим карты: ${mode}`);
  return MODE_KINDS[mode];
}

export function warmupOnlyGroups(workout) {
  const strength = setsByGroup(workout, 'strength');
  // Явно Set ключей, а не new Map([...a, ...b]): нас интересует только
  // «встречалась ли группа», а слияние двух Map через spread не суммирует
  // объёмы при совпадении ключа — оно их перезаписывает (заминка молча
  // затёрла бы значение разминки). Пока читаются только ключи, это неважно,
  // но выражение через Map выглядело бы как сложение объёмов, которого нет.
  const soft = new Set([...setsByGroup(workout, 'warmup').keys(), ...setsByGroup(workout, 'cooldown').keys()]);
  return [...soft].filter(group => !strength.has(group));
}

// Группы, которых нет ни в одном упражнении любого типа. От режима карты этот
// список не зависит — он и есть «ни в одном типе», то есть объединение обоих
// режимов, — поэтому берёт типы режима «вся нагрузка».
export function idleGroups(workout) {
  const touched = new Set();
  for (const kind of MODE_KINDS.all) {
    for (const group of setsByGroup(workout, kind).keys()) touched.add(group);
  }
  return Object.keys(MUSCLES).filter(group => !touched.has(group));
}

export function createBodyMap({ workout, anteriorHost, posteriorHost, onPick, mode = DEFAULT_MODE }) {
  // Сводка выбранного режима — наш единственный источник чисел и списков.
  // Меняется при setMode, поэтому let: обработчик клика держит на неё ссылку
  // и после перерисовки обязан отвечать по новому режиму.
  let summary = regionSummary(workout, kindsOfMode(mode));

  // Библиотеке отдаём по одной записи на регион, и её дело — полигоны и цвет,
  // а не арифметика. Своё число она считает как сумму frequency всех записей
  // региона, поэтому запись должна быть одна и уже с итогом.
  //
  // Округляем здесь, а не в volume.js: целая частота нужна библиотеке (цвет
  // выбирается как LIBRARY_COLORS[min(len-1, frequency-1)]), человеку же
  // показывается точная сумма. И округляем один раз от суммы, а не по каждому
  // упражнению: сумма округлений давала бы библиотеке другое число — у косых 5
  // вместо 4, у икроножных 6 вместо 5.
  //
  // name не передаём: библиотека кладёт его только в свой список упражнений,
  // а подбор мы собираем из summary и этот список больше не читаем.
  //
  // frequency нулём не бывает: в summary попадают только регионы с нагрузкой,
  // наименьший вклад — доля 0.5 (LOAD_VALUES) на один круг, а Math.round(0.5)
  // даёт 1. Это важно: внутри библиотеки стоит `frequency || 1`, и запись с
  // нулём она покрасила бы как один подход.
  //
  // chosen — выбранная кликом область или null. Ей ставится частота, за которой
  // в палитре стоит синий; остальным частота ограничивается длиной шкалы
  // объёма, иначе синий достался бы и им: у квадрицепсов в режиме всей нагрузки
  // 12.5 подхода, то есть частота 13 и тот же последний индекс палитры.
  // Ограничение верх шкалы не двигает — шесть подходов и так последний оттенок.
  const dataOf = (rows, chosen) => {
    const data = [...rows].map(([region, row]) => ({
      muscles: [region],
      frequency: region === chosen ? SELECTED_FREQUENCY : Math.min(PALETTE.length, Math.round(row.sets)),
    }));
    // Выбранной области может не быть в сводке: предплечья не размечены ни в
    // одном упражнении, у задней дельты нет силовых подходов. Заливать её всё
    // равно надо, поэтому запись для неё добавляется отдельно.
    if (chosen !== null && !rows.has(chosen)) {
      data.push({ muscles: [chosen], frequency: SELECTED_FREQUENCY });
    }
    return data;
  };

  // Область, выбранная последним кликом. Живёт здесь, а не в app.js: это
  // состояние картинки, и красит её библиотека по данным, которые готовим мы.
  let chosen = null;

  const svgOf = view => view.element.querySelector('svg');

  const handle = ({ muscle }) => {
    if (!KNOWN_REGIONS.has(muscle)) return;
    // Заливка выбора — дело самой карты, поэтому она не ждёт onPick: по клику
    // область заливается синим и без слушателя.
    chosen = muscle;
    repaint();
    // Регион без нагрузки в этом режиме в summary отсутствует — по клику это
    // обычный случай (предплечья, а в силовом режиме и задняя дельта), а не
    // край: ноль подходов и пустой список.
    const row = summary.get(muscle) ?? { sets: 0, exercises: [] };
    // Наружу отдаём русское название, а не идентификатор региона: вызывающий
    // код показывает это человеку, и «gluteal» его только запутает.
    onPick?.({
      region: muscle,
      label: regionLabel(muscle),
      sets: row.sets,
      exercises: row.exercises,
    });
  };

  const common = {
    data: dataOf(summary, chosen),
    bodyColor: IDLE_COLOR,
    highlightedColors: LIBRARY_COLORS,
    onClick: handle,
    style: { width: '100%' },
  };

  const views = [
    { type: ModelType.ANTERIOR, view: createBodyHighlighter({ ...common, container: anteriorHost, type: ModelType.ANTERIOR }) },
    { type: ModelType.POSTERIOR, view: createBodyHighlighter({ ...common, container: posteriorHost, type: ModelType.POSTERIOR }) },
  ];

  // Бокс поднимаем один раз на вид: update() библиотеки переставляет только
  // детей своего svg и его атрибут style (n() и C() в
  // vendor/body-highlighter.esm.js), а viewBox она ставит при создании и
  // больше не трогает. Повторная установка после каждой отрисовки была бы
  // мёртвой — это показано мутацией, и потому её здесь нет; что бокс остаётся
  // поднятым после смены режима, сторожит тест.
  for (const { type, view } of views) {
    svgOf(view).setAttribute('viewBox', VIEW_BOX);
    decorate(svgOf(view), { type, fill: IDLE_COLOR });
  }

  // Отрисовка библиотекой плюс возврат дорисованного. Порядок обязателен:
  // update() сносит детей svg целиком, вместе со стопами, кистями и головой, —
  // поэтому decorate идёт ПОСЛЕ него, а не до.
  function repaint() {
    const data = dataOf(summary, chosen);
    for (const { type, view } of views) {
      view.update({ data });
      decorate(svgOf(view), { type, fill: IDLE_COLOR });
    }
  }

  return {
    // Смена режима — это update() библиотеки, а не «уничтожить и создать
    // заново»: update перестраивает полигоны внутри того же svg и того же
    // узла-обёртки (vendor/body-highlighter.esm.js: n() заменяет детей, а l()
    // вставляет обёртку, только если её ещё нет в контейнере). Пара
    // destroy()/createBodyMap() дала бы тот же экран, но силуэт при каждом
    // переключении пересоздавался бы целиком.
    setMode(next) {
      summary = regionSummary(workout, kindsOfMode(next));
      // Выбор снимаем: в новом режиме у области другое число подходов и другой
      // список упражнений, поэтому подбор под картой app.js тоже убирает.
      // Залитая синим область осталась бы на экране без ответа на вопрос,
      // который человек уже не задавал.
      chosen = null;
      repaint();
    },
    // Повторный вызов не бросает — это гарантирует destroy() самой библиотеки
    // (пустой список детей и уже отсоединённый узел — оба no-op), а не флаг
    // на нашей стороне: мутацией показано, что свой флаг здесь ничем не
    // отличался бы от его отсутствия. См. тест в test/bodymap.test.js.
    destroy() {
      for (const { view } of views) view.destroy();
    },
  };
}
