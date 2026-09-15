// Связывание: данные тренировки, рендерер, хранилище, слой Telegram и таймер
// соединяются здесь и больше нигде. Точка входа — index.html, который импортирует
// startApp и зовёт её; сам модуль ничего не делает при импорте, поэтому связывание
// проверяется тестами на jsdom.
import { getWorkout } from './workouts/index.js';
import { renderWorkout, renderIntro } from './render.js';
import { createStorage } from './storage.js';
import { initTelegram } from './telegram.js';
import { createTimer, formatTime } from './timer.js';
import { setupPlayers } from './player.js';

// Отсчёт сверяется с часами часто, чтобы экран не отставал от них больше чем
// на глаз: на границе секунды подпись меняется в пределах пятой доли.
const TIMER_PERIOD_MS = 200;

// Задержка перед записью набора отметок. Полсекунды длиннее промежутка между
// двумя подряд тапами (человек, закрывающий круги один за другим, укладывается
// в 200–400 мс) и короче любой паузы, после которой он откладывает телефон.
// Склейка безопасна ровно потому, что save получает набор целиком, а не разницу:
// промежуточные состояния никому не нужны, важно только последнее.
const SAVE_DELAY_MS = 500;

// Вопрос перед сбросом — дословно из src-original/app.js.
const RESET_QUESTION = 'Сбросить все отметки за сегодня?';

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
// экран. navigator.vibrate есть не везде (в Safari его нет вовсе) и может
// бросить — например, когда вкладка не на виду.
function vibrate(win) {
  try {
    win.navigator.vibrate?.([120, 80, 120]);
  } catch { /* устройство без вибромотора или запрет политикой */ }
}

// Плавность прокрутки просят не все — ровно та же проверка есть в player.js.
function scrollBehavior(win) {
  return win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
}

export function startApp(win = globalThis.window) {
  const document = win.document;
  const tg = initTelegram(win);
  const workout = getWorkout(tg.workoutId);
  const storage = createStorage({
    cloud: cloudStorage(tg.webApp),
    local: localStore(win),
  });

  renderIntro(workout, document);

  const host = document.getElementById('workout');
  host.replaceChildren(renderWorkout(workout, document));
  setupPlayers(host, url => tg.openLink(url));

  const marks = new Set();
  const progress = document.getElementById('progress');
  const progressText = document.getElementById('progress-text');
  const total = host.querySelectorAll('input[data-mark]').length;
  progress.max = total;

  function paint() {
    for (const box of host.querySelectorAll('input[data-mark]')) {
      box.checked = marks.has(box.dataset.mark);
    }
    // Класс completed висит на самом упражнении и загорается, когда закрыты
    // все его круги — так это устроено в style.css.
    for (const exercise of host.querySelectorAll('.exercise')) {
      const boxes = [...exercise.querySelectorAll('input[data-mark]')];
      // Проверка на пустоту здесь не про невозможного вызывающего, а про every():
      // на пустом списке он отвечает true, и упражнение без кругов загорелось бы
      // выполненным, ничего не выполнив.
      exercise.classList.toggle('completed', boxes.length > 0 && boxes.every(b => b.checked));
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
    if (saveTimer === null) return;
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
  let resetBeforeLoad = false;
  const ready = storage.load(workout.id).then(saved => {
    if (resetBeforeLoad) return;
    for (const id of saved) marks.add(id);
    // Ранняя отметка уже ушла в хранилище одна, без сохранённых: save пишет
    // набор целиком. Возвращаем туда объединённый набор, иначе старые отметки
    // пропадут из хранилища, даже оставшись на экране.
    if (marks.size > saved.size) queueSave();
    paint();
  });
  paint();

  // Отметка — чекбокс, поэтому слушаем change: это событие смены состояния, оно
  // приходит при любом способе переключения и уже с новым checked. Клик по самому
  // квадратику браузер, конечно, тоже показал бы, но click — событие про нажатие,
  // а не про состояние, и на нём обработчик зависел бы от способа ввода.
  host.addEventListener('change', event => {
    // Цель change от чекбокса — сам чекбокс, вложенности тут не бывает.
    const box = event.target;
    if (!box.matches('input[data-mark]')) return;
    const id = box.dataset.mark;
    if (box.checked) marks.add(id); else marks.delete(id);
    paint();
    queueSave();

    const section = box.closest('section.workout-block');
    const all = [...section.querySelectorAll('input[data-mark]')];
    tg.haptic(all.every(b => marks.has(b.dataset.mark)) ? 'done' : 'mark');
  });

  function resetMarks() {
    resetBeforeLoad = true;
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
  const panel = document.querySelector('.timer');
  const value = document.getElementById('timer-value');
  const status = document.getElementById('timer-status');
  const toggle = document.getElementById('timer-toggle');

  const timer = createTimer({
    onTick: remaining => {
      value.textContent = formatTime(remaining);
      toggle.textContent = timer.running ? 'Пауза' : 'Старт';
      status.textContent = timer.running ? 'Идёт отдых' : 'Выбери время';
      panel.classList.toggle('done', remaining === 0);
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

  function stopTicking() {
    if (ticker === null) return;
    win.clearInterval(ticker);
    ticker = null;
  }

  function catchUp() {
    const shouldRemain = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    // Догоняем часы ровно на столько секунд, сколько они ушли вперёд: после сна
    // вкладки это может быть сразу вся оставшаяся минута. Цикл ограничен самим
    // остатком — в ноль таймер останавливается и tick() перестаёт что-то менять.
    while (timer.running && timer.remaining > shouldRemain) timer.tick();
    if (!timer.running) stopTicking();
  }

  function startTicking() {
    endAt = Date.now() + timer.remaining * 1000;
    ticker = win.setInterval(catchUp, TIMER_PERIOD_MS);
  }

  toggle.addEventListener('click', () => {
    timer.toggle();
    // Пауза и конец отдыха гасят интервал: незачем будить процессор телефона,
    // пока человек делает подход.
    if (timer.running) startTicking(); else stopTicking();
  });

  document.getElementById('timer-reset').addEventListener('click', () => {
    timer.reset();
    stopTicking();
  });

  const presets = [...document.querySelectorAll('.presets button')];
  for (const preset of presets) {
    preset.addEventListener('click', () => {
      for (const other of presets) other.setAttribute('aria-pressed', 'false');
      preset.setAttribute('aria-pressed', 'true');
      timer.setDuration(Number(preset.dataset.time));
      stopTicking();
    });
  }

  // Начальная длительность — из разметки, из пресета с aria-pressed. Другого
  // источника нет: ни в index.html текстом, ни в timer.js по умолчанию. Что
  // отмеченный пресет на странице есть, сторожит тест стартового экрана, а не
  // ветка в коде: без него приложению всё равно нечего показать на табло.
  const chosen = presets.find(preset => preset.getAttribute('aria-pressed') === 'true');
  timer.setDuration(Number(chosen.dataset.time));

  // Возвращение к приложению — второй источник правды о времени, кроме интервала:
  // пока вкладка была скрыта, он мог не сработать ни разу. Уход, наоборот, —
  // последний момент, когда можно дописать отметки.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSave(); else catchUp();
  });

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
  for (const section of host.querySelectorAll('.workout-block')) observer.observe(section);

  return { workout, marks, timer, total, ready };
}
