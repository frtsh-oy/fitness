# «Что есть дома» — план реализации

**Цель:** человек отмечает свой инвентарь, и генератор, библиотека и замена упражнения предлагают только то, что ему по силам.

**Спека:** `docs/superpowers/specs/2026-10-21-gear-profile-design.md`. Читать вместе с этим планом.

**Архитектура.** Словарь инвентаря и правило «подходит ли упражнение» живут в новом модуле `gear.js` в корне. Выбор человека хранится в `gear-profile.js` (localStorage). Переключатели — в `gear-picker.js`, общем для генератора и библиотеки. Фильтрация делается до того, как библиотека попадёт в генератор, в замену и на экран. Сами правила подбора (`builder/generator.js`, `builder/replace.js`) про инвентарь не знают; добавляется только подсказка «есть с инвентарём».

## Общие ограничения

- Нет сборки, нет рантайм-зависимостей, ES-модули.
- Тексты, комментарии и коммиты — по-русски; комментарии в стиле файла: объясняют «почему».
- `key` упражнений не меняется. `expandWorkout` и всё, что разворачивает сохранённые тренировки, получает **полную** библиотеку, без фильтра.
- Тесты не зависят от состава настоящей библиотеки (`.claude/notes/gotchas.md`, последний раздел). Новые тесты пишутся на фикстурах `test/fixtures/test-library.js` или на своих маленьких записях.
- Перед коммитом: `node tools/muscle-report.js`, затем `npm test` — всё зелёное (797+). Шум jsdom «scrollTo» — не ошибка.
- Коммиты в ветке `feat/gear-profile`, worktree `/Users/manager/Sites/tg-workout-gear`. Не пушить.

## Где проверять в первую очередь

1. Правка сохранённой тренировки, в которой есть упражнение с неотмеченным инвентарём: шторка замены не должна падать (`replaceCandidates` бросает на ключ, которого нет в переданной библиотеке).
2. Отмечено пусто (только «без инвентаря»): всё работает, отказ генератора с подсказкой.
3. В localStorage мусор, чужие id или localStorage бросает: выбор по умолчанию, ничего не падает.
4. Смена инвентаря на экране генератора делает выбранный уровень или зону недоступными: выбор поправляется, а не остаётся невыполнимым.
5. Счётчик «ещё N с другим инвентарём» вместе с поиском и фильтрами зоны и сложности.

---

### Задача 1. Словарь инвентаря

**Файлы:** создать `gear.js`; изменить `workouts/schema.js`, `tools/import-exercises.mjs`, `builder/texts.js`, `builder-view.js` (только `GEAR`/`gearText`), `tools/library-report.js`, `exercises/README.md`; тесты `test/gear.test.js` (новый), `test/import-exercises.test.js`, `test/builder-texts.test.js`, `test/library-report.test.js`.

**Интерфейс `gear.js`:**

```js
export const GEAR = [
  ['band_long', 'длинная резинка'],
  ['loop_short', 'мини-петля'],
  ['band_handles', 'резинка с ручками'],
  ['dumbbells', 'гантели'],
  ['kettlebell', 'гиря'],
];                                   // порядок — порядок на экране и в «Нужно»
export const NO_GEAR = 'none';
export const NO_GEAR_LABEL = 'без инвентаря';
export const GEAR_IDS = [...GEAR.map(([id]) => id), NO_GEAR];   // все допустимые значения entry.gear
export const DEFAULT_OWNED = ['band_long', 'loop_short'];
export function gearLabel(id): string       // и для 'none'; неизвестный id — throw Error
export function gearText(entry): string      // подписи entry.gear через ', ' (переносится из builder-view.js)
export function fitsGear(entry, owned): boolean   // каждый id из entry.gear — NO_GEAR или есть в owned (массив)
export function fitLibrary(library, owned): entry[]   // library.filter(e => fitsGear(e, owned))
```

**Изменения:**

- `workouts/schema.js`: `GEAR` — это `GEAR_IDS` из `gear.js`. Экспорт с прежним именем сохранить, если его кто-то импортирует.
- `tools/import-exercises.mjs`: карта «подпись → id» строится из `GEAR` и `NO_GEAR`/`NO_GEAR_LABEL`.
  - Сообщение об ошибке перечисляет все шесть подписей в порядке словаря, «без инвентаря» последним: `через запятую из «длинная резинка», «мини-петля», «резинка с ручками», «гантели», «гиря», «без инвентаря» — получено «…»`.
  - Новое правило: «без инвентаря» вместе с другим видом → `Строка N, «Инвентарь»: «без инвентаря» не сочетается с другим инвентарём — получено «…»`.
- `builder/texts.js`: `equipmentFor` берёт порядок и подписи из `GEAR`. Экспорт `GEAR_NAMES` убрать, если после правок его никто не использует.
- `builder-view.js`: локальные `GEAR`/`gearText` заменить импортом `gearText` из `gear.js`.
- `tools/library-report.js`:
  - `buildLibraryReport(library = LIBRARY)` не меняется (вся библиотека, без фильтра).
  - Новая `buildGearReport(library = LIBRARY)` — три профиля, перед каждым строка-заголовок, затем строки `buildLibraryReport(fitLibrary(library, owned))`:
    - `== Весь инвентарь ==` (owned — все id из `GEAR`);
    - `== Только резинки: длинная резинка, мини-петля ==` (owned — `DEFAULT_OWNED`, подписи из словаря);
    - `== Без инвентаря ==` (owned — `[]`).
  - Запуск из командной строки печатает `buildGearReport()`.
- `exercises/README.md`: строка «Инвентарь» в таблице колонок — шесть значений, «без инвентаря» только одно. Абзац: новый вид инвентаря добавляется строкой в `gear.js`, и только потом его можно писать в таблицу.
- `tools/muscle-report.js`: менять, только если его текст про инвентарь стал неверным.

**Тесты (минимум):**

- `fitsGear`: none всегда подходит; упражнение с двумя видами подходит, только если отмечены оба; пустой owned.
- `gearLabel` бросает на неизвестном id.
- Импорт: принимает «Гантели, длинная резинка»; новое сообщение со списком; «без инвентаря, гиря» — ошибка нового вида.
- `equipmentFor` сохраняет порядок словаря для новых видов.
- `buildGearReport` на фикстуре, где упражнение на группу есть только с гантелями: в профиле «весь инвентарь» группа закрыта, в двух других — нет.

**Коммит:** `Инвентарь: словарь в gear.js, пять видов, отчёт о пробелах по трём профилям`.

---

### Задача 2. Выбор человека, переключатели, библиотека

**Файлы:** создать `gear-profile.js`, `gear-picker.js`; изменить `library-view.js`, `style.css`; тесты `test/gear-profile.test.js`, `test/gear-picker.test.js` (новые), `test/library-view.test.js`.

**Интерфейсы:**

```js
// gear-profile.js
export const GEAR_KEY = 'gear-owned';
export function createGearProfile(local = null) → { get(): string[], set(ids: string[]): void }
```

- `get()` при первом вызове читает `local.getItem(GEAR_KEY)` (в try/catch) и разбирает JSON.
  - Массив → оставить известные id из `GEAR` (без `none`), без повторов, в порядке словаря. `[]` — законное значение: «ничего нет».
  - Нет ключа, не JSON, не массив или исключение → копия `DEFAULT_OWNED`.
  - Возвращает копию.
- `set(ids)` нормализует так же, держит в памяти и пишет JSON в local (в try/catch). Если local бросает, выбор живёт в памяти.

```js
// gear-picker.js
export function renderGearPicker(document, { owned, onChange, idPrefix }) → HTMLElement
```

- Разметка: `div.gear-picker` содержит:
  - `h3.builder-group-title` «Что есть дома» с `id = ${idPrefix}-title`;
  - `p.gear-hint` «Отметь, что у тебя есть. Упражнения без инвентаря доступны всегда.»;
  - `div.zone-chips` с `role="group"` и `aria-labelledby` на заголовок.
- Внутри группы по кнопке на каждый вид из `GEAR`:
  - `button.zone-chip.gear-chip`, `type=button`, `data-gear=<id>`;
  - текст — подпись с заглавной буквы («Длинная резинка»);
  - `aria-pressed` по owned.
- Нажатие переключает вид и обновляет `aria-pressed`, затем зовёт `onChange(newOwned, id)`. `newOwned` — в порядке словаря.

**`library-view.js`:**

- `filterEntries(entries, { query, zone, difficulty, owned = null })`: при `owned !== null` оставить только `fitsGear(entry, owned)`.
- `renderLibrary({ …, gear = null })`. `gear` — `{ owned, onChange(owned) }` или `null`; при `null` экран ведёт себя ровно как сейчас.
- При `gear`:
  - переключатели (`idPrefix: 'library-gear'`) стоят после чипов сложности и перед строкой «Найдено»;
  - смена: `state.owned = owned`, `gear.onChange(owned)`, `drawList()`;
  - строка «Найдено»: `Найдено: N`, а если с инвентарём скрыто M > 0, то `Найдено: N · ещё M с другим инвентарём`. M — сколько прошло бы по тем же поиску, зоне и сложности без фильтра инвентаря, минус N;
  - «Сбросить фильтры» инвентарь не трогает.
- В верхней строке карточки — `span.library-gear` с `gearText(entry)`, всегда, и с `gear`, и без.

**`style.css`:** отступ блока `.gear-picker`, `.gear-hint` как у `.zone-hint`, `.library-gear` в духе `.muscles`. Классы чипов не дублировать: внешний вид даёт `.zone-chip`.

**Тесты (минимум):**

- Профиль:
  - по умолчанию `DEFAULT_OWNED`;
  - мусор и чужие id в local;
  - local бросает на `getItem` и `setItem`;
  - `set([])` → `get()` даёт `[]`;
  - порядок словаря.
- Переключатели:
  - `aria-pressed` по owned;
  - нажатие зовёт `onChange` с новым набором и id.
- Библиотека:
  - скрывает неподходящее;
  - счётчик «ещё M» с поиском и с зоной;
  - без `gear` ничего не фильтрует;
  - инвентарь на карточке.

**Коммит:** `«Что есть дома»: выбор на устройстве, переключатели, фильтр библиотеки`.

---

### Задача 3. Генератор, сборка, замена

**Файлы:** изменить `builder/generator.js`, `builder-view.js`, `app.js`, `README.md`; тесты `test/generator.test.js`, `test/builder-view.test.js`, `test/app.test.js` (если там собирается конструктор).

**`builder/generator.js`:**

```js
export function missingGear(library, owned, level, groups): string[]
```

- Возвращает id из `GEAR`, которых нет в `owned`, в порядке словаря.
- Берёт их из упражнений пула уровня (полной `library`), у которых доля 1 хотя бы на одну из `groups` и которые не проходят `fitsGear(entry, owned)`.
- `missingGroupsMessage(level, groups, gear = [])`: при пустом `gear` текст прежний. Иначе: `Для ${genitive} уровня с отмеченным инвентарём нет ${poolWords} на: ${groupsPhrase(groups)}. Есть с инвентарём: ${подписи через ', '}.`
- `missingZoneMessage(level, zone, gear = [])`: при пустом `gear` прежний. Иначе: `Для упора на зону «${label}» на ${prepositional} уровне с отмеченным инвентарём не хватает упражнений: нужно второе упражнение на ту же группу. Есть с инвентарём: ${подписи}.`
- `generate` и `availability` не меняются: им передают уже отфильтрованную библиотеку.

**`builder-view.js`** — `renderBuilder({ …, gearProfile = createGearProfile(null) })`; подходящие упражнения = `fitLibrary(library, gearProfile.get())`.

- **Ручная сборка.** `startManual`: скелет из подходящих.
- **Библиотека.** `showLibrary`: `entries: library` (полная — для счётчика «ещё M»), `gear: { owned: gearProfile.get(), onChange: owned => gearProfile.set(owned) }`.
- **Экран генератора.**
  - Переключатели (`idPrefix: 'generator-gear'`) после подзаголовка и перед «Уровень».
  - Смена: `gearProfile.set(owned)`, экран рисуется заново, фокус — на кнопку `[data-gear=<id>]` нового экрана.
  - `info` считается по подходящим.
  - Если выбранный уровень стал недоступен, `choice.level` — первый доступный или `null`.
  - Зоны, ставшие недоступными, снимаются.
  - Причины под уровнем и зоной — с `missingGear(library, owned, level, groups)`: для уровня groups — его `missing`, для зоны — группы зоны.
- **Подбор.** `runGenerator`: `generate({ …, library: подходящие })`. Отказ `reason === 'missing'` пересобирает текст с подсказкой: при `result.zone` — `missingZoneMessage(level, result.zone, missingGear(…, ZONES[zone].groups))`, иначе `missingGroupsMessage(level, result.groups, missingGear(…, result.groups))`. Отказ по потолку — как есть.
- **Замена.**
  - `openReplace` ищет кандидатов в библиотеке «подходящие + само заменяемое упражнение, если его там нет»: иначе `replaceCandidates` бросает на ключе сохранённой тренировки с неотмеченным инвентарём.
  - Пусто: посмотреть кандидатов по полной библиотеке.
    - Если там есть: `Похожих упражнений с отмеченным инвентарём больше нет. Есть с инвентарём: ${подписи неотмеченного инвентаря этих кандидатов}.`
    - Иначе прежний `NO_CANDIDATES`.
- **`expandWorkout`**: везде полная `library` (не трогать).
- **`app.js`**: `createGearProfile(local)` — тем же `local`, что у `createStorage`; передать `gearProfile` в `renderBuilder`.
- **`README.md`**: в описании конструктора — одна-две фразы про «Что есть дома»; в таблице «Структура» — строки `gear.js`, `gear-profile.js`, `gear-picker.js`.

**Тесты (минимум):**

- `missingGear` на фикстуре.
- Тексты отказов с подсказкой и без.
- Экран генератора:
  - снятие инвентаря делает уровень недоступным, и выбор поправляется;
  - фокус после смены на той же кнопке;
  - причина с «Есть с инвентарём».
- Замена в тренировке с неотмеченным инвентарём не бросает.
- Сообщение шторки при пустом списке из-за инвентаря.
- Скелет ручной сборки — только подходящие.
- `app.js` передаёт профиль: выбор переживает перерисовку раздела (если в `test/app.test.js` есть подходящая обвязка).

**Коммит:** `Конструктор учитывает «Что есть дома»: генератор, сборка, замена`.
