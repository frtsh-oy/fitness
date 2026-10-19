// Тестовая библиотека для генератора (builder/generator.js): записи той же формы,
// что у exercises/library.js, но с заглушками вместо текстов и с разметкой,
// придуманной под проверку, а не снятой с настоящих упражнений. Нынешняя
// библиотека для проверки условий не годится: у неё нет упражнений на шесть
// основных групп, и генератор честно отказывает на любом уровне.
//
// Библиотека обязана быть богатой. На одних односуставных упражнениях 17
// основных групп плюс две зоны упора требуют 19 упражнений (по одному на группу
// и второе на каждую группу упора) — а потолок 18. Тест «обязательные условия
// выполнены» падал бы тогда не из-за кода, а из-за бедной библиотеки; поэтому
// здесь шесть многосуставных упражнений, каждое двойником: одно закрывает
// несколько групп разом, а двойник даёт «второе упражнение на ту же группу».
//
// Разминка, разогрев и завершение целят только неосновные группы (предплечья,
// трапеции, сгибатели бедра): тогда `withoutTargets` и `onlyOneFor`, убирая
// упражнения на основную группу, не задевают скелет тренировки.
import { CORE_GROUPS } from '../../builder/rules.js';
import { MUSCLES } from '../../muscles.js';

function deepFreeze(value) {
  for (const inner of Object.values(value)) {
    if (typeof inner === 'object' && inner !== null) deepFreeze(inner);
  }
  return Object.freeze(value);
}

const stub = (key, slot, name, extra) => ({
  key, slot, name, muscles: 'Заглушка', reps: '8–10 раз', text: 'Текст-заглушка.',
  gear: ['none'], unilateral: false, kind: slot === 'strength' ? 'strength' : slot === 'cooldown' ? 'cooldown' : 'warmup',
  ...extra,
});

const NON_CORE = ['forearms', 'traps', 'hip_flexors'];
const loadOf = index => ({ [NON_CORE[index % NON_CORE.length]]: 1 });

const WARMUP = [1, 2, 3].map(n => stub(`warm-${n}`, 'warmup', `Разминка ${n}`, { load: loadOf(n), pattern: 'mobility' }));
const CIRCUIT = [1, 2, 3, 4, 5].map(n => stub(`circ-${n}`, 'circuit', `Разогрев ${n}`, { load: loadOf(n), pattern: 'mobility' }));
const STRETCHES = [1, 2, 3].map(n => stub(`stretch-${n}`, 'cooldown', `Растяжка ${n}`, { load: loadOf(n), pattern: 'stretch' }));
// Единственная запись с пустым load: pattern recovery это разрешает (schema.js).
const BREATHING = stub('breathing', 'cooldown', 'Дыхание', { load: {}, pattern: 'recovery' });

// Многосуставные базовые упражнения. У двойников `-a` и `-b` одна разметка:
// это не копия ради копии, а «второе упражнение на ту же группу».
const COMPOUNDS = [
  ['squat', { quads: 1, glutes: 1, hamstrings: 0.5 }, 'squat', false],
  ['hinge', { hamstrings: 1, glutes: 1, lower_back: 1 }, 'hinge', false],
  ['lunge', { quads: 1, adductors: 1, glutes_med: 1 }, 'lunge', true],
  ['row', { lats: 1, upper_back: 1, delts_rear: 1, biceps: 0.5 }, 'pull', false],
  ['press', { chest: 1, triceps: 1, delts_front: 1 }, 'push', false],
  ['overhead', { delts_side: 1, delts_front: 1, triceps: 1 }, 'push', false],
].flatMap(([id, load, pattern, unilateral]) => ['a', 'b'].map(twin => stub(`${id}-${twin}`, 'strength', `Многосуставное ${id} ${twin}`, {
  load: { ...load }, pattern, unilateral, difficulty: 'basic', compound: true,
})));

const CRUNCH = ['a', 'b'].map(twin => stub(`crunch-${twin}`, 'strength', `Скручивание ${twin}`, {
  load: { abs: 1, obliques: 1 }, pattern: 'core', difficulty: 'basic', compound: false,
}));

// По четыре односуставных на каждую основную группу: два базовых, среднее и
// сложное — чтобы пулы трёх уровней различались. У `-1` через группу
// одностороннее: так в одной библиотеке есть и двусторонние, и односторонние
// (один даёт подход за круг, другой — два).
const SINGLES = CORE_GROUPS.flatMap((group, index) => {
  const id = group.replaceAll('_', '-');
  return [1, 2, 3, 4].map(n => stub(`${id}-${n}`, 'strength', `Односуставное «${MUSCLES[group].ru}» ${n}`, {
    load: { [group]: 1 }, pattern: 'isolation', unilateral: n === 1 && index % 2 === 0,
    difficulty: n < 3 ? 'basic' : n === 3 ? 'medium' : 'hard', compound: false,
  }));
});

export const TEST_LIBRARY = deepFreeze([
  ...WARMUP, ...CIRCUIT, ...COMPOUNDS, ...CRUNCH, ...SINGLES, ...STRETCHES, BREATHING,
]);

const targets = (entry, group) => entry.load[group] === 1;

// Копия без упражнений, где одна из этих групп целевая.
export function withoutTargets(groups) {
  return TEST_LIBRARY.filter(entry => !groups.some(group => targets(entry, group)));
}

// Запись с правками, тоже заморожена глубоко: тест, который строит свои записи
// из фикстуры, не должен получить изменяемые копии (изменяемую копию можно
// случайно поправить, и поправка переживёт тест).
export function variant(entry, changes) {
  return deepFreeze({ ...entry, ...changes });
}

// Только односуставные `-1`…`-4`, все двусторонние: самая бедная библиотека, в
// которой всё же есть упражнение на каждую группу.
export function singlesOnly() {
  return SINGLES.map(entry => variant(entry, { unilateral: false }));
}

// Копия, где на эту группу целевое ровно одно упражнение — `${id}-1`. Для зоны
// упора этого мало: нужно ещё одно, иначе до десяти подходов не дотянуть.
export function onlyOneFor(group) {
  const only = `${group.replaceAll('_', '-')}-1`;
  return TEST_LIBRARY.filter(entry => entry.key === only || !targets(entry, group));
}
