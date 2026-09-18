# Калькулятор недельной нагрузки — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** показать, сколько каждая группа мышц получает подходов за неделю по всем тренировкам реестра, и дать этому оценку от «не тренируется целенаправленно» до «у предела восстановления».

**Architecture:** три слоя, как уже сделано с картой. `weekly.js` считает числа и не знает ни про DOM, ни про оценки. `load-bands.js` держит границы с источником у каждой и отвечает на вопрос «какая это полоса». `weekly-view.js` собирает из чисел, границ и названий разметку экрана. Четвёртый потребитель того же расчёта — раздел в `docs/muscle-map.md`, чтобы перекос был виден при добавлении упражнений.

**Tech Stack:** ES-модули без сборки, `node --test` + jsdom для тестов.

**Spec:** `docs/superpowers/specs/2026-09-18-weekly-load-calculator-design.md`

## Global Constraints

- **Ноль зависимостей в рантайме и никакой сборки.** ES-модули грузятся браузером напрямую; в `package.json` только devDependencies (`jsdom`).
- Кириллица — настоящий UTF-8, без escape-последовательностей.
- Тесты: `node --test` из корня — **именно так, без пути**. `node --test test/` на Node 24 сломан, `node --test=test/` молча проглатывает падения.
- `vendor/body-highlighter.esm.js` не трогать: он привязан контрольной суммой SHA-256 в `test/vendor.test.js`.
- `weekly.js` обязан остаться чистым расчётом: ни DOM, ни библиотеки карты, ни импорта реестра тренировок — коллекция приходит параметром.
- Единица счёта — **группа мышц** (20 в `muscles.js`), а не область схемы библиотеки (17).
- Вердикт выносится по **сопоставимому** числу: только целевые доли (`share === 1`), односторонние упражнения считаются по сторонам. Наше число (с коэффициентом 0.5 за вспомогательные, односторонние один раз) показывается рядом как контекст.
- Границы живут в отдельном файле данных, у каждой — ссылка на источник.
- Экран обязан говорить о себе две вещи: он считает количество, а не качество; счёт односторонних — наше чтение, а не цитата из источников.
- Высота нажимаемого — не ниже 44px. Новые нажимаемые элементы обязаны попасть в список `TAP_TARGETS` в `test/app.test.js:1199`, иначе сторож их молча не покроет.
- Новые модули обязаны попадать в `dist/`: `tools/collect-site.mjs` обходит граф импортов от `index.html`, проверять через `find dist -type f`, а не `ls`.

---

## File Structure

| файл | ответственность |
|---|---|
| `weekly.js` (создать) | недельные числа по группам: наше и сопоставимое. Чистый расчёт. |
| `load-bands.js` (создать) | границы полос с источниками и поиск полосы по числу. |
| `weekly-view.js` (создать) | сборка разметки экрана из чисел, полос и названий. |
| `index.html` (правка) | разметка секции после секции карты. |
| `style.css` (правка) | стили секции. |
| `app.js` (правка) | подключение секции: раскрытие, память состояния, ленивая отрисовка. |
| `tools/muscle-report.js` (правка) | раздел недельного объёма в отчёте. |
| `README.md` (правка) | что считает калькулятор и чего не считает. |
| `test/weekly.test.js` (создать) | числа на настоящих и синтетических данных. |
| `test/load-bands.test.js` (создать) | границы полос, включая попадание точно на границу. |
| `test/weekly-section.test.js` (создать) | секция в разметке: раскрытие, память, содержимое. |

`weekly-view.js` заведён отдельно, а не внутри `app.js`, потому что `app.js` уже 571 строка; так же в этой ветке был вынесен `figure.js`.

---

## Task 1: `weekly.js` — недельные числа

**Files:**
- Create: `weekly.js`
- Test: `test/weekly.test.js`

**Interfaces:**
- Consumes: `MUSCLES` из `./muscles.js` (объект групп; у каждой поле `region` и `ru`).
- Produces: `weeklySets(workouts)` → `Map<string, { ours: number, comparable: number }>`. Ключи — все идентификаторы групп из `MUSCLES` в их порядке, включая группы с нулями. `workouts` — массив объектов тренировок; у каждой есть `days` (массив номеров дней) и `blocks[].items[]` с полями `kind`, `load`, `unilateral` и `blocks[].rounds`.

- [ ] **Step 1: Написать падающий тест на настоящих данных**

Создай `test/weekly.test.js`:

```js
// Недельный объём по группам мышц. Два числа на группу считаются РАЗНО, и это
// главное, что проверяется: наше — с коэффициентом 0.5 за вспомогательную
// работу и односторонними один раз, сопоставимое — только целевые доли и
// односторонние по сторонам. Числа ниже посчитаны из данных программы, а не
// выбраны: три тренировки в неделю (days = [1,3,5]).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklySets } from '../weekly.js';
import { MUSCLES } from '../muscles.js';
import { WORKOUTS } from '../workouts/index.js';

const all = Object.values(WORKOUTS);

test('ягодичные: вспомогательная работа поднимает наше число выше сопоставимого', () => {
  const row = weeklySets(all).get('glutes');
  assert.equal(row.ours, 18);
  assert.equal(row.comparable, 12);
});

test('средняя ягодичная: односторонние поднимают сопоставимое выше нашего', () => {
  // Подъём верхней ноги лёжа на боку — целевое и одностороннее: 2 круга × 2
  // стороны × 3 дня = 12. Наше число меньше, потому что сторону не удваивает.
  const row = weeklySets(all).get('glutes_med');
  assert.equal(row.ours, 9);
  assert.equal(row.comparable, 12);
});

test('предплечья: работа есть, но целевой ни одной', () => {
  const row = weeklySets(all).get('forearms');
  assert.equal(row.ours, 18);
  assert.equal(row.comparable, 0);
});

test('сгибатели бедра: в силовых блоках не работают вовсе', () => {
  const row = weeklySets(all).get('hip_flexors');
  assert.equal(row.ours, 0);
  assert.equal(row.comparable, 0);
});

test('в ответе все двадцать групп, и порядок словаря сохранён', () => {
  const keys = [...weeklySets(all).keys()];
  assert.deepEqual(keys, Object.keys(MUSCLES));
});

test('групп без целевой работы ровно девять — это считается, а не вписано', () => {
  const idle = [...weeklySets(all).values()].filter(row => row.comparable === 0);
  assert.equal(idle.length, 9);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `node --test`
Expected: FAIL — `Cannot find module '../weekly.js'`.

- [ ] **Step 3: Написать `weekly.js`**

```js
// Недельный объём по группам мышц: сколько подходов каждая получает за неделю
// по всем тренировкам, которые ей передали.
//
// Ни DOM, ни библиотеки карты, ни реестра тренировок: коллекция приходит
// параметром, как и в volume.js. Реестр импортируют потребители.
import { MUSCLES } from './muscles.js';

// Два числа на группу, потому что источники ориентиров и наша разметка считают
// подходы по-разному, и смешивать их нельзя (см. спеку):
//
// ours — то же, что показывает карта, умноженное на число дней: вспомогательная
//   доля идёт с коэффициентом 0.5, одностороннее упражнение даёт один подход за
//   круг, а не два. Это внутренняя единица приложения.
// comparable — единица, в которой получены практические ориентиры: считаются
//   только целевые доли (0.5 не считается вовсе, её вклад уже заложен в сами
//   ориентиры), а одностороннее упражнение даёт подход на каждую сторону.
//
// Счёт односторонних по сторонам — НАШЕ чтение, а не цитата: договорённости об
// этом в проверенных источниках нет, в отличие от коэффициента 0.5 для
// вспомогательной работы, который назван прямо. Экран обязан это оговаривать.
//
// Считается только силовая работа: ориентиры про неё. Разминка и заминка в
// недельный объём не входят.
export function weeklySets(workouts) {
  const sets = new Map(Object.keys(MUSCLES).map(group => [group, { ours: 0, comparable: 0 }]));
  for (const workout of workouts) {
    const days = workout.days.length;
    for (const block of workout.blocks) {
      for (const item of block.items) {
        if (item.kind !== 'strength') continue;
        const sides = item.unilateral ? 2 : 1;
        for (const [group, share] of Object.entries(item.load)) {
          const row = sets.get(group);
          if (!row) {
            throw new Error(`Неизвестная группа мышц: ${group}`);
          }
          row.ours += share * block.rounds * days;
          if (share === 1) {
            row.comparable += block.rounds * sides * days;
          }
        }
      }
    }
  }
  return sets;
}
```

- [ ] **Step 4: Прогнать и убедиться, что зелено**

Run: `node --test`
Expected: PASS, число тестов выросло на 6.

- [ ] **Step 5: Добавить тест на синтетических данных**

Настоящая программа не покрывает два случая: тренировку с другим числом дней и группу, которой нет в словаре. Допиши в `test/weekly.test.js`:

```js
// Синтетическая тренировка: настоящая программа идёт три дня в неделю и
// проверить множитель дней на ней нельзя — три и «правильно» неразличимы.
function fixture({ days, rounds, load, unilateral = false }) {
  return {
    id: 'fixture',
    days,
    blocks: [{ id: 'b', n: '01', nav: 'Б', title: 'Блок', rounds, items: [
      { key: 'x', name: 'Упражнение', muscles: 'Мышцы', reps: '10', text: 'Текст',
        load, pattern: 'isolation', gear: ['none'], unilateral, kind: 'strength' },
    ] }],
  };
}

test('число дней умножает объём', () => {
  const two = weeklySets([fixture({ days: [1, 4], rounds: 2, load: { chest: 1 } })]);
  const four = weeklySets([fixture({ days: [1, 2, 4, 6], rounds: 2, load: { chest: 1 } })]);
  assert.equal(two.get('chest').comparable, 4);
  assert.equal(four.get('chest').comparable, 8);
});

test('односторонность удваивает только сопоставимое', () => {
  const row = weeklySets([fixture({ days: [1], rounds: 3, load: { biceps: 1 }, unilateral: true })]).get('biceps');
  assert.equal(row.ours, 3);
  assert.equal(row.comparable, 6);
});

test('вспомогательная доля не попадает в сопоставимое', () => {
  const row = weeklySets([fixture({ days: [1], rounds: 2, load: { traps: 0.5 } })]).get('traps');
  assert.equal(row.ours, 1);
  assert.equal(row.comparable, 0);
});

test('несколько тренировок складываются', () => {
  const rows = weeklySets([
    fixture({ days: [1], rounds: 2, load: { chest: 1 } }),
    fixture({ days: [3], rounds: 3, load: { chest: 1 } }),
  ]);
  assert.equal(rows.get('chest').comparable, 5);
});

test('группа вне словаря — это ошибка данных, а не ноль', () => {
  assert.throws(
    () => weeklySets([fixture({ days: [1], rounds: 1, load: { shoulders: 1 } })]),
    /Неизвестная группа мышц: shoulders/);
});
```

- [ ] **Step 6: Прогнать**

Run: `node --test`
Expected: PASS.

- [ ] **Step 7: Доказать мутациями, что тесты живые**

Для каждой мутации: применить, прогнать `node --test`, записать результат, откатить через `git checkout -- weekly.js`, проверить `git status --porcelain` пустым.

| мутация в `weekly.js` | должно |
|---|---|
| `if (share === 1)` → `if (share > 0)` | упасть (сопоставимое перестанет отличаться) |
| `item.unilateral ? 2 : 1` → `1` | упасть |
| `* days` убрать из обеих строк | упасть |
| `if (item.kind !== 'strength') continue;` убрать | упасть |
| `throw new Error(...)` заменить на `continue` | упасть на тесте про группу вне словаря |

Если какая-то мутация оставляет тесты зелёными — тест на это место декоративен, допиши настоящий, а не убирай мутацию из списка.

- [ ] **Step 8: Закоммитить**

```bash
git add weekly.js test/weekly.test.js
git commit -m "Недельный объём по группам: два числа, потому что счёт разный"
```

---

## Task 2: `load-bands.js` — границы и вердикт

**Files:**
- Create: `load-bands.js`
- Test: `test/load-bands.test.js`

**Interfaces:**
- Consumes: ничего из проекта.
- Produces: `LOAD_BANDS` — замороженный массив полос по возрастанию, у каждой `{ max, verdict, why, source }`, у последней `max: Infinity`. `verdictFor(sets)` → элемент `LOAD_BANDS`; на отрицательном или нечисловом входе бросает.

- [ ] **Step 1: Написать падающий тест**

Создай `test/load-bands.test.js`:

```js
// Полосы недельного объёма. Проверяется главным образом попадание ТОЧНО на
// границу: ошибка на единицу здесь меняет вердикт целой группе мышц, а увидеть
// её на глаз невозможно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOAD_BANDS, verdictFor } from '../load-bands.js';

test('ноль — отдельная полоса, а не «мало»', () => {
  assert.equal(verdictFor(0).verdict, 'не тренируется целенаправленно');
});

test('границы полос: каждое число попадает туда, куда задумано', () => {
  const at = n => verdictFor(n).verdict;
  assert.equal(at(1), 'ниже минимума');
  assert.equal(at(3), 'ниже минимума');
  assert.equal(at(4), 'поддержание');
  assert.equal(at(9), 'поддержание');
  assert.equal(at(10), 'рабочий объём');
  assert.equal(at(20), 'рабочий объём');
  assert.equal(at(21), 'у предела восстановления');
  assert.equal(at(100), 'у предела восстановления');
});

test('полосы идут по возрастанию и покрывают всё без разрывов', () => {
  const maxes = LOAD_BANDS.map(band => band.max);
  assert.deepEqual(maxes, [...maxes].sort((a, b) => a - b));
  assert.equal(maxes.at(-1), Infinity);
});

test('у каждой полосы есть обоснование и источник', () => {
  for (const band of LOAD_BANDS) {
    assert.ok(band.why.length > 0, `у полосы «${band.verdict}» нет обоснования`);
    assert.ok(band.source.startsWith('https://'), `у полосы «${band.verdict}» нет ссылки`);
  }
});

test('мусор на входе — ошибка, а не тихий вердикт', () => {
  assert.throws(() => verdictFor(-1), /объём не может быть отрицательным/);
  assert.throws(() => verdictFor(Number.NaN), /объём должен быть числом/);
  assert.throws(() => verdictFor('12'), /объём должен быть числом/);
});

test('таблица заморожена: вердикт не подменить на ходу', () => {
  assert.throws(() => { LOAD_BANDS[0].verdict = 'другое'; });
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `node --test`
Expected: FAIL — `Cannot find module '../load-bands.js'`.

- [ ] **Step 3: Написать `load-bands.js`**

Полоса «ноль» отделена от «ниже минимума» намеренно: это разные сообщения. Ноль значит «упражнения на эту мышцу в программе нет вовсе», и лечится он добавлением упражнения, а не увеличением подходов.

```js
// Границы недельного объёма и вердикт по нему.
//
// Все числа — СОПОСТАВИМЫЕ подходы в неделю на группу мышц: только целевые
// доли, односторонние по сторонам (см. weekly.js и спеку). Подставлять сюда
// наше внутреннее число нельзя: ориентиры получены в другой системе счёта, и у
// ягодичных это 12 против 18.
//
// У каждой полосы ссылка на источник. Менять числа можно, не трогая расчёт, —
// для этого таблица и вынесена в свой файл.
const bands = [
  {
    max: 0,
    verdict: 'не тренируется целенаправленно',
    why: 'ни одного упражнения, где эта группа — целевая. Лечится добавлением упражнения, а не числом подходов.',
    source: 'https://sportrxiv.org/index.php/server/preprint/view/460',
  },
  {
    max: 3,
    verdict: 'ниже минимума',
    why: 'минимум, при котором рост измерим, начинается примерно с четырёх подходов в неделю.',
    source: 'https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth',
  },
  {
    max: 9,
    verdict: 'поддержание',
    why: 'около шести подходов хватает, чтобы удержать набранное; меньше пяти работает, но не оптимально.',
    source: 'https://pubmed.ncbi.nlm.nih.gov/27433992/',
  },
  {
    max: 20,
    verdict: 'рабочий объём',
    why: 'десять и больше подходов в неделю дали лучший результат; рабочая полоса примерно до восемнадцати.',
    source: 'https://pubmed.ncbi.nlm.nih.gov/27433992/',
  },
  {
    max: Infinity,
    verdict: 'у предела восстановления',
    why: 'выше двадцати—двадцати пяти подходов в неделю объём перестаёт восстанавливаться у большинства.',
    source: 'https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth',
  },
];

export const LOAD_BANDS = Object.freeze(bands.map(band => Object.freeze(band)));

export function verdictFor(sets) {
  if (typeof sets !== 'number' || Number.isNaN(sets)) {
    throw new Error(`объём должен быть числом, получено: ${sets}`);
  }
  if (sets < 0) {
    throw new Error(`объём не может быть отрицательным: ${sets}`);
  }
  // Полосы отсортированы по возрастанию, поэтому первая подходящая и есть
  // ответ. Последняя с max: Infinity гарантирует, что find всегда что-то найдёт.
  return LOAD_BANDS.find(band => sets <= band.max);
}
```

- [ ] **Step 4: Прогнать**

Run: `node --test`
Expected: PASS.

- [ ] **Step 5: Доказать мутациями**

| мутация в `load-bands.js` | должно |
|---|---|
| `max: 3` → `max: 4` | упасть на границе `at(4)` |
| `max: 9` → `max: 10` | упасть на `at(10)` |
| `max: 20` → `max: 21` | упасть на `at(21)` |
| `sets <= band.max` → `sets < band.max` | упасть |
| убрать `Object.freeze` | упасть на тесте про заморозку |
| убрать проверку `sets < 0` | упасть |

Дополнительно проверь **эквивалентной** мутацией, не мёртв ли отдельный `Number.isNaN`: замени условие на `typeof sets !== 'number'`. Если тесты остались зелёными — проверка на `NaN` ничего не держит, и тест на неё надо дописать (у `NaN` тип `number`, так что мутация обязана его ронять).

- [ ] **Step 6: Закоммитить**

```bash
git add load-bands.js test/load-bands.test.js
git commit -m "Границы недельного объёма: таблица с источником у каждой полосы"
```

---

## Task 3: экран в приложении

**Files:**
- Create: `weekly-view.js`
- Modify: `index.html` (после секции `.bodymap`, она заканчивается на строке 26)
- Modify: `style.css`
- Modify: `app.js`
- Modify: `test/app.test.js:1199` — добавить `.weekly-toggle` в `TAP_TARGETS`
- Test: `test/weekly-section.test.js`

**Interfaces:**
- Consumes: `weeklySets(workouts)` из `./weekly.js`; `verdictFor(sets)` из `./load-bands.js`; `muscleLabel(id)` из `./muscles.js`; `WORKOUTS` из `./workouts/index.js`.
- Produces: `renderWeekly({ host, workouts })` — заполняет `host` разметкой, ничего не возвращает.

- [ ] **Step 1: Добавить разметку секции**

В `index.html` сразу после закрывающего `</section>` секции карты тела:

```html
<section class="weekly">
<button class="weekly-toggle" type="button" aria-expanded="false" aria-controls="weekly-body">Сколько получает каждая мышца за неделю</button>
<div class="weekly-body" id="weekly-body" hidden></div>
</section>
```

- [ ] **Step 2: Написать падающий тест на секцию**

Создай `test/weekly-section.test.js`:

```js
// Секция недельного объёма на странице: раскрытие, память состояния и
// содержимое. Сам расчёт проверен в test/weekly.test.js, полосы — в
// test/load-bands.test.js; здесь только связывание с разметкой.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

function mount() {
  const { window } = makeDom(html);
  return { window, document: window.document };
}

test('секция есть в разметке и свёрнута по умолчанию', () => {
  const { window, document } = mount();
  startApp(window);
  const section = document.querySelector('.weekly');
  assert.ok(section, 'секции .weekly нет');
  assert.equal(section.querySelector('.weekly-body').hidden, true);
  assert.equal(section.querySelector('.weekly-toggle').getAttribute('aria-expanded'), 'false');
});

test('нажатие раскрывает секцию и рисует строки по всем группам', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  assert.equal(document.querySelector('.weekly-body').hidden, false);
  assert.equal(document.querySelector('.weekly-toggle').getAttribute('aria-expanded'), 'true');
  assert.equal(document.querySelectorAll('.weekly-row').length, 20);
});

test('строка показывает оба числа и вердикт', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const glutes = rows.find(row => row.textContent.includes('Ягодичные'));
  assert.match(glutes.textContent, /12/, 'нет сопоставимого числа');
  assert.match(glutes.textContent, /18/, 'нет нашего числа');
  assert.match(glutes.textContent, /рабочий объём/);
});

test('группа без целевой работы получает свой вердикт, а не «мало»', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const rows = [...document.querySelectorAll('.weekly-row')];
  const forearms = rows.find(row => row.textContent.includes('Предплечья'));
  assert.match(forearms.textContent, /не тренируется целенаправленно/);
});

test('строки идут по убыванию сопоставимого объёма', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const nums = [...document.querySelectorAll('.weekly-row .weekly-main')]
    .map(cell => Number(cell.textContent.replace(',', '.')));
  assert.deepEqual(nums, [...nums].sort((a, b) => b - a));
});

test('секция говорит о себе две оговорки', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  const notes = document.querySelector('.weekly-body').textContent;
  assert.match(notes, /количество, а не качество/,
    'нет оговорки про то, что усилие из данных не видно');
  assert.match(notes, /наше чтение/,
    'нет оговорки про счёт односторонних');
});

test('состояние раскрытия помнится между загрузками', () => {
  const first = mount();
  startApp(first.window);
  first.document.querySelector('.weekly-toggle').click();
  assert.equal(first.window.localStorage.getItem('weekly-open'), '1');

  const second = mount();
  second.window.localStorage.setItem('weekly-open', '1');
  startApp(second.window);
  assert.equal(second.document.querySelector('.weekly-body').hidden, false);
});

test('свёрнутое состояние тоже помнится', () => {
  const { window, document } = mount();
  window.localStorage.setItem('weekly-open', '1');
  startApp(window);
  document.querySelector('.weekly-toggle').click();
  assert.equal(window.localStorage.getItem('weekly-open'), '0');
});

test('повторное раскрытие не рисует строки заново', () => {
  const { window, document } = mount();
  startApp(window);
  const toggle = document.querySelector('.weekly-toggle');
  toggle.click();
  toggle.click();
  toggle.click();
  assert.equal(document.querySelectorAll('.weekly-row').length, 20);
});
```

- [ ] **Step 3: Прогнать и убедиться, что падает**

Run: `node --test`
Expected: FAIL — `.weekly-toggle` есть в разметке, но обработчика нет, поэтому тесты про раскрытие падают.

- [ ] **Step 4: Написать `weekly-view.js`**

```js
// Экран недельного объёма: собирает разметку из чисел (weekly.js), полос
// (load-bands.js) и названий групп (muscles.js). Своего расчёта здесь нет.
import { weeklySets } from './weekly.js';
import { verdictFor } from './load-bands.js';
import { muscleLabel } from './muscles.js';

// Дробные значения бывают только у нашего числа: вспомогательная доля 0.5 на
// нечётном числе кругов даёт половину. Сопоставимое всегда целое.
function formatSets(sets) {
  return String(sets).replace('.', ',');
}

function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function renderWeekly({ host, workouts }) {
  const document = host.ownerDocument;
  host.textContent = '';

  const rows = [...weeklySets(workouts)]
    .map(([group, sets]) => ({ group, ...sets, band: verdictFor(sets.comparable) }))
    // По убыванию сопоставимого: вердикт считается по нему, и сверху должно
    // быть самое нагруженное. При равенстве — по нашему числу, потом по
    // названию, чтобы порядок не зависел от порядка словаря.
    .sort((a, b) => b.comparable - a.comparable
      || b.ours - a.ours
      || muscleLabel(a.group).localeCompare(muscleLabel(b.group), 'ru'));

  const list = el(document, 'div', 'weekly-list');
  for (const row of rows) {
    const line = el(document, 'div', 'weekly-row');
    line.append(
      el(document, 'span', 'weekly-name', muscleLabel(row.group)),
      el(document, 'span', 'weekly-main', formatSets(row.comparable)),
      el(document, 'span', 'weekly-ours', formatSets(row.ours)),
      el(document, 'span', 'weekly-verdict', row.band.verdict),
    );
    list.append(line);
  }

  host.append(
    el(document, 'p', 'weekly-head',
      'Подходов в неделю на группу мышц. Первое число — целевая работа, по нему и вердикт. Второе — как считает карта: вспомогательная работа идёт половиной.'),
    list,
    el(document, 'p', 'weekly-note',
      'Калькулятор считает количество, а не качество: доводите вы подход до отказа или нет, из данных не видно.'),
    el(document, 'p', 'weekly-note',
      'Односторонние упражнения в первом числе считаются по сторонам. Это наше чтение: договорённости об этом в проверенных источниках нет, в отличие от вспомогательной работы, для которой коэффициент половины назван прямо.'),
  );
}
```

- [ ] **Step 5: Подключить секцию в `app.js`**

Рядом с подключением секции карты тела добавь тот же приём: ленивая отрисовка при первом раскрытии, состояние в `localStorage`.

Секция карты тела в этом же файле устроена ровно так же — `MAP_KEY`,
`setMapOpen`, ленивый `openMap`. Повтори её приём, включая работу с хранилищем
через `win.localStorage` в `try/catch` по месту: **никаких `readLocal`/
`writeLocal` в `app.js` нет**, и заводить их для одной секции не нужно.

```js
  // Секция недельного объёма. Устроена как секция карты выше: рисуется при
  // первом раскрытии, состояние помнится. Повторное раскрытие не
  // перерисовывает — renderWeekly очистил бы host и собрал те же строки заново.
  const WEEKLY_KEY = 'weekly-open';
  const weeklyToggle = document.querySelector('.weekly-toggle');
  const weeklyBody = document.querySelector('.weekly-body');
  let weeklyDrawn = false;

  function drawWeekly() {
    if (weeklyDrawn) return;
    renderWeekly({ host: weeklyBody, workouts: Object.values(WORKOUTS) });
    weeklyDrawn = true;
  }

  function setWeeklyOpen(open) {
    weeklyToggle.setAttribute('aria-expanded', String(open));
    weeklyBody.hidden = !open;
    if (open) drawWeekly();
    // try/catch по месту — как у MAP_KEY выше: он гасит и бросающий геттер
    // localStorage, и его отсутствие, второй защиты поверх не нужно.
    try { win.localStorage.setItem(WEEKLY_KEY, open ? '1' : '0'); } catch { /* приватный режим */ }
  }

  weeklyToggle.addEventListener('click', () =>
    setWeeklyOpen(weeklyToggle.getAttribute('aria-expanded') !== 'true'));

  let weeklyWasOpen = false;
  try { weeklyWasOpen = win.localStorage.getItem(WEEKLY_KEY) === '1'; } catch { /* см. выше */ }
  if (weeklyWasOpen) setWeeklyOpen(true);
```

Переменная `document` внутри `startApp` уже объявлена как `win.document` —
возьми её, а не глобальную. Импорты `renderWeekly` из `./weekly-view.js` и
`WORKOUTS` из `./workouts/index.js` добавь к уже существующим в шапке файла
(`WORKOUTS` там, возможно, уже есть — проверь, прежде чем дублировать).

- [ ] **Step 6: Добавить стили в `style.css`**

```css
.weekly{margin:14px 0 0;border:1px solid #cad6e4;border-radius:12px;overflow:hidden;background:#fff}
.weekly-toggle{width:100%;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:#fff;border:0;padding:0 14px;font-family:inherit;font-size:15px;font-weight:600;color:#152d4a;text-align:left;cursor:pointer}
.weekly-toggle[aria-expanded=true]{background:#e4edf8;border-bottom:1px solid #d8e1eb}
.weekly-body{padding:12px 14px 14px}
.weekly-head,.weekly-note{margin:0 0 10px;font-size:13px;line-height:1.5;color:#526278}
.weekly-note{margin:10px 0 0}
.weekly-row{display:grid;grid-template-columns:1fr auto auto;gap:4px 10px;align-items:baseline;padding:8px 0;border-top:1px solid #e8edf4}
.weekly-name{font-size:14px;font-weight:600}
.weekly-main{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.weekly-ours{font-size:13px;color:#657289;font-variant-numeric:tabular-nums}
.weekly-verdict{grid-column:1/-1;font-size:12px;color:#526278}
```

- [ ] **Step 7: Добавить `.weekly-toggle` в сторож высоты**

В `test/app.test.js`, массив `TAP_TARGETS` (строка 1199), добавь `'.weekly-toggle',`. Без этого сторож новую кнопку не покрывает: он перебирает только перечисленные селекторы.

- [ ] **Step 8: Прогнать**

Run: `node --test`
Expected: PASS.

- [ ] **Step 9: Проверить, что модули уехали в сборку**

Run: `node tools/collect-site.mjs && find dist -type f | wc -l`
Expected: 19 — было 16, добавились `weekly.js`, `load-bands.js`, `weekly-view.js`.

- [ ] **Step 10: Посмотреть глазами**

Подними сервер на свежем порту из `dist/`, почисти `localStorage`, открой при 375×812. Проверь: секция свёрнута; раскрывается; строки читаются; оба числа не путаются местами; вердикты стоят у тех групп, у которых должны (предплечья — «не тренируется целенаправленно», ягодичные — «рабочий объём»); горизонтальной прокрутки нет; кнопка не ниже 44px по `getBoundingClientRect`.

Браузер в этом проекте многократно отдавал пустой или чужой кадр, а серверы — закешированные файлы: числа бери из DOM, а не со скриншота, и скажи прямо, если столкнулся.

- [ ] **Step 11: Доказать мутациями**

| мутация | должно |
|---|---|
| в `weekly-view.js` поменять местами `formatSets(row.comparable)` и `formatSets(row.ours)` | упасть (тест на два числа) |
| убрать `.sort(...)` целиком | упасть (тест на порядок) |
| `verdictFor(sets.comparable)` → `verdictFor(sets.ours)` | упасть (предплечья получат не тот вердикт) |
| убрать одну из двух оговорок | упасть |
| убрать `if (!weeklyDrawn)` в `app.js` | **эквивалентная**: если тесты зелёные, тест на повторное раскрытие ничего не проверяет — почини тест |
| `writeLocal(WEEKLY_KEY, open ? '0' : '1')` → всегда `'1'` | упасть (тест на свёрнутое состояние) |

- [ ] **Step 12: Закоммитить**

```bash
git add index.html style.css app.js weekly-view.js test/weekly-section.test.js test/app.test.js
git commit -m "Экран недельного объёма: два числа и вердикт по каждой группе"
```

---

## Task 4: раздел в отчёте и README

**Files:**
- Modify: `tools/muscle-report.js` (функция `buildReportLines`, строка 108)
- Modify: `docs/muscle-map.md` (перегенерировать, не править руками)
- Modify: `README.md`
- Test: `test/muscle-report.test.js` (существующий)

**Interfaces:**
- Consumes: `weeklySets(workouts)` из `../weekly.js`; `verdictFor(sets)` из `../load-bands.js`; `muscleLabel(id)` из `../muscles.js`.
- Produces: ничего нового наружу.

- [ ] **Step 1: Написать падающий тест**

Допиши в `test/muscle-report.test.js`:

```js
test('в отчёте есть раздел недельного объёма с обоими числами и вердиктом', () => {
  const text = buildReportLines().join('\n');
  assert.match(text, /Недельный объём/);
  // Ягодичные: 12 сопоставимых, 18 наших — числа из данных, не из воздуха.
  assert.match(text, /Ягодичные \| 12 \| 18 \| рабочий объём/);
  assert.match(text, /Предплечья \| 0 \| 18 \| не тренируется целенаправленно/);
});

test('раздел отчёта называет обе оговорки счёта', () => {
  const text = buildReportLines().join('\n');
  assert.match(text, /односторонние считаются по сторонам/);
  assert.match(text, /вспомогательная работа идёт половиной/);
  assert.match(text, /наше чтение, а не цитата/);
});
```

- [ ] **Step 2: Прогнать и убедиться, что падает**

Run: `node --test`
Expected: FAIL — раздела в отчёте нет.

- [ ] **Step 3: Добавить раздел в генератор**

В `tools/muscle-report.js` добавь импорты и функцию, а её вывод вставь в `buildReportLines` перед строкой про то, что файл сгенерирован:

```js
import { weeklySets } from '../weekly.js';
import { verdictFor } from '../load-bands.js';

// Недельный объём: то же, что показывает экран калькулятора, чтобы перекос был
// виден при добавлении упражнений, а не только с телефона. Расчёт общий —
// разойтись экран и отчёт не могут.
function weeklyLines(workouts) {
  const rows = [...weeklySets(Object.values(workouts))]
    .map(([group, sets]) => ({ group, ...sets, band: verdictFor(sets.comparable) }))
    .sort((a, b) => b.comparable - a.comparable
      || b.ours - a.ours
      || muscleLabel(a.group).localeCompare(muscleLabel(b.group), 'ru'));

  const lines = [
    '## Недельный объём', '',
    'Сколько подходов получает каждая группа за неделю по всем тренировкам',
    'реестра, с учётом того, сколько дней в неделю идёт каждая тренировка.',
    'Считается только силовая работа.', '',
    'Два числа, потому что счёт разный. **Целевые** — только те упражнения, где',
    'группа целевая, и односторонние считаются по сторонам: в этой системе',
    'получены ориентиры, поэтому по ней и вердикт. **Как на карте** —',
    'вспомогательная работа идёт половиной, односторонние один раз.', '',
    'Счёт односторонних по сторонам — наше чтение, а не цитата: договорённости',
    'об этом в проверенных источниках нет.', '',
    '| Группа | Целевые | Как на карте | Вердикт |',
    '|---|---|---|---|',
  ];
  for (const row of rows) {
    lines.push(`| ${muscleLabel(row.group)} | ${fmt(row.comparable)} | ${fmt(row.ours)} | ${row.band.verdict} |`);
  }
  lines.push('');
  return lines;
}

function fmt(sets) {
  return String(sets).replace('.', ',');
}
```

`muscleLabel` в этом файле уже импортирован из `../muscles.js` — второй раз не добавляй.

- [ ] **Step 4: Перегенерировать отчёт и прогнать тесты**

```bash
node tools/muscle-report.js
node --test
```
Expected: PASS; `docs/muscle-map.md` содержит новый раздел.

- [ ] **Step 5: Дописать README**

В `README.md` добавь раздел про калькулятор: что он считает (подходы в неделю на группу по всем тренировкам, только силовая работа), почему два числа, по какому выносится вердикт, и обе оговорки — про количество вместо качества и про то, что счёт односторонних наш, а не цитата. Ссылку на источники давай на спеку, а не дублируй список.

Пиши без жаргона: README читает не программист. «Медиазапрос», «фикстура», «мутация» — не слова для него.

- [ ] **Step 6: Проверить согласованность трёх потребителей**

Одно и то же число должно получаться в трёх местах. Проверь на ягодичных и предплечьях: экран в браузере, `docs/muscle-map.md`, и прямой вызов:

```bash
node -e 'const {WORKOUTS}=await import("./workouts/index.js");const {weeklySets}=await import("./weekly.js");const r=weeklySets(Object.values(WORKOUTS));console.log("glutes",r.get("glutes"),"forearms",r.get("forearms"))' --input-type=module
```
Expected: `glutes { ours: 18, comparable: 12 } forearms { ours: 18, comparable: 0 }`.

- [ ] **Step 7: Закоммитить**

```bash
git add tools/muscle-report.js docs/muscle-map.md README.md test/muscle-report.test.js
git commit -m "Недельный объём в отчёте и README"
```

---

## Самопроверка плана

**Покрытие спеки.** Период — неделя через `days` (Task 1). Вердикт по целевым, наше число рядом (Task 1, 3, 4). Границы отдельным файлом с источником у каждой (Task 2). Единица — группа, не область схемы (Task 1: ключи из `MUSCLES`). Два потребителя одного расчёта (Task 3, 4). Обе оговорки на экране (Task 3, Step 4) и в отчёте (Task 4). «Девять групп без целевой работы» считается, а не вписано (Task 1, Step 1). Верхняя полоса покрыта синтетикой (Task 2: `at(21)`, `at(100)`).

**Чего в плане нет, и это соответствует спеке:** объём по факту выполнения, периоды кроме недели, личные границы, разминка и заминка в вердикте.

**Согласованность имён.** `weeklySets(workouts)` возвращает `Map<string, {ours, comparable}>` — так и вызывается в Task 3 и Task 4. `verdictFor(sets)` возвращает полосу, у которой читается `.verdict` — так и в Task 3, и в Task 4. `renderWeekly({ host, workouts })` объявлен в Task 3 и вызывается там же. `LOAD_BANDS` читается только в тестах Task 2.

**Проверенные допущения.** Перед сдачей плана сверила с кодом четыре места, на которые он опирается: секция карты в `index.html` заканчивается на строке 26 (верно); `test/muscle-report.test.js` существует и импортирует `buildReportLines` (верно); `muscleLabel` уже импортирован в `tools/muscle-report.js` (верно); а вот помощников `readLocal`/`writeLocal` в `app.js` **нет** — там `win.localStorage` в `try/catch` по месту, и Task 3, Step 5 переписан под настоящий приём.

**Известный риск.** Ожидаемое число файлов в `dist/` (19) посчитано как 16 + три новых модуля. Если `collect-site.mjs` по какой-то причине не подхватит модуль, шаг 9 Task 3 это и покажет — он для этого и стоит отдельным шагом.
