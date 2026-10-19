# Конструктор тренировок и библиотека упражнений — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Рабочий раздел «Конструктор»: библиотека упражнений из таблицы владельца, ручная сборка, генератор на всё тело по уровню и зонам упора, замена упражнения, свои тренировки в CloudStorage и настоящее переключение тренировок в «Сегодня».

**Architecture:** Библиотека — сгенерированный `exercises/library.js` (импорт из CSV таблицы с проверками). Вся логика конструктора — чистые модули в `builder/` (правила, порядок пар, сжатый формат, покрытие, генератор, замена) поверх существующего `weeklySets`. Своя тренировка хранится сжатой записью в CloudStorage через общий слой `kv.js` и разворачивается в обычную тренировку, которую `validateWorkout`, рендерер, карта, недельная нагрузка и отметки принимают без изменений. `app.js` получает перерисовку «Сегодня» при смене тренировки без перезагрузки страницы.

**Tech Stack:** статический ES-модульный JS без сборки и рантайм-зависимостей; тесты `node --test` + jsdom; инструменты `tools/*.mjs|js` на Node 24 без пакетов.

**Spec:** `docs/superpowers/specs/2026-10-19-workout-builder-design.md`

## Global Constraints

- Без сборки и без зависимостей во время работы приложения; инструменты в `tools/` — скрипты на Node без пакетов.
- Тексты, комментарии, сообщения коммитов — по-русски. Комментарии в стиле соседнего кода: объясняют «почему».
- На экране, в комментариях и именах нет «ИИ», «персональный», «тренер»; генератор — «подбор по правилам».
- Ключ CloudStorage — `^[A-Za-z0-9_-]{1,128}$`; значение — до 4096 символов; записей — до 1024 на человека.
- Служебные признаки («не подтверждено», «удалено», текущая тренировка) живут только в `localStorage`.
- `key` упражнения не меняется никогда. Ключ библиотеки — `^[a-z0-9-]{1,40}$`.
- Основных групп 17 (все, кроме `forearms`, `traps`, `hip_flexors`); счёт — `weeklySets(...).comparable`, `ours` не подставлять.
- Всё нажимаемое не ниже 44px, и каждый новый селектор нажимаемого добавляется в `TAP_TARGETS` (`test/app.test.js`).
- Признак оплаты не хранится нигде; `access.js` удаляется (Task 11).
- Мутационная дисциплина: каждый новый тест доказывается эквивалентной мутацией (тест зелёный) и ломающей (тест красный); обе перечисляются в отчёте задачи.
- Перед каждым коммитом `npm test` зелёный (`# fail 0`).
- Ветка `feat/workout-builder`. Коммиты от `frtsh-oy` (стоит в `.git/config` репозитория), git config не трогать. Каждое сообщение коммита заканчивается строкой `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push и PR не делать.
- `docs/muscle-map.md` и `exercises/library.js` руками не править — только генераторами.

## Review Focus

- Таблица из русской Google Sheets: BOM, CRLF, многострочные ячейки в кавычках, `0,5`, пустые хвостовые строки — импорт обязан это читать (тест в Task 2).
- Облако молчит при запуске, а текущая тренировка — своя: «Сегодня» сразу показывает её с устройства, а не пустой экран и не чужую тренировку (тест в Task 9).
- Переключение тренировки посреди отдыха и сразу после отметки: таймер продолжает идти, отложенная отметка уходит под старую тренировку (тесты в Task 9).
- Два устройства: тренировку удалили или изменили на одном — другое при следующем запуске видит то же; неудачное удаление не воскрешает тренировку (тесты в Task 8).
- Название из одних пробелов, длиннее 60 символов, с кавычками и эмодзи: пробелы — это пусто, длинное не вводится и не принимается, остальное сохраняется как есть (тесты в Task 5 и Task 11).

## Карта файлов

| файл | ответственность | задача |
|---|---|---|
| `kv.js` | обёртки localStorage и вызов облака с тремя способами отказа | 1 |
| `storage.js` | отметки: ключи из разрешённых символов, чистка старых | 1 |
| `tools/import-exercises.mjs` | CSV → проверки → `exercises/library.csv` + `exercises/library.js` | 2 |
| `exercises/library.csv`, `exercises/library.js` | снимок таблицы и сгенерированная библиотека | 3 |
| `exercises/index.js` | доступ к библиотеке: `entry`, `toItem`, `item` | 3 |
| `exercises/README.md` | правила таблицы для владельца, импорт, обоснования разметки | 4 |
| `builder/rules.js` | уровни, зоны, основные группы, пределы | 5 |
| `builder/arrange.js` | порядок силовых и пары | 5 |
| `builder/texts.js` | стандартные тексты своей тренировки | 5 |
| `builder/compact.js` | сжатый формат и разворачивание в тренировку | 5 |
| `builder/coverage.js` | группы с нулём и ниже нижней границы | 5 |
| `builder/generator.js` | генератор, скелет, доступность уровней и зон | 6 |
| `tools/library-report.js` | чего не хватает библиотеке по уровням и зонам | 6 |
| `builder/replace.js` | кандидаты на замену и замена | 7 |
| `my-workouts.js` | хранение своих тренировок | 8 |
| `workouts-view.js` | раздел «Тренировки»: «Мои» и «Готовые» | 9, 11 |
| `library-view.js` | экран библиотеки | 10 |
| `builder-view.js` | раздел «Конструктор»: вход, сборка, генератор, результат, сохранение | 11, 12 |

---

### Task 1: Ключи облака из разрешённых символов и чистка старых отметок

**Files:**
- Create: `kv.js`
- Modify: `storage.js` (весь файл: ключ, переход на `kv.js`, `prune`, `yesterday`)
- Modify: `app.js:93-96` (вызов `storage.prune()` при запуске)
- Modify: `README.md:71` и раздел «Известное ограничение» (`README.md:264-…`)
- Test: `test/kv.test.js` (новый), `test/cloud-keys.test.js` (новый), `test/storage.test.js` (константы ключей, `fakeLocal` с `key()`/`length`), `test/app.test.js`

**Interfaces:**
- Produces:
  - `kv.js`: `export const CLOUD_KEY = /^[A-Za-z0-9_-]{1,128}$/`
  - `kv.js`: `export function createKv({ cloud = null, local = null, cloudTimeout = 5000 } = {})` → `{ hasCloud: boolean, localGet(key): string /* '' при отсутствии или исключении */, localSet(key, value): boolean /* удалось ли */, localRemove(key): void, localKeys(): string[] /* [] при исключении */, callCloud(method: string, args: any[]): Promise<{ ok: boolean, value: any }> }` — `callCloud` переносится из `storage.js` дословно по поведению (никогда не реджектится; ошибка колбэка, синхронное исключение, таймаут → `ok: false`; `value ?? ''`).
  - `storage.js`: `storageKey(workoutId, date)` → `` `m_${workoutId}_${date}` ``
  - `storage.js`: `export function yesterday(day: 'YYYY-MM-DD'): 'YYYY-MM-DD'` (через `Date.UTC`, без местного часового пояса)
  - `storage.js`: `createStorage(...)` → `{ load, save, clear, prune(): Promise<void> }`

- [ ] **Step 1: Тесты на правило ключей облака**

`test/cloud-keys.test.js` — облако записывает каждый ключ, который ему отдали (`getItem`, `setItem`, `removeItem`, `removeItems`, `getKeys`); проверяем записанное, а не исключения: `callCloud` гасит исключения, и отказ «по правилам» прошёл бы молча.

```js
test('ключ отметок проходит правило CloudStorage для каждой тренировки реестра', () => {
  for (const id of Object.keys(WORKOUTS)) assert.match(storageKey(id, '2026-10-19'), CLOUD_KEY);
});
test('id тренировок реестра — латиница, цифры и дефис, до 40 символов', () => {
  for (const id of Object.keys(WORKOUTS)) assert.match(id, /^[A-Za-z0-9-]{1,40}$/);
});
test('save, load, clear и prune отдают облаку только разрешённые ключи', async () => {
  const cloud = recordingCloud({ 'm_legs-mwf_2026-09-01': '[]' });
  const s = createStorage({ cloud, local: fakeLocal(), today: () => '2026-09-14' });
  await s.save('legs-mwf', new Set(['start-pelvic-tilt-1']));
  await s.load('legs-mwf'); await s.clear('legs-mwf'); await s.prune();
  assert.ok(cloud.keys.length >= 4, 'облаку не отдали ни одного ключа — тест ничего не проверяет');
  for (const key of cloud.keys) assert.match(key, CLOUD_KEY);
});
```

- [ ] **Step 2: Тесты на `kv.js` и `prune`**

`test/kv.test.js`: `localSet` отвечает `true`/`false` (бросающий `setItem` → `false`); `localKeys` перечисляет ключи через `length`/`key(i)` и отдаёт `[]` при бросающем хранилище; `callCloud` — три способа отказа дают `{ ok: false }`, удачный колбэк — `{ ok: true, value }`, массив (`getKeys`) проходит как есть.

`test/storage.test.js` — `KEY = 'm_legs-mwf_2026-09-14'`, `PENDING = \`${KEY}:pending\``; `fakeLocal()` получает `key(i)` и `length`; облако в тестах — `getKeys`, `removeItems`. Новые тесты:

```js
test('yesterday переходит через месяц, год и 29 февраля', () => {
  assert.equal(yesterday('2026-03-01'), '2026-02-28');
  assert.equal(yesterday('2027-01-01'), '2026-12-31');
  assert.equal(yesterday('2028-03-01'), '2028-02-29');
});
test('prune удаляет из облака отметки старше вчерашнего дня и не трогает вчера, сегодня и чужие ключи', async () => {
  const cloud = fakeCloud({ data: { 'm_legs-mwf_2026-09-12': '[]', 'm_legs-mwf_2026-09-13': '[]', 'm_legs-mwf_2026-09-14': '[]', 'm_my-abc_2026-08-01': '[]', 'u_my-abc': '{}' } });
  await createStorage({ cloud, local: fakeLocal(), today }).prune();
  assert.deepEqual(Object.keys(cloud.data).sort(), ['m_legs-mwf_2026-09-13', 'm_legs-mwf_2026-09-14', 'u_my-abc']);
});
test('prune чистит устройство: отметки обоих форматов старше вчерашнего вместе с признаками', async () => {
  // на устройстве: 'w:legs-mwf:2026-09-10', 'w:legs-mwf:2026-09-10:pending', 'm_legs-mwf_2026-09-12',
  // 'm_legs-mwf_2026-09-12:pending', 'm_legs-mwf_2026-09-13', 'section', 'u_my-abc'
  // после prune остаются ровно: 'm_legs-mwf_2026-09-13', 'section', 'u_my-abc'
});
test('отказ getKeys не роняет prune и ничего не удаляет из облака', async () => { /* getKeys отвечает ошибкой → облако нетронуто, устройство всё равно почищено */ });
test('prune с бросающим localStorage и без облака не падает', async () => { /* await s.prune() разрешается */ });
```

`test/app.test.js`: «при запуске старые отметки удаляются с устройства» — до `startApp` положить в `window.localStorage` ключ `m_legs-mwf_2000-01-01`, после запуска его нет.

- [ ] **Step 3: Прогнать — тесты падают**

Run: `node --test test/cloud-keys.test.js test/kv.test.js test/storage.test.js`
Expected: FAIL (`kv.js` не найден; `storageKey` даёт `w:legs-mwf:…`; `prune`/`yesterday` не определены)

- [ ] **Step 4: Реализация**

`kv.js` — `createKv` из обёрток и `callCloud`, вынесенных из `storage.js` без смены поведения (комментарии про приватный режим, таймаут и «отдельного сторожа нет намеренно» переезжают вместе с кодом). `storage.js` строит всё на `createKv`; очередь записей и правила чтения не меняются. `prune()`:
- устройство — синхронно, в момент вызова, до первого обращения к облаку: `localKeys()` → удалить ключи `^m_.+_(\d{4}-\d{2}-\d{2})(:pending)?$` и старого формата `^w:.+:(\d{4}-\d{2}-\d{2})(:pending)?$` с датой меньше вчерашней;
- облако: `getKeys` → ключи вида `^m_.+_(\d{4}-\d{2}-\d{2})$` с датой строго меньше `yesterday(today())` → один `removeItems`; отказ `getKeys` — облако не трогаем.

В шапке `storage.js` — почему двоеточие нельзя (правило Telegram, ссылка на core.telegram.org/bots/webapps) и почему вчерашние не трогаются (у другого устройства в другом поясе «сегодня» может быть нашим «вчера»). `app.js`: сразу после `createStorage` — `storage.prune();` без ожидания.

README: строка 71 остаётся; в «Известном ограничении» сказать, что до этой версии ключ отметок содержал двоеточие, которое CloudStorage не принимает, поэтому отметки фактически жили только на устройстве; в день обновления сегодняшние отметки начинаются заново; отметки старше вчерашнего дня удаляются при запуске.

- [ ] **Step 5: Прогнать — тесты проходят**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add kv.js storage.js app.js README.md test/kv.test.js test/cloud-keys.test.js test/storage.test.js test/app.test.js
git commit -m "Ключи облака из разрешённых символов и чистка старых отметок" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Импорт таблицы упражнений с проверками

**Files:**
- Modify: `workouts/schema.js` (вынести проверки одного упражнения в `itemProblems`)
- Create: `tools/import-exercises.mjs`
- Test: `test/import-exercises.test.js` (новый), `test/schema.test.js` (остаётся зелёным без правок)

**Interfaces:**
- Produces:
  - `workouts/schema.js`: `export function itemProblems(item, at: string): string[]` — ровно проверки тела цикла по `block.items` в `validateWorkout`, кроме уникальности `key` внутри блока (она остаётся в `validateWorkout`). Тексты сообщений не меняются.
  - `tools/import-exercises.mjs`:
    - `COLUMNS: string[]` — `['Ключ', 'Название', 'Тип', 'Паттерн', 'Мышцы (подпись)', 'Дозировка', 'Техника', 'Уточнение', 'Видео', 'Подпись видео', 'Доп. видео', 'Прогрессия', 'Инвентарь', 'Одностороннее', 'Сложность', 'Многосуставное', ...Object.values(MUSCLES).map(m => m.ru)]`
    - `KEY_PATTERN = /^[a-z0-9-]{1,40}$/`
    - `parseCsv(text: string): string[][]` (RFC 4180: кавычки, удвоенные кавычки, перенос строки в ячейке; BOM срезается; `\r\n` и `\n`)
    - `parseYoutube(url: string): { id: string, start: number } | null` — хосты `www.youtube.com`, `youtube.com`, `m.youtube.com` (`/watch?v=`, `/shorts/<id>`, `/embed/<id>`), `youtu.be/<id>`; старт из `t` или `start`: `523`, `523s`, `8m43s`, `1h2m3s`; без метки — `0`
    - `formatStart(sec: number): string` → `` `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` ``
    - `buildLibrary(records: string[][], { previousKeys = [], allowRemoved = [] } = {}): { entries: Entry[] | null, errors: string[] }` — `entries === null`, когда есть хоть одна ошибка
    - `renderLibraryJs(entries: Entry[]): string`
  - `Entry` (форма записи библиотеки, порядок полей при выводе — этот):
    `{ key, slot: 'warmup'|'circuit'|'strength'|'cooldown', name, muscles, reps, text, detail?, extra?, v?, links?, load, pattern, gear, unilateral, kind, difficulty?: 'basic'|'medium'|'hard', compound?: boolean }` — `detail` из «Уточнение», `extra` из «Прогрессия», `links` из «Доп. видео»; пустая колонка → поля нет вовсе; `difficulty`/`compound` есть только у силовых; `kind`: `circuit` → `'warmup'`, остальные совпадают со `slot`; `load` — в порядке `MUSCLES`.
  - CLI: `node tools/import-exercises.mjs <файл.csv | https://…> [--allow-removed=ключ1,ключ2] [--out=каталог]` (по умолчанию `--out=exercises`). Читает прежние ключи из `<out>/library.js`, если он есть. Ошибки → печатает все в stderr, код выхода 1, **ничего не пишет**. Успех → пишет `<out>/library.csv` (текст как получен) и `<out>/library.js`.

Соответствия (значение ячейки сравнивается после `trim()` и в нижнем регистре):

| колонка | значение → данные |
|---|---|
| Тип | разминка → `warmup`, разогрев → `circuit`, силовое → `strength`, завершение → `cooldown` |
| Паттерн | наклон от таза → `hinge`, присед → `squat`, выпад → `lunge`, жим → `push`, тяга → `pull`, кор → `core`, изолирующее → `isolation`, подвижность → `mobility`, растяжка → `stretch`, восстановление → `recovery` |
| Инвентарь | через запятую: длинная резинка → `band_long`, мини-петля → `loop_short`, без инвентаря → `none` |
| Одностороннее, Многосуставное | да → `true`, нет → `false` |
| Сложность | базовое → `basic`, среднее → `medium`, сложное → `hard` |
| группы | пусто → нет ключа, `1` → `1`, `0,5` и `0.5` → `0.5` |
| Подпись видео | пусто → `formatStart(start)` |
| Доп. видео | каждая непустая строка: «подпись — ссылка» (разрез по последнему « — ») → `[id, start, подпись]` |

Сообщения (номер строки — номер записи CSV, заголовок — строка 1, как в Google Sheets):

| проверка | текст |
|---|---|
| нет колонки | `Заголовок: нет колонки «${c}»` |
| лишняя колонка | `Заголовок: неизвестная колонка «${c}»` |
| ключ | `Строка ${n}, «Ключ»: только строчная латиница, цифры и дефис, до 40 символов — получено «${v}»` |
| повтор ключа | `Строка ${n}, «Ключ»: ключ «${v}» уже есть в строке ${m}` |
| пустой обязательный текст (Название, Мышцы (подпись), Дозировка, Техника) | `Строка ${n}, «${c}»: не может быть пустым` |
| Тип | `Строка ${n}, «Тип»: одно из «разминка», «разогрев», «силовое», «завершение» — получено «${v}»` |
| Паттерн | `Строка ${n}, «Паттерн»: одно из ${все русские названия через «, » в кавычках-ёлочках} — получено «${v}»` |
| Видео | `Строка ${n}, «Видео»: не ссылка на ролик YouTube — «${v}»` |
| подпись без видео | `Строка ${n}, «Подпись видео»: подпись есть, а видео нет` |
| Доп. видео | `Строка ${n}, «Доп. видео»: строка ${i} — нужно «подпись — ссылка на YouTube», получено «${line}»` |
| Инвентарь | `Строка ${n}, «Инвентарь»: через запятую из «длинная резинка», «мини-петля», «без инвентаря» — получено «${v}»` |
| да/нет | `Строка ${n}, «${c}»: «да» или «нет» — получено «${v}»` |
| Сложность у силового | `Строка ${n}, «Сложность»: у силового одно из «базовое», «среднее», «сложное» — получено «${v}»` |
| Сложность/Многосуставное не у силового | `Строка ${n}, «${c}»: заполняется только у силовых` |
| группа | `Строка ${n}, «${c}»: пусто, 1 или 0,5 — получено «${v}»` |
| проверки `itemProblems` | `Строка ${n}: ${problem}` |
| пропавший ключ | `Ключ «${k}» был в библиотеке и пропал из таблицы. Удаление ломает сохранённые тренировки; если это намеренно, запусти импорт с --allow-removed=${k}` |

Строка, где все ячейки пустые, пропускается. Многосуставное у силового пустым быть не может (сообщение «да или нет» с пустым значением).

- [ ] **Step 1: Тесты импорта**

`test/import-exercises.test.js` — помощник `row(overrides)` собирает правильную строку силового упражнения по `COLUMNS`:

```js
const BASE = { 'Ключ': 'rdl', 'Название': 'Румынская тяга', 'Тип': 'силовое', 'Паттерн': 'наклон от таза',
  'Мышцы (подпись)': 'Ягодицы', 'Дозировка': '10–15 раз', 'Техника': 'Текст',
  'Видео': 'https://www.youtube.com/watch?v=9aLdnLtIBhY&t=4s', 'Инвентарь': 'длинная резинка',
  'Одностороннее': 'нет', 'Сложность': 'базовое', 'Многосуставное': 'да',
  'Ягодичные': '1', 'Задняя поверхность бедра': '1', 'Разгибатели поясницы': '0,5' };
const row = (o = {}) => COLUMNS.map(c => ({ ...BASE, ...o })[c] ?? '');
const build = (rows, options) => buildLibrary([COLUMNS, ...rows], options);

test('правильная строка становится упражнением библиотеки', () => {
  assert.deepEqual(build([row()]), { errors: [], entries: [{ key: 'rdl', slot: 'strength', name: 'Румынская тяга',
    muscles: 'Ягодицы', reps: '10–15 раз', text: 'Текст', v: ['9aLdnLtIBhY', 4, '0:04'],
    load: { glutes: 1, hamstrings: 1, lower_back: 0.5 }, pattern: 'hinge', gear: ['band_long'],
    unilateral: false, kind: 'strength', difficulty: 'basic', compound: true }] });
});
test('0,5 и 0.5 дают одно и то же', () => { /* 'Разгибатели поясницы': '0.5' → тот же entries */ });
test('все ошибки печатаются разом, с номером строки и колонкой', () => {
  const { entries, errors } = build([row({ 'Ключ': 'Bad Key' }), row({ 'Ключ': 'x', 'Тип': 'кардио' }), row({ 'Ключ': 'y', 'Ягодичные': '2' })]);
  assert.equal(entries, null);
  assert.deepEqual(errors, [
    'Строка 2, «Ключ»: только строчная латиница, цифры и дефис, до 40 символов — получено «Bad Key»',
    'Строка 3, «Тип»: одно из «разминка», «разогрев», «силовое», «завершение» — получено «кардио»',
    'Строка 4, «Ягодичные»: пусто, 1 или 0,5 — получено «2»',
  ]);
});
```

Остальные тесты файла (по одному на строку таблицы сообщений, плюс):
- `parseCsv`: `'﻿a,b\r\n"x, y","строка 1\nстрока 2"\r\n"он сказал ""да""",\r\n'` → `[['a','b'], ['x, y','строка 1\nстрока 2'], ['он сказал "да"', '']]`;
- `parseYoutube`: `watch?v=kOAy8BGdxBc&t=523s` → 523; `youtu.be/zMZWyURC6tw?t=18` → 18; `t=8m43s` → 523; `/shorts/<id>` → 0; без `t` → 0; `https://example.com/watch?v=kOAy8BGdxBc` → `null`;
- подпись видео: пусто → `'8:43'` для старта 523, заполнена → как есть;
- «Доп. видео» из двух строк → два элемента `links` в порядке строк;
- «Уточнение» и «Прогрессия» пустые → полей `detail` и `extra` нет (`Object.hasOwn` → `false`);
- пустая разметка нагрузки у силового → `Строка 2: … нужен непустой load …` (текст из `itemProblems`); у паттерна «восстановление» — проходит;
- сложность у разминки → `заполняется только у силовых`; пустая сложность у силового → ошибка;
- пропавший ключ: `{ previousKeys: ['rdl', 'gone'] }` → ошибка с `--allow-removed=gone`; с `allowRemoved: ['gone']` → без ошибок;
- пустые строки таблицы пропускаются;
- `renderLibraryJs` импортируется обратно: `(await import('data:text/javascript,' + encodeURIComponent(renderLibraryJs(entries)))).default` → `deepEqual(entries)`; два вызова дают один и тот же текст;
- CLI: `spawnSync(process.execPath, ['tools/import-exercises.mjs', bad.csv, '--out=' + tmp])` → `status === 1`, stderr содержит сообщение, `readdirSync(tmp)` пуст; с правильным CSV → `status === 0`, в `tmp` ровно `library.csv` и `library.js`.

- [ ] **Step 2: Прогнать — тесты падают**

Run: `node --test test/import-exercises.test.js`
Expected: FAIL (`Cannot find module …/tools/import-exercises.mjs`)

- [ ] **Step 3: Реализация**

`schema.js`: тело проверки одного упражнения → `itemProblems(item, at)`; `validateWorkout` зовёт её в цикле. `tools/import-exercises.mjs` — по интерфейсу и таблицам выше; CLI выполняется, только когда файл запущен напрямую (как `isMainModule` в `tools/muscle-report.js`). Ссылку скачивает глобальным `fetch`. `renderLibraryJs` — шапка-комментарий «Сгенерировано tools/import-exercises.mjs из exercises/library.csv. Руками не править: правки идут в таблицу и импорт.» + `export default ${JSON.stringify(entries, null, 2)};\n`.

- [ ] **Step 4: Прогнать — тесты проходят**

Run: `npm test`
Expected: PASS, `# fail 0` (в том числе `test/schema.test.js` без правок)

- [ ] **Step 5: Commit**

```bash
git add workouts/schema.js tools/import-exercises.mjs test/import-exercises.test.js
git commit -m "Импорт таблицы упражнений с проверками" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Первая версия библиотеки из нынешней тренировки

**Files:**
- Create: `test/fixtures/legs-mwf.json` — снимок нынешней тренировки, **до любых правок** `workouts/legs-mwf.js`
- Create: `test/legs-mwf-snapshot.test.js`
- Create: `exercises/library.csv`, `exercises/library.js` (через импорт)
- Create: `exercises/index.js`
- Test: `test/library.test.js` (новый)

**Interfaces:**
- Consumes: `buildLibrary`, `parseCsv`, `renderLibraryJs`, `formatStart`, `COLUMNS` (Task 2).
- Produces (`exercises/index.js`):
  - `LIBRARY: Entry[]` (реэкспорт `library.js`)
  - `entry(key: string): Entry | undefined`
  - `toItem(entry: Entry): Item` — копия без `slot`, `difficulty`, `compound`; остальные поля как есть
  - `item(key: string): Item` — бросает `Error(\`Нет упражнения «${key}» в библиотеке\`)`
  - `SLOT_LABELS = { warmup: 'Разминка', circuit: 'Разогрев', strength: 'Силовое', cooldown: 'Завершение' }`
  - `DIFFICULTY_LABELS = { basic: 'Базовое', medium: 'Среднее', hard: 'Сложное' }`

- [ ] **Step 1: Снимок и тест снимка (зелёный сразу)**

```bash
node -e "import('./workouts/legs-mwf.js').then(m => process.stdout.write(JSON.stringify(m.default, null, 2) + '\n'))" > test/fixtures/legs-mwf.json
```

`test/legs-mwf-snapshot.test.js`:
```js
test('готовая тренировка совпадает со снимком целиком', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(legsMwf)), SNAPSHOT);
});
```
Run: `node --test test/legs-mwf-snapshot.test.js` → PASS. Этот тест обязан пройти и до, и после Task 4.

- [ ] **Step 2: Первая таблица**

Одноразовым скриптом в scratchpad (в репозиторий не идёт) выгрузить 19 упражнений `legs-mwf` в `exercises/library.csv` по `COLUMNS`, в порядке блоков: каждая ячейка в кавычках, кавычки внутри удвоены, разделитель строк `\n`. Тип: блок `start` → разминка, `circuit` → разогрев, `finish` → завершение, силовые блоки → силовое. «Подпись видео» пустая, если подпись равна `formatStart(start)` (своя подпись остаётся у `leg-press` и `mini-row`). «Доп. видео» у `glute-bridge`: две строки «подпись — https://www.youtube.com/watch?v=<id>&t=<start>s». Сложность и многосуставность силовых (инженерное суждение, владелец вычитает в `docs/muscle-map.md`):

| key | Сложность | Многосуставное |
|---|---|---|
| rdl | базовое | да |
| adduction | базовое | нет |
| glute-bridge | базовое | нет |
| leg-press | базовое | да |
| side-leg-raise | базовое | нет |
| bird-dog | базовое | нет |
| seated-row | базовое | да |
| chest-press | базовое | да |
| mini-row | базовое | да |
| overhead-extension | базовое | нет |

Затем: `node tools/import-exercises.mjs exercises/library.csv` → пишет `exercises/library.js`.

- [ ] **Step 3: Тесты библиотеки**

`test/library.test.js`:
```js
test('library.js совпадает с тем, что импорт построит из library.csv', () => {
  const csv = readFileSync(new URL('../exercises/library.csv', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../exercises/library.js', import.meta.url), 'utf8');
  const { entries, errors } = buildLibrary(parseCsv(csv));
  assert.deepEqual(errors, []);
  assert.equal(js, renderLibraryJs(entries));
});
test('каждое упражнение нынешней тренировки есть в библиотеке и совпадает полем в поле', () => {
  const items = SNAPSHOT.blocks.flatMap(b => b.items);
  assert.equal(items.length, 19);
  for (const it of items) assert.deepStrictEqual(JSON.parse(JSON.stringify(toItem(entry(it.key)))), it);
});
test('item() на неизвестный ключ падает с понятной ошибкой', () => {
  assert.throws(() => item('net-takogo'), /Нет упражнения «net-takogo» в библиотеке/);
});
```

- [ ] **Step 4: Реализация `exercises/index.js`, прогон**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add test/fixtures/legs-mwf.json test/legs-mwf-snapshot.test.js exercises/ test/library.test.js
git commit -m "Библиотека упражнений: первая таблица из нынешней тренировки" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Готовая тренировка ссылается на библиотеку; отчёт описывает библиотеку

**Files:**
- Modify: `workouts/legs-mwf.js` — упражнения заменяются на `item('<key>')`; тексты тренировки и блоков остаются
- Create: `exercises/README.md`
- Modify: `tools/muscle-report.js` (раздел «Библиотека упражнений», подпись в конце)
- Regenerate: `docs/muscle-map.md`
- Test: `test/legs-mwf-snapshot.test.js` (без правок), `test/muscle-report.test.js`

**Interfaces:**
- Consumes: `item`, `LIBRARY`, `SLOT_LABELS`, `DIFFICULTY_LABELS` (Task 3).

- [ ] **Step 1: Тесты отчёта**

В `test/muscle-report.test.js`:
```js
test('раздел библиотеки: каждое упражнение ровно один раз, со сложностью и многосуставностью', () => {
  const text = buildReportLines().join('\n');
  const section = text.split('## Библиотека упражнений')[1].split('\n## ')[0];
  const rows = section.split('\n').filter(l => /^\| [a-z0-9-]+ \| /.test(l));
  assert.equal(rows.length, LIBRARY.length);
  assert.ok(rows.includes('| rdl | Румынская тяга с длинной резинкой | Силовое | Базовое | да | Ягодичные, Задняя поверхность бедра | Разгибатели поясницы, Предплечья |'));
  assert.ok(rows.includes('| pelvic-tilt | Подкручивание таза лёжа | Разминка | — | — | Прямая мышца живота | Косые мышцы живота |'));
});
test('docs/muscle-map.md совпадает с тем, что печатает генератор', () => {
  assert.equal(readFileSync(new URL('../docs/muscle-map.md', import.meta.url), 'utf8'), buildReportLines().join('\n') + '\n');
});
```

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/muscle-report.test.js`
Expected: FAIL (нет раздела «Библиотека упражнений»)

- [ ] **Step 3: Реализация**

- `legs-mwf.js`: `import { item } from '../exercises/index.js';` и `items: [item('pelvic-tilt'), item('thoracic-rotation')]` и т. д. Шапку файла переписать: упражнения живут в библиотеке, здесь тексты тренировки и порядок.
- Комментарии-обоснования разметки, которые были у упражнений внутри `legs-mwf.js`, переезжают в раздел «Почему разметка такая» в `exercises/README.md` — по ключу упражнения, дословно по смыслу.
- `exercises/README.md` — для владельца: колонки таблицы и правила (таблица из спеки, раздел «Таблица владельца», плюс соответствия русских названий из Task 2), как обновить библиотеку (`node tools/import-exercises.mjs <ссылка на CSV>` → `npm test` → `node tools/muscle-report.js`), что значит отказ импорта и флаг `--allow-removed`, что `key` не меняется никогда.
- `tools/muscle-report.js`: раздел `## Библиотека упражнений` после недельного объёма, колонки `| Ключ | Упражнение | Тип | Сложность | Многосуставное | Целевые | Вспомогательные |`, тип по `SLOT_LABELS`, у несиловых сложность и многосуставность «—»; вступительная фраза: сложность и многосуставность — то же инженерное суждение, что разметка, вычитывается здесь. Подпись в конце: правки упражнений — в таблицу упражнений и импорт, тексты тренировок — в `workouts/*.js`.
- `node tools/muscle-report.js`.

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`; `test/legs-mwf-snapshot.test.js` зелёный без правок.

- [ ] **Step 5: Commit**

```bash
git add workouts/legs-mwf.js exercises/README.md tools/muscle-report.js docs/muscle-map.md test/muscle-report.test.js
git commit -m "Готовая тренировка ссылается на библиотеку, отчёт описывает библиотеку" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Правила, порядок пар и своя тренировка в полном виде

**Files:**
- Create: `builder/rules.js`, `builder/arrange.js`, `builder/texts.js`, `builder/compact.js`, `builder/coverage.js`
- Modify: `muscles.js` (`groupsPhrase`), `app.js:169-172` (`listGroups` → `groupsPhrase`)
- Modify: `workouts/schema.js` (`focus`), `render.js` (метка «упор»), `style.css` (`.focus-tag`)
- Test: `test/builder-rules.test.js`, `test/arrange.test.js`, `test/compact.test.js`, `test/coverage.test.js` (новые), `test/render.test.js`, `test/schema.test.js`

**Interfaces:**
- Consumes: `LIBRARY`, `toItem` (Task 3); `weeklySets` (`weekly.js`).
- Produces:
  - `muscles.js`: `groupsPhrase(ids: string[]): string` — подписи через «, », у каждой первая буква строчная (поведение нынешнего `listGroups` из `app.js`).
  - `builder/rules.js`:
    ```js
    export const CORE_GROUPS; // Object.keys(MUSCLES) без forearms, traps, hip_flexors — 17, порядок MUSCLES
    export const LEVELS = {
      beginner:     { label: 'Начальный',   genitive: 'начального',   who: 'Занятий не было или перерыв в несколько лет', rounds: 2, pool: ['basic'],                   poolWords: 'базовых упражнений',           floor: 5, reserve: '3–4' },
      intermediate: { label: 'Средний',     genitive: 'среднего',     who: 'Около полугода регулярных занятий',          rounds: 2, pool: ['basic', 'medium'],         poolWords: 'базовых и средних упражнений', floor: 5, reserve: '2–3' },
      advanced:     { label: 'Продвинутый', genitive: 'продвинутого', who: 'Годы регулярных занятий',                    rounds: 3, pool: ['basic', 'medium', 'hard'], poolWords: 'упражнений',                   floor: 9, reserve: '1–2' },
    };
    export const ZONES = {
      legs:      { label: 'Ноги',        groups: ['quads', 'hamstrings', 'adductors', 'calves'] },
      glutes:    { label: 'Ягодицы',     groups: ['glutes', 'glutes_med'] },
      back:      { label: 'Спина',       groups: ['lats', 'upper_back', 'lower_back'] },
      chest:     { label: 'Грудь',       groups: ['chest'] },
      shoulders: { label: 'Плечи',       groups: ['delts_front', 'delts_side', 'delts_rear'] },
      arms:      { label: 'Руки',        groups: ['biceps', 'triceps'] },
      core:      { label: 'Пресс и кор', groups: ['abs', 'obliques'] },
    };
    export const MANUAL_ROUNDS = 2, MANUAL_RESERVE = '2–3', FOCUS_MIN = 10, SOFT_CEILING = 20,
      MAX_STRENGTH = 18, MAX_ZONES = 2, PLAN_DAYS = [1, 3, 5], DEFAULT_DAYS = [1, 3, 5];
    export const SKELETON = { warmup: { count: 2, rounds: 1 }, circuit: { count: 4, rounds: 3 }, cooldown: { count: 3, rounds: 1 } };
    export const BIG_GROUPS = ['glutes', 'quads', 'hamstrings', 'lats', 'upper_back', 'chest'];
    ```
  - `builder/arrange.js`: `arrangeStrength(entries: Entry[]): Entry[][]` — пары (последняя может быть из одного).
  - `builder/texts.js`: `plural(n, [one, few, many])`; `PAIR_PREAMBLE` (дословно `preamble` блока `legs1` из `legs-mwf.js`); `BLOCK_TEXTS = { start: { nav: 'Старт', title: 'Стартовая разминка', sub: 'Плавно, без длительных остановок' }, circuit: { nav: 'Разогрев', title: 'Круговой разогрев', sub: 'Повышает пульс, резинки лёгкие', note: '10–20 с между упражнениями · 30–45 с между кругами · 60–90 с после третьего круга. Резинки лёгкие, без работы до отказа.' }, finish: { nav: 'Финиш', title: 'Завершение', sub: '2–3 минуты в спокойном темпе' } }`; `CAUTION`; `progressionFor(level | null): string[]`; `kickerFor`, `leadFor`, `equipmentFor(entries)`, `defaultName(zones)`.
  - `builder/compact.js`:
    ```js
    // Compact = { v: 1, name, days, level: LevelId | null, zones: ZoneId[], warmup: key[], circuit: key[],
    //             strength: key[], focus: [key, ZoneId][], cooldown: key[], t: number }
    export const NAME_MAX = 60, VALUE_MAX = 4096;
    export function serializeCompact(compact): string;            // JSON.stringify
    export function parseCompact(text): Compact | null;           // форма проверяется, битое → null
    export function roundsOf(compact): number;                    // LEVELS[level].rounds или MANUAL_ROUNDS
    export function exerciseCount(compact): number;               // все ключи всех слотов
    export function expandWorkout(id, compact, library = LIBRARY): { workout, removed: string[] };
    ```
  - `builder/coverage.js`: `zeroGroups(workout): string[]` (основные с `comparable === 0`, порядок `CORE_GROUPS`); `belowFloor(workout, floor): string[]` (основные с `comparable < floor`). Обе — через `weeklySets([workout])`.
  - `schema.js`: необязательное `focus`, если есть — ровно `true`, иначе `` `${at}: focus — только true` ``.
  - `render.js`: у `item.focus` в `.exercise-top` — `<span class="focus-tag">упор</span>`.

Правила разворачивания (`expandWorkout`):
- блоки по порядку: `start` (warmup, 1 круг), `circuit` (3 круга, с `note`), `pair1…pairN` (силовые по `arrangeStrength`, круги — `roundsOf`), `finish` (1 круг); `n` — `'01'`, `'02'`… подряд; у первой пары — `preamble: PAIR_PREAMBLE`;
- пара: `nav` и `title` — `Пара ${i}`, `sub` — `groupsPhrase` целевых групп пары с заглавной первой буквой;
- упражнение: `toItem(entry)`; у ключей из `focus` — `focus: true`;
- ключа нет в библиотеке → в `removed`, упражнение пропускается; блок без упражнений не рисуется;
- поля тренировки: `id`, `kicker` (`СВОЯ · ${label.toUpperCase()} УРОВЕНЬ` / `СВОЯ · СБОРКА ИЗ БИБЛИОТЕКИ`), `title` и `titleLines: [name]`, `lead` (`Подобрана по правилам для уровня «${label}».` + ` Упор: ${зоны через «, » строчными}.` при зонах / `Собрана из библиотеки упражнений.`), `days`, `stats: [{ v: String(exerciseCount), l: plural(n, ['упражнение', 'упражнения', 'упражнений']) }, { v: \`3 + ${rounds}\`, l: 'круга разминки + каждой пары' }]`, `equipment` (`Нужно: коврик` + подписи инвентаря: `band_long` — длинная резинка, `loop_short` — мини-петля, `none` — ничего), `progression`, `caution`.

Тексты (`builder/texts.js`) — дословно:
- `progressionFor(level)`: 1) `` `Сохраняй ${rounds} круга каждой силовой пары. Заканчивай подход с запасом ${reserve} повторов до отказа.` `` (у ручной `MANUAL_RESERVE`); 2) `Сделала на 1–2 повтора больше верхней границы в обоих подходах на двух тренировках подряд? Возьми резинку жёстче или перехвати её короче и вернись к нижней границе.`; 3) `Сохраняй амплитуду и контроль. Если приходится раскачиваться, более тугая резинка пока не подходит.`; только у `beginner` четвёртым: `Новичкам Американская коллегия спортивной медицины (ACSM) советует нагрузку примерно на 8–12 повторов. Если у упражнения дозировка больше, ориентируйся на неё и на запас повторов.`
- `CAUTION`: `При острой боли в суставе прекрати вызывающее её упражнение. Не увеличивай сопротивление через боль. Если боль повторяется, сохраняется после тренировки или появляется отёк, обратись к врачу или физиотерапевту.\n\nУпражнения укрепляют мышцы, но не убирают жир только в одной выбранной зоне. Оценивай прогресс по силе, технике и изменениям тела со временем.`
- `defaultName([])` → `Всё тело`; `defaultName(['glutes', 'back'])` → `Всё тело. Упор: ягодицы и спина`.

`arrangeStrength`: сортировка — многосуставные раньше; затем те, у кого есть целевая из `BIG_GROUPS`, раньше; затем по `key`. Пары — жадно: берём первое оставшееся, партнёр — первое оставшееся без общей группы с долей 1, а если такого нет — просто первое оставшееся; без пары — отдельный последний блок.

- [ ] **Step 1: Тесты**

```js
// test/builder-rules.test.js
test('17 основных групп: все, кроме предплечий, трапеций и сгибателей бедра', () => {
  assert.equal(CORE_GROUPS.length, 17);
  for (const g of ['forearms', 'traps', 'hip_flexors']) assert.ok(!CORE_GROUPS.includes(g));
});
test('каждая основная группа ровно в одной зоне, в зонах только основные', () => {
  const all = Object.values(ZONES).flatMap(z => z.groups);
  assert.deepEqual([...all].sort(), [...CORE_GROUPS].sort());
});
test('одно целевое упражнение даёт нижнюю границу уровня, два — рабочий объём', () => {
  for (const L of Object.values(LEVELS)) {
    assert.ok(L.rounds * PLAN_DAYS.length >= L.floor);
    assert.ok(2 * L.rounds * PLAN_DAYS.length >= FOCUS_MIN);
  }
});

// test/coverage.test.js
test('zeroGroups называет ровно основные группы без целевой нагрузки', () => {
  assert.deepEqual(zeroGroups(legsMwf), ['calves', 'abs', 'obliques', 'delts_front', 'delts_rear', 'biceps']);
});
test('belowFloor считает при днях тренировки', () => {
  assert.deepEqual(belowFloor(legsMwf, 5), zeroGroups(legsMwf));
  assert.deepEqual(belowFloor({ ...legsMwf, days: [1] }, 5), CORE_GROUPS);
});

// test/arrange.test.js — на записях-заглушках с заданными load/compound
test('многосуставные раньше односуставных, крупные группы раньше мелких', ...);
test('в паре нет общей целевой группы, когда есть выбор', ...);
test('нечётное упражнение — отдельным последним блоком', ...);
test('порядок не зависит от порядка на входе', ...);

// test/compact.test.js
test('своя тренировка в полном виде проходит validateWorkout', () => {
  for (const c of [MANUAL, GENERATED]) assert.deepEqual(validateWorkout(expandWorkout('my-test0001', c).workout), []);
});
test('блоки: старт 1 круг, разогрев 3, пары по кругам уровня, завершение 1; у первой пары вступление', ...);
test('у ручной сборки 2 круга, у продвинутого 3', ...);
test('упражнение упора помечено focus: true, остальные без поля focus', ...);
test('ключ, которого нет в библиотеке, пропускается и попадает в removed; пустой блок не рисуется', () => {
  const { workout, removed } = expandWorkout('my-x', { ...MANUAL, strength: ['gone-key'] });
  assert.deepEqual(removed, ['gone-key']);
  assert.ok(!workout.blocks.some(b => b.id.startsWith('pair')));
  assert.deepEqual(validateWorkout(workout), []);
});
test('самая большая тренировка укладывается в 4096 символов', () => {
  const key = i => `${'k'.repeat(37)}-${String(i).padStart(2, '0')}`; // 40 символов
  const huge = { v: 1, name: 'Ж'.repeat(NAME_MAX), days: [1, 2, 3, 4, 5, 6, 7], level: 'intermediate', zones: ['shoulders', 'core'],
    warmup: [key(1), key(2)], circuit: [key(3), key(4), key(5), key(6)], strength: Array.from({ length: MAX_STRENGTH }, (_, i) => key(10 + i)),
    focus: [[key(10), 'shoulders'], [key(11), 'core']], cooldown: [key(7), key(8), key(9)], t: 9_999_999_999_999 };
  assert.ok(serializeCompact(huge).length <= VALUE_MAX);
});
test('parseCompact отвергает битое и чужое', () => {
  for (const text of ['{', '{"v":2}', serializeCompact({ ...MANUAL, name: '   ' }), serializeCompact({ ...MANUAL, name: 'ж'.repeat(61) }),
    serializeCompact({ ...MANUAL, level: 'expert' }), serializeCompact({ ...MANUAL, days: [0] }), serializeCompact({ ...MANUAL, days: [] })]) {
    assert.equal(parseCompact(text), null, text);
  }
});
test('название с кавычками и эмодзи переживает запись и чтение', () => {
  const c = { ...MANUAL, name: 'Мой «день» "Б" 💪' };
  assert.deepEqual(parseCompact(serializeCompact(c)), c);
});
```

`MANUAL` и `GENERATED` — сжатые тренировки на ключах настоящей библиотеки (`GENERATED` с `level: 'beginner'`, `zones: ['glutes']`, `focus: [['glute-bridge', 'glutes']]`). `test/render.test.js`: у упражнения с `focus: true` есть `.focus-tag` с текстом «упор», у остальных нет. `test/schema.test.js`: `focus: 'да'` → сообщение `focus — только true`.

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/builder-rules.test.js test/arrange.test.js test/compact.test.js test/coverage.test.js`
Expected: FAIL (модулей нет)

- [ ] **Step 3: Реализация** по интерфейсам и правилам выше. В `muscles.js` — `groupsPhrase` с комментарием из `app.js` (почему строчная), `app.js` переходит на неё.

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add builder/ muscles.js app.js workouts/schema.js render.js style.css test/
git commit -m "Правила конструктора, порядок пар и своя тренировка в полном виде" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Генератор тренировки на всё тело

**Files:**
- Create: `builder/generator.js`, `tools/library-report.js`
- Create: `test/fixtures/test-library.js`
- Test: `test/generator.test.js`, `test/library-report.test.js` (новые)

**Interfaces:**
- Consumes: `LEVELS`, `ZONES`, `CORE_GROUPS`, `FOCUS_MIN`, `SOFT_CEILING`, `MAX_STRENGTH`, `MAX_ZONES`, `PLAN_DAYS`, `DEFAULT_DAYS`, `SKELETON` (Task 5); `defaultName`, `groupsPhrase`; `weeklySets`.
- Produces (`builder/generator.js`):
  - `makeRandom(seed: number): () => number` — mulberry32
  - `pickSkeleton(library, random): { warmup: key[], circuit: key[], cooldown: key[] }` — случайные без повторов из своего слота, сколько есть, но не больше `SKELETON.*.count`; в завершении последним — упражнение с `pattern: 'recovery'`, если оно есть
  - `focusCandidates(pool: Entry[], zone): Entry[]` — силовые из пула, где целевая хотя бы одна группа зоны, и для каждой их основной целевой группы в пуле есть ещё хотя бы одно упражнение с долей 1
  - `availability(library, level): { missing: string[], zones: Record<ZoneId, boolean> }`
  - `missingGroupsMessage(level, groups)` → `` `Для ${genitive} уровня в библиотеке пока нет ${poolWords} на: ${groupsPhrase(groups)}.` ``
  - `missingZoneMessage(level, zone)` → `` `Для упора на зону «${label}» на ${genitive} уровне в библиотеке пока не хватает упражнений: нужно второе упражнение на ту же группу.` ``
  - `ceilingMessage(groups)` → `` `Не получилось уложиться в 9 силовых пар: ниже границы остались ${groupsPhrase(groups)}.` ``
  - `generate({ level, zones, seed, library = LIBRARY, now = Date.now }): { ok: true, compact } | { ok: false, reason: 'missing' | 'ceiling', groups: string[], zone?: ZoneId, message: string }`; больше `MAX_ZONES` зон → `throw new RangeError('Зон упора не больше двух')`
- Produces (`tools/library-report.js`): `buildLibraryReport(library = LIBRARY): string[]`; CLI печатает строки.

Алгоритм (тестами не определяется, поэтому фиксируется здесь):

```
generate:
  pool = силовые библиотеки с difficulty из LEVELS[level].pool
  { missing, zones: zoneOk } = availability(library, level)
  missing непуст → отказ('missing', missing, missingGroupsMessage)
  есть зона z без zoneOk[z] → отказ('missing', ZONES[z].groups, zone: z, missingZoneMessage)
  random = makeRandom(seed); firstValid = null; best = null
  50 попыток:
    r = attempt()
    r.ok и ни одна основная группа не выше SOFT_CEILING → вернуть finish(r)
    r.ok → firstValid ??= r
    иначе → best = попытка с наименьшим r.groups.length
  firstValid → finish(firstValid); иначе отказ(best.kind, best.groups, ceilingMessage или missingGroupsMessage)

attempt:
  chosen = []; focus = []
  для каждой зоны z: кандидаты = focusCandidates(pool, z) без chosen
    нет → { ok: false, kind: 'missing', groups: ZONES[z].groups }
    лучшие = многосуставные с наибольшим числом целевых групп зоны (если многосуставных нет — все с наибольшим числом); взять случайное
    chosen += он; focus += [key, z]
  need[g] = floor уровня для каждой основной; для основных целевых групп упражнений упора need[g] = max(need[g], FOCUS_MIN)
  цикл:
    sets = weeklySets([{ days: PLAN_DAYS, blocks: [{ rounds, items: chosen }] }])   ← тот же расчёт, что у экрана нагрузки
    deficient = основные с sets.get(g).comparable < need[g]
    пусто → { ok: true, chosen, focus }
    chosen.length === MAX_STRENGTH → { ok: false, kind: 'ceiling', groups: deficient }
    g = случайная из deficient
    кандидаты = пул без chosen с load[g] === 1; нет → { ok: false, kind: 'missing', groups: [g] }
    очки = сколько групп из deficient упражнение нагружает целево; из лучших по очкам — многосуставные, если есть; взять случайное
    chosen += он

finish(r): { ok: true, compact: { v: 1, name: defaultName(zones), days: DEFAULT_DAYS, level, zones,
            ...pickSkeleton(library, random), strength: ключи r.chosen, focus: r.focus, t: now() } }
```

Тестовая библиотека `test/fixtures/test-library.js` (записи проходят `itemProblems`; тексты-заглушки). Она обязана быть богатой: на одних односуставных 17 групп плюс две зоны требуют 19 упражнений и упираются в потолок 18 — тест условий падал бы не из-за кода.
- разминка ×3, разогрев ×5, завершение ×3 (растяжки) + 1 с `pattern: 'recovery'` и пустым `load`;
- многосуставные, базовые, двусторонние, каждое двойником `-a` и `-b` с той же разметкой: `squat` (`quads`, `glutes` — 1, `hamstrings` — 0.5), `hinge` (`hamstrings`, `glutes`, `lower_back` — 1), `lunge` (`quads`, `adductors`, `glutes_med` — 1, этот односторонний), `row` (`lats`, `upper_back`, `delts_rear` — 1, `biceps` — 0.5), `press` (`chest`, `triceps`, `delts_front` — 1), `overhead` (`delts_side`, `delts_front`, `triceps` — 1); базовый односуставный двойник `crunch-a`/`crunch-b` (`abs`, `obliques` — 1);
- односуставные на каждую основную группу (`id` — группа с дефисом вместо подчёркивания): `${id}-1` и `${id}-2` базовые, `${id}-3` среднее, `${id}-4` сложное; у `-1` через группу `unilateral: true`.

Экспорт: `TEST_LIBRARY`; `withoutTargets(groups)` — копия без упражнений, где эти группы целевые; `singlesOnly()` — только односуставные `-1`…`-4`, все двусторонние; `onlyOneFor(group)` — копия, где на эту группу целевое ровно одно упражнение (`${id}-1`).

- [ ] **Step 1: Тесты генератора**

```js
const ZONE_SETS = [[], ...Object.keys(ZONES).map(z => [z]), ['glutes', 'back'], ['arms', 'core']];
const byKey = new Map(TEST_LIBRARY.map(e => [e.key, e]));

test('обязательные условия выполнены для каждого уровня, набора зон и зерна', () => {
  for (const level of Object.keys(LEVELS)) for (const zones of ZONE_SETS) for (let seed = 1; seed <= 20; seed += 1) {
    const r = generate({ level, zones, seed, library: TEST_LIBRARY, now: () => 1 });
    assert.ok(r.ok, `${level} ${zones} ${seed}: ${r.message}`);
    const { compact } = r;
    const { workout } = expandWorkout('gen', compact, TEST_LIBRARY);
    const sets = weeklySets([{ ...workout, days: [1, 3, 5] }]);
    assert.equal(new Set(compact.strength).size, compact.strength.length);                                   // 1
    for (const k of compact.strength) assert.ok(LEVELS[level].pool.includes(byKey.get(k).difficulty));       // 2
    for (const g of CORE_GROUPS) assert.ok(sets.get(g).comparable >= LEVELS[level].floor, g);                 // 3
    for (const z of zones) assert.ok(compact.focus.some(([k, fz]) => fz === z
      && ZONES[z].groups.some(g => byKey.get(k).load[g] === 1)));                                             // 4
    for (const [k] of compact.focus) for (const [g, share] of Object.entries(byKey.get(k).load))
      if (share === 1 && CORE_GROUPS.includes(g)) assert.ok(sets.get(g).comparable >= FOCUS_MIN, g);         // 5
    assert.ok(compact.strength.length <= MAX_STRENGTH);                                                       // 6
    assert.equal(compact.warmup.length, 2); assert.equal(compact.circuit.length, 4); assert.equal(compact.cooldown.length, 3);
    assert.equal(byKey.get(compact.cooldown.at(-1)).pattern, 'recovery');
    assert.ok(serializeCompact({ ...compact, name: 'Ж'.repeat(NAME_MAX) }).length <= VALUE_MAX);
  }
});
test('одинаковый вход даёт одинаковую тренировку', ...);       // deepEqual двух вызовов
test('другое зерно даёт другую тренировку, когда пул позволяет', () => {
  const variants = new Set(Array.from({ length: 10 }, (_, i) =>
    JSON.stringify(generate({ level: 'beginner', zones: [], seed: i + 1, library: TEST_LIBRARY, now: () => 1 }).compact.strength.toSorted())));
  assert.ok(variants.size >= 2);
});
test('нет упражнения на группу — отказ с её названием, а не тренировка', () => {
  assert.deepEqual(generate({ level: 'beginner', zones: [], seed: 1, library: withoutTargets(['biceps']) }),
    { ok: false, reason: 'missing', groups: ['biceps'], message: 'Для начального уровня в библиотеке пока нет базовых упражнений на: бицепс.' });
});
test('не хватает второго упражнения для зоны — отказ с названием зоны', () => {
  const r = generate({ level: 'beginner', zones: ['chest'], seed: 1, library: onlyOneFor('chest') });
  assert.deepEqual([r.ok, r.reason, r.zone, r.message], [false, 'missing', 'chest', missingZoneMessage('beginner', 'chest')]);
  assert.equal(availability(onlyOneFor('chest'), 'beginner').zones.chest, false);
});
test('не уложились в 9 пар — отказ «ceiling» с группами ниже границы', () => {
  const r = generate({ level: 'beginner', zones: ['legs', 'arms'], seed: 1, library: singlesOnly() });
  assert.equal(r.ok, false); assert.equal(r.reason, 'ceiling');
  assert.ok(r.groups.length > 0 && r.groups.every(g => CORE_GROUPS.includes(g)));
  assert.match(r.message, /^Не получилось уложиться в 9 силовых пар: ниже границы остались /);
});
test('третья зона — ошибка вызова', () => assert.throws(() => generate({ level: 'beginner', zones: ['legs', 'arms', 'core'], seed: 1, library: TEST_LIBRARY }), RangeError));
test('с нынешней библиотекой начальный уровень недоступен и называет шесть групп', () => {
  assert.deepEqual(availability(LIBRARY, 'beginner').missing, ['calves', 'abs', 'obliques', 'delts_front', 'delts_rear', 'biceps']);
});
```

`test/library-report.test.js`: строка начального уровня для `LIBRARY` равна `Начальный: нет базовых упражнений на: икроножные, прямая мышца живота, косые мышцы живота, передняя дельта, задняя дельта, бицепс.`; для `TEST_LIBRARY` — `Начальный: все основные группы закрыты.`; по каждой зоне строка `  упор «Грудь»: можно` или `  упор «Грудь»: не хватает второго упражнения на ту же группу`.

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/generator.test.js test/library-report.test.js`
Expected: FAIL (модулей нет)

- [ ] **Step 3: Реализация** по алгоритму и интерфейсам. В шапке `generator.js` — откуда правила (спека, раздел «Генератор»), почему перебор проверяется `weeklySets`, а не своим счётом, и что условие 5 касается основных групп упражнения упора (неосновные экран не оценивает).

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add builder/generator.js tools/library-report.js test/fixtures/test-library.js test/generator.test.js test/library-report.test.js
git commit -m "Генератор тренировки на всё тело и отчёт о нехватке упражнений" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Замена упражнения

**Files:**
- Create: `builder/replace.js`
- Test: `test/replace.test.js`

**Interfaces:**
- Consumes: `LEVELS`, `ZONES` (Task 5); `TEST_LIBRARY` (Task 6).
- Produces:
  - `similarity(a: Entry, b: Entry): number` — `Σ_g min(a.load[g] ?? 0, b.load[g] ?? 0)`
  - `replaceCandidates({ compact, slot, key, library = LIBRARY }): Entry[]` — записи с тем же `slot`, которых нет ни в одном слоте тренировки; у сгенерированной (`level !== null`) — только `difficulty` из пула уровня (для силовых); у силового — хотя бы одна общая группа с долей 1; у упражнения из `focus` — ещё и целевая хотя бы одна группа его зоны. Порядок — `similarity` по убыванию, при равенстве — по `key`.
  - `replaceExercise(compact, slot, key, newKey): Compact` — новый объект, позиция в слоте та же; пара в `focus` с этим ключом получает `newKey`.

- [ ] **Step 1: Тесты**

Сжатые тренировки на `TEST_LIBRARY`: `GEN` — `level: 'beginner'`, `zones: ['glutes']`, `strength: ['glutes-1', 'quads-1']`, `focus: [['glutes-1', 'glutes']]`; `MANUAL_ONE` — `level: null`, `zones: []`, `strength: ['squat-a']`, `focus: []`; разминка, разогрев и завершение у обеих — из `pickSkeleton(TEST_LIBRARY, makeRandom(1))`.

```js
test('кандидаты — того же слота и ещё не в тренировке', ...);
test('у силового обязательна общая целевая группа, у разминки — нет', ...);
test('у сгенерированной — только пул её уровня, у ручной — любая сложность', ...);
test('порядок — по сходству разметки, при равенстве по ключу', ...);
test('у упражнения упора кандидаты нагружают ту же зону, и пометка упора переходит на замену', () => {
  const next = replaceExercise(GEN, 'strength', 'glutes-1', 'glutes-2');
  assert.deepEqual(next.focus, [['glutes-2', 'glutes']]);
  assert.ok(!next.strength.includes('glutes-1') && next.strength.includes('glutes-2'));
});
test('замена, после которой группа остаётся с нулём, разрешена — покрытие показывает это сразу', () => {
  const next = replaceExercise(MANUAL_ONE, 'strength', 'squat-a', 'quads-1');
  assert.ok(zeroGroups(expandWorkout('m', next, TEST_LIBRARY).workout).includes('glutes'));
});
test('нечем заменить — пустой список', ...);
```

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/replace.test.js`
Expected: FAIL

- [ ] **Step 3: Реализация**

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add builder/replace.js test/replace.test.js
git commit -m "Замена упражнения на похожее" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Хранилище своих тренировок

**Files:**
- Create: `my-workouts.js`
- Test: `test/my-workouts.test.js` (новый), `test/cloud-keys.test.js`

**Interfaces:**
- Consumes: `createKv` (Task 1); `serializeCompact`, `parseCompact` (Task 5).
- Produces:
  - `OWN_LIMIT = 50`
  - `recordKey(id)` → `` `u_${id}` ``
  - `newWorkoutId(random = Math.random)` → `'my-'` + 8 символов `[a-z0-9]`
  - `createMyWorkouts({ cloud = null, local = null, cloudTimeout = 5000 } = {})` →
    - `list(): Promise<Array<{ id, compact, localOnly: boolean }>>` — по `compact.t` по убыванию
    - `peek(id): Compact | null` — синхронно с устройства
    - `save(id, compact): Promise<{ ok: true, localOnly: boolean } | { ok: false, reason: 'limit' | 'device' }>`
    - `remove(id): Promise<void>`

Правила (служебные признаки — только на устройстве: `${recordKey(id)}:pending`, `${recordKey(id)}:deleted`):
- `save`: новый id при уже известных `OWN_LIMIT` → `limit`. Запись на устройство синхронно (`localSet`), признак `pending`, затем `setItem` в облако; облако подтвердило → признак снят, `localOnly: false`; не подтвердило → `localOnly: true`; не удалось ни туда, ни туда → `device`; на устройство не удалось, а облако приняло → `ok`. Без облака: удалось на устройство → `{ ok: true, localOnly: false }`, иначе `device`.
- `list`: облако — `getKeys`, ключи `^u_`, затем `getItems`. Для `:deleted` — повторить `removeItem` в облаке (успех → признак снять), в список не включать. Для `:pending` — дослать `setItem` (успех → признак снять), показывать локальную версию, `localOnly` = не удалось. Есть в облаке, нет признаков → облачная версия, переписать на устройство. Есть только на устройстве без признаков и облако ответило → удалена на другом устройстве: удалить с устройства. Облако не ответило → всё, что на устройстве (кроме `:deleted`), `localOnly` по признаку `pending`. Битая запись (`parseCompact` → `null`) — не показывать и не удалять.
- `remove`: удалить с устройства; `removeItem` в облаке; не подтвердило → признак `:deleted`.

- [ ] **Step 1: Тесты**

```js
test('сохранённая тренировка читается обратно; без облака localOnly — false', ...);
test('облако не подтвердило — localOnly, при следующем list она досылается и пометка снимается', async () => {
  const cloud = flakyCloud({ failSet: 1 });
  const store = createMyWorkouts({ cloud, local: fakeLocal(), cloudTimeout: 20 });
  assert.deepEqual(await store.save('my-a', C), { ok: true, localOnly: true });
  const [own] = await store.list();
  assert.equal(own.localOnly, false);
  assert.equal(cloud.data['u_my-a'], serializeCompact(C));
});
test('не удалось записать никуда — reason device; на устройство не удалось, облако приняло — сохранено', ...);
test('пятьдесят первую сохранить нельзя, перезаписать существующую — можно', ...);
test('удалённая на другом устройстве пропадает и здесь, изменённая там — показывается их версия', ...);
test('удаление при молчащем облаке не воскрешает тренировку, удаление досылается при list', ...);
test('облако молчит при list — показываем то, что на устройстве', ...);
test('битая запись не роняет list и не удаляется', ...);
test('peek читает с устройства синхронно', ...);
```

`test/cloud-keys.test.js`: «save, list и remove своих тренировок отдают облаку только разрешённые ключи» — прогнать все три операции через `recordingCloud`, проверить каждый ключ `CLOUD_KEY`, и что ни один служебный признак (`:pending`, `:deleted`) в облако не ушёл.

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/my-workouts.test.js test/cloud-keys.test.js`
Expected: FAIL

- [ ] **Step 3: Реализация** на `createKv`. В шапке — почему здесь досылка при запуске разрешена, а у отметок (`storage.js`) нет: решение спеки «при следующем запуске она досылается», цена — правка той же тренировки на двух устройствах, пока одно было без связи, решается последней записью.

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add my-workouts.js test/my-workouts.test.js test/cloud-keys.test.js
git commit -m "Хранение своих тренировок в облаке Telegram" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Переключение тренировок

**Files:**
- Modify: `app.js` (перерисовка «Сегодня» без перезагрузки, выбор текущей, недельная нагрузка по текущей, свои тренировки)
- Modify: `workouts-view.js` («Мои» и «Готовые», «Удалить»)
- Modify: `index.html` (`<p class="removed-note" id="removed-note" hidden></p>` перед `#workout`), `style.css`
- Test: `test/switch.test.js` (новый), `test/sections.test.js` (тесты раздела «Тренировки»), `test/app.test.js` (`TAP_TARGETS`: `.workout-delete`; подготовка сторожа высоты — своя тренировка на устройстве, чтобы выборка была непустой)

**Interfaces:**
- Consumes: `createMyWorkouts`, `recordKey` (Task 8); `expandWorkout`, `exerciseCount` (Task 5); `LEVELS`; `WORKOUTS`, `DEFAULT_WORKOUT_ID`; `scheduleShort`.
- Produces:
  - `app.js`: `export const CURRENT_KEY = 'current-workout'`; `startApp(win, { library = LIBRARY } = {})` → `{ get workout(), marks, timer, get total(), get ready(), store }` (`marks` — тот же `Set` на всё время работы, очищается при смене).
  - `workouts-view.js`: `renderWorkouts({ host, ready, mine, currentId, saved = null, onPick(id), onEdit = null, onDelete(id) })` — `ready` — реестр `WORKOUTS`, `mine` — результат `list()`, `saved` — `null | { localOnly: boolean }`.

Поведение:
- Текущая при запуске: `tg.workoutId`, если он есть в `WORKOUTS`; иначе запомненная (`CURRENT_KEY` в `localStorage`): готовая — она, своя — `expandWorkout(id, store.peek(id), library)`, если копия на устройстве есть; иначе `DEFAULT_WORKOUT_ID`. Ссылка запомненное не перезаписывает.
- `store.list()` при запуске в фоне; ответ обновляет «Мои» (и перерисовывает раздел, если он открыт). Первая отрисовка «Сегодня» его не ждёт.
- Смена тренировки (`selectWorkout(id)`): отложенная запись отметок уходит немедленно под прежний id; отметки, загрузка которых пришла после смены, игнорируются (счётчик поколений); `renderIntro`, `#workout`, `#removed-note` (`` `Убрано из библиотеки и пропущено упражнений: ${n}.` ``, скрыт при нуле), плееры, наблюдатель за блоками (`disconnect` и заново), карта (подбор очищен, подписи пересчитаны, раскрытая карта строится заново), недельная нагрузка (раскрытая — перерисована) — для новой; `CURRENT_KEY` запомнен; открыт «Сегодня». Таймер не трогается.
- Недельная нагрузка — `renderWeekly({ host, workouts: [workout] })`.
- Раздел «Тренировки» перерисовывается при каждом показе. «Мои»: заголовок `Мои`; пусто → `Своих тренировок пока нет — собери первую в «Конструкторе».`; карточка — `<div class="workout-item">` с `<button class="workout-card">` (название и строка `${уровень ? \`${label} уровень\` : 'Своя сборка'} · ${scheduleShort(days)} · ${n} ${plural}` + ` · только на этом устройстве` при `localOnly`) и `<button class="workout-delete">Удалить</button>`. «Готовые»: заголовок `Готовые`, карточки реестра. У текущей — `aria-current="true"` и подпись `Сейчас в «Сегодня»`. `saved` → `<p class="workouts-saved" role="status">` с `Тренировка сохранена` или `Тренировка сохранена на этом устройстве: облако Telegram не ответило. Отправим её туда при следующем запуске.`
- «Удалить» → `tg.confirm(\`Удалить тренировку «${name}»?\`)` → `store.remove` → удалили текущую → текущей становится `DEFAULT_WORKOUT_ID` (раздел не меняется).

- [ ] **Step 1: Тесты**

`test/switch.test.js` — монтирование на настоящем `index.html`; своя тренировка кладётся до запуска в `localStorage` под `recordKey('my-test0001')`:

```js
test('карточка своей тренировки делает её текущей и открывает «Сегодня»', ...);   // h1, раздел, CURRENT_KEY
test('выбор переживает перезапуск', ...);
test('?w= важнее запомненного; неизвестный ?w= не мешает запомненному', ...);
test('отметки разных тренировок не смешиваются', ...);   // отметка в legs-mwf → своя показывает 0 → назад: отметка на месте; ключи m_legs-mwf_… и m_my-test0001_… разные
test('отложенная отметка уходит под прежнюю тренировку при переключении', ...); // отметить и сразу переключить: m_legs-mwf_<сегодня> содержит отметку
test('таймер отдыха не сбрасывается при переключении', ...);
test('недельная нагрузка считает только текущую тренировку', () => {
  // раскрыть секцию, переключиться; число у «Квадрицепсы» = weeklySets([своя]).get('quads').comparable
});
test('подписи под картой и подбор относятся к новой тренировке', ...);
test('своя тренировка показывается сразу, даже если облако молчит', ...);   // CloudStorage, который не отвечает никогда
test('убранное из библиотеки упражнение — пропуск с пометкой, а не падение', ...);
test('«Удалить» спрашивает; удалили текущую — текущей становится готовая по умолчанию', ...);
test('в «Мои» пометка «только на этом устройстве» у неподтверждённой', ...);
test('«Мои» пусто — подсказка про «Конструктор»', ...);
```

`test/sections.test.js`: прежний «нажатие на карточку тренировки открывает «Сегодня»» остаётся; «текущая тренировка помечена в списке» — ещё и подпись `Сейчас в «Сегодня»`.

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/switch.test.js`
Expected: FAIL

- [ ] **Step 3: Реализация.** Всё, что в `startApp` зависит от тренировки, собирается в `showWorkout(workout, removed)`; обработчики, которые вешаются один раз (отметки, раскрытие, сброс, таймер, прокрутка), остаются как есть и читают текущую тренировку из замыкания. Комментарий в шапке «Тренировки» про «смены текущей тренировки здесь нет» снимается.

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add app.js workouts-view.js index.html style.css test/
git commit -m "Переключение тренировок: «Мои» и «Готовые», выбранная открывается в «Сегодня»" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Экран библиотеки

**Files:**
- Create: `library-view.js`
- Modify: `render.js` (вынести `renderHowto`, `bindHowto`), `app.js:139-150` (на `bindHowto`), `player.js` (`idPrefix`), `style.css`
- Test: `test/library-view.test.js` (новый), `test/render.test.js`, `test/app.test.js` (без правок — раскрытие в «Сегодня» работает как было)

**Interfaces:**
- Consumes: `LIBRARY`, `DIFFICULTY_LABELS` (Task 3); `ZONES` (Task 5).
- Produces:
  - `render.js`: `renderHowto(document, { idPrefix: string, item, expanded: boolean }) → { refs: HTMLElement, body: HTMLElement, links: HTMLElement[] }` (кнопка «Как выполнять», ссылка на видео, область с текстами, доп. ролики — то, что сейчас строит `renderItem`; `renderItem` переходит на неё, разметка «Сегодня» не меняется); `bindHowto(root)` — делегированный обработчик раскрытия, перенесённый из `app.js`.
  - `player.js`: `setupPlayers(root, openLink, { idPrefix = 'exercise-video' } = {})` — `id` панели `` `${idPrefix}-${index}` ``.
  - `library-view.js`:
    - `normalizeQuery(text): string` — нижний регистр, `ё` → `е`, обрезка пробелов
    - `filterEntries(entries, { query = '', zone = null, difficulty = null }): Entry[]` — только `slot === 'strength'`; название содержит запрос; зона — целевая хотя бы одна группа зоны; сложность — равна
    - `renderLibrary({ host, entries, isAdded(key): boolean, addBlocked(): string | null, onAdd(key), onBack(), openLink }) → { refresh(): void }`

Разметка экрана (классы — договор с тестами и сторожем высоты): кнопка назад `.builder-back` «← К сборке»; поле поиска `input.library-search` (`aria-label="Поиск упражнения"`); чипы зон `.library-chip` (`Все` + семь), чипы сложности `.library-chip` (`Любая`, `Базовое`, `Среднее`, `Сложное`), выбранный — `aria-pressed="true"`; строка `Найдено: ${n}`; карточка `article.exercise.library-card` (`h3` — название, `.muscles`, `.library-level` — сложность, `renderHowto` с `idPrefix: 'lib'`, кнопка `.library-add` — `Добавить` или недоступная `В тренировке`); пусто — `Ничего не найдено`, `Измени запрос или сбрось фильтры.` и кнопка `.library-chip` «Сбросить фильтры»; `addBlocked()` вернул причину — все `Добавить` недоступны, причина в `<p class="library-blocked" role="status">`; внизу `В тренировке: ${n}` и `.builder-back` «К сборке».

- [ ] **Step 1: Тесты**

`strength(key, name)` — помощник теста: запись силового упражнения с заданными ключом и названием, остальные поля — заглушки.

```js
test('поиск без учёта регистра и разницы е/ё', () => {
  const lib = [strength('a', 'Ёлочка'), strength('b', 'елка'), strength('c', 'Тяга')];
  assert.deepEqual(filterEntries(lib, { query: 'ЕЛ' }).map(e => e.key), ['a', 'b']);
  assert.deepEqual(filterEntries(lib, { query: 'ёл' }).map(e => e.key), ['a', 'b']);
});
test('на экране только силовые', () => assert.ok(filterEntries(LIBRARY, {}).every(e => e.slot === 'strength')));
test('фильтр по зоне — упражнения, где целевая хотя бы одна группа зоны', ...);
test('фильтр по сложности', ...);
test('карточка: название, мышцы, сложность и «Добавить»; добавленное — «В тренировке» и недоступно', ...);
test('«Как выполнять» раскрывает технику так же, как в «Сегодня»', ...);
test('ничего не найдено — подсказка и сброс фильтров', ...);
test('добавлять нельзя — кнопки недоступны и причина на экране', ...);
test('ролики библиотеки и «Сегодня» не делят id панелей', ...);   // setupPlayers с idPrefix
```

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/library-view.test.js`
Expected: FAIL

- [ ] **Step 3: Реализация**

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add library-view.js render.js app.js player.js style.css test/
git commit -m "Экран библиотеки упражнений с поиском и фильтрами" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Конструктор: вход, ручная сборка, замена и сохранение

**Files:**
- Rewrite: `builder-view.js`
- Delete: `access.js`, `test/access.test.js`
- Modify: `index.html` (у пункта «Конструктор» нет замка и `aria-label`), `app.js` (новый `renderBuilder`, `onSaved`, «Изменить»), `workouts-view.js` (`.workout-edit`), `style.css`
- Test: `test/builder-view.test.js` (переписать), `test/tabbar.test.js` (тест замка → «у «Конструктора» нет замка и платности»), `test/sections.test.js` («Конструктор» объясняет платность → вход в конструктор), `test/app.test.js` (`TAP_TARGETS` и подготовка сторожа)

**Interfaces:**
- Consumes: `renderLibrary` (Task 10); `pickSkeleton`, `makeRandom` (Task 6); `replaceCandidates`, `replaceExercise` (Task 7); `expandWorkout`, `parseCompact`-ограничения, `NAME_MAX`, `exerciseCount` (Task 5); `zeroGroups`, `belowFloor`, `groupsPhrase`; `store` и `newWorkoutId` (Task 8); `OWN_LIMIT`.
- Produces:
  - `builder-view.js`: `renderBuilder({ host, win, library = LIBRARY, store, confirm, onSaved(id, compact, { localOnly }), seed = () => Date.now(), openLink }) → { edit(id, compact): void }`
  - `app.js`: `onSaved` обновляет «Мои», открывает «Тренировки» с `saved`, а если сохранили текущую — перерисовывает «Сегодня»; `onEdit(id)` в `renderWorkouts` → `builder.edit(id, compact)` и раздел «Конструктор».

Экраны и тексты (классы — договор с тестами):
- **Вход:** `h2` «Конструктор»; `Тренировка всегда на всё тело. Собери её сам из библиотеки или получи готовую по правилам, а потом сохрани.`; кнопка `.builder-path` «Собрать самому» с подписью `Листай библиотеку упражнений, добавляй нужные и сохрани тренировку.` (вторую, «Сгенерировать», добавляет Task 12 вместе с её экраном — кнопки, ведущей в никуда, не бывает); список «Любая тренировка устроена одинаково» — четыре шага из макета (`Разминка` — `Плавно, без длительных остановок`; `Круговой разогрев` — `Повышает пульс, резинки лёгкие`; `Силовые пары` — `Два упражнения подряд, потом отдых`; `Завершение` — `2–3 минуты в спокойном темпе, дыхание`).
- **Сборка** (новая: скелет `pickSkeleton(library, makeRandom(seed()))`, силовых нет): `h2` «Своя тренировка»; строка покрытия `.builder-coverage` (`role="status"`): все закрыты → `Все основные группы получают нагрузку`; иначе `Тренировка пока не на всё тело`, `` `Без нагрузки: ${groupsPhrase(zeroGroups(workout))}.` ``, `Считаются только силовые упражнения. Сохранить можно и так.`; блоки как в `expandWorkout`; у разминки, разогрева и завершения — `.builder-replace` «Заменить»; у силовых — `.builder-remove` «Убрать»; `.builder-add` «Добавить упражнение» → экран библиотеки (`addBlocked` → `Не больше 9 силовых пар — убери упражнение, чтобы добавить другое.` при `MAX_STRENGTH`); `.builder-save` «Сохранить» (без силовых — недоступна, причина `Добавь хотя бы одно силовое упражнение.`).
- **Шторка замены** (`.replace-sheet`, `role="dialog"`): `Заменить упражнение`, название заменяемого, подсказка (`Те же целевые мышцы, похожая разметка` у силовых, `Того же типа` у остальных), кандидаты (название, мышцы, инвентарь, `.replace-pick` «Выбрать»), пусто → `Похожих упражнений больше нет: все подходящие уже в тренировке.`, закрыть — `.replace-close`. Выбор → `replaceExercise`, строка покрытия пересчитывается сразу.
- **Сохранение:** `input.save-name` (`maxlength="60"`, по умолчанию название черновика), семь `.day-chip` (`aria-pressed`, по умолчанию пн, ср, пт), `Что сохранится: ${n} ${plural}, ${уровень | 'своя сборка'}`; покрытие при выбранных днях: у ручной — `zeroGroups`, у сгенерированной — `belowFloor(…, LEVELS[level].floor)` с текстом `` `Ниже границы уровня при этих днях: ${…}.` ``; один день → `Один день в неделю — мало: каждую группу лучше нагружать хотя бы дважды в неделю.`; `.builder-save` «Сохранить тренировку» недоступна с причиной: пустое после `trim()` название → `Введи название, чтобы сохранить.`; нет дней → `Выбери хотя бы один день.`. Ответ `limit` → `` `Сохранить нельзя: уже ${OWN_LIMIT} своих тренировок. Удали ненужную в разделе «Тренировки».` ``; `device` → `Не удалось сохранить: хранилище недоступно. Тренировка осталась здесь — попробуй ещё раз.` (черновик не сбрасывается). Сохраняется `name.trim()`, `t: Date.now()`; id — прежний при правке, иначе `newWorkoutId()`.
- **Правка** (`edit(id, compact)`): черновик — копия, экран сборки (в Task 12 сгенерированная откроется на результате); сохранение перезаписывает тот же id.

- [ ] **Step 1: Тесты**

`test/builder-view.test.js` — монтирование приложения на `index.html` (своя библиотека — `startApp(window, { library: TEST_LIBRARY })`, где нужно закрыть все группы):

```js
test('вход: «Собрать самому» и устройство тренировки; нет слов «ИИ», «персональный», «тренер»', () => {
  // открыть раздел; одна .builder-path; textContent раздела не совпадает с /(^|[^а-яё])ИИ([^а-яё]|$)|персональн|тренер/i
});
test('ручная сборка: разминка, разогрев и завершение заполнены сразу, предупреждение называет все 17 групп', ...);
test('добавление из библиотеки пересчитывает «Без нагрузки», убрать — возвращает группу', ...);
test('закрыты все группы — «Все основные группы получают нагрузку»', ...);   // TEST_LIBRARY
test('замена разминки: кандидаты того же типа; нечем заменить — «Похожих упражнений больше нет»', ...);
test('пустое или из пробелов название — сохранить нельзя, причина на экране', ...);
test('название длиннее 60 не вводится: у поля maxlength 60', ...);
test('без дней — нельзя; один день — предупреждение, но можно', ...);
test('сохранённая появляется в «Мои» с отметкой «Тренировка сохранена» и открывается в «Сегодня»', ...);
test('название с кавычками и эмодзи сохраняется как есть', ...);
test('пятьдесят первую сохранить нельзя — экран говорит почему', ...);
test('не удалось записать никуда — сообщение, черновик остаётся на экране', ...);   // localStorage бросает, облака нет
test('«Изменить» у собранной руками открывает сборку с её упражнениями; сохранение перезаписывает', ...);
```

`test/tabbar.test.js`: «у «Конструктора» нет замка и подписи про платность» — нет `.lock-badge`, нет `aria-label` у пункта, текст пункта «Конструктор». `test/app.test.js`: `TAP_TARGETS` += `.builder-path`, `.builder-back`, `.builder-add`, `.builder-remove`, `.builder-replace`, `.builder-save`, `.library-chip`, `.library-add`, `.day-chip`, `.replace-pick`, `.replace-close`, `.workout-edit`; подготовка сторожа открывает вход, сборку, библиотеку, шторку замены и сохранение, чтобы ни одна выборка не была пустой.

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/builder-view.test.js test/tabbar.test.js`
Expected: FAIL

- [ ] **Step 3: Реализация.** `access.js` и его тест удаляются целиком; импорт из `app.js` уходит.

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add -A builder-view.js access.js test/access.test.js index.html app.js workouts-view.js style.css test/
git commit -m "Конструктор: ручная сборка из библиотеки, замена и сохранение" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Генератор и результат на экране

**Files:**
- Modify: `builder-view.js`, `style.css`
- Test: `test/builder-view.test.js`, `test/app.test.js` (`TAP_TARGETS`)

**Interfaces:**
- Consumes: `generate`, `availability`, `missingGroupsMessage`, `missingZoneMessage` (Task 6); `LEVELS`, `ZONES`, `MAX_ZONES` (Task 5); шторка замены и сохранение (Task 11).

Экраны:
- **Генератор:** `h2` «Генератор», подзаголовок `Подбор упражнений по правилам`; три `.level-option` (`role="radio"`, `aria-checked`): название, `who`, строки `Кругов в паре: ${rounds}`, `Упражнения: ${базовые | базовые и средние | все}`, `Остановка: за ${reserve} повтора до отказа`; недоступный уровень — `aria-disabled="true"` и под ним `missingGroupsMessage`. Зоны — `.zone-chip` (`aria-pressed`), подсказка `Упор добавит упражнение на каждую выбранную зону, не больше двух. Остальные группы мышц остаются в тренировке.`; при двух выбранных остальные недоступны; зона, недоступная на выбранном уровне, недоступна с `missingZoneMessage`. `.builder-generate` «Сгенерировать» → результат или отказ `<p class="builder-refusal" role="alert">` с `message`.
- **Результат:** заголовок — `defaultName(zones)`; подзаголовок `` `${label} уровень · ${n} ${plural}` ``; строка покрытия — `belowFloor(workout при PLAN_DAYS, floor)`: пусто → `Все основные группы получают нагрузку`, иначе `` `Ниже границы уровня: ${groupsPhrase(groups)}.` ``; у пар — `${rounds} круга`; метка `упор` у упражнения упора, `заменено` у заменённого в этом сеансе; `.builder-replace` у каждого упражнения (кандидаты — пул уровня); `.builder-variant` «Другой вариант» — новое зерно, те же уровень и зоны (замены сбрасываются); `.builder-save` → экран сохранения с уровнем.
- **Правка сгенерированной** открывает результат (у ручной — сборку, как в Task 11).

- [ ] **Step 1: Тесты**

```js
test('на входе два пути: «Собрать самому» и «Сгенерировать»', ...);
test('с нынешней библиотекой уровни недоступны и называют, чего не хватает', ...);   // настоящая LIBRARY: начальный — шесть групп
test('генерация: тренировка на всё тело с меткой «упор» у упражнения зоны', ...);      // TEST_LIBRARY
test('третья зона недоступна', ...);
test('«Другой вариант» меняет тренировку', ...);
test('замена в сгенерированной: кандидаты из пула уровня; сломала нижнюю границу — предупреждение сразу', ...);
test('сохранение с двумя днями показывает группы ниже границы уровня ещё до сохранения', ...);
test('«Изменить» у сгенерированной открывает результат', ...);
test('экраны генератора и результата без слов «ИИ», «персональный», «тренер»', ...);
```

`TAP_TARGETS` += `.level-option`, `.zone-chip`, `.builder-generate`, `.builder-variant`; подготовка сторожа открывает генератор и результат (через `TEST_LIBRARY`).

- [ ] **Step 2: Прогнать — падают**

Run: `node --test test/builder-view.test.js`
Expected: FAIL

- [ ] **Step 3: Реализация.** На входе конструктора появляется вторая `.builder-path` «Сгенерировать».

- [ ] **Step 4: Прогнать**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 5: Commit**

```bash
git add builder-view.js style.css test/
git commit -m "Конструктор: генератор по уровню и зонам упора, результат с заменой" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Документы и проверка глазами

**Files:**
- Modify: `README.md` (структура, «Библиотека упражнений и таблица», «Конструктор», снять предупреждение «карточка не переключает тренировку»)
- Modify: `docs/superpowers/specs/2026-09-19-sections-shell-design.md` (отметка в части «Конструктор — платная заглушка» со ссылкой на спеку конструктора)
- Modify: `docs/superpowers/specs/2026-09-19-subscription-server-design.md` (примечание: пока оплаты нет, библиотека в публичном репозитории; вопрос решается заново в спеке сервера)
- Modify: `.claude/notes/todo.md`, `.claude/notes/gotchas.md` (вне git)

- [ ] **Step 1: README.** Таблица «Структура» — строки для всех новых файлов из «Карты файлов» и снятие `access.js`. Раздел «Библиотека упражнений и таблица»: таблица владельца → «Файл → Опубликовать в интернете → CSV» → `node tools/import-exercises.mjs <ссылка>` → `npm test` → `node tools/muscle-report.js` → `node tools/library-report.js` → PR; отказ импорта и `--allow-removed`; ссылка на `exercises/README.md`. Раздел «Конструктор»: два пути, уровни и зоны (ссылка на спеку), своя тренировка в CloudStorage, 50 тренировок, «только на этом устройстве».

- [ ] **Step 2: Пометки в спеках** — по одной короткой отметке со ссылкой на `2026-10-19-workout-builder-design.md`.

- [ ] **Step 3: Сборка сайта.** Run: `node tools/collect-site.mjs && ls dist/builder dist/exercises` — Expected: в `dist/` есть `builder/*.js` и `exercises/library.js`, нет `access.js`.

- [ ] **Step 4: Проверка глазами.** `python3 -m http.server <свободный порт>`, чистый `localStorage`, экран 375×812: вход конструктора; сборка → библиотека (поиск «ё», фильтры, «Как выполнять», видео) → добавить → предупреждение пересчитывается → замена разминки → сохранение (пустое имя, без дней, один день) → «Мои» → открыть в «Сегодня» → отметка → переключение на готовую и обратно → таймер идёт → «Изменить» → «Удалить» текущую. Генератор с настоящей библиотекой: все уровни недоступны с причинами. Снимки экрана — в отчёт.

- [ ] **Step 5: Финальный прогон**

Run: `npm test`
Expected: PASS, `# fail 0`

- [ ] **Step 6: Commit**

```bash
git add README.md docs/superpowers/specs/
git commit -m "Документы: библиотека, таблица и конструктор" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Сказать владельцу** (не править самому): в личном `CLAUDE.local.md` инвариант «Вся логика «есть ли подписка» живёт в `access.js`» устарел — файла больше нет.
