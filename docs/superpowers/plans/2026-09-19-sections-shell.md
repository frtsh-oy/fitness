# Оболочка с разделами — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** разделить приложение на четыре раздела с нижней навигацией и перенести таймер из полосы во всю ширину в пункт этой навигации.

**Architecture:** разделы — это показ и скрытие блоков одной страницы, а не переходы по адресам: приложение статическое и загружается один раз. Выбранный раздел и положение прокрутки «Сегодня» запоминаются там же, где остальное состояние. Таймер сохраняет всё поведение, меняется только его место на экране.

**Tech Stack:** ES-модули без сборки, `node --test` + jsdom для тестов.

**Spec:** `docs/superpowers/specs/2026-09-19-sections-shell-design.md`

## Global Constraints

- **Ноль зависимостей в рантайме и никакой сборки.** ES-модули грузятся браузером напрямую; в `package.json` только devDependencies (`jsdom`).
- Кириллица — настоящий UTF-8, без escape-последовательностей.
- Тесты: `node --test` из корня — **именно так, без пути**. `node --test test/` на Node 24 сломан, `node --test=test/` молча проглатывает падения.
- `vendor/body-highlighter.esm.js` не трогать: привязан контрольной суммой SHA-256 в `test/vendor.test.js`.
- **Высота нажимаемого — не ниже 44px.** Каждая новая кнопка обязана попасть в массив `TAP_TARGETS` в `test/app.test.js:1200`: сторож перебирает только перечисленные селекторы и иначе молча её не покрывает.
- В `dist/` сейчас 20 файлов (`find dist -type f`, не `ls`). Новые модули обязаны туда попадать: `tools/collect-site.mjs` обходит граф импортов от `index.html`.
- Поведение таймера не меняется: те же пресеты, тот же отсчёт, то же восстановление после перезагрузки.
- Признаков оплаты в хранилище Telegram не заводить: туда пишет клиент, и «оплачено» впишет туда кто угодно.

## Ловушка, на которой уже попались трое

`html` в `style.css` имеет `scroll-behavior: smooth`. Из-за этого `window.scrollTo(...)` возвращает управление **до** того, как прокрутка закончилась, и замер сразу после него читает старое положение — трое подряд решили, что прокрутка сломана.

В коде и в тестах прокручивай с `behavior: 'instant'`, а в браузере перечитывай положение после паузы. Это не дефект приложения.

---

## File Structure

| файл | ответственность |
|---|---|
| `index.html` (правка) | разметка: обёртки разделов, нижняя навигация, шторка таймера |
| `sections.js` (создать) | переключение разделов, память выбора и прокрутки |
| `app.js` (правка) | связывание разделов и переезд таймера |
| `style.css` (правка) | стили навигации, шторки и обёрток |
| `access.js` (создать) | единственная точка, отвечающая «есть ли подписка». Пока всегда «нет» |
| `test/sections.test.js` (создать) | переключение, память, прокрутка |
| `test/tabbar.test.js` (создать) | навигация и таймер в ней |
| `test/app.test.js` (правка) | новые кнопки в сторож высоты |

---

## Task 1: переключатель разделов

**Files:**
- Create: `sections.js`, `test/sections.test.js`
- Modify: `index.html`, `app.js`, `style.css`, `test/app.test.js`

**Interfaces:**
- Produces: `createSections({ win, onShow })` → `{ show(id), current() }`. `id` — одно из `'today' | 'workouts' | 'builder'`. `onShow(id)` вызывается после показа.

- [ ] **Step 1: Разметка**

В `index.html` заверни существующее содержимое `<main class="wrap">` в обёртку и добавь две пустые:

```html
<div class="screen" id="screen-today"><!-- сюда переезжает всё нынешнее содержимое main --></div>
<div class="screen" id="screen-workouts" hidden></div>
<div class="screen" id="screen-builder" hidden></div>
```

Перед `</body>`, но **после** `<aside class="timer">`, добавь навигацию. Таймер пока остаётся на месте — он переезжает в Task 2, и до тех пор две полосы стоят друг над другом. Это ожидаемо и не является дефектом.

```html
<nav class="tabbar" aria-label="Разделы">
<button type="button" data-section="today" aria-current="page">Сегодня</button>
<button type="button" data-section="workouts">Тренировки</button>
<button type="button" data-section="builder">Конструктор</button>
</nav>
```

- [ ] **Step 2: Падающий тест**

Создай `test/sections.test.js`:

```js
// Переключение разделов. Разделы — это показ и скрытие, а не переходы по
// адресам, поэтому проверяется именно видимость узлов, а не состояние истории.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mount = () => {
  const { window } = makeDom(html);
  return { window, document: window.document };
};
const shown = d => [...d.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);

test('по умолчанию открыт раздел «Сегодня», остальные скрыты', () => {
  const { window, document } = mount();
  startApp(window);
  assert.deepEqual(shown(document), ['screen-today']);
});

test('нажатие переключает раздел: открыт ровно один', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('[data-section="workouts"]').click();
  assert.deepEqual(shown(document), ['screen-workouts']);
  document.querySelector('[data-section="builder"]').click();
  assert.deepEqual(shown(document), ['screen-builder']);
});

test('выбранный раздел помечен для чтения с экрана', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('[data-section="workouts"]').click();
  const marked = [...document.querySelectorAll('.tabbar button')]
    .filter(b => b.getAttribute('aria-current') === 'page')
    .map(b => b.dataset.section);
  assert.deepEqual(marked, ['workouts'], 'пометка должна быть ровно на одном пункте');
});

test('выбор раздела переживает перезагрузку', () => {
  const first = mount();
  startApp(first.window);
  first.document.querySelector('[data-section="builder"]').click();
  assert.equal(first.window.localStorage.getItem('section'), 'builder');

  const second = mount();
  second.window.localStorage.setItem('section', 'builder');
  startApp(second.window);
  assert.deepEqual(shown(second.document), ['screen-builder']);
});

test('неизвестный раздел в хранилище не ломает запуск', () => {
  // Хранилище переживает смену версии приложения и правку руками: значение
  // оттуда — это ввод, а не гарантия.
  const { window, document } = mount();
  window.localStorage.setItem('section', 'выдумка');
  startApp(window);
  assert.deepEqual(shown(document), ['screen-today']);
});

test('«Сегодня» возвращается на то место, где его оставили', () => {
  const { window, document } = mount();
  startApp(window);
  window.scrollY = 900;
  document.querySelector('[data-section="workouts"]').click();
  document.querySelector('[data-section="today"]').click();
  assert.deepEqual(scrolls.at(-1), { top: 900, behavior: 'instant' },
    'при возврате в «Сегодня» прокрутка должна восстанавливаться');
});

test('прочие разделы открываются сверху', () => {
  const { window, document } = mount();
  startApp(window);
  window.scrollY = 900;
  document.querySelector('[data-section="workouts"]').click();
  assert.deepEqual(scrolls.at(-1), { top: 0, behavior: 'instant' });
});
```

**`test/setup.js` не трогай.** В проекте уже есть приём для этого — подмена
`window.scrollTo` внутри самого теста, см. `test/app.test.js:1001`:

```js
  const scrolls = [];
  window.scrollTo = options => scrolls.push(options);
```

Заводить вторую, глобальную заглушку значит держать два способа делать одно и
то же. Перепиши два теста про прокрутку под этот приём: собирай вызовы в массив
и проверяй последний. `window.scrollY` в jsdom записываемый — проверено, так что
задать исходное положение можно прямо присваиванием.

- [ ] **Step 3: Прогнать, убедиться, что падает**

Run: `node --test`
Expected: FAIL — узлов `.screen` и `.tabbar` нет либо переключение не работает.

- [ ] **Step 4: Написать `sections.js`**

```js
// Переключение разделов приложения.
//
// Разделы — это показ и скрытие блоков одной страницы, а не переходы по
// адресам: приложение статическое и загружается один раз, а настоящая
// маршрутизация добавила бы историю переходов, восстановление состояния и
// обработку неизвестных адресов ради четырёх экранов, между которыми
// переключаются нажатием.
const KEY = 'section';
const DEFAULT_ID = 'today';

// «Сегодня» — длинный раздел, и возвращаться в его начало при каждом
// переключении неудобно. Остальные короткие и открываются сверху.
const REMEMBERS_SCROLL = new Set(['today']);

export function createSections({ win, onShow }) {
  const document = win.document;
  const buttons = [...document.querySelectorAll('.tabbar button[data-section]')];
  const ids = buttons.map(button => button.dataset.section);
  const scrollAt = new Map();
  let current = DEFAULT_ID;

  function show(id) {
    // Значение приходит и из разметки, и из хранилища, которое переживает
    // смену версии приложения и правку руками. Неизвестное — не повод падать
    // на запуске, но и не повод показать пустой экран: открываем раздел по
    // умолчанию.
    const next = ids.includes(id) ? id : DEFAULT_ID;
    if (REMEMBERS_SCROLL.has(current)) scrollAt.set(current, win.scrollY);

    for (const button of buttons) {
      const mine = button.dataset.section === next;
      document.getElementById(`screen-${button.dataset.section}`).hidden = !mine;
      if (mine) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    current = next;

    // Здесь намеренно 'instant', а не scrollBehavior(win) из app.js: тот
    // отдаёт 'smooth' всем, кто не просил убрать плавность, и это уместно для
    // кнопки «назад», которая именно прокручивает. Переключение разделов —
    // не прокрутка, а смена экрана: анимировать её незачем, а у html стоит
    // scroll-behavior: smooth, из-за которого плавная прокрутка ещё и
    // возвращает управление до своего окончания.
    win.scrollTo({ top: REMEMBERS_SCROLL.has(next) ? (scrollAt.get(next) ?? 0) : 0, behavior: 'instant' });

    try { win.localStorage.setItem(KEY, next); } catch { /* приватный режим */ }
    if (onShow) onShow(next);
  }

  for (const button of buttons) {
    button.addEventListener('click', () => show(button.dataset.section));
  }

  return { show, current: () => current };
}

export function savedSection(win) {
  try { return win.localStorage.getItem(KEY); } catch { return null; }
}
```

- [ ] **Step 5: Подключить в `app.js`**

Рядом с остальным связыванием внутри `startApp`:

```js
  const sections = createSections({ win });
  sections.show(savedSection(win) ?? 'today');
```

Импорты добавь к существующим в шапке файла.

- [ ] **Step 6: Стили**

```css
.tabbar{position:fixed;left:0;right:0;bottom:0;z-index:6;display:flex;background:#fff;border-top:1px solid #d8e1eb;padding-bottom:env(safe-area-inset-bottom)}
.tabbar button{flex:1 1 0;min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border:0;background:transparent;font-family:inherit;font-size:11px;font-weight:600;color:#657289;cursor:pointer}
.tabbar button[aria-current=page]{color:#152d4a}
.screen[hidden]{display:none}
```

Нижний отступ содержимого увеличь на высоту навигации, чтобы последняя карточка не пряталась под ней.

- [ ] **Step 7: Добавить кнопки в сторож высоты**

В `test/app.test.js`, массив `TAP_TARGETS` (строка 1200), добавь `'.tabbar button',`. Без этого сторож новые кнопки не покрывает.

- [ ] **Step 8: Прогнать**

Run: `node --test`
Expected: PASS.

- [ ] **Step 9: Мутации**

| мутация | должно |
|---|---|
| `ids.includes(id) ? id : DEFAULT_ID` → `id` | упасть на тесте про неизвестный раздел |
| убрать `button.removeAttribute('aria-current')` | упасть на тесте про пометку |
| `REMEMBERS_SCROLL` сделать пустым | упасть на тесте про возврат «Сегодня» |
| `REMEMBERS_SCROLL` дополнить всеми разделами | упасть на тесте «открываются сверху» |
| убрать `try { setItem }` | упасть на тесте про перезагрузку |
| `behavior: 'instant'` → убрать | **эквивалентная**: если тесты зелёные, значит поведение прокрутки не проверено. Не подгоняй тест под неё — в jsdom это и не проверить; отметь в отчёте и проверь глазами в браузере |

- [ ] **Step 10: Посмотреть глазами**

`node tools/collect-site.mjs`, сервер на свежем порту, `localStorage` чистый, 375×812. Проверь: переключение, что под навигацией ничего не прячется, что «Сегодня» возвращается на место, что высота кнопок не ниже 44px по `getBoundingClientRect`.

- [ ] **Step 11: Закоммитить**

```bash
git add index.html sections.js app.js style.css test/sections.test.js test/setup.js test/app.test.js
git commit -m "Разделы: нижняя навигация и переключение"
```

---

## Task 2: таймер переезжает в навигацию

**Files:**
- Modify: `index.html`, `app.js`, `style.css`, `test/app.test.js`
- Create: `test/tabbar.test.js`

**Interfaces:**
- Consumes: `createSections` из Task 1 — пункт таймера живёт в той же полосе, но раздел не переключает.
- Produces: ничего нового наружу.

- [ ] **Step 1: Разметка**

Убери `<aside class="timer">` из `index.html` целиком. Вместо него добавь четвёртый пункт в навигацию и шторку:

```html
<button type="button" class="tabbar-timer" id="timer-open" aria-expanded="false" aria-controls="timer-sheet">Отдых</button>
```

```html
<div class="timer-sheet" id="timer-sheet" hidden>
<div class="timer-sheet-head"><span>ОТДЫХ</span><button type="button" id="timer-close" aria-label="Закрыть">✕</button></div>
<output id="timer-value" role="timer" aria-label="Оставшееся время отдыха"></output>
<div class="presets" aria-label="Длительность отдыха"><button data-time="20">20с</button><button data-time="45">45с</button><button data-time="60" aria-pressed="true">60с</button><button data-time="90">90с</button></div>
<button class="timer-start" id="timer-toggle">Старт</button>
<button class="timer-reset" id="timer-reset" aria-label="Сбросить таймер">↺</button>
<span id="timer-status" aria-live="polite">Выбери время</span>
</div>
```

Идентификаторы сохранены намеренно: связывание таймера в `app.js` ищет узлы по ним, и менять их незачем.

- [ ] **Step 2: Падающий тест**

Создай `test/tabbar.test.js`:

```js
// Таймер в навигации. Само поведение таймера проверено в существующих тестах —
// здесь только его новое место: шторка и подпись пункта.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mount = () => {
  const { window } = makeDom(html);
  return { window, document: window.document };
};

test('полосы таймера во всю ширину больше нет', () => {
  const { window, document } = mount();
  startApp(window);
  assert.equal(document.querySelector('aside.timer'), null,
    'прежняя полоса должна быть убрана, а не спрятана стилями');
});

test('шторка закрыта по умолчанию и открывается пунктом «Отдых»', () => {
  const { window, document } = mount();
  startApp(window);
  const sheet = document.getElementById('timer-sheet');
  assert.equal(sheet.hidden, true);
  document.getElementById('timer-open').click();
  assert.equal(sheet.hidden, false);
  assert.equal(document.getElementById('timer-open').getAttribute('aria-expanded'), 'true');
});

test('крестик закрывает шторку', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  document.getElementById('timer-close').click();
  assert.equal(document.getElementById('timer-sheet').hidden, true);
});

test('пока отдых идёт, пункт показывает время вместо подписи', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  document.getElementById('timer-toggle').click();
  const label = document.getElementById('timer-open').textContent.trim();
  assert.match(label, /\d\d:\d\d/, `в пункте должно быть время, а не «${label}»`);
});

test('в покое пункт подписан «Отдых»', () => {
  const { window, document } = mount();
  startApp(window);
  assert.equal(document.getElementById('timer-open').textContent.trim(), 'Отдых');
});

test('пункт «Отдых» не переключает раздел', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  const shown = [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);
  assert.deepEqual(shown, ['screen-today'], 'шторка не должна менять раздел');
});
```

- [ ] **Step 3: Прогнать, убедиться, что падает**

Run: `node --test`
Expected: FAIL.

- [ ] **Step 4: Переписать связывание таймера в `app.js`**

Существующий код таймера (около строки 457) найдёт узлы по прежним идентификаторам. Добавь к нему открытие и закрытие шторки и подпись пункта:

```js
  const openButton = document.getElementById('timer-open');
  const sheet = document.getElementById('timer-sheet');

  function setSheetOpen(open) {
    sheet.hidden = !open;
    openButton.setAttribute('aria-expanded', String(open));
  }

  openButton.addEventListener('click', () => setSheetOpen(sheet.hidden));
  document.getElementById('timer-close').addEventListener('click', () => setSheetOpen(false));
```

В том же обработчике отрисовки таймера, где сейчас обновляется `#timer-value`, добавь подпись пункта:

```js
      // Пока отдых идёт, время видно в навигации: это единственное место, где
      // таймер занимает место постоянно, и ради него шторку открывать не надо.
      openButton.textContent = timer.running ? formatTime(remaining) : 'Отдых';
```

- [ ] **Step 5: Стили**

```css
.timer-sheet{position:fixed;left:0;right:0;bottom:56px;z-index:7;background:#152d4a;color:#fff;border-radius:16px 16px 0 0;padding:14px 14px 16px;box-shadow:0 -10px 30px #142a4647}
.timer-sheet[hidden]{display:none}
.timer-sheet output{display:block;text-align:center;font-size:46px;font-weight:650;line-height:1;margin:6px 0 14px;font-variant-numeric:tabular-nums}
.tabbar-timer[aria-expanded=true]{color:#152d4a}
```

Прежние правила `.timer`, `.timer-inner`, `.timer-head`, `.timer-controls` из `style.css` убери — полосы больше нет. Правила `.presets`, `.timer-start`, `.timer-reset` сохрани: кнопки переехали в шторку.

- [ ] **Step 6: Сторож высоты**

Замени `'.timer button'` в `TAP_TARGETS` на `'.timer-sheet button'`. Старый селектор после переезда ничего не накрывает, и сторож обязан упасть с сообщением про беззубость — это его правильное поведение, а не поломка.

**`'.tabbar-timer'` отдельно добавлять не надо:** кнопка лежит внутри `.tabbar`, а `'.tabbar button'` там уже есть с Task 1. Второй селектор на то же самое — лишняя запись, которая создаёт вид покрытия там, где оно уже есть.

- [ ] **Step 7: Прогнать**

Run: `node --test`
Expected: PASS. Все существующие тесты таймера обязаны остаться зелёными без правок по существу: поведение не менялось.

- [ ] **Step 8: Мутации**

| мутация | должно |
|---|---|
| `openButton.textContent = ...` заменить на постоянное `'Отдых'` | упасть на тесте про время в пункте |
| `sheet.hidden = !open` → `= false` | упасть на тесте про крестик |
| убрать `setAttribute('aria-expanded')` | упасть |
| вернуть `<aside class="timer">` в разметку | упасть на первом тесте |

- [ ] **Step 9: Посмотреть глазами**

Замерь высоту нижних полос при 375×812: навигация 56px, шторка появляется только по нажатию. Сравни с прежними 104px таймера и назови фактическую экономию.

- [ ] **Step 10: Закоммитить**

```bash
git add index.html app.js style.css test/tabbar.test.js test/app.test.js
git commit -m "Таймер переехал в навигацию: шторка вместо полосы во всю ширину"
```

---

## Task 3: содержимое разделов «Тренировки» и «Конструктор»

**Files:**
- Create: `access.js`, `workouts-view.js`, `test/access.test.js`
- Modify: `app.js`, `style.css`, `index.html`
- Test: `test/sections.test.js` (дополнить)

**Interfaces:**
- Consumes: `WORKOUTS`, `getWorkout` из `./workouts/index.js`.
- Produces: `hasSubscription()` из `./access.js` → `false` всегда. `renderWorkouts({ host, workouts, currentId, onPick })` из `./workouts-view.js`.

- [ ] **Step 1: Падающий тест на доступ**

Создай `test/access.test.js`:

```js
// Единственная точка, отвечающая «есть ли подписка». Сервера ещё нет, и
// честный ответ один: подписки нет. Признак оплаты НЕ хранится в хранилище
// Telegram: туда пишет клиент, и «оплачено» впишет туда кто угодно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasSubscription } from '../access.js';

test('пока сервера нет, подписки нет', () => {
  assert.equal(hasSubscription(), false);
});

test('ответ не зависит от того, что лежит в хранилище', () => {
  const source = readFileSync(new URL('../access.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|CloudStorage/,
    'подписка не должна читаться из хранилища, доступного клиенту на запись');
});
```

- [ ] **Step 2: Прогнать, убедиться, что падает**

Run: `node --test`
Expected: FAIL — `Cannot find module '../access.js'`.

- [ ] **Step 3: Написать `access.js`**

```js
// Есть ли у человека подписка.
//
// Сервера ещё нет, поэтому ответ один и честный: подписки нет. Когда сервер
// появится, меняется только этот файл — он для того и заведён отдельным.
//
// Признак оплаты НЕ хранится ни в localStorage, ни в CloudStorage Telegram:
// в оба пишет клиент, и «оплачено: да» впишет туда кто угодно. Решать о
// доступе может только сервер, проверивший подпись данных запуска.
export function hasSubscription() {
  return false;
}
```

- [ ] **Step 4: Падающий тест на содержимое разделов**

Допиши в `test/sections.test.js`:

```js
test('«Тренировки» показывают то, что есть в реестре', async () => {
  const { WORKOUTS } = await import('../workouts/index.js');
  const { window, document } = mount();
  startApp(window);
  document.querySelector('[data-section="workouts"]').click();
  const cards = document.querySelectorAll('#screen-workouts .workout-card');
  assert.equal(cards.length, Object.keys(WORKOUTS).length);
  assert.match(document.querySelector('#screen-workouts').textContent, /Всё тело/);
});

test('текущая тренировка помечена в списке', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('[data-section="workouts"]').click();
  const marked = document.querySelectorAll('#screen-workouts .workout-card[aria-current]');
  assert.equal(marked.length, 1);
});

test('«Конструктор» объясняет, что это и почему платно', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('[data-section="builder"]').click();
  const text = document.querySelector('#screen-builder').textContent;
  assert.match(text, /платн/i, 'должно быть сказано, что раздел платный');
  assert.match(text, /упражнени/i, 'должно быть сказано, что в нём будет');
  assert.ok(text.trim().length > 80, 'заглушка не должна быть пустым экраном');
});
```

- [ ] **Step 5: Написать `workouts-view.js` и заглушку конструктора**

```js
// Список тренировок из реестра. Платных тренировок сегодня нет, поэтому
// заблокированных карточек здесь тоже нет: показываем то, что есть.
export function renderWorkouts({ host, workouts, currentId, onPick }) {
  const document = host.ownerDocument;
  host.textContent = '';
  for (const [id, workout] of Object.entries(workouts)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'workout-card';
    if (id === currentId) card.setAttribute('aria-current', 'true');
    const title = document.createElement('span');
    title.className = 'workout-card-title';
    title.textContent = workout.title;
    const kicker = document.createElement('span');
    kicker.className = 'workout-card-kicker';
    kicker.textContent = workout.kicker;
    card.append(title, kicker);
    card.addEventListener('click', () => onPick(id));
    host.append(card);
  }
}
```

Заглушку конструктора собери прямо в `app.js` или отдельной функцией — но текстом, объясняющим три вещи: что это за раздел, что в нём будет (библиотека упражнений и сборка своих тренировок) и что он платный. Формулируй сам; проверка по тексту в тесте выше.

- [ ] **Step 6: Связать в `app.js`**

Раздел «Тренировки» рисуй при первом показе, а не при запуске: `createSections` принимает `onShow`, и это его назначение.

- [ ] **Step 7: Прогнать**

Run: `node --test`
Expected: PASS.

- [ ] **Step 8: Мутации**

| мутация | должно |
|---|---|
| `hasSubscription` → `true` | ничего не упадёт: сегодня её никто не спрашивает. Это ожидаемо, отметь в отчёте |
| убрать `aria-current` у текущей тренировки | упасть |
| выкинуть половину списка тренировок | упасть на сверке с размером реестра |
| сократить текст заглушки до одного слова | упасть |

- [ ] **Step 9: Посмотреть глазами и закоммитить**

```bash
git add access.js workouts-view.js app.js style.css index.html test/access.test.js test/sections.test.js
git commit -m "Разделы «Тренировки» и «Конструктор»: список и честная заглушка"
```

---

## Самопроверка плана

**Покрытие спеки.** Четыре пункта навигации — Task 1 и 2. Таймер как пункт со шторкой и временем в подписи — Task 2. Карта тела и нагрузка остаются внутри «Сегодня» — следствие того, что содержимое `main` переезжает целиком, отдельной задачи не требует. Память выбора и прокрутки — Task 1. Заглушка конструктора и точка проверки подписки — Task 3. Высота нажимаемого — шаги про `TAP_TARGETS` в Task 1 и 2.

**Чего в плане нет, и это соответствует спеке:** сервера, платежей, настоящего разграничения, загрузки тренировок извне.

**Согласованность имён.** `createSections({ win, onShow })` объявлен в Task 1 и используется в Task 3. `hasSubscription()` объявлен в Task 3 и больше нигде не вызывается — это намеренно, о чём сказано в таблице мутаций. Идентификаторы узлов таймера (`timer-value`, `timer-toggle`, `timer-reset`, `timer-status`) сохранены из нынешней разметки, потому что связывание в `app.js` ищет по ним.

**Проверенные допущения.** Перед сдачей сверила пять мест с кодом, и все подтвердились: `fillBrowserGaps` в `test/setup.js` существует и `scrollTo` там ещё не подменён; идентификаторы узлов таймера в разметке те самые; `'.timer button'` действительно стоит в `TAP_TARGETS`; `formatTime` отдаёт `ММ:СС`, как и ждёт тест; `kicker` у тренировки — «ДОМА · С РЕЗИНКАМИ».

Одну свою ошибку при этом нашла и исправила: класс назывался `workout-card-days`, а клал в него `kicker`, то есть не дни. Название, обещающее не то, что в коде, — дефект, который эта работа ловит с первого дня; здесь он попался в тексте плана, до кода.

**Известный риск.** В Task 1 две нижние полосы стоят друг над другом, пока Task 2 не уберёт старую. Это сказано в шаге прямо, чтобы ревьюер не счёл это дефектом.

**Мелочь, о которой стоит знать исполнителю.** Ссылка-логотип в шапке ведёт на `#top`, а это `<main id="top">`. Содержимое `main` переезжает внутрь обёрток разделов, но сам `main` и его идентификатор остаются, поэтому ссылка продолжает работать из любого раздела.
