// Слой между расчётом объёма и чужой библиотекой. Не знает ни про конкретную
// тренировку, ни про разметку страницы: получает объект тренировки и два
// контейнера.
import createBodyHighlighter, { ModelType } from './vendor/body-highlighter.esm.js';
import { exerciseEntries, setsByGroup, PALETTE_STEPS } from './volume.js';
import { MUSCLES, regionLabel } from './muscles.js';

// Шесть оттенков от бледного к насыщенному. Библиотека выбирает цвет как
// PALETTE[min(len-1, подходы-1)], поэтому порядок здесь и есть шкала.
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

export function warmupOnlyGroups(workout) {
  const strength = setsByGroup(workout, 'strength');
  const soft = new Map([...setsByGroup(workout, 'warmup'), ...setsByGroup(workout, 'cooldown')]);
  return [...soft.keys()].filter(group => !strength.has(group));
}

export function idleGroups(workout) {
  const touched = new Set();
  for (const kind of ['strength', 'warmup', 'cooldown']) {
    for (const group of setsByGroup(workout, kind).keys()) touched.add(group);
  }
  return Object.keys(MUSCLES).filter(group => !touched.has(group));
}

export function createBodyMap({ workout, anteriorHost, posteriorHost, onPick }) {
  const data = exerciseEntries(workout, 'strength');

  const handle = ({ muscle, data: stats }) => {
    if (!onPick || !KNOWN_REGIONS.has(muscle)) return;
    // Наружу отдаём русское название, а не идентификатор региона: вызывающий
    // код показывает это человеку, и «gluteal» его только запутает.
    onPick({
      region: muscle,
      label: regionLabel(muscle),
      sets: stats?.frequency ?? 0,
      exercises: stats?.exercises ?? [],
    });
  };

  const common = {
    data,
    bodyColor: IDLE_COLOR,
    highlightedColors: PALETTE.slice(0, PALETTE_STEPS),
    onClick: handle,
    style: { width: '100%' },
  };

  const views = [
    createBodyHighlighter({ ...common, container: anteriorHost, type: ModelType.ANTERIOR }),
    createBodyHighlighter({ ...common, container: posteriorHost, type: ModelType.POSTERIOR }),
  ];

  let alive = true;
  return {
    destroy() {
      if (!alive) return;          // повторный вызов не должен бросать
      alive = false;
      for (const view of views) view.destroy();
    },
  };
}
