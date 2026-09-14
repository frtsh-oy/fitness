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

  // Разметка уже на экране, отметки приезжают следом: load асинхронный, потому
  // что за CloudStorage стоит запрос к клиенту Telegram. Пустого экрана при этом
  // не бывает — рисуем сразу, проставляем по готовности.
  let touched = false;
  const ready = storage.load(workout.id).then(saved => {
    // Пользователь успел нажать раньше, чем ответило хранилище — его действие
    // главнее. Иначе сохранённые отметки отменили бы только что сделанный сброс.
    if (touched) return;
    for (const id of saved) marks.add(id);
    paint();
  });
  paint();

  // Отметка — чекбокс, поэтому слушаем change: это событие смены состояния, оно
  // приходит при любом способе переключения и уже с новым checked. Клик по самому
  // квадратику браузер, конечно, тоже показал бы, но click — событие про нажатие,
  // а не про состояние, и на нём обработчик зависел бы от способа ввода.
  host.addEventListener('change', event => {
    const box = event.target.closest('input[data-mark]');
    if (!box) return;
    touched = true;
    const id = box.dataset.mark;
    if (box.checked) marks.add(id); else marks.delete(id);
    paint();
    // save принимает весь набор целиком, а не разницу, поэтому актуальный Set
    // держим здесь и отдаём его снимок на каждое изменение.
    storage.save(workout.id, marks);

    const section = box.closest('section.workout-block');
    const all = [...section.querySelectorAll('input[data-mark]')];
    tg.haptic(all.every(b => marks.has(b.dataset.mark)) ? 'done' : 'mark');
  });

  document.getElementById('reset').addEventListener('click', () => {
    touched = true;
    marks.clear();
    paint();
    storage.clear(workout.id);
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
      tg.haptic('done');
    },
  });

  win.setInterval(() => timer.tick(), 1000);
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
  // Вешаем обработчик ровно один раз: у настоящего BackButton.onClick
  // обработчики накапливаются, а не заменяют друг друга.
  tg.onBack(() => win.scrollTo({ top: 0, behavior: 'smooth' }));

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
  // В jsdom наблюдателя нет, поэтому проверка не декоративная.
  if ('IntersectionObserver' in win) {
    const observer = new win.IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const link of document.querySelectorAll('.block-nav a')) {
          link.classList.toggle('active', link.hash === `#${entry.target.id}`);
        }
      }
    }, { rootMargin: '-70px 0px -65% 0px', threshold: 0 });
    for (const section of host.querySelectorAll('.workout-block')) observer.observe(section);
  }

  return { workout, marks, timer, total, ready };
}
