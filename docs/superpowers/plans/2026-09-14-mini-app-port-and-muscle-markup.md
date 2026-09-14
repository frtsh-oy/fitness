# Telegram Mini App: порт тренировки + разметка мышц — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перенести закрытый ChatGPT-сайт с тренировкой в самостоятельный Telegram Mini App на GitHub Pages и разметить все упражнения по группам мышц так, чтобы карта тела, конструктор и оценка нагрузки строились поверх без переразметки.

**Architecture:** Статика без сборки и без бэкенда. ES-модули, загружаемые напрямую браузером. Данные тренировки отделены от рендерера, слой Telegram и адаптер хранилища не знают про тренировки, словарь мышц — единственный источник истины для будущей карты тела.

**Tech Stack:** Ванильный JS (ES-модули), Node 24 + `node --test` и `jsdom` только для тестов, `telegram-web-app.js` с CDN Telegram, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-14-telegram-mini-app-design.md`

## Global Constraints

- Никакого шага сборки. Файлы, лежащие в репозитории, — ровно те, что отдаёт GitHub Pages.
- Ноль рантайм-зависимостей. `jsdom` только в `devDependencies`, в продакшен не попадает.
- Приложение обязано работать в обычном браузере без `window.Telegram`. Ни один вызов Telegram API не должен ронять страницу.
- Фирменная палитра сохраняется: фон `#152d4a`, акцент `#ceef69`. Тема Telegram не подменяет цвета приложения.
- Весь текст интерфейса — русский, обращение к пользователю на «ты» (как на исходном сайте).
- Идентификаторы групп мышц берутся только из `muscles.js`. Свободный текст `muscles` остаётся как подпись и в логике не используется.
- `load` содержит `1` для целевой группы и `0.5` для вспомогательной. Другие значения запрещены.
- Токен бота в проекте не используется и не хранится. Привязка к боту делается в BotFather вручную.
- Файлы в `src-original/` — архив исходника, только для сверки. Продакшен-код их не импортирует.

---

### Task 1: Архив исходников и каркас тестов

**Files:**
- Create: `src-original/index.html`, `src-original/style.css`, `src-original/app.js`, `src-original/player.js`, `src-original/player.css`
- Create: `package.json`
- Create: `test/setup.js`
- Create: `test/smoke.test.js`

**Interfaces:**
- Consumes: ничего
- Produces: `test/setup.js` экспортирует `makeDom(html = '<!doctype html><html><body></body></html>')`, возвращающий `{ window, document }` на базе jsdom; каждый следующий тест с DOM импортирует его.

- [ ] **Step 1: Забрать пять файлов с закрытого сайта**

Сайт отдаёт `401` анонимно, поэтому забирать только через уже авторизованную вкладку Browser-панели (`mcp__Claude_Browser__javascript_tool`). Для каждого файла выполнить `await (await fetch(path)).text()` и сохранить содержимое в `src-original/` под тем же именем.

Пути: `/index.html`, `/style.css`, `/app.js`, `/player.js`, `/player.css`.

- [ ] **Step 2: Срезать вставку Cloudflare из архивной копии index.html**

В конце `src-original/index.html` есть инлайновый скрипт, начинающийся с `(function(){function c(){var b=a.contentDocument`. Это челлендж хостинга, к приложению отношения не имеет. Удалить весь тег `<script>…</script>` вместе с содержимым.

- [ ] **Step 3: Проверить, что архив совпал с оригиналом по размеру**

Ожидаемые размеры оригинала в байтах: `app.js` 16024, `index.html` 5159 (до вырезания Cloudflare-скрипта), `player.css` 1130, `player.js` 3003, `style.css` 8364.

Run: `wc -c src-original/*`
Expected: `app.js`, `player.js`, `player.css`, `style.css` совпадают точно. `index.html` меньше 5159 — это ожидаемо после Step 2.

Если какой-то файл не совпал — забрать его заново, передав из браузера `btoa(unescape(encodeURIComponent(text)))` и раскодировав через `base64 -d`.

- [ ] **Step 4: Создать package.json**

```json
{
  "name": "tg-workout",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/"
  },
  "devDependencies": {
    "jsdom": "^26.0.0"
  }
}
```

- [ ] **Step 5: Установить jsdom**

Run: `npm install`
Expected: создаётся `node_modules/` и `package-lock.json`, ошибок нет.

- [ ] **Step 6: Добавить node_modules в .gitignore**

Проверить, что `.gitignore` содержит строку `node_modules/`. Если нет — дописать.

- [ ] **Step 7: Написать хелпер DOM для тестов**

```js
// test/setup.js
import { JSDOM } from 'jsdom';

export function makeDom(html = '<!doctype html><html><body></body></html>') {
  const dom = new JSDOM(html, { url: 'https://example.test/' });
  return { window: dom.window, document: dom.window.document };
}
```

- [ ] **Step 8: Написать дымовой тест**

```js
// test/smoke.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';

test('jsdom поднимается и отдаёт документ', () => {
  const { document } = makeDom('<!doctype html><html><body><p id="x">привет</p></body></html>');
  assert.equal(document.getElementById('x').textContent, 'привет');
});
```

- [ ] **Step 9: Запустить тесты**

Run: `npm test`
Expected: PASS, 1 тест.

- [ ] **Step 10: Коммит**

```bash
git add package.json package-lock.json .gitignore src-original test
git commit -m "Архив исходного сайта и каркас тестов"
```

---

### Task 2: Словарь групп мышц

**Files:**
- Create: `muscles.js`
- Create: `test/muscles.test.js`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `MUSCLES` — объект, ключ это идентификатор группы, значение `{ ru: string, region: string }`
  - `isMuscleId(id) -> boolean`
  - `muscleLabel(id) -> string` (бросает `Error` на неизвестном id)
  - `toRegions(loadObject) -> Map<string, number>` — свёртка наших групп в регионы картинки, значения суммируются

- [ ] **Step 1: Написать падающие тесты**

```js
// test/muscles.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MUSCLES, isMuscleId, muscleLabel, toRegions } from '../muscles.js';

test('словарь содержит ровно 20 групп', () => {
  assert.equal(Object.keys(MUSCLES).length, 20);
});

test('у каждой группы есть русская подпись и регион картинки', () => {
  for (const [id, m] of Object.entries(MUSCLES)) {
    assert.ok(m.ru && m.ru.length > 0, `${id}: нет подписи`);
    assert.ok(m.region && m.region.length > 0, `${id}: нет региона`);
  }
});

test('isMuscleId отличает известные группы от выдуманных', () => {
  assert.equal(isMuscleId('glutes'), true);
  assert.equal(isMuscleId('adductors'), true);
  assert.equal(isMuscleId('nonexistent'), false);
});

test('muscleLabel бросает ошибку на неизвестной группе', () => {
  assert.equal(muscleLabel('biceps'), 'Бицепс');
  assert.throws(() => muscleLabel('nope'), /nope/);
});

test('toRegions складывает группы, указывающие на один регион', () => {
  const regions = toRegions({ glutes: 1, glutes_med: 0.5, quads: 1 });
  assert.equal(regions.get('gluteal'), 1.5);
  assert.equal(regions.get('quadriceps'), 1);
});

test('toRegions бросает ошибку на неизвестной группе', () => {
  assert.throws(() => toRegions({ nope: 1 }), /nope/);
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Cannot find module '../muscles.js'`.

- [ ] **Step 3: Написать muscles.js**

```js
// Единственный источник истины по группам мышц.
// region — идентификатор области на картинке тела; несколько наших групп
// могут указывать на один регион. Значения region сверяются с библиотекой
// карты тела на этапе S2 и живут только здесь.
export const MUSCLES = {
  glutes:      { ru: 'Ягодичные',                  region: 'gluteal' },
  glutes_med:  { ru: 'Средняя и малая ягодичные',  region: 'gluteal' },
  quads:       { ru: 'Квадрицепсы',                region: 'quadriceps' },
  hamstrings:  { ru: 'Задняя поверхность бедра',   region: 'hamstring' },
  adductors:   { ru: 'Приводящие',                 region: 'adductors' },
  calves:      { ru: 'Икроножные',                 region: 'calves' },
  abs:         { ru: 'Прямая мышца живота',        region: 'abs' },
  obliques:    { ru: 'Косые мышцы живота',         region: 'obliques' },
  lower_back:  { ru: 'Разгибатели поясницы',       region: 'lower-back' },
  hip_flexors: { ru: 'Сгибатели бедра',            region: 'quadriceps' },
  lats:        { ru: 'Широчайшие',                 region: 'upper-back' },
  upper_back:  { ru: 'Верх спины',                 region: 'upper-back' },
  traps:       { ru: 'Трапеции',                   region: 'trapezius' },
  chest:       { ru: 'Грудные',                    region: 'chest' },
  delts_front: { ru: 'Передняя дельта',            region: 'deltoids' },
  delts_side:  { ru: 'Средняя дельта',             region: 'deltoids' },
  delts_rear:  { ru: 'Задняя дельта',              region: 'deltoids' },
  biceps:      { ru: 'Бицепс',                     region: 'biceps' },
  triceps:     { ru: 'Трицепс',                    region: 'triceps' },
  forearms:    { ru: 'Предплечья',                 region: 'forearm' },
};

export function isMuscleId(id) {
  return Object.hasOwn(MUSCLES, id);
}

export function muscleLabel(id) {
  if (!isMuscleId(id)) throw new Error(`Неизвестная группа мышц: ${id}`);
  return MUSCLES[id].ru;
}

export function toRegions(load) {
  const regions = new Map();
  for (const [id, value] of Object.entries(load)) {
    if (!isMuscleId(id)) throw new Error(`Неизвестная группа мышц: ${id}`);
    const region = MUSCLES[id].region;
    regions.set(region, (regions.get(region) ?? 0) + value);
  }
  return regions;
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS, все тесты `muscles`.

- [ ] **Step 5: Коммит**

```bash
git add muscles.js test/muscles.test.js
git commit -m "Словарь групп мышц и свёртка в регионы картинки"
```

---

### Task 3: Валидатор схемы тренировки

**Files:**
- Create: `workouts/schema.js`
- Create: `test/schema.test.js`

**Interfaces:**
- Consumes: `isMuscleId` из `muscles.js`
- Produces:
  - `PATTERNS` — массив допустимых значений `pattern`
  - `GEAR` — массив допустимых значений элементов `gear`
  - `KINDS` — массив допустимых значений `kind`
  - `validateWorkout(workout) -> string[]` — список найденных проблем, пустой массив означает «всё в порядке»
  - `countMarks(workout) -> number` — сколько всего отметок в тренировке, сумма `rounds * items.length` по блокам

- [ ] **Step 1: Написать падающие тесты**

```js
// test/schema.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout, countMarks } from '../workouts/schema.js';

function minimalWorkout(overrides = {}) {
  return {
    id: 'test',
    kicker: 'ДОМА',
    title: 'Тест',
    lead: 'Описание',
    schedule: 'ПН · СР · ПТ',
    stats: [{ v: '10', l: 'минут' }],
    gear: 'Коврик',
    blocks: [{
      id: 'b1', n: '01', title: 'Блок', sub: 'Подзаголовок', rounds: 2,
      items: [{
        name: 'Упражнение', muscles: 'Ягодицы', reps: '10 раз', text: 'Описание',
        load: { glutes: 1 }, pattern: 'hinge', gear: ['band_long'],
        unilateral: false, kind: 'strength',
      }],
    }],
    progression: ['Совет'],
    caution: 'Осторожно',
    ...overrides,
  };
}

test('корректная тренировка проходит проверку', () => {
  assert.deepEqual(validateWorkout(minimalWorkout()), []);
});

test('отсутствие обязательного поля верхнего уровня попадает в отчёт', () => {
  const w = minimalWorkout();
  delete w.title;
  const problems = validateWorkout(w);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /title/);
});

test('неизвестная группа мышц в load попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = { nonexistent: 1 };
  assert.match(validateWorkout(w).join('\n'), /nonexistent/);
});

test('значение load кроме 1 и 0.5 попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = { glutes: 0.7 };
  assert.match(validateWorkout(w).join('\n'), /0\.7/);
});

test('неизвестный pattern попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].pattern = 'flying';
  assert.match(validateWorkout(w).join('\n'), /flying/);
});

test('неизвестный инвентарь попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].gear = ['kettlebell'];
  assert.match(validateWorkout(w).join('\n'), /kettlebell/);
});

test('разминочному упражнению разрешён пустой load', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].kind = 'warmup';
  w.blocks[0].items[0].load = {};
  assert.deepEqual(validateWorkout(w), []);
});

test('силовому упражнению пустой load запрещён', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = {};
  assert.match(validateWorkout(w).join('\n'), /load/);
});

test('countMarks считает rounds умножить на число упражнений по всем блокам', () => {
  const w = minimalWorkout();
  w.blocks.push({
    id: 'b2', n: '02', title: 'Второй', sub: '', rounds: 3,
    items: [w.blocks[0].items[0], w.blocks[0].items[0]],
  });
  // блок 1: 2 круга * 1 упражнение = 2; блок 2: 3 круга * 2 упражнения = 6
  assert.equal(countMarks(w), 8);
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Cannot find module '../workouts/schema.js'`.

- [ ] **Step 3: Написать workouts/schema.js**

```js
import { isMuscleId } from '../muscles.js';

export const PATTERNS = ['hinge', 'squat', 'lunge', 'push', 'pull', 'core', 'mobility', 'stretch'];
export const GEAR = ['band_long', 'loop_short', 'none'];
export const KINDS = ['warmup', 'strength', 'cooldown'];
export const LOAD_VALUES = [0.5, 1];

const WORKOUT_FIELDS = ['id', 'kicker', 'title', 'lead', 'schedule', 'stats', 'gear', 'blocks', 'progression', 'caution'];
const BLOCK_FIELDS = ['id', 'n', 'title', 'sub', 'rounds', 'items'];
const ITEM_FIELDS = ['name', 'muscles', 'reps', 'text', 'load', 'pattern', 'gear', 'unilateral', 'kind'];

export function validateWorkout(workout) {
  const problems = [];

  for (const field of WORKOUT_FIELDS) {
    if (workout[field] === undefined) problems.push(`Тренировка: нет поля ${field}`);
  }
  if (!Array.isArray(workout.blocks)) return problems;

  for (const block of workout.blocks) {
    const where = `Блок ${block.id ?? '?'}`;
    for (const field of BLOCK_FIELDS) {
      if (block[field] === undefined) problems.push(`${where}: нет поля ${field}`);
    }
    if (!Number.isInteger(block.rounds) || block.rounds < 1) {
      problems.push(`${where}: rounds должен быть целым числом не меньше 1, получено ${block.rounds}`);
    }
    if (!Array.isArray(block.items)) continue;

    for (const item of block.items) {
      const at = `${where}, упражнение «${item.name ?? '?'}»`;
      for (const field of ITEM_FIELDS) {
        if (item[field] === undefined) problems.push(`${at}: нет поля ${field}`);
      }
      if (!PATTERNS.includes(item.pattern)) problems.push(`${at}: неизвестный pattern ${item.pattern}`);
      if (!KINDS.includes(item.kind)) problems.push(`${at}: неизвестный kind ${item.kind}`);
      if (typeof item.unilateral !== 'boolean') problems.push(`${at}: unilateral должен быть true или false`);

      for (const g of item.gear ?? []) {
        if (!GEAR.includes(g)) problems.push(`${at}: неизвестный инвентарь ${g}`);
      }

      const load = item.load ?? {};
      const entries = Object.entries(load);
      if (item.kind === 'strength' && entries.length === 0) {
        problems.push(`${at}: силовому упражнению нужен непустой load`);
      }
      for (const [id, value] of entries) {
        if (!isMuscleId(id)) problems.push(`${at}: неизвестная группа мышц ${id}`);
        if (!LOAD_VALUES.includes(value)) problems.push(`${at}: load[${id}] должен быть 1 или 0.5, получено ${value}`);
      }
    }
  }
  return problems;
}

export function countMarks(workout) {
  return workout.blocks.reduce((sum, block) => sum + block.rounds * block.items.length, 0);
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add workouts/schema.js test/schema.test.js
git commit -m "Валидатор схемы тренировки с проверкой разметки мышц"
```

---

### Task 4: Данные тренировки и разметка мышц

**Files:**
- Create: `workouts/legs-mwf.js`
- Create: `workouts/index.js`
- Create: `test/legs-mwf.test.js`
- Read: `src-original/app.js` (источник текстов)

**Interfaces:**
- Consumes: `validateWorkout`, `countMarks` из `workouts/schema.js`
- Produces:
  - `workouts/legs-mwf.js` — `export default` объект тренировки по схеме из Task 3
  - `workouts/index.js` — `WORKOUTS` (объект `id -> тренировка`), `DEFAULT_WORKOUT_ID`, `getWorkout(id)` (возвращает дефолтную при неизвестном id)

- [ ] **Step 1: Написать падающие тесты**

```js
// test/legs-mwf.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout, countMarks } from '../workouts/schema.js';
import legsMwf from '../workouts/legs-mwf.js';
import { getWorkout, DEFAULT_WORKOUT_ID } from '../workouts/index.js';

test('тренировка проходит валидацию схемы', () => {
  assert.deepEqual(validateWorkout(legsMwf), []);
});

test('в тренировке 8 блоков и 19 упражнений', () => {
  assert.equal(legsMwf.blocks.length, 8);
  assert.equal(legsMwf.blocks.flatMap(b => b.items).length, 19);
});

test('порядок и идентификаторы блоков совпадают с оригиналом', () => {
  assert.deepEqual(
    legsMwf.blocks.map(b => b.id),
    ['start', 'circuit', 'legs1', 'legs2', 'legs3', 'upper1', 'upper2', 'finish'],
  );
});

test('всего 37 отметок, как на исходном сайте', () => {
  assert.equal(countMarks(legsMwf), 37);
});

test('каждое силовое упражнение имеет хотя бы одну целевую группу', () => {
  for (const item of legsMwf.blocks.flatMap(b => b.items)) {
    if (item.kind !== 'strength') continue;
    const primary = Object.values(item.load).filter(v => v === 1);
    assert.ok(primary.length >= 1, `«${item.name}»: нет группы с load 1`);
  }
});

test('приводящие и средняя ягодичная размечены — программа заявлена на них', () => {
  const load = legsMwf.blocks.flatMap(b => b.items).map(i => i.load);
  assert.ok(load.some(l => l.adductors === 1), 'нет упражнения с целевыми приводящими');
  assert.ok(load.some(l => l.glutes_med === 1), 'нет упражнения с целевой средней ягодичной');
});

test('реестр отдаёт тренировку по id и падает на дефолт при неизвестном', () => {
  assert.equal(getWorkout('legs-mwf').id, 'legs-mwf');
  assert.equal(getWorkout('нет-такой').id, DEFAULT_WORKOUT_ID);
  assert.equal(getWorkout(undefined).id, DEFAULT_WORKOUT_ID);
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Cannot find module '../workouts/legs-mwf.js'`.

- [ ] **Step 3: Перенести тексты из src-original/app.js**

Открыть `src-original/app.js`. В нём объявлен `const blocks=[…]` — восемь блоков с полями `id, n, title, sub, rounds, note?, items`, каждый item с `name, reps, muscles, text, detail?, extra?, v?, links?, key?`.

Перенести всё содержимое дословно в `workouts/legs-mwf.js`, обернув в объект тренировки. Тексты верхнего уровня (`kicker`, `title`, `lead`, `stats`, `gear`, `progression`, `caution`, `schedule`) взять из `src-original/index.html` — они там в разметке, а не в JS.

Поле `v` остаётся в исходном виде `[youtubeId, стартСек, подпись]`. Ссылка на YouTube собирается в рендерере, а не хранится в данных.

Ни один текст не переписывать и не сокращать: это содержательная часть программы.

- [ ] **Step 4: Разметить каждое упражнение**

Добавить к каждому упражнению `load`, `pattern`, `gear`, `unilateral`, `kind`. Ниже — разметка целиком, по порядку блоков.

```
start / Подкручивание таза лёжа
  load {abs:1, lower_back:0.5}  pattern core       gear [none]        unilateral false  kind warmup
start / Разворот грудного отдела у стены
  load {}                       pattern mobility   gear [none]        unilateral true   kind warmup

circuit / «Китайское» приседание с подъёмом таза и разворотом
  load {quads:1, glutes:1, obliques:0.5}  pattern squat  gear [none]  unilateral true   kind warmup
circuit / Подъём колена с лёгкой резинкой
  load {hip_flexors:1, abs:0.5}  pattern core      gear [loop_short]  unilateral true   kind warmup
circuit / Разведение резинки над головой
  load {delts_side:1, delts_rear:0.5, traps:0.5}  pattern pull  gear [band_long]  unilateral false  kind warmup
circuit / Подъём и опускание вытянутых ног лёжа
  load {abs:1, hip_flexors:1}    pattern core      gear [none]        unilateral false  kind warmup

legs1 / Румынская тяга с длинной резинкой
  load {hamstrings:1, glutes:1, lower_back:0.5}   pattern hinge  gear [band_long]  unilateral false  kind strength
legs1 / Приведение ноги перед собой с резинкой
  load {adductors:1}             pattern core      gear [loop_short]  unilateral true   kind strength

legs2 / Ягодичный мост
  load {glutes:1, hamstrings:0.5}  pattern hinge   gear [loop_short]  unilateral false  kind strength
legs2 / Жим двумя ногами лёжа
  load {quads:1, glutes:0.5}     pattern squat     gear [band_long]   unilateral false  kind strength

legs3 / Подъём верхней ноги лёжа на боку
  load {glutes_med:1}            pattern core      gear [loop_short]  unilateral true   kind strength
legs3 / «Птица-собака»: противоположные рука и нога
  load {lower_back:1, glutes:0.5, abs:0.5, delts_front:0.5}  pattern core  gear [none]  unilateral true  kind strength

upper1 / Тяга резинки сидя к поясу
  load {lats:1, upper_back:1, biceps:0.5}  pattern pull  gear [band_long]  unilateral false  kind strength
upper1 / Жим резинки от груди стоя
  load {chest:1, triceps:0.5, delts_front:0.5}  pattern push  gear [band_long]  unilateral false  kind strength

upper2 / Тяга короткой резинки одной рукой к груди
  load {delts_side:1, upper_back:0.5, biceps:0.5}  pattern pull  gear [loop_short]  unilateral true  kind strength
upper2 / Разгибание одной руки вверх
  load {triceps:1}               pattern push      gear [loop_short]  unilateral true   kind strength

finish / Растяжка сгибателя бедра с колена
  load {}                        pattern stretch   gear [none]        unilateral true   kind cooldown
finish / Подтягивание бёдер к животу лёжа
  load {}                        pattern stretch   gear [none]        unilateral false  kind cooldown
finish / Спокойное дыхание
  load {}                        pattern stretch   gear [none]        unilateral false  kind cooldown
```

Разметка составлена по описаниям упражнений и является инженерным суждением, а не заключением тренера. Она выносится на вычитку в Task 9.

- [ ] **Step 5: Написать реестр тренировок**

```js
// workouts/index.js
import legsMwf from './legs-mwf.js';

export const WORKOUTS = {
  'legs-mwf': legsMwf,
};

export const DEFAULT_WORKOUT_ID = 'legs-mwf';

export function getWorkout(id) {
  return WORKOUTS[id] ?? WORKOUTS[DEFAULT_WORKOUT_ID];
}
```

- [ ] **Step 6: Запустить тесты**

Run: `npm test`
Expected: PASS. Если `countMarks` даёт не 37 — сверить `rounds` каждого блока с оригиналом (1, 3, 2, 2, 2, 2, 2, 1).

- [ ] **Step 7: Сверить тексты с оригиналом**

Run: `node -e "import('./workouts/legs-mwf.js').then(m=>console.log(m.default.blocks.flatMap(b=>b.items).map(i=>i.name).join('\n')))"`
Expected: 19 названий, дословно совпадающих с названиями на исходном сайте.

- [ ] **Step 8: Коммит**

```bash
git add workouts/legs-mwf.js workouts/index.js test/legs-mwf.test.js
git commit -m "Данные тренировки legs-mwf с разметкой групп мышц"
```

---

### Task 5: Адаптер хранилища прогресса

**Files:**
- Create: `storage.js`
- Create: `test/storage.test.js`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `createStorage({ cloud, local, today }) -> { load(workoutId), save(workoutId, marks), clear(workoutId) }`
  - `load` возвращает `Promise<Set<string>>` — множество идентификаторов отметок
  - `save` и `clear` возвращают `Promise<void>`
  - `pickBackend(win) -> 'cloud' | 'local'` — выбор бэкенда по наличию `win.Telegram.WebApp.CloudStorage`
  - Ключ хранения: `w:<workoutId>:<YYYY-MM-DD>`

- [ ] **Step 1: Написать падающие тесты**

```js
// test/storage.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage, pickBackend, storageKey } from '../storage.js';

function fakeLocal() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map,
  };
}

const today = () => '2026-09-14';

test('ключ включает id тренировки и дату', () => {
  assert.equal(storageKey('legs-mwf', '2026-09-14'), 'w:legs-mwf:2026-09-14');
});

test('пустое хранилище отдаёт пустое множество', async () => {
  const s = createStorage({ local: fakeLocal(), today });
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('сохранённые отметки читаются обратно', async () => {
  const local = fakeLocal();
  const s = createStorage({ local, today });
  await s.save('legs-mwf', new Set(['start-0-1', 'legs1-1-2']));
  const marks = await s.load('legs-mwf');
  assert.deepEqual([...marks].sort(), ['legs1-1-2', 'start-0-1']);
});

test('clear стирает отметки текущего дня', async () => {
  const local = fakeLocal();
  const s = createStorage({ local, today });
  await s.save('legs-mwf', new Set(['a']));
  await s.clear('legs-mwf');
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('отметки за вчера сегодня не читаются', async () => {
  const local = fakeLocal();
  await createStorage({ local, today: () => '2026-09-13' }).save('legs-mwf', new Set(['a']));
  const marks = await createStorage({ local, today }).load('legs-mwf');
  assert.deepEqual([...marks], []);
});

test('битое значение в хранилище не роняет загрузку', async () => {
  const local = fakeLocal();
  local.setItem('w:legs-mwf:2026-09-14', 'не json');
  const marks = await createStorage({ local, today }).load('legs-mwf');
  assert.deepEqual([...marks], []);
});

test('CloudStorage используется когда доступен', async () => {
  const store = new Map();
  const cloud = {
    setItem: (k, v, cb) => { store.set(k, v); cb?.(null, true); },
    getItem: (k, cb) => cb(null, store.get(k) ?? ''),
    removeItem: (k, cb) => { store.delete(k); cb?.(null, true); },
  };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  await s.save('legs-mwf', new Set(['x']));
  assert.ok(store.has('w:legs-mwf:2026-09-14'), 'запись не ушла в CloudStorage');
  assert.deepEqual([...(await s.load('legs-mwf'))], ['x']);
});

test('ошибка CloudStorage не роняет загрузку', async () => {
  const cloud = { getItem: (k, cb) => cb(new Error('нет сети')), setItem: (k, v, cb) => cb?.(null, true) };
  const s = createStorage({ cloud, local: fakeLocal(), today });
  assert.deepEqual([...(await s.load('legs-mwf'))], []);
});

test('pickBackend выбирает cloud только при наличии CloudStorage', () => {
  assert.equal(pickBackend({ Telegram: { WebApp: { CloudStorage: {} } } }), 'cloud');
  assert.equal(pickBackend({ Telegram: { WebApp: {} } }), 'local');
  assert.equal(pickBackend({}), 'local');
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Cannot find module '../storage.js'`.

- [ ] **Step 3: Написать storage.js**

```js
// Прогресс живёт в CloudStorage внутри Telegram и в localStorage снаружи.
// Ключ включает дату, поэтому отметки сами сбрасываются на следующий день.
export function storageKey(workoutId, date) {
  return `w:${workoutId}:${date}`;
}

export function pickBackend(win) {
  return win?.Telegram?.WebApp?.CloudStorage ? 'cloud' : 'local';
}

function parseMarks(raw) {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function createStorage({ cloud = null, local = null, today = () => new Date().toISOString().slice(0, 10) } = {}) {
  const read = key => new Promise(resolve => {
    if (cloud) {
      cloud.getItem(key, (err, value) => resolve(err ? '' : value));
      return;
    }
    try { resolve(local?.getItem(key) ?? ''); } catch { resolve(''); }
  });

  const write = (key, value) => new Promise(resolve => {
    if (cloud) {
      cloud.setItem(key, value, () => resolve());
      return;
    }
    try { local?.setItem(key, value); } catch { /* приватный режим — молча пропускаем */ }
    resolve();
  });

  const drop = key => new Promise(resolve => {
    if (cloud) {
      cloud.removeItem(key, () => resolve());
      return;
    }
    try { local?.removeItem(key); } catch { /* см. выше */ }
    resolve();
  });

  return {
    async load(workoutId) {
      return parseMarks(await read(storageKey(workoutId, today())));
    },
    async save(workoutId, marks) {
      await write(storageKey(workoutId, today()), JSON.stringify([...marks]));
    },
    async clear(workoutId) {
      await drop(storageKey(workoutId, today()));
    },
  };
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add storage.js test/storage.test.js
git commit -m "Адаптер прогресса CloudStorage и localStorage"
```

---

### Task 6: Рендерер тренировки

**Files:**
- Create: `render.js`
- Create: `test/render.test.js`
- Read: `src-original/app.js` (разметка и имена классов)

**Interfaces:**
- Consumes: ничего
- Produces:
  - `renderWorkout(workout, document) -> DocumentFragment` — весь список блоков с упражнениями
  - `renderIntro(workout, document) -> void` — заполняет шапку, факты, навигацию, инвентарь, прогрессию и предупреждение из данных
  - `markId(blockId, itemIndex, round) -> string` — идентификатор отметки, формат `<blockId>-<itemIndex>-<round>`, round считается с 1
  - `videoUrl(v) -> string` — `https://www.youtube.com/watch?v=<id>&t=<sec>s`

Примечание к спеке: спека называет рендерер `app.js`. Здесь он разделён на `render.js` (чистое построение DOM, тестируемое) и `app.js` (связывание, Task 8). Это следует принципу спеки «один файл — одна ответственность».

- [ ] **Step 1: Написать падающие тесты**

```js
// test/render.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { renderWorkout, renderIntro, markId, videoUrl } from '../render.js';
import legsMwf from '../workouts/legs-mwf.js';

test('markId собирает идентификатор из блока, индекса и круга', () => {
  assert.equal(markId('legs1', 0, 1), 'legs1-0-1');
  assert.equal(markId('circuit', 3, 2), 'circuit-3-2');
});

test('videoUrl собирает ссылку с таймкодом', () => {
  assert.equal(videoUrl(['VZ3f0pSTObM', 20, '0:20']), 'https://www.youtube.com/watch?v=VZ3f0pSTObM&t=20s');
});

test('рендерятся все восемь блоков с якорями', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const sections = fragment.querySelectorAll('section.block');
  assert.equal(sections.length, 8);
  assert.deepEqual(
    [...sections].map(s => s.id),
    ['start', 'circuit', 'legs1', 'legs2', 'legs3', 'upper1', 'upper2', 'finish'],
  );
});

test('рендерятся все 19 упражнений', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  assert.equal(fragment.querySelectorAll('.exercise').length, 19);
});

test('число кнопок отметок совпадает с countMarks', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  assert.equal(fragment.querySelectorAll('button[data-mark]').length, 37);
});

test('идентификаторы отметок уникальны', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const ids = [...fragment.querySelectorAll('button[data-mark]')].map(b => b.dataset.mark);
  assert.equal(new Set(ids).size, ids.length);
});

test('у блока с одним кругом кнопка подписана «Готово», у многокруговых — «Круг N»', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const start = fragment.querySelector('#start');
  assert.equal(start.querySelector('button[data-mark]').textContent, 'Готово');
  const circuit = fragment.querySelector('#circuit');
  const labels = [...circuit.querySelectorAll('.exercise')[0].querySelectorAll('button[data-mark]')].map(b => b.textContent);
  assert.deepEqual(labels, ['Круг 1', 'Круг 2', 'Круг 3']);
});

test('ссылка на видео ведёт на YouTube с таймкодом', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const link = fragment.querySelector('#start a.video');
  assert.equal(link.href, 'https://www.youtube.com/watch?v=VZ3f0pSTObM&t=20s');
});

test('упражнение без видео не получает ссылку', () => {
  const { document } = makeDom();
  const workout = structuredClone(legsMwf);
  delete workout.blocks[0].items[0].v;
  const fragment = renderWorkout(workout, document);
  assert.equal(fragment.querySelector('#start .exercise a.video'), null);
});

test('renderIntro заполняет шапку из данных, а не из статики HTML', () => {
  const { document } = makeDom(`<!doctype html><html><body>
    <p class="eyebrow"></p><h1></h1><p class="intro-copy"></p>
    <div class="facts"></div><nav class="block-nav"></nav>
    <div class="equipment"></div><ol id="progression-list"></ol><div id="care"></div>
  </body></html>`);
  renderIntro(legsMwf, document);
  assert.equal(document.querySelector('.eyebrow').textContent, legsMwf.kicker);
  assert.match(document.querySelector('h1').textContent, /Акцент на ноги/);
  assert.equal(document.querySelector('.intro-copy').textContent, legsMwf.lead);
  assert.equal(document.querySelectorAll('.facts > div').length, legsMwf.stats.length);
  assert.equal(document.querySelector('.equipment').textContent, legsMwf.gear);
  assert.equal(document.querySelectorAll('#progression-list li').length, legsMwf.progression.length);
});

test('renderIntro строит навигацию по реальным блокам', () => {
  const { document } = makeDom(`<!doctype html><html><body>
    <p class="eyebrow"></p><h1></h1><p class="intro-copy"></p>
    <div class="facts"></div><nav class="block-nav"></nav>
    <div class="equipment"></div><ol id="progression-list"></ol><div id="care"></div>
  </body></html>`);
  renderIntro(legsMwf, document);
  const links = [...document.querySelectorAll('.block-nav a')];
  assert.equal(links.length, 8);
  assert.deepEqual(links.map(a => a.getAttribute('href')), legsMwf.blocks.map(b => `#${b.id}`));
});

test('тексты упражнения попадают в разметку', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const first = fragment.querySelector('#start .exercise');
  assert.equal(first.querySelector('h3').textContent, 'Подкручивание таза лёжа');
  assert.match(first.textContent, /8–10 раз/);
  assert.match(first.textContent, /Ляг на спину/);
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Cannot find module '../render.js'`.

- [ ] **Step 3: Написать render.js**

Разметку и имена классов взять из `src-original/app.js`, чтобы существующий `style.css` подошёл без правок. Обязательные точки сцепления с CSS и с `player.js`: секция блока — `section.block` с `id` равным `block.id`; упражнение — элемент с классом `exercise`, внутри `h3` с названием; ссылка на видео — `a.video`; дополнительные ссылки — `a.extra-link`; кнопки отметок — `button[data-mark="<markId>"]`.

```js
export function markId(blockId, itemIndex, round) {
  return `${blockId}-${itemIndex}-${round}`;
}

export function videoUrl([id, start = 0]) {
  return `https://www.youtube.com/watch?v=${id}&t=${start}s`;
}

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function renderItem(document, block, item, itemIndex) {
  const wrap = el(document, 'article', 'exercise');
  wrap.append(el(document, 'p', 'muscles', item.muscles));
  wrap.append(el(document, 'h3', null, item.name));
  wrap.append(el(document, 'p', 'reps', item.reps));
  wrap.append(el(document, 'p', 'howto', item.text));

  if (item.detail) {
    const details = document.createElement('details');
    details.append(el(document, 'summary', null, item.extra ? 'Техника и прогрессия' : 'Техника'));
    details.append(el(document, 'p', null, item.detail));
    if (item.extra) details.append(el(document, 'p', null, item.extra));
    wrap.append(details);
  }

  if (item.v) {
    const link = el(document, 'a', 'video', `Видео · ${item.v[2]}`);
    link.href = videoUrl(item.v);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    wrap.append(link);
  }

  for (const extra of item.links ?? []) {
    const link = el(document, 'a', 'extra-link', `${extra.label} · ${extra.v[2]}`);
    link.href = videoUrl(extra.v);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    wrap.append(link);
  }

  const marks = el(document, 'div', 'marks');
  for (let round = 1; round <= block.rounds; round += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mark = markId(block.id, itemIndex, round);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = block.rounds === 1 ? 'Готово' : `Круг ${round}`;
    marks.append(button);
  }
  wrap.append(marks);
  return wrap;
}

export function renderWorkout(workout, document) {
  const fragment = document.createDocumentFragment();

  for (const block of workout.blocks) {
    const section = el(document, 'section', 'block');
    section.id = block.id;
    const head = el(document, 'header', 'block-head');
    head.append(el(document, 'p', 'block-n', block.n));
    head.append(el(document, 'h2', null, block.title));
    head.append(el(document, 'p', 'block-sub', block.sub));
    head.append(el(document, 'p', 'block-rounds', block.rounds === 1 ? '1 круг' : `${block.rounds} круга`));
    if (block.note) head.append(el(document, 'p', 'block-note', block.note));
    section.append(head);

    block.items.forEach((item, index) => section.append(renderItem(document, block, item, index)));
    fragment.append(section);
  }

  return fragment;
}

// Тексты верхнего уровня тоже живут в данных: держать их ещё и в index.html
// значит рано или поздно получить расхождение между сайтом и тренировкой.
export function renderIntro(workout, document) {
  document.querySelector('.eyebrow').textContent = workout.kicker;

  const [first, ...rest] = workout.title.split(' ');
  const h1 = document.querySelector('h1');
  h1.replaceChildren(document.createTextNode(first), document.createElement('br'));
  h1.append(el(document, 'span', null, rest.join(' ')));

  document.querySelector('.intro-copy').textContent = workout.lead;

  const facts = document.querySelector('.facts');
  facts.replaceChildren(...workout.stats.map(stat => {
    const box = document.createElement('div');
    box.append(el(document, 'strong', null, stat.v), el(document, 'span', null, stat.l));
    return box;
  }));

  const nav = document.querySelector('.block-nav');
  nav.replaceChildren(...workout.blocks.map(block => {
    const link = el(document, 'a', null, block.title);
    link.href = `#${block.id}`;
    return link;
  }));

  document.querySelector('.equipment').textContent = workout.gear;
  document.getElementById('progression-list')
    .replaceChildren(...workout.progression.map(step => el(document, 'li', null, step)));
  document.getElementById('care')
    .replaceChildren(...workout.caution.split('\n\n').map(par => el(document, 'p', null, par)));
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add render.js test/render.test.js
git commit -m "Рендерер тренировки, отделённый от данных"
```

---

### Task 7: Слой Telegram

**Files:**
- Create: `telegram.js`
- Create: `test/telegram.test.js`

**Interfaces:**
- Consumes: ничего
- Produces:
  - `initTelegram(win) -> { available, webApp, workoutId, openLink(url), haptic(kind), onBack(handler), setBackVisible(visible) }`
  - `available` — `false`, если `win.Telegram.WebApp` нет
  - `workoutId` — из `initDataUnsafe.start_param`, иначе из `?w=`, иначе `null`
  - `haptic(kind)` принимает `'mark'` и `'done'`
  - `openLink(url)` вне Telegram делает `win.open(url, '_blank', 'noopener')`

- [ ] **Step 1: Написать падающие тесты**

```js
// test/telegram.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initTelegram } from '../telegram.js';

function fakeWebApp(overrides = {}) {
  const calls = [];
  return {
    calls,
    initDataUnsafe: {},
    ready: () => calls.push('ready'),
    expand: () => calls.push('expand'),
    disableVerticalSwipes: () => calls.push('disableVerticalSwipes'),
    setHeaderColor: c => calls.push(`header:${c}`),
    setBackgroundColor: c => calls.push(`bg:${c}`),
    openLink: url => calls.push(`open:${url}`),
    HapticFeedback: {
      impactOccurred: s => calls.push(`impact:${s}`),
      notificationOccurred: t => calls.push(`notify:${t}`),
    },
    BackButton: {
      show: () => calls.push('back:show'),
      hide: () => calls.push('back:hide'),
      onClick: () => calls.push('back:onClick'),
    },
    ...overrides,
  };
}

const fakeWin = (webApp, search = '') => ({
  Telegram: webApp ? { WebApp: webApp } : undefined,
  location: { search },
  open: () => {},
});

test('вне Telegram слой не падает и сообщает о недоступности', () => {
  const tg = initTelegram({ location: { search: '' }, open: () => {} });
  assert.equal(tg.available, false);
  assert.doesNotThrow(() => { tg.haptic('mark'); tg.setBackVisible(true); tg.onBack(() => {}); });
});

test('внутри Telegram вызываются ready, expand и запрет вертикальных свайпов', () => {
  const webApp = fakeWebApp();
  initTelegram(fakeWin(webApp));
  assert.ok(webApp.calls.includes('ready'));
  assert.ok(webApp.calls.includes('expand'));
  assert.ok(webApp.calls.includes('disableVerticalSwipes'));
});

test('цвета шапки и фона ставятся в фирменные', () => {
  const webApp = fakeWebApp();
  initTelegram(fakeWin(webApp));
  assert.ok(webApp.calls.includes('header:#152d4a'));
  assert.ok(webApp.calls.includes('bg:#152d4a'));
});

test('отсутствие новых методов у старого клиента не роняет инициализацию', () => {
  const webApp = fakeWebApp();
  delete webApp.disableVerticalSwipes;
  delete webApp.setHeaderColor;
  assert.doesNotThrow(() => initTelegram(fakeWin(webApp)));
});

test('start_param имеет приоритет над query-параметром', () => {
  const webApp = fakeWebApp({ initDataUnsafe: { start_param: 'from-start' } });
  assert.equal(initTelegram(fakeWin(webApp, '?w=from-query')).workoutId, 'from-start');
});

test('без start_param берётся query-параметр', () => {
  assert.equal(initTelegram(fakeWin(fakeWebApp(), '?w=from-query')).workoutId, 'from-query');
});

test('без обоих источников workoutId равен null', () => {
  assert.equal(initTelegram(fakeWin(fakeWebApp())).workoutId, null);
});

test('openLink внутри Telegram идёт через WebApp', () => {
  const webApp = fakeWebApp();
  initTelegram(fakeWin(webApp)).openLink('https://youtu.be/x');
  assert.ok(webApp.calls.includes('open:https://youtu.be/x'));
});

test('openLink вне Telegram открывает новое окно', () => {
  let opened = null;
  const win = { location: { search: '' }, open: url => { opened = url; } };
  initTelegram(win).openLink('https://youtu.be/x');
  assert.equal(opened, 'https://youtu.be/x');
});

test('haptic различает отметку и завершение блока', () => {
  const webApp = fakeWebApp();
  const tg = initTelegram(fakeWin(webApp));
  tg.haptic('mark');
  tg.haptic('done');
  assert.ok(webApp.calls.includes('impact:light'));
  assert.ok(webApp.calls.includes('notify:success'));
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Cannot find module '../telegram.js'`.

- [ ] **Step 3: Написать telegram.js**

```js
// Слой поверх Telegram WebApp. Всё опционально: приложение обязано
// работать в обычном браузере, где window.Telegram отсутствует.
const BRAND_BG = '#152d4a';

const safely = fn => { try { fn(); } catch { /* старый клиент — метода может не быть */ } };

export function initTelegram(win = globalThis) {
  const webApp = win?.Telegram?.WebApp ?? null;
  const available = Boolean(webApp);

  if (available) {
    safely(() => webApp.ready());
    safely(() => webApp.expand());
    safely(() => webApp.disableVerticalSwipes());
    safely(() => webApp.setHeaderColor(BRAND_BG));
    safely(() => webApp.setBackgroundColor(BRAND_BG));
  }

  const fromStart = webApp?.initDataUnsafe?.start_param ?? null;
  const fromQuery = new URLSearchParams(win?.location?.search ?? '').get('w');

  return {
    available,
    webApp,
    workoutId: fromStart || fromQuery || null,

    openLink(url) {
      if (available && typeof webApp.openLink === 'function') {
        safely(() => webApp.openLink(url));
        return;
      }
      win.open?.(url, '_blank', 'noopener');
    },

    haptic(kind) {
      if (!available) return;
      const h = webApp.HapticFeedback;
      if (!h) return;
      if (kind === 'done') safely(() => h.notificationOccurred('success'));
      else safely(() => h.impactOccurred('light'));
    },

    onBack(handler) {
      if (!available || !webApp.BackButton) return;
      safely(() => webApp.BackButton.onClick(handler));
    },

    setBackVisible(visible) {
      if (!available || !webApp.BackButton) return;
      safely(() => (visible ? webApp.BackButton.show() : webApp.BackButton.hide()));
    },
  };
}
```

- [ ] **Step 4: Запустить тесты**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Коммит**

```bash
git add telegram.js test/telegram.test.js
git commit -m "Слой Telegram с безопасной деградацией вне мессенджера"
```

---

### Task 8: Оболочка, таймер, сборка приложения

**Files:**
- Create: `index.html`
- Create: `style.css` (копия из `src-original/style.css` плюс правки safe area)
- Create: `player.css` (копия из `src-original/player.css`)
- Create: `player.js` (на основе `src-original/player.js`)
- Create: `timer.js`
- Create: `app.js`
- Create: `test/timer.test.js`

**Interfaces:**
- Consumes: `initTelegram` (telegram.js), `createStorage` (storage.js), `renderWorkout` и `renderIntro` (render.js), `getWorkout` (workouts/index.js)
- Produces: `setupPlayers(root, openLink)` в `player.js`
- Produces: `createTimer({ onTick, onDone })` с методами `setDuration(sec)`, `toggle()`, `reset()`, `tick()` и полями `remaining`, `running`

- [ ] **Step 1: Написать падающие тесты таймера**

```js
// test/timer.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTimer, formatTime } from '../timer.js';

test('formatTime переводит секунды в мм:сс', () => {
  assert.equal(formatTime(0), '00:00');
  assert.equal(formatTime(60), '01:00');
  assert.equal(formatTime(95), '01:35');
});

test('новый таймер стоит на выбранной длительности и не идёт', () => {
  const t = createTimer({});
  t.setDuration(45);
  assert.equal(t.remaining, 45);
  assert.equal(t.running, false);
});

test('toggle запускает и останавливает', () => {
  const t = createTimer({});
  t.setDuration(60);
  t.toggle();
  assert.equal(t.running, true);
  t.toggle();
  assert.equal(t.running, false);
});

test('tick уменьшает остаток только на ходу', () => {
  const t = createTimer({});
  t.setDuration(10);
  t.tick();
  assert.equal(t.remaining, 10);
  t.toggle();
  t.tick();
  assert.equal(t.remaining, 9);
});

test('по достижении нуля таймер останавливается и зовёт onDone один раз', () => {
  let done = 0;
  const t = createTimer({ onDone: () => { done += 1; } });
  t.setDuration(2);
  t.toggle();
  t.tick();
  t.tick();
  t.tick();
  assert.equal(t.remaining, 0);
  assert.equal(t.running, false);
  assert.equal(done, 1);
});

test('reset возвращает выбранную длительность и останавливает', () => {
  const t = createTimer({});
  t.setDuration(20);
  t.toggle();
  t.tick();
  t.reset();
  assert.equal(t.remaining, 20);
  assert.equal(t.running, false);
});
```

- [ ] **Step 2: Запустить и убедиться, что тесты падают**

Run: `npm test`
Expected: FAIL — `Cannot find module '../timer.js'`.

- [ ] **Step 3: Написать timer.js**

```js
export function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function createTimer({ onTick = () => {}, onDone = () => {} } = {}) {
  let duration = 60;
  const state = { remaining: 60, running: false };

  return {
    get remaining() { return state.remaining; },
    get running() { return state.running; },

    setDuration(seconds) {
      duration = seconds;
      state.remaining = seconds;
      state.running = false;
      onTick(state.remaining);
    },
    toggle() {
      state.running = !state.running;
      onTick(state.remaining);
    },
    reset() {
      state.remaining = duration;
      state.running = false;
      onTick(state.remaining);
    },
    tick() {
      if (!state.running) return;
      state.remaining = Math.max(0, state.remaining - 1);
      onTick(state.remaining);
      if (state.remaining === 0) {
        state.running = false;
        onDone();
      }
    },
  };
}
```

- [ ] **Step 4: Запустить тесты таймера**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Скопировать стили**

```bash
cp src-original/style.css style.css
cp src-original/player.css player.css
```

- [ ] **Step 6: Добавить в style.css отступ под safe area**

Нижняя панель таймера — элемент `.timer`. Дописать в конец `style.css`:

```css
/* Нижняя панель не должна уходить под системную полосу iPhone
   и под панель Telegram. Переменные отсутствуют вне Telegram — тогда 0px. */
.timer {
  padding-bottom: calc(var(--tg-safe-area-inset-bottom, 0px) + var(--tg-content-safe-area-inset-bottom, 0px));
}
.masthead {
  padding-top: var(--tg-content-safe-area-inset-top, 0px);
}
```

- [ ] **Step 7: Перенести player.js с фолбэком через Telegram**

Взять `src-original/player.js` целиком. Внести три правки:

1. Файл становится ES-модулем с экспортом: обернуть тело в `export function setupPlayers(root, openLink) {` … `}`, заменив `document.querySelectorAll` на `root.querySelectorAll`.
2. Внешняя ссылка «Открыть в YouTube» больше не полагается на `target="_blank"` — внутри Telegram он не работает. Заменить создание ссылки на кнопку с обработчиком:

```js
const external = document.createElement('button');
external.type = 'button';
external.className = 'player-external';
external.textContent = 'Открыть в YouTube';
external.addEventListener('click', () => openLink(source));
help.append(external);
```

3. Если iframe не загрузился за 3 секунды, показать подсказку — это и есть фолбэк для устройств, где встроенный плеер заблокирован:

```js
const failTimer = setTimeout(() => {
  help.firstChild.textContent = 'Видео не открылось здесь. ';
}, 3000);
frame.addEventListener('load', () => clearTimeout(failTimer));
```

Также добавить в `player.css` правило для новой кнопки, повторяющее вид бывшей ссылки:

```css
.player-external{border:0;background:none;padding:6px 0;font:inherit;font-size:14px;color:#193d6a;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
```

- [ ] **Step 8: Написать app.js**

```js
import { getWorkout } from './workouts/index.js';
import { renderWorkout, renderIntro } from './render.js';
import { createStorage } from './storage.js';
import { initTelegram } from './telegram.js';
import { createTimer, formatTime } from './timer.js';
import { setupPlayers } from './player.js';

const tg = initTelegram(window);
const workout = getWorkout(tg.workoutId);
const storage = createStorage({
  cloud: tg.webApp?.CloudStorage ?? null,
  local: window.localStorage,
});

renderIntro(workout, document);

const host = document.getElementById('workout');
host.replaceChildren(renderWorkout(workout, document));
setupPlayers(host, url => tg.openLink(url));

// Разметка отрисована сразу; отметки приезжают из хранилища и применяются следом.
const marks = new Set();
const progress = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const total = host.querySelectorAll('button[data-mark]').length;
progress.max = total;

function paint() {
  for (const button of host.querySelectorAll('button[data-mark]')) {
    const on = marks.has(button.dataset.mark);
    button.setAttribute('aria-pressed', String(on));
    button.classList.toggle('done', on);
  }
  progress.value = marks.size;
  progressText.textContent = `Сегодня: ${marks.size} из ${total} отметок`;
}

storage.load(workout.id).then(saved => {
  for (const id of saved) marks.add(id);
  paint();
});
paint();

host.addEventListener('click', event => {
  const button = event.target.closest('button[data-mark]');
  if (!button) return;
  const id = button.dataset.mark;
  if (marks.has(id)) marks.delete(id); else marks.add(id);
  paint();
  storage.save(workout.id, marks);

  const section = button.closest('section.block');
  const all = [...section.querySelectorAll('button[data-mark]')];
  tg.haptic(all.every(b => marks.has(b.dataset.mark)) ? 'done' : 'mark');
});

document.getElementById('reset').addEventListener('click', () => {
  marks.clear();
  paint();
  storage.clear(workout.id);
});

// Таймер отдыха
const value = document.getElementById('timer-value');
const status = document.getElementById('timer-status');
const toggle = document.getElementById('timer-toggle');

const timer = createTimer({
  onTick: remaining => {
    value.textContent = formatTime(remaining);
    toggle.textContent = timer.running ? 'Пауза' : 'Старт';
    status.textContent = timer.running ? 'Идёт отдых' : 'Выбери время';
  },
  onDone: () => {
    status.textContent = 'Отдых закончен';
    tg.haptic('done');
  },
});

setInterval(() => timer.tick(), 1000);
toggle.addEventListener('click', () => timer.toggle());
document.getElementById('timer-reset').addEventListener('click', () => timer.reset());

for (const preset of document.querySelectorAll('.presets button')) {
  preset.addEventListener('click', () => {
    for (const other of document.querySelectorAll('.presets button')) other.setAttribute('aria-pressed', 'false');
    preset.setAttribute('aria-pressed', 'true');
    timer.setDuration(Number(preset.dataset.time));
  });
}

// Кнопка «назад» показывается, когда пользователь ушёл ниже первого экрана.
tg.onBack(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
window.addEventListener('scroll', () => tg.setBackVisible(window.scrollY > window.innerHeight), { passive: true });
```

- [ ] **Step 9: Написать index.html**

Взять `src-original/index.html` как основу. Пять изменений:

1. Убрать инлайновый скрипт Cloudflare (если он ещё остался).
2. Перед своими скриптами подключить SDK: `<script src="https://telegram.org/js/telegram-web-app.js"></script>`.
3. Заменить два тега `<script src="app.js" defer>` и `<script src="player.js" defer>` на один `<script type="module" src="app.js"></script>`.
4. Опустошить контейнеры, которые теперь заполняет `renderIntro`, чтобы тексты не жили в двух местах сразу: `<p class="eyebrow">`, `<h1>`, `<p class="intro-copy">`, `<div class="facts">`, `<nav class="block-nav">`, `<div class="equipment">`. Список прогрессии внутри `section.guide` заменить на `<ol id="progression-list"></ol>`, два абзаца внутри `aside.care` — на `<div id="care"></div>`. Заголовки `<h2>` внутри `.guide` и `.care` остаются статикой.
5. В `<progress>` убрать жёсткое `max="37"` — значение ставится из JS.
6. Оставить `<noscript>` на месте: без JS теперь не отрисовывается ничего, и предупреждение стало важнее, чем было.

- [ ] **Step 10: Прогнать все тесты**

Run: `npm test`
Expected: PASS, все файлы тестов.

- [ ] **Step 11: Поднять локальный сервер и проверить вручную**

Run: `python3 -m http.server 8000`

Открыть `http://localhost:8000/` в Browser-панели и проверить:
- отрисованы 8 блоков и 19 упражнений;
- счётчик показывает «Сегодня: 0 из 37 отметок»;
- клик по отметке меняет её вид и увеличивает счётчик, после перезагрузки отметки на месте;
- «Сбросить отметки» обнуляет счётчик;
- пресеты таймера переключаются, «Старт» запускает обратный отсчёт, «↺» сбрасывает;
- клик по «Видео» открывает плеер, «Скрыть видео» закрывает;
- в консоли нет ошибок.

- [ ] **Step 12: Проверить мобильный вьюпорт**

Через `mcp__Claude_Browser__resize_window` выставить preset `mobile` (375×812) и убедиться: горизонтальной прокрутки нет, нижняя панель таймера не перекрывает контент, кнопки отметок нажимаемы.

Вернуть preset `desktop` после проверки.

- [ ] **Step 13: Коммит**

```bash
git add index.html style.css player.css player.js timer.js app.js test/timer.test.js
git commit -m "Оболочка приложения, таймер отдыха и сборка мини-аппа"
```

---

### Task 9: Сводка разметки для вычитки и README

**Files:**
- Create: `tools/muscle-report.js`
- Create: `docs/muscle-map.md` (генерируется)
- Create: `README.md`

**Interfaces:**
- Consumes: `legs-mwf.js`, `muscles.js`, `schema.js`
- Produces: `docs/muscle-map.md` — таблица «упражнение → группы мышц» и сводка подходов по группам

- [ ] **Step 1: Написать генератор отчёта**

```js
// tools/muscle-report.js
// Генерирует docs/muscle-map.md — сводку разметки для вычитки человеком.
import { writeFileSync } from 'node:fs';
import { MUSCLES, muscleLabel } from '../muscles.js';
import { WORKOUTS } from '../workouts/index.js';

const lines = ['# Разметка групп мышц', '',
  'Файл сгенерирован `node tools/muscle-report.js`. Правьте не его, а `workouts/*.js`.', '',
  'Разметка составлена по описаниям упражнений и нуждается в вычитке:',
  'ошибка здесь тихо исказит будущую оценку нагрузки.', ''];

for (const workout of Object.values(WORKOUTS)) {
  lines.push(`## ${workout.title}`, '');
  lines.push('| Блок | Упражнение | Целевые | Вспомогательные | Тип |', '|---|---|---|---|---|');

  const totals = new Map();
  for (const block of workout.blocks) {
    for (const item of block.items) {
      const primary = Object.entries(item.load).filter(([, v]) => v === 1).map(([id]) => muscleLabel(id));
      const secondary = Object.entries(item.load).filter(([, v]) => v === 0.5).map(([id]) => muscleLabel(id));
      lines.push(`| ${block.id} | ${item.name} | ${primary.join(', ') || '—'} | ${secondary.join(', ') || '—'} | ${item.kind} |`);

      if (item.kind !== 'strength') continue;
      for (const [id, v] of Object.entries(item.load)) {
        totals.set(id, (totals.get(id) ?? 0) + v * block.rounds);
      }
    }
  }

  lines.push('', '### Рабочие подходы за одну тренировку', '', '| Группа | Подходов |', '|---|---|');
  for (const [id, sum] of [...totals].sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${muscleLabel(id)} | ${sum} |`);
  }
  const untouched = Object.keys(MUSCLES).filter(id => !totals.has(id)).map(muscleLabel);
  lines.push('', `Не задействованы: ${untouched.join(', ') || '—'}`, '');
}

writeFileSync(new URL('../docs/muscle-map.md', import.meta.url), lines.join('\n'));
console.log('docs/muscle-map.md обновлён');
```

- [ ] **Step 2: Запустить генератор**

Run: `node tools/muscle-report.js`
Expected: `docs/muscle-map.md обновлён`, файл создан.

- [ ] **Step 3: Прочитать отчёт и проверить на бессмыслицу**

Открыть `docs/muscle-map.md`. Проверить три вещи: у каждого силового упражнения есть хотя бы одна целевая группа; приводящие и средняя ягодичная набирают заметный объём (программа заявлена на них); в списке «не задействованы» нет ничего неожиданного для тренировки на всё тело с акцентом на ноги.

Расхождения исправлять в `workouts/legs-mwf.js` и перегенерировать.

- [ ] **Step 4: Написать README.md**

```markdown
# Моя тренировка — Telegram Mini App

Домашняя тренировка с резинками, оформленная как Telegram Mini App.
Статика без сборки: файлы репозитория — ровно то, что отдаёт GitHub Pages.

## Локальный запуск

    python3 -m http.server 8000

Открыть http://localhost:8000/. Вне Telegram приложение работает как обычный
сайт: прогресс уходит в localStorage, вызовы Telegram API пропускаются.

## Тесты

    npm install
    npm test

## Структура

| Файл | Ответственность |
|---|---|
| `app.js` | связывание: роутинг, прогресс, таймер, подписки |
| `render.js` | построение DOM по объекту тренировки |
| `workouts/legs-mwf.js` | данные тренировки |
| `workouts/schema.js` | валидатор схемы и подсчёт отметок |
| `workouts/index.js` | реестр тренировок |
| `muscles.js` | словарь групп мышц и свёртка в регионы картинки |
| `storage.js` | прогресс: CloudStorage внутри Telegram, localStorage снаружи |
| `telegram.js` | слой Telegram с деградацией вне мессенджера |
| `timer.js` | таймер отдыха |
| `player.js` | видео с фолбэком на внешнее открытие |
| `src-original/` | архив исходного сайта, только для сверки |

## Добавить тренировку

1. Создать `workouts/<id>.js` по образцу `legs-mwf.js`.
2. Добавить строку в `WORKOUTS` в `workouts/index.js`.
3. Прогнать `npm test` — валидатор проверит разметку.
4. Обновить сводку: `node tools/muscle-report.js`.

Открыть конкретную тренировку: `?w=<id>` в браузере или
`t.me/fitdomabot/<app>?startapp=<id>` в Telegram.
```

- [ ] **Step 5: Прогнать тесты целиком**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Коммит**

```bash
git add tools/muscle-report.js docs/muscle-map.md README.md
git commit -m "Сводка разметки мышц для вычитки и README"
```

---

### Task 10: Подготовка к публикации

**Files:**
- Create: `.nojekyll`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: всё предыдущее
- Produces: дерево, готовое к заливке на GitHub Pages

- [ ] **Step 1: Отключить обработку Jekyll**

GitHub Pages по умолчанию прогоняет содержимое через Jekyll, который игнорирует файлы и папки, начинающиеся с подчёркивания, и может ломать отдачу. Пустой файл `.nojekyll` в корне это отключает.

```bash
touch .nojekyll
```

- [ ] **Step 2: Убедиться, что node_modules и src-original не попадут в публикацию**

`node_modules/` уже в `.gitignore`. Папка `src-original/` остаётся в репозитории намеренно — это архив для сверки, он не импортируется приложением и весит 34 КБ.

Run: `git status --short`
Expected: в списке нет `node_modules`.

- [ ] **Step 3: Проверить, что в репозитории нет секретов**

Run: `git grep -nE '[0-9]{8,10}:[A-Za-z0-9_-]{35}' -- . ':!docs' || echo "токенов не найдено"`
Expected: `токенов не найдено`.

- [ ] **Step 4: Финальный прогон тестов и сервера**

Run: `npm test`
Expected: PASS, все файлы.

Run: `python3 -m http.server 8000` и открыть заново — убедиться, что приложение работает из чистого дерева.

- [ ] **Step 5: Коммит**

```bash
git add .nojekyll
git commit -m "Подготовить дерево к публикации на GitHub Pages"
```

- [ ] **Step 6: Остановиться и передать управление**

Дальше идут действия за пределами репозитория, каждое требует отдельного подтверждения пользователя:

1. Создать публичный репозиторий `tg-workout` в аккаунте `yanad-adw` через веб-интерфейс GitHub в профиле Chrome «Ya».
2. Залить содержимое (кроме `node_modules/`).
3. Settings → Pages → Deploy from branch, `main`, папка `/` (root).
4. Проверить анонимный доступ к `https://yanad-adw.github.io/tg-workout/` — именно анонимный, иначе повторится история с закрытым ChatGPT-сайтом.
5. Подготовить иконку 640×360 для `/newapp` в фирменных цветах (фон `#152d4a`, акцент `#ceef69`), если пользователь не даёт свою.
6. Передать пользователю инструкцию для BotFather: `/newapp` для `@fitdomabot` с этим URL, затем `/setmenubutton`.

Не выполнять эти шаги без явного согласия.
