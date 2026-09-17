// Слой между расчётом объёма и чужой библиотекой. Не знает ни про конкретную
// тренировку, ни про разметку страницы: получает объект тренировки и два
// контейнера.
import createBodyHighlighter, { ModelType } from './vendor/body-highlighter.esm.js';
import { exerciseEntries, setsByGroup } from './volume.js';
import { MUSCLES, regionLabel } from './muscles.js';

// Шесть оттенков от бледного к насыщенному. Библиотека выбирает цвет как
// PALETTE[min(len-1, подходы-1)], поэтому порядок здесь и есть шкала.
// Длина обязана равняться PALETTE_STEPS из volume.js — это держит тест
// «палитра ровно на число уровней объёма», а не срез при передаче в
// библиотеку: если бы длины разошлись, тест уже упал бы раньше, чем срез
// успел бы что-то скрыть.
export const PALETTE = ['#eaf6cb', '#ddf0a8', '#d2ec86', '#c6e765', '#a9d248', '#8ab82f'];

// Мышцы без силовой нагрузки: заметно светлее фона секции, но не белые —
// они есть на схеме, просто не работают.
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
  const dataForMode = next => exerciseEntries(workout, kindsOfMode(next));
  const data = dataForMode(mode);

  const handle = ({ muscle, data: stats }) => {
    if (!onPick || !KNOWN_REGIONS.has(muscle)) return;
    // Наружу отдаём русское название, а не идентификатор региона: вызывающий
    // код показывает это человеку, и «gluteal» его только запутает.
    // stats — без ?./??: аккумулятор библиотеки строится по полному списку
    // её 22 канонических типов (включая те, что вне KNOWN_REGIONS), muscle
    // всегда один из них, значит stats определён для любого клика по телу.
    // Это свойство читается в самой библиотеке, а не проверяется кликами:
    // затравка аккумулятора (vendor/body-highlighter.esm.js:266-288)
    // перечисляет все 22 типа со значением { exercises: [], frequency: 0 },
    // а reduce внутри I (там же, 349-355) копирует затравку заново на каждую
    // перерисовку. Кликами это и не проверить: в литерале ниже
    // label: regionLabel(muscle) вычисляется раньше sets: stats.frequency,
    // поэтому на чужой анатомии первым бросает regionLabel и до stats
    // выполнение не доходит.
    onPick({
      region: muscle,
      label: regionLabel(muscle),
      sets: stats.frequency,
      exercises: stats.exercises,
    });
  };

  const common = {
    data,
    bodyColor: IDLE_COLOR,
    highlightedColors: PALETTE,
    onClick: handle,
    style: { width: '100%' },
  };

  const views = [
    createBodyHighlighter({ ...common, container: anteriorHost, type: ModelType.ANTERIOR }),
    createBodyHighlighter({ ...common, container: posteriorHost, type: ModelType.POSTERIOR }),
  ];

  return {
    // Смена режима — это update() библиотеки, а не «уничтожить и создать
    // заново»: update перестраивает полигоны внутри того же svg и того же
    // узла-обёртки (vendor/body-highlighter.esm.js: n() заменяет детей, а l()
    // вставляет обёртку, только если её ещё нет в контейнере). Пара
    // destroy()/createBodyMap() дала бы тот же экран, но силуэт при каждом
    // переключении пересоздавался бы целиком.
    setMode(next) {
      const nextData = dataForMode(next);
      for (const view of views) view.update({ data: nextData });
    },
    // Повторный вызов не бросает — это гарантирует destroy() самой библиотеки
    // (пустой список детей и уже отсоединённый узел — оба no-op), а не флаг
    // на нашей стороне: мутацией показано, что свой флаг здесь ничем не
    // отличался бы от его отсутствия. См. тест в test/bodymap.test.js.
    destroy() {
      for (const view of views) view.destroy();
    },
  };
}
