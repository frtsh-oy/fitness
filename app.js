// Связывание: данные тренировки, рендерер, хранилище, слой Telegram и таймер
// соединяются здесь и больше нигде. Точка входа — index.html, который импортирует
// startApp и зовёт её; сам модуль ничего не делает при импорте, поэтому связывание
// проверяется тестами на jsdom.
import { WORKOUTS, DEFAULT_WORKOUT_ID } from './workouts/index.js';
import { renderWorkout, renderIntro } from './render.js';
import { createStorage } from './storage.js';
import { createMyWorkouts } from './my-workouts.js';
import { expandWorkout } from './builder/compact.js';
import { LIBRARY } from './exercises/index.js';
import { initTelegram } from './telegram.js';
import { createTimer, formatTime } from './timer.js';
import { setupPlayers } from './player.js';
import { createBodyMap, warmupOnlyGroups, idleGroups, isMode, DEFAULT_MODE } from './bodymap.js';
import { groupsPhrase, regionGroups } from './muscles.js';
import { renderWeekly } from './weekly-view.js';
import { createSections, savedSection } from './sections.js';
import { renderWorkouts } from './workouts-view.js';
import { renderBuilder } from './builder-view.js';
import { hasSubscription } from './access.js';

// Отсчёт сверяется с часами часто, чтобы экран не отставал от них больше чем
// на глаз: на границе секунды подпись меняется в пределах пятой доли.
const TIMER_PERIOD_MS = 200;

// Задержка перед записью набора отметок. Полсекунды длиннее промежутка между
// двумя подряд тапами (человек, закрывающий круги один за другим, укладывается
// в 200–400 мс) и короче любой паузы, после которой он откладывает телефон.
// Склейка безопасна ровно потому, что save получает набор целиком, а не разницу:
// промежуточные состояния никому не нужны, важно только последнее.
const SAVE_DELAY_MS = 500;

// Ключ в localStorage, под которым запомнена текущая тренировка: id готовой
// (реестр WORKOUTS) или своей. Только на устройстве: это признак «что открыто
// у меня», а не данные человека, и в облако ему незачем.
export const CURRENT_KEY = 'current-workout';

// Вопрос перед сбросом — дословно из src-original/app.js.
const RESET_QUESTION = 'Сбросить все отметки за сегодня?';

// Порог телефона — то же число, что в style.css, где ниже него действуют
// телефонные размеры. Здесь он нужен потому, что раскрытие описаний
// упражнений — атрибут разметки (aria-expanded и hidden), а атрибут
// медиазапросом не задать. Что оба файла говорят про одну и ту же ширину,
// сторожит тест: разъехавшись, они дали бы телефонные размеры с раскрытым
// текстом, и причину этого пришлось бы искать в двух файлах сразу.
export const PHONE_MAX_WIDTH = 480;

// Объяснение в подборе под картой: показывается только у области, которая на
// схеме одна на несколько наших групп мышц (их три из семнадцати, см.
// regionGroups в muscles.js). Постоянным абзацем под картой оно объясняло
// затруднение до того, как человек с ним столкнётся.
//
// Числа групп в тексте нет намеренно. Сейчас у всех таких областей их ровно
// две, и «для двух групп» было бы правдой — но ровно до первой правки
// разметки, после которой подпись соврала бы молча. Согласовывать же
// числительное с фактическим числом значило бы завести в проекте склонение
// числительных ради случая, которого в данных нет.
const SHARED_REGION_NOTE = 'Эта область на схеме общая для нескольких групп мышц — поэтому в заголовке перечислены все.';

// Обращение к localStorage может бросить ещё до первого getItem: урезанный
// WebView или запрет на данные сайтов. storage.js умеет работать с local = null,
// так что здесь достаточно не дать исключению обрушить старт приложения.
function localStore(win) {
  try {
    return win.localStorage;
  } catch {
    return null;
  }
}

// SDK Telegram подключён на странице всегда, и в обычном браузере он тоже отдаёт
// объект WebApp — только представляется версией 6.0. CloudStorage появился в 6.9,
// и в клиенте постарше каждый вызов не просто уходит впустую, а бросает исключение
// с ошибкой в консоли. Поэтому облако берём, только когда клиент его действительно
// умеет; иначе остаётся localStorage, ради которого storage.js и принимает null.
function cloudStorage(webApp) {
  return webApp?.isVersionAtLeast?.('6.9') ? webApp.CloudStorage : null;
}

// Конец отдыха там, где клиент отклика не дал: человек на отдыхе смотрит не в
// экран. Оба способа отказа — метода нет вовсе (в Safari его не бывает) или он
// бросает (например, без жеста пользователя) — для нас одно и то же событие
// «сигнала не будет», поэтому и обрабатываются они одним catch. Отдельная
// проверка на существование метода ничего к этому не добавляла бы.
function vibrate(win) {
  try {
    win.navigator.vibrate([120, 80, 120]);
  } catch { /* устройство без вибромотора или запрет политикой */ }
}

// Плавность прокрутки просят не все — ровно та же проверка есть в player.js.
function scrollBehavior(win) {
  return win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

export function startApp(win = globalThis.window, { library = LIBRARY } = {}) {
  const document = win.document;
  const tg = initTelegram(win);
  const cloud = cloudStorage(tg.webApp);
  const local = localStore(win);
  const storage = createStorage({ cloud, local });
  // Один на всё время работы приложения: счётчик правок, по которому он отличает
  // свежее состояние тренировки от устаревшего ответа облака, у каждого
  // экземпляра свой, и второй экземпляр его бы не видел.
  const store = createMyWorkouts({ cloud, local });
  // Старые отметки чистим при каждом запуске и не ждём: устройство очищается
  // тут же, облако — когда ответит, а сбой чистки на запуск не влияет.
  storage.prune();

  // Тренировка по id: готовая из реестра или своя с устройства, собранная из
  // сжатой записи. null — такой нет: неизвестный id или своя, которую уже
  // удалили. Облака здесь нет намеренно: открывать тренировку надо сразу, а оно
  // отвечает до пяти секунд.
  function openWorkout(id) {
    if (Object.hasOwn(WORKOUTS, id)) return { workout: WORKOUTS[id], removed: [] };
    const compact = store.peek(id);
    return compact ? expandWorkout(id, compact, library) : null;
  }

  function rememberedId() {
    try { return win.localStorage.getItem(CURRENT_KEY); } catch { return null; }
  }

  // Что открыть при запуске: тренировка из ссылки (`?w=` или startapp), если
  // она есть в реестре; иначе запомненная; иначе готовая по умолчанию. Ссылка
  // запомненное не трогает: она лишь на этот запуск.
  const start = (() => {
    const linked = tg.workoutId;
    if (linked && Object.hasOwn(WORKOUTS, linked)) return openWorkout(linked);
    return openWorkout(rememberedId()) ?? openWorkout(DEFAULT_WORKOUT_ID);
  })();
  // Открытая в «Сегодня»: её читают обработчики, которые вешаются один раз
  // (отметки, сброс, карта), поэтому она одна на всё время работы, а не
  // параметр каждого из них. Меняется только в showWorkout.
  let workout = start.workout;

  // Свои тренировки, как их вернул list(): null, пока ответа ещё нет.
  let mine = null;

  // «Конструктор» рисуется при первом показе, а не при запуске: до тех пор,
  // пока человек ни разу не открыл раздел, готовить его разметку незачем.
  // «Тренировки» рисуются при КАЖДОМ показе: список зависит от того, какая
  // тренировка открыта сейчас, какие свои есть и что только что удалили.
  let builderDrawn = false;

  const sections = createSections({
    win,
    onShow(id) {
      if (id === 'workouts') drawWorkouts();
      if (id === 'builder' && !builderDrawn) {
        builderDrawn = true;
        renderBuilder({ host: document.getElementById('screen-builder'), hasSubscription });
      }
    },
  });
  sections.show(savedSection(win) ?? 'today');

  function drawWorkouts() {
    renderWorkouts({
      host: document.getElementById('screen-workouts'),
      ready: WORKOUTS,
      mine,
      currentId: workout.id,
      library,
      onPick: selectWorkout,
      onDelete: deleteOwn,
    });
  }

  // Запоминание — только на устройстве, см. CURRENT_KEY.
  function remember(id) {
    try { win.localStorage.setItem(CURRENT_KEY, id); } catch { /* приватный режим */ }
  }

  // Смена по выбору человека: карточка в «Тренировках». Та же тренировка
  // ничего не перерисовывает — «Сегодня» просто открывается там, где его
  // оставили. Другая открывается сверху: сохранённое место прокрутки относилось
  // к прежней тренировке и в новой вело бы в случайную точку.
  function selectWorkout(id) {
    const next = openWorkout(id);
    // Своей тренировки, которой на устройстве уже нет, открыть нечем.
    if (!next) return;
    const changed = next.workout.id !== workout.id;
    if (changed) showWorkout(next.workout, next.removed);
    remember(id);
    sections.show('today');
    if (changed) win.scrollTo({ top: 0, behavior: 'instant' });
  }

  // Удаление своей: сначала спрашиваем. Запись исчезает с устройства сразу, а
  // облаку удаление уходит в фоне: экран не ждёт ответа, которого может не быть
  // пять секунд. Удалили текущую — открывается готовая по умолчанию, раздел
  // остаётся тем же: человек в списке и должен увидеть, что запись пропала.
  async function deleteOwn(id) {
    // Записи может уже не быть: второй тап по «Удалить», пока первый ждал ответа
    // на вопрос, приходит сюда после того, как первый её убрал.
    const own = mine.find(entry => entry.id === id);
    if (!own) return;
    if (!await tg.confirm(`Удалить тренировку «${own.compact.name}»?`)) return;
    store.remove(id);
    mine = mine.filter(own => own.id !== id);
    if (id === workout.id) {
      const fallback = openWorkout(DEFAULT_WORKOUT_ID);
      showWorkout(fallback.workout, fallback.removed);
      remember(DEFAULT_WORKOUT_ID);
    }
    drawWorkouts();
  }

  const host = document.getElementById('workout');
  const removedNote = document.getElementById('removed-note');

  // Раскрытие описания — делегированием на host: кнопок девятнадцать, и своего
  // обработчика каждой не нужно. Кнопку ищем через closest, потому что цель
  // события — значок-уголок, когда палец попал в него, а не в подпись.
  // Раскрытие одного упражнения не трогает остальные: человек вправе держать
  // раскрытыми оба упражнения силовой пары, которые делает одно за другим.
  host.addEventListener('click', event => {
    const toggle = event.target.closest('.howto-toggle');
    if (!toggle) return;
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    document.getElementById(toggle.getAttribute('aria-controls')).hidden = !open;
  });

  // Карта тела. Отложено именно РИСОВАНИЕ: сам модуль библиотеки грузится
  // вместе с приложением, статическим импортом. Отложена работа по построению
  // двух SVG-схем, которая большинству открытий не нужна.
  const mapToggle = document.querySelector('.bodymap-toggle');
  const mapBody = document.querySelector('.bodymap-body');
  const mapPick = document.querySelector('.bodymap-pick');
  const mapModeButtons = [...document.querySelectorAll('.bodymap-modes button')];
  const MAP_KEY = 'bodymap-open';
  const MODE_KEY = 'bodymap-mode';
  let bodyMap = null;
  let mapMode = DEFAULT_MODE;

  // Объём — точная сумма долей, поэтому бывает дробным (0.5 за круг): 2.5 в
  // русском тексте пишется «2,5». Доли кратны 0.5, такие суммы в double
  // представимы точно, и String печатает их не длиннее одного знака после
  // точки — без toFixed, который приписал бы «,0» целым числам.
  const formatSets = sets => String(sets).replace('.', ',');

  // Две подписи под картой, обе короткие: владелец программы сказал, что
  // текста под картинкой много. Про верх шкалы подписи молчат — объяснение
  // через округление на экране почти никому не нужно, а короче и не соврав его
  // не сказать (последний оттенок начинается с 5.5, а не с шести). Подробность
  // осталась в README, точное число подходов видно по клику.
  function fillNotes() {
    // Первая — про то, что красит цвет в выбранном режиме. В режиме всей
    // нагрузки «цветом — силовые подходы» было бы прямой неправдой.
    document.querySelector('.bodymap-note').textContent = mapMode === 'all'
      ? 'Цветом — вся нагрузка: разминка, силовые и заминка.'
      : 'Цветом — силовые подходы.';

    // Вторая — оговорки про отдельные группы. Обе фразы в ней про разметку, а
    // не про тело, и каждая появляется только при непустом списке. Пустой
    // список — не край случая, а другая тренировка: такая, где у каждой группы
    // из разминки И заминки есть ещё и силовые подходы (warmupOnlyGroups
    // объединяет оба типа, см. bodymap.js), либо такая, где размечены все
    // двадцать групп словаря. Реестр тренировок — документированная точка
    // расширения (README, `?w=<id>`), и через неё эта ветвь проверена тестом на
    // синтетической тренировке («у тренировки, где нечего оговаривать, второй
    // подписи под картой нет вовсе»): без проверок length там оставалось бы
    // «Только в разминке и заминке: .» с повисшим двоеточием.
    const parts = [];
    // Про разминку и заминку речь только в силовом режиме: в нём у этих групп
    // нет ни одного силового подхода, и по карте этого не увидеть. У задней
    // дельты своя область бледная — но бледность значит и «нет силовых
    // подходов», и «нет разметки вовсе» (о втором — фраза ниже), так что по
    // цвету причину не отличить. А область сгибателей бедра, квадрицепсы, и
    // вовсе окрашена: два силовых подхода ей дают квадрицепсы, а не они. В
    // режиме всей нагрузки разминка и заминка уже посчитаны в цвете, и
    // говорить об этих группах нечего.
    const warm = warmupOnlyGroups(workout);
    if (mapMode !== 'all' && warm.length) {
      parts.push(`Только в разминке и заминке: ${groupsPhrase(warm)}.`);
    }
    // Этот список от режима не зависит: idleGroups перебирает все типы
    // упражнений сразу, и группа попадает в него, только если её нет ни в
    // одном load. Речь именно о разметке, а не о теле — но для legs-mwf такой
    // группы больше нет: хват резинки размечен предплечьям по правилу из
    // docs/muscle-map.md, и idleGroups(workout) для этой тренировки пуст.
    // Условие ниже остаётся ради будущих тренировок и будущих групп мышц,
    // которым разметки ещё не досталось.
    const idle = idleGroups(workout);
    if (idle.length) parts.push(`Светлым — то, чего нет в разметке: ${groupsPhrase(idle)}.`);
    document.querySelector('.bodymap-groups').textContent = parts.join(' ');
  }

  function paintModeButtons() {
    for (const button of mapModeButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mapMode));
    }
  }

  function showPick({ region, label, sets, exercises }) {
    mapPick.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = `${label} — ${formatSets(sets)} подх.`;
    mapPick.append(title);
    // Заголовок перечисляет все группы области, и когда их несколько, это
    // нужно объяснить — иначе непонятно, почему в ответ на один клик названо
    // несколько мышц. Объяснение стоит сразу под заголовком — речь в нём как
    // раз про заголовок.
    if (regionGroups(region).length > 1) {
      const shared = document.createElement('p');
      shared.className = 'bodymap-shared';
      shared.textContent = SHARED_REGION_NOTE;
      mapPick.append(shared);
    }
    for (const name of exercises) {
      const link = document.createElement('button');
      link.type = 'button';
      link.textContent = name;
      link.addEventListener('click', () => {
        // target — без ?.: name пришёл из regionSummary того же объекта
        // тренировки, что нарисован в host, а render.js безусловно рисует h3
        // с item.name для каждого упражнения каждого блока — любой режим карты
        // отбирает подмножество этих упражнений, значит заголовок находится
        // всегда. Тот же стандарт, что у localStorage ниже: защиту ставим там,
        // где ветка достижима.
        const target = [...host.querySelectorAll('.exercise h3')].find(h => h.textContent === name);
        target.scrollIntoView({ block: 'center', behavior: scrollBehavior(win) });
      });
      mapPick.append(link);
    }
  }

  function openMap() {
    if (!bodyMap) {
      bodyMap = createBodyMap({
        workout,
        anteriorHost: document.querySelector('.bodymap-anterior'),
        posteriorHost: document.querySelector('.bodymap-posterior'),
        onPick: showPick,
        mode: mapMode,
      });
    }
  }

  function setMapOpen(open) {
    mapToggle.setAttribute('aria-expanded', String(open));
    mapBody.hidden = !open;
    if (open) openMap();
    // Как и в остальном приложении (см. localStore/vibrate выше): try/catch
    // сам по себе уже гасит и бросающий геттер localStorage, и отсутствующий
    // объект — второй защиты поверх него (?.) не требуется.
    try { win.localStorage.setItem(MAP_KEY, open ? '1' : '0'); } catch { /* приватный режим */ }
  }

  mapToggle.addEventListener('click', () =>
    setMapOpen(mapToggle.getAttribute('aria-expanded') !== 'true'));

  for (const button of mapModeButtons) {
    button.addEventListener('click', () => {
      mapMode = button.dataset.mode;
      // bodyMap здесь заведомо построен, без ?.: кнопки режима лежат внутри
      // .bodymap-body, а он скрыт атрибутом hidden, пока карту не раскрыли, —
      // до нажатия скрытой кнопки не доходит ни мышь, ни Tab. Раскрытие же
      // строит карту сразу (setMapOpen → openMap), в том же обработчике.
      bodyMap.setMode(mapMode);
      // Прежний подбор относится к прежнему режиму: в нём и число подходов, и
      // список упражнений уже не те. Пересчитать его было бы чем — регион
      // известен, и bodymap.js знает по нему всё, — но подбор это ответ на
      // клик: подменить в нём числа под прежним заголовком значит показать
      // человеку то, чего он не спрашивал. Поэтому убираем и ждём нового клика.
      mapPick.replaceChildren();
      paintModeButtons();
      fillNotes();
      try { win.localStorage.setItem(MODE_KEY, mapMode); } catch { /* приватный режим */ }
    });
  }

  let mapWasOpen = false;
  try { mapWasOpen = win.localStorage.getItem(MAP_KEY) === '1'; } catch { /* см. выше */ }
  // Режим из хранилища проверяем: там переживает и смена версии приложения, и
  // правка руками, а неизвестное значение обрушило бы построение карты.
  try {
    const savedMode = win.localStorage.getItem(MODE_KEY);
    if (isMode(savedMode)) mapMode = savedMode;
  } catch { /* см. выше */ }
  paintModeButtons();

  // Секция недельного объёма. Устроена как секция карты выше: рисуется при
  // первом раскрытии, состояние помнится. Повторное раскрытие не
  // перерисовывает — renderWeekly очистил бы host и собрал те же строки заново.
  // Неделя человека — это текущая тренировка, повторённая в её дни, поэтому
  // считается она одна, а не весь реестр; со сменой тренировки секция
  // рисуется заново (showWorkout).
  const WEEKLY_KEY = 'weekly-open';
  const weeklyToggle = document.querySelector('.weekly-toggle');
  const weeklyBody = document.querySelector('.weekly-body');
  let weeklyDrawn = false;

  function drawWeekly() {
    if (weeklyDrawn) return;
    renderWeekly({ host: weeklyBody, workouts: [workout] });
    weeklyDrawn = true;
  }

  function setWeeklyOpen(open) {
    weeklyToggle.setAttribute('aria-expanded', String(open));
    weeklyBody.hidden = !open;
    // Без if (open). Ложным open бывает — ровно при сворачивании, вторым
    // кликом, — но к этому моменту рисовать уже нечего: раскрыть секцию можно
    // только кликом по свёрнутой кнопке, а он всегда даёт open=true
    // (aria-expanded стартует 'false' и меняется только здесь), значит перед
    // любым setWeeklyOpen(false) drawWeekly уже отработал и weeklyDrawn уже
    // true. То есть условие не меняло бы исхода ни разу — сторожит сам
    // drawWeekly() своим if (weeklyDrawn).
    drawWeekly();
    // try/catch по месту — как у MAP_KEY выше: он гасит и бросающий геттер
    // localStorage, и его отсутствие, второй защиты поверх не нужно.
    try { win.localStorage.setItem(WEEKLY_KEY, open ? '1' : '0'); } catch { /* приватный режим */ }
  }

  weeklyToggle.addEventListener('click', () =>
    setWeeklyOpen(weeklyToggle.getAttribute('aria-expanded') !== 'true'));

  let weeklyWasOpen = false;
  try { weeklyWasOpen = win.localStorage.getItem(WEEKLY_KEY) === '1'; } catch { /* см. выше */ }

  // Один набор на всё время работы: при смене тренировки он очищается и
  // заполняется заново, а не заменяется новым, — на него смотрят снаружи.
  const marks = new Set();
  const progress = document.getElementById('progress');
  const progressText = document.getElementById('progress-text');
  // Отметки, которые есть на экране: сколько их всего и какие именно. Второе
  // нужно на слияние с хранилищем — см. loadMarks ниже. Пересчитываются при
  // каждой смене тренировки (showWorkout).
  let known = new Set();
  let total = 0;

  function paint() {
    for (const box of host.querySelectorAll('input[data-mark]')) {
      box.checked = marks.has(box.dataset.mark);
    }
    // Класс completed висит на самом упражнении и загорается, когда закрыты
    // все его круги — так это устроено в style.css.
    for (const exercise of host.querySelectorAll('.exercise')) {
      const boxes = [...exercise.querySelectorAll('input[data-mark]')];
      exercise.classList.toggle('completed', boxes.every(box => box.checked));
    }
    progress.value = marks.size;
    progressText.textContent = `Сегодня: ${marks.size} из ${total} отметок`;
  }

  // Каждый тап — не отдельная запись. За CloudStorage стоит запрос к клиенту
  // Telegram, и при мёртвой сети каждая запись ждёт свой таймаут в очереди:
  // пятнадцать тапов подряд растянули бы сохранение последнего на минуту.
  // Поэтому частые изменения склеиваются и уходят одним актуальным набором.
  let saveTimer = null;

  function cancelSave() {
    win.clearTimeout(saveTimer);
    saveTimer = null;
  }

  function queueSave() {
    cancelSave();
    saveTimer = win.setTimeout(() => {
      saveTimer = null;
      storage.save(workout.id, marks);
    }, SAVE_DELAY_MS);
  }

  // Отложенную запись нельзя оставлять «на потом», когда приложение убирают
  // с глаз: свёрнутый мини-апп клиент вправе выгрузить вместе с таймерами.
  function flushSave() {
    if (saveTimer === null) return;
    cancelSave();
    storage.save(workout.id, marks);
  }

  // Разметка уже на экране, отметки приезжают следом: load асинхронный, потому
  // что за CloudStorage стоит запрос к клиенту Telegram — до пяти секунд.
  // Приехавшее ОБЪЕДИНЯЕТСЯ с тем, что человек успел отметить, а не спорит с ним:
  // до ответа хранилища на экране пусто, значит единственное возможное действие —
  // поставить отметку, и объединение не теряет ни её, ни сохранённых.
  //
  // Сброс — единственное исключение: он и означает «забыть сохранённое».
  // Признак отдельный, потому что обычная отметка приехавшего не отменяет.
  //
  // Состояние живёт у каждой загрузки своё (marksLoad), а не общим на всё
  // приложение: ответ хранилища может прийти уже после смены тренировки, и тогда
  // ему нужны признаки ТОЙ тренировки, а не нынешней.
  //   reset — сброс до ответа (см. выше);
  //   touched — успела ли уйти запись до слияния. Спрашивать вместо этого «стал
  //     ли набор больше приехавшего» нельзя: ранний набор бывает ПОДМНОЖЕСТВОМ
  //     сохранённого — тапнули круг, который в хранилище уже отмечен, или
  //     тапнули и тут же сняли промах. Размеры тогда совпадают (во втором случае
  //     ранний набор вообще пуст), а в хранилище уже лежит обрезанный набор или
  //     пустота. Значение имеет сам факт изменения, а не его размер;
  //   known — отметки, которые были на экране этой тренировки;
  //   early — копия набора на момент смены тренировки, пока ответа не было.
  let marksLoad = null;
  let ready = Promise.resolve();

  function loadMarks() {
    const load = { id: workout.id, known, touched: false, reset: false, early: null };
    marksLoad = load;
    ready = storage.load(load.id).then(saved => {
      if (load.reset) return;
      // Ответ пришёл после смены тренировки: он принадлежит прежней, и в набор на
      // экране ему не место, иначе он показал бы отметки одной тренировки на
      // экране другой. Но выбросить его нельзя: при смене под прежний id уже ушёл
      // ранний набор, один, без сохранённых (save пишет набор целиком), и они
      // остались бы затёртыми. Поэтому возвращаем в хранилище объединение. Не
      // было ранних отметок — нечего защищать, и записывать нечего.
      if (load !== marksLoad) {
        if (load.touched) {
          storage.save(load.id, new Set([...load.early, ...[...saved].filter(id => load.known.has(id))]));
        }
        return;
      }
      // Приехавшее сверяется с экраном. В хранилище за сегодня могут лежать
      // идентификаторы, которых на странице уже нет: упражнению сменили key,
      // упражнение убрали, блок переименовали. Без сверки такая отметка попадает
      // в marks, и счётчик показывает «Сегодня: 4 из 37» при одном отмеченном
      // чекбоксе, а при достатке мусора перевалит и за 37 — потому что и текст,
      // и полоса прогресса считаются по размеру набора. Из набора они уходят
      // насовсем: сохраняется он целиком, поэтому первая же запись вычистит их
      // и из хранилища. В оригинале ровно для этого была явная чистка
      // (src-original/app.js: удаление ключей по маске при переименовании).
      for (const id of saved) if (known.has(id)) marks.add(id);
      // Ранняя отметка уже уехала в хранилище — одна, без сохранённых, потому что
      // save пишет набор целиком. Возвращаем туда объединённый набор, иначе старые
      // отметки пропадут из хранилища, даже оставшись на экране.
      if (load.touched) queueSave();
      paint();
    });
  }

  // Отметка — чекбокс, поэтому слушаем change: это событие смены состояния, оно
  // приходит при любом способе переключения и уже с новым checked. Клик по самому
  // квадратику браузер, конечно, тоже показал бы, но click — событие про нажатие,
  // а не про состояние, и на нём обработчик зависел бы от способа ввода.
  host.addEventListener('change', event => {
    // Цель change от чекбокса — сам чекбокс, вложенности тут не бывает.
    const box = event.target;
    if (!box.matches('input[data-mark]')) return;
    marksLoad.touched = true;
    const id = box.dataset.mark;
    if (box.checked) marks.add(id); else marks.delete(id);
    paint();
    queueSave();

    const section = box.closest('section.workout-block');
    const all = [...section.querySelectorAll('input[data-mark]')];
    tg.haptic(all.every(b => marks.has(b.dataset.mark)) ? 'done' : 'mark');
  });

  function resetMarks() {
    marksLoad.reset = true;
    // Отложенная запись больше не нужна: её набор устарел, а очистка идёт следом.
    cancelSave();
    marks.clear();
    paint();
    storage.clear(workout.id);
  }

  document.getElementById('reset').addEventListener('click', () => {
    // Спрашиваем, только когда есть что терять, — как в оригинале.
    // Ответ асинхронный: внутри Telegram это окно самого клиента.
    if (marks.size === 0) {
      resetMarks();
      return;
    }
    tg.confirm(RESET_QUESTION).then(confirmed => {
      if (confirmed) resetMarks();
    });
  });

  // Таймер отдыха
  const sheet = document.getElementById('timer-sheet');
  const value = document.getElementById('timer-value');
  const status = document.getElementById('timer-status');
  const toggle = document.getElementById('timer-toggle');

  const openButton = document.getElementById('timer-open');

  function setSheetOpen(open) {
    sheet.hidden = !open;
    openButton.setAttribute('aria-expanded', String(open));
  }

  openButton.addEventListener('click', () => setSheetOpen(sheet.hidden));
  document.getElementById('timer-close').addEventListener('click', () => setSheetOpen(false));

  const timer = createTimer({
    onTick: remaining => {
      value.textContent = formatTime(remaining);
      // «Ещё раз» в нуле — как в оригинале: старт на отработавшем таймере
      // начинает отсчёт заново, и кнопка обязана обещать именно это.
      toggle.textContent = timer.running ? 'Пауза' : remaining === 0 ? 'Ещё раз' : 'Старт';
      sheet.classList.toggle('done', remaining === 0);
      // Пока отдых идёт, время видно в навигации: это единственное место, где
      // таймер занимает место постоянно, и ради него шторку открывать не надо.
      openButton.textContent = timer.running ? formatTime(remaining) : 'Отдых';
      // Подсветка пункта навигации держится на состоянии отсчёта, а не на
      // открытости шторки: закрыв шторку крестиком во время отдыха, человек
      // обязан по-прежнему видеть, что где-то идёт время. aria-expanded для
      // этого не подходит — он гаснет вместе со шторкой, а отдых продолжается.
      openButton.dataset.running = String(timer.running);
      // Статус здесь не пишется намеренно. #timer-status — область aria-live:
      // каждое значение в ней экранный диктор проговаривает вслух. Перерисовка
      // случается и в нуле, и тогда он успел бы сказать одно ровно перед тем,
      // как onDone скажет «Отдых закончен». Статус меняют события, а не
      // перерисовка, поэтому его ставят обработчики — по одному разу на событие.
    },
    onDone: () => {
      status.textContent = 'Отдых закончен';
      // Спрашивать «мы внутри Telegram?» тут нельзя: SDK подключён со страницы
      // всегда и в обычном браузере тоже отдаёт объект WebApp — просто версии
      // 6.0, в которой HapticFeedback ничего не делает. Поэтому решает не факт
      // наличия клиента, а ответ самого haptic: был отклик или не было.
      if (!tg.haptic('done')) vibrate(win);
    },
  });

  // Интервалом владеет связывание, а не таймер. Отсчёт ведётся по настенным
  // часам: в фоне браузер прореживает интервалы, а WebView Telegram у свёрнутого
  // приложения останавливает их совсем — человек убирает телефон в карман на
  // полторы минуты и возвращается к экрану, застрявшему на середине отдыха.
  // Поэтому запоминается момент конца отдыха, а срабатывание интервала лишь
  // спрашивает часы, сколько целых секунд уже прошло.
  let ticker = null;
  let endAt = 0;
  // Остаток, с которым таймер встал на паузу, — в миллисекундах. timer.remaining
  // огрублён до целых секунд вверх, и возобновление по нему дарило бы человеку
  // почти секунду отдыха на каждой паре «пауза — старт».
  let pausedMs = 0;

  function stopTicking() {
    win.clearInterval(ticker);
    ticker = null;
  }

  function catchUp() {
    // Догоняем часы ровно на столько секунд, сколько они ушли вперёд: после сна
    // вкладки это может быть сразу вся оставшаяся минута. Цикл ограничен самим
    // остатком — в ноль таймер останавливается и tick() перестаёт что-то менять.
    const shouldRemain = Math.ceil((endAt - Date.now()) / 1000);
    while (timer.running && timer.remaining > shouldRemain) timer.tick();
    if (!timer.running) stopTicking();
  }

  function startTicking() {
    endAt = Date.now() + (pausedMs || timer.remaining * 1000);
    pausedMs = 0;
    ticker = win.setInterval(catchUp, TIMER_PERIOD_MS);
  }

  toggle.addEventListener('click', () => {
    if (!timer.running) {
      timer.toggle();
      startTicking();
      status.textContent = 'Восстанавливай дыхание';
      return;
    }
    // Пауза. Сначала добираем секунды, созревшие с последнего срабатывания:
    // замереть надо на том, что показывают часы, а не на том, что успел
    // нарисовать интервал. Отдых мог на этом и закончиться — тогда паузу
    // ставить уже не над чем, конец обработан внутри catchUp.
    catchUp();
    if (!timer.running) return;
    pausedMs = endAt - Date.now();
    timer.toggle();
    // Интервал гасим: незачем будить процессор телефона, пока человек
    // делает подход.
    stopTicking();
    status.textContent = 'На паузе';
  });

  const presets = [...document.querySelectorAll('.presets button')];

  function selectDuration(preset) {
    for (const other of presets) other.setAttribute('aria-pressed', String(other === preset));
    timer.setDuration(Number(preset.dataset.time));
    stopTicking();
    pausedMs = 0;
  }

  for (const preset of presets) {
    preset.addEventListener('click', () => {
      selectDuration(preset);
      status.textContent = 'Готов к старту';
    });
  }

  document.getElementById('timer-reset').addEventListener('click', () => {
    timer.reset();
    stopTicking();
    pausedMs = 0;
    status.textContent = 'Готов к старту';
  });

  // Начальная длительность — из разметки, из пресета с aria-pressed. Другого
  // источника нет: ни в index.html текстом, ни в timer.js по умолчанию. Что
  // отмеченный пресет на странице есть, сторожит тест стартового экрана, а не
  // ветка в коде: без него приложению всё равно нечего показать на табло.
  // Статус при этом не трогаем: на свежей странице человек ещё ничего не
  // выбирал, и «Выбери время» из разметки — правда. Это тоже как в оригинале.
  selectDuration(presets.find(preset => preset.getAttribute('aria-pressed') === 'true'));

  // Escape закрывает открытое видео. Слушатель на document один на всё время
  // работы, а не по одному на каждую отрисовку тренировки: плеер приходит от
  // последнего setupPlayers, и закрывает он именно своё видео (в разметке
  // прежней тренировки их уже нет).
  let closePlayer = () => {};
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePlayer();
  });

  // Возвращение к приложению — второй источник правды о времени, кроме интервала:
  // пока вкладка была скрыта, он мог не сработать ни разу. Уход, наоборот, —
  // последний момент, когда можно дописать отметки.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSave(); else catchUp();
  });

  // В Safari и на iOS visibilitychange при уходе со страницы приходит не всегда,
  // а pagehide — штатный путь: им клиент и браузер сообщают, что страницу
  // сворачивают, заменяют или выгружают.
  win.addEventListener('pagehide', flushSave);

  // Кнопка «назад» показывается, когда пользователь ушёл ниже первого экрана.
  // Вешаем обработчик ровно один раз: у настоящего BackButton.onClick
  // обработчики накапливаются, а не заменяют друг друга.
  tg.onBack(() => win.scrollTo({ top: 0, behavior: scrollBehavior(win) }));

  // setBackVisible каждый раз ходит в клиент Telegram, а событий прокрутки за
  // один жест десятки. Зовём его только когда ответ меняется.
  let backVisible = false;
  win.addEventListener('scroll', () => {
    const shouldShow = win.scrollY > win.innerHeight;
    if (shouldShow === backVisible) return;
    backVisible = shouldShow;
    tg.setBackVisible(shouldShow);
  }, { passive: true });

  // Подсветка текущего блока в навигации — как в src-original/app.js.
  const observer = new win.IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of document.querySelectorAll('.block-nav a')) {
        link.classList.toggle('active', link.hash === `#${entry.target.id}`);
      }
    }
  }, { rootMargin: '-70px 0px -65% 0px', threshold: 0 });

  // Всё, что зависит от тренировки, собрано здесь, и первая отрисовка при
  // запуске идёт тем же путём, что и смена на другую: расходиться им не с чего.
  // Обработчики, которые вешаются один раз (отметки, раскрытие, сброс, таймер,
  // прокрутка), сюда не входят и читают тренировку из замыкания. Таймер не
  // трогается вовсе: отдых идёт, пока человек выбирает, чем заняться дальше.
  // skipped — ключи, которых уже нет в библиотеке (expandWorkout).
  function showWorkout(next, skipped) {
    // Отложенная запись отметок уходит немедленно и под ПРЕЖНИМ id: после
    // присваивания ниже она записала бы их под id новой тренировки.
    flushSave();
    workout = next;

    renderIntro(workout, document);
    removedNote.textContent = skipped.length
      ? `Убрано из библиотеки и пропущено упражнений: ${skipped.length}.`
      : '';
    removedNote.hidden = skipped.length === 0;

    // Описания упражнений: на телефоне свёрнуты, в широком окне раскрыты — там
    // места хватает, и прятать текст незачем. Решение принимается один раз, при
    // отрисовке тренировки. Перерисовки при повороте экрана нет намеренно: она
    // стёрла бы то, что человек успел раскрыть руками, а поворот телефона сам по
    // себе просьбы «покажи мне технику» не означает.
    const expandDescriptions = !win.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`).matches;
    host.replaceChildren(renderWorkout(workout, document, { expandDescriptions }));
    closePlayer = setupPlayers(host, url => tg.openLink(url));

    // Блоки прежней тренировки из документа ушли, наблюдать за ними нечего.
    observer.disconnect();
    for (const section of host.querySelectorAll('.workout-block')) observer.observe(section);

    // Карта: подбор относился к прежней тренировке, и число подходов в нём
    // чужое; построенная карта — тоже её. Раскрытая строится заново сразу,
    // свёрнутая — при раскрытии (openMap строит только то, чего ещё нет).
    // Подписи под картой не ждут раскрытия: они не стоят ничего, а зависят от
    // режима и от тренировки, а не от построенной карты.
    mapPick.replaceChildren();
    bodyMap?.destroy();
    bodyMap = null;
    fillNotes();
    if (mapToggle.getAttribute('aria-expanded') === 'true') openMap();

    // Недельная нагрузка: раскрытая перерисовывается сразу, свёрнутая — при
    // раскрытии (drawWeekly рисует только то, чего ещё нет).
    weeklyDrawn = false;
    if (!weeklyBody.hidden) drawWeekly();

    // Ответа по прежней тренировке могло ещё не быть: он придёт позже и ему
    // понадобится набор на момент смены (см. loadMarks).
    if (marksLoad) marksLoad.early = new Set(marks);
    marks.clear();
    const onScreen = [...host.querySelectorAll('input[data-mark]')].map(box => box.dataset.mark);
    known = new Set(onScreen);
    total = onScreen.length;
    progress.max = total;
    loadMarks();
    paint();
  }

  showWorkout(start.workout, start.removed);

  // Раскрытые в прошлый раз секции восстанавливаются после первой отрисовки:
  // карта и неделя строятся по открытой тренировке, и до неё их пришлось бы
  // строить дважды.
  if (mapWasOpen) setMapOpen(true);
  if (weeklyWasOpen) setWeeklyOpen(true);

  // Свои тренировки приезжают в фоне и ничего не задерживают: облако отвечает до
  // пяти секунд, а «Сегодня» уже нарисовано с устройства. Если человек успел
  // открыть «Тренировки», раздел перерисовывается по ответу. Единственный вызов
  // list: параллельный второй повторил бы досылку и удаление, которые первый
  // уже делает.
  store.list().then(list => {
    mine = list;
    if (!document.getElementById('screen-workouts').hidden) drawWorkouts();
  });

  return {
    get workout() { return workout; },
    marks,
    timer,
    get total() { return total; },
    get ready() { return ready; },
    store,
  };
}
