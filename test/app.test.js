// Связывание проверяем на настоящем index.html: так тест заодно сторожит, что
// страница не потеряла ни одного узла, за который цепляется app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { startApp, PHONE_MAX_WIDTH } from '../app.js';
import { storageKey, currentDay } from '../storage.js';
import { markId, scheduleShort, scheduleLong } from '../render.js';
import { getWorkout } from '../workouts/index.js';
import { countMarks } from '../workouts/schema.js';

const PAGE = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const WORKOUT = getWorkout(null);
const TOTAL = countMarks(WORKOUT);

// Тот же ключ, что построит storage.js по умолчанию: день берётся у него же,
// а не пересчитывается здесь заново — иначе тест разошёлся бы с приложением
// молча, ключами, которые просто не совпали.
const todayKey = () => storageKey(WORKOUT.id, currentDay());

// Идентификатор отметки строится из id блока и key упражнения (render.js).
// Берём его из данных, а не набираем руками: набранный руками разошёлся бы с
// приложением молча — такие отметки теперь просто не попадают на экран.
const markOf = (blockIndex, itemIndex, round = 1) => {
  const block = WORKOUT.blocks[blockIndex];
  return markId(block.id, block.items[itemIndex].key, round);
};

// Запись отметок отложена на SAVE_DELAY_MS, а отсчёт таймера идёт по настоящим
// часам — эти тесты ждут реального времени, а не фальшивого.
const settle = ms => new Promise(resolve => setTimeout(resolve, ms));

// Клиент Telegram ровно в том объёме, в каком его трогает telegram.js.
function fakeWebApp({ version = '6.9', cloud = null } = {}) {
  const calls = [];
  const backHandlers = [];
  // Заданные клиентом вопросы: ответ отдаётся тестом, когда тесту нужно, —
  // именно этим окном и проверяется совпадение сброса с ответом хранилища.
  const confirms = [];
  return {
    calls,
    backHandlers,
    confirms,
    showConfirm(message, callback) { confirms.push({ message, answer: callback }); },
    initDataUnsafe: {},
    CloudStorage: cloud,
    isVersionAtLeast: asked => Number.parseFloat(version) >= Number.parseFloat(asked),
    ready() {},
    expand() {},
    disableVerticalSwipes() {},
    setHeaderColor() {},
    setBackgroundColor() {},
    openLink(url) { calls.push(`open:${url}`); },
    HapticFeedback: {
      impactOccurred: style => calls.push(`impact:${style}`),
      notificationOccurred: type => calls.push(`notify:${type}`),
    },
    BackButton: {
      onClick(handler) { backHandlers.push(handler); calls.push('back:onClick'); },
      show: () => calls.push('back:show'),
      hide: () => calls.push('back:hide'),
    },
  };
}

// CloudStorage отвечает не сразу — за ним запрос к клиенту Telegram.
// Задержка здесь и есть то окно, в которое человек успевает нажать чекбокс.
function fakeCloud({ data = {}, delay = 0 } = {}) {
  const calls = [];
  const answer = (callback, ...args) => setTimeout(() => callback(...args), delay);
  return {
    calls,
    data,
    getItem(key, callback) { calls.push(`get:${key}`); answer(callback, null, data[key] ?? ''); },
    setItem(key, value, callback) { calls.push(`set:${value}`); data[key] = value; answer(callback, null, true); },
    removeItem(key, callback) { calls.push(`remove:${key}`); delete data[key]; answer(callback, null, true); },
  };
}

// Подменённые часы и интервалы окна: отдых доходит до конца через настоящий
// ход времени и настоящий catchUp, но без ожидания двадцати секунд в тесте.
// Интервалы живут в этой карте, поэтому по ней же видно, погашен ли интервал.
function installFakeClock(t, window) {
  const realNow = Date.now;
  let now = realNow();
  Date.now = () => now;
  t.after(() => { Date.now = realNow; });

  const live = new Map();
  let nextId = 1;
  window.setInterval = (fn, period) => {
    const id = nextId;
    nextId += 1;
    live.set(id, { fn, period, due: now + period });
    return id;
  };
  window.clearInterval = id => { live.delete(id); };

  return {
    get liveIntervals() { return live.size; },
    // Двигаем часы до цели, по дороге давая сработать каждому интервалу,
    // чьё время пришло, — как это делает браузер.
    advance(ms) {
      const target = now + ms;
      while (now < target) {
        const pending = [...live.entries()];
        const nextDue = pending.length ? Math.min(...pending.map(([, entry]) => entry.due)) : target;
        now = Math.min(nextDue, target);
        for (const [id, entry] of pending) {
          if (entry.due > now || !live.has(id)) continue;
          entry.due = now + entry.period;
          entry.fn();
        }
      }
    },
  };
}

// Окно заданной ширины: matchMedia отвечает на запросы о ширине так, как
// ответил бы экран в screenWidth пикселей, а на остальные — как обычный стаб
// окружения, то есть «нет». Разбор запроса, а не «всегда да»: приложение тем
// же matchMedia спрашивает и про prefers-reduced-motion, и стаб-«да» отвечал бы
// заодно и на него.
function widthMatchMedia(screenWidth) {
  return query => {
    const max = query.match(/max-width:\s*(\d+)px/);
    return {
      media: query,
      matches: max ? screenWidth <= Number(max[1]) : false,
      addEventListener() {},
      removeEventListener() {},
    };
  };
}

function mount(t, { marks = null, webApp = null, freezeTimers = false, fakeClock = false, denyStorage = false, screenWidth = null } = {}) {
  const { window, document } = makeDom(PAGE);
  t.after(() => window.close());
  // Ширину окна подменяем до startApp: по ней приложение решает при отрисовке,
  // раскрывать ли описания упражнений.
  if (screenWidth !== null) window.matchMedia = widthMatchMedia(screenWidth);
  if (marks) window.localStorage.setItem(todayKey(), JSON.stringify(marks));
  // Приватный режим Safari и урезанный WebView: обращение к localStorage
  // бросает ещё до первого getItem.
  if (denyStorage) {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('данные сайтов запрещены'); },
      configurable: true,
    });
  }
  if (webApp) window.Telegram = { WebApp: webApp };
  // Обезвреженный setInterval — это свёрнутый мини-апп: клиент Telegram
  // морозит таймеры целиком, а фоновая вкладка браузера их прореживает.
  if (freezeTimers) window.setInterval = () => 0;
  const clock = fakeClock ? installFakeClock(t, window) : null;
  return { window, document, clock, app: startApp(window) };
}

const boxes = document => [...document.querySelectorAll('#workout input[data-mark]')];

test('страница собирается: блоки, упражнения, вставка про пары и счётчик', t => {
  const { document, app } = mount(t);

  assert.equal(document.querySelectorAll('#workout section.workout-block').length, WORKOUT.blocks.length);
  assert.equal(document.querySelectorAll('#workout .exercise').length,
    WORKOUT.blocks.reduce((sum, block) => sum + block.items.length, 0));
  assert.equal(boxes(document).length, TOTAL);
  assert.equal(app.total, TOTAL);

  const rules = document.querySelector('#workout .pair-rules');
  assert.ok(rules, 'вставка «Как выполнять силовые пары» отрисована');
  assert.equal(rules.nextElementSibling.id, 'legs1');

  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 0 из ${TOTAL} отметок`);
  assert.equal(document.getElementById('progress').max, TOTAL);
  assert.equal(document.getElementById('progress').value, 0);
  assert.equal(document.getElementById('kicker').textContent, WORKOUT.kicker);
  assert.equal(document.querySelectorAll('#progression-list li').length, WORKOUT.progression.length);
});

// Расписание на настоящей странице: оба места заполняются из данных. Заодно
// сторожит структуру подвала — расписание там ведущий текстовый узел, и если
// его переставить местами с примечанием, renderIntro затрёт примечание.
test('расписание в шапке и в подвале совпадает с днями тренировки', t => {
  const { document } = mount(t);
  assert.equal(document.querySelector('.masthead .schedule').textContent, scheduleShort(WORKOUT.days));
  assert.equal(document.querySelector('footer').textContent,
    `${scheduleLong(WORKOUT.days)}Между тренировками — день восстановления.`);
});

// Начальная длительность живёт в одном месте — в разметке, на пресете
// с aria-pressed. Если её оттуда уберут, приложению нечего показать на табло,
// и узнать об этом надо здесь, а не на телефоне.
test('таймер стартует с длительности, отмеченной в разметке', t => {
  const { document, app } = mount(t);

  assert.equal(document.getElementById('timer-value').textContent, '01:00');
  assert.equal(app.timer.remaining, 60);
  assert.equal(document.querySelector('.presets button[aria-pressed="true"]').dataset.time, '60');
  assert.equal(document.getElementById('timer-toggle').textContent, 'Старт');
});

test('отметка добавляется в набор, красит упражнение и двигает счётчик', t => {
  const { document, app } = mount(t);
  // Блок legs1: два круга у каждого упражнения — видно и промежуточное состояние.
  const exercise = document.querySelector('#legs1 .exercise');
  const [first, second] = [...exercise.querySelectorAll('input[data-mark]')];

  first.click();
  assert.deepEqual([...app.marks], [first.dataset.mark]);
  assert.equal(exercise.classList.contains('completed'), false, 'закрыт один круг из двух');
  assert.equal(document.getElementById('progress').value, 1);
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 1 из ${TOTAL} отметок`);

  second.click();
  assert.equal(app.marks.size, 2);
  assert.equal(exercise.classList.contains('completed'), true, 'закрыты оба круга');
  assert.equal(document.getElementById('progress').value, 2);
});

// Отметка — чекбокс внутри label, и нажимают чаще по подписи, чем по квадратику.
// Проверка сквозная: подпись переключает чекбокс, а приложение это видит.
test('клик по подписи отметки тоже считается', t => {
  const { document, app } = mount(t);
  const label = document.querySelector('#legs1 .exercise label.check');
  const box = label.querySelector('input[data-mark]');

  label.querySelector('span').click();
  assert.equal(box.checked, true);
  assert.deepEqual([...app.marks], [box.dataset.mark]);
  assert.equal(document.getElementById('progress').value, 1);
});

// Слушаем именно change — событие смены состояния чекбокса, а не клик по нему.
// Тест берёт единственный путь, который эти два события различает: состояние
// меняется без клика. Обработчик на click такой смены не заметил бы.
test('приложение реагирует на change, а не только на клик', t => {
  const { window, document, app } = mount(t);
  const box = boxes(document)[0];

  box.checked = true;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.deepEqual([...app.marks], [box.dataset.mark]);
  assert.equal(document.getElementById('progress').value, 1);
});

// Обработчик один на весь контейнер, а содержимое контейнера рисуется из данных:
// фильтр цели — часть делегирования, а не догадка о будущем. Без него любое
// чужое change добавило бы в набор отметку-призрак.
test('делегированный обработчик реагирует только на отметки', t => {
  const { window, document, app } = mount(t);
  const foreign = document.createElement('input');
  foreign.type = 'checkbox';
  document.querySelector('#legs1 .exercise').append(foreign);

  foreign.checked = true;
  foreign.dispatchEvent(new window.Event('change', { bubbles: true }));

  assert.equal(app.marks.size, 0);
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 0 из ${TOTAL} отметок`);
});

// Отметки — не единственное, что может отказать: приватный режим Safari
// бросает на самом обращении к localStorage. Тренировка обязана открыться.
test('запрет на данные сайтов не роняет приложение', async t => {
  const { document, app } = mount(t, { denyStorage: true });
  await app.ready;

  assert.equal(boxes(document).length, TOTAL, 'страница собралась');
  const box = boxes(document)[0];
  box.click();
  await settle(700);

  assert.deepEqual([...app.marks], [box.dataset.mark], 'отметки живут хотя бы до перезагрузки');
  assert.equal(document.getElementById('progress').value, 1);
});

test('снятие отметки убирает её из набора и гасит класс completed', t => {
  const { document, app } = mount(t);
  const exercise = document.querySelector('#legs1 .exercise');
  const [first, second] = [...exercise.querySelectorAll('input[data-mark]')];

  first.click();
  second.click();
  assert.equal(exercise.classList.contains('completed'), true);

  second.click();
  assert.deepEqual([...app.marks], [first.dataset.mark]);
  assert.equal(exercise.classList.contains('completed'), false);
  assert.equal(document.getElementById('progress').value, 1);
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 1 из ${TOTAL} отметок`);
});

test('отметка доезжает до хранилища', async t => {
  const { window, document, app } = mount(t);
  await app.ready;

  const box = boxes(document)[0];
  box.click();
  await settle(700);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(todayKey())), [box.dataset.mark]);
});

test('сохранённые отметки проставляются, когда хранилище ответило', async t => {
  const saved = [markOf(0, 0), markOf(0, 1)];
  const { document, app } = mount(t, { marks: saved });

  assert.equal(app.marks.size, 0, 'до ответа хранилища разметка уже на экране, но пустая');
  assert.equal(boxes(document).length, TOTAL, 'экран не пустой ещё до загрузки отметок');

  await app.ready;
  assert.deepEqual([...app.marks].sort(), [...saved].sort());
  assert.equal(document.getElementById('progress').value, 2);
  assert.equal(document.querySelector('#start .exercise').classList.contains('completed'), true);
});

// ФИНАЛЬНОЕ РЕВЬЮ, пункт 3: в хранилище за сегодня могут лежать отметки, для
// которых на экране нет чекбокса — упражнению сменили key, упражнение убрали.
// Счётчик и полоса прогресса считаются по размеру набора, поэтому такой мусор
// показывал «Сегодня: 4 из 37» при одном отмеченном чекбоксе, а при достатке
// мусора перевалил бы и за 37.
test('устаревшие отметки из хранилища не попадают ни в набор, ни в счётчик', async t => {
  const alive = markOf(0, 0);
  const stale = ['start-0-1', 'legs1-старый-ключ-2', 'нет-такого-блока-x-1'];
  const { window, document, app } = mount(t, { marks: [alive, ...stale] });
  await app.ready;

  assert.deepEqual([...app.marks], [alive], 'в наборе оказалось лишнее');
  assert.equal(document.getElementById('progress').value, 1);
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 1 из ${TOTAL} отметок`);
  assert.equal(boxes(document).filter(box => box.checked).length, 1);

  // И из хранилища они уходят при первой же записи: сохраняется весь набор.
  boxes(document)[1].click();
  await settle(700);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(todayKey())).sort(),
    [alive, boxes(document)[1].dataset.mark].sort());
});

// Гонка, из-за которой отметки исчезали: человек открывает мини-апп посреди
// тренировки и отмечает только что закрытый круг, пока CloudStorage ещё думает.
// Приехавшее обязано объединиться с нажатым — и в наборе, и в хранилище,
// потому что ранняя запись успела сохранить набор без старых отметок.
test('ранняя отметка не стирает приехавшие из хранилища', async t => {
  const saved = [markOf(0, 0), markOf(0, 1), markOf(1, 0), markOf(1, 1), markOf(1, 2)];
  // Ответ облака отстаёт от склейки записей: к моменту, когда старые отметки
  // приедут, ранняя уже успеет сохраниться — одна, без них. Настоящий
  // CloudStorage отвечает и дольше: его таймаут — пять секунд.
  const cloud = fakeCloud({ data: { [todayKey()]: JSON.stringify(saved) }, delay: 700 });
  const { document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });

  const box = document.querySelector('#legs1 input[data-mark]');
  box.click();
  assert.equal(app.marks.size, 1, 'пока хранилище молчит, на экране только своя отметка');

  await app.ready;
  const expected = [...saved, box.dataset.mark].sort();
  assert.deepEqual([...app.marks].sort(), expected);
  assert.equal(document.getElementById('progress').value, 6);
  assert.equal(box.checked, true);
  assert.ok(cloud.calls.includes(`get:${todayKey()}`), 'облако у клиента 6.9 действительно спрашивают');
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]), [box.dataset.mark],
    'ранняя запись и правда затёрла в хранилище всё остальное');

  // Значит, объединённый набор обязан уехать туда следом — иначе пять отметок
  // останутся на экране, но пропадут из хранилища.
  await settle(700);
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]).sort(), expected);
});

// Тот же дефект, но ранний набор — ПОДМНОЖЕСТВО сохранённого, и по размеру
// набора его не видно. Человек открыл мини-апп и отметил круг, который уже
// отмечен: на экране всё честно, а в хранилище остался бы один круг из пяти.
test('ранний тап по уже сохранённой отметке не обрезает хранилище', async t => {
  const saved = [markOf(0, 0), markOf(0, 1), markOf(1, 0), markOf(1, 1), markOf(1, 2)];
  const cloud = fakeCloud({ data: { [todayKey()]: JSON.stringify(saved) }, delay: 700 });
  const { document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });

  const box = document.querySelector(`input[data-mark="${markOf(0, 0)}"]`);
  box.click();

  await app.ready;
  assert.deepEqual([...app.marks].sort(), [...saved].sort(), 'на экране все пять');
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]), [markOf(0, 0)],
    'ранняя запись оставила в хранилище одну отметку');

  await settle(700);
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]).sort(), [...saved].sort());
});

// Самый тихий вариант: тап и сразу снятие — ранний набор пуст, размеров не
// различить вовсе, а в хранилище уезжает пустота. День стирается целиком от
// одного исправленного промаха, и на экране это никак не видно.
test('ранний тап со снятием не стирает день из хранилища', async t => {
  const saved = [markOf(0, 0), markOf(0, 1), markOf(1, 0), markOf(1, 1), markOf(1, 2)];
  const cloud = fakeCloud({ data: { [todayKey()]: JSON.stringify(saved) }, delay: 700 });
  const { document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });

  const box = document.querySelector('#legs1 input[data-mark]');
  box.click();
  box.click();
  assert.equal(app.marks.size, 0);

  await app.ready;
  assert.deepEqual([...app.marks].sort(), [...saved].sort(), 'на экране все пять');
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]), [], 'в хранилище к этому моменту пусто');

  await settle(700);
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]).sort(), [...saved].sort());
});

// Обратная сторона той же дописки: открыть тренировку и ничего не трогать —
// не повод лезть в CloudStorage с записью.
test('открытие без единого касания ничего не пишет в хранилище', async t => {
  const cloud = fakeCloud({ data: { [todayKey()]: JSON.stringify([markOf(0, 0), markOf(0, 1)]) } });
  const { app } = mount(t, { webApp: fakeWebApp({ cloud }) });

  await app.ready;
  await settle(700);
  assert.equal(app.marks.size, 2);
  assert.deepEqual(cloud.calls.filter(call => !call.startsWith('get:')), []);
});

test('сброс очищает набор, экран и хранилище', async t => {
  const { window, document, app } = mount(t, { marks: [markOf(0, 0)] });
  await app.ready;
  assert.equal(app.marks.size, 1);
  window.confirm = () => true;

  document.getElementById('reset').click();
  await settle(0);

  assert.equal(app.marks.size, 0);
  assert.equal(boxes(document).some(box => box.checked), false);
  assert.equal(document.querySelectorAll('#workout .exercise.completed').length, 0);
  assert.equal(document.getElementById('progress').value, 0);
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 0 из ${TOTAL} отметок`);
  assert.equal(window.localStorage.getItem(todayKey()), null);
});

// Сброс стирает работу целиком, поэтому его переспрашивают — как в оригинале.
test('сброс спрашивает подтверждение, и отказ оставляет отметки на месте', async t => {
  const { window, document, app } = mount(t, { marks: [markOf(0, 0)] });
  await app.ready;
  const asked = [];
  window.confirm = message => { asked.push(message); return false; };

  document.getElementById('reset').click();
  await settle(0);

  assert.deepEqual(asked, ['Сбросить все отметки за сегодня?']);
  assert.equal(app.marks.size, 1);
  assert.equal(boxes(document).filter(box => box.checked).length, 1);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(todayKey())), [markOf(0, 0)]);
});

test('пустой список сбрасывается без вопроса', async t => {
  const { window, document, app } = mount(t);
  await app.ready;
  let asked = 0;
  window.confirm = () => { asked += 1; return true; };

  document.getElementById('reset').click();
  await settle(0);

  assert.equal(asked, 0);
  assert.equal(app.marks.size, 0);
});

// load асинхронный, и пользователь успевает нажать раньше ответа хранилища.
// Сброс — единственное действие, которое приехавшее отменяет: он ровно про
// то, чтобы забыть сохранённое.
test('сброс, сделанный до ответа хранилища, не отменяется приехавшими отметками', async t => {
  const { document, app } = mount(t, { marks: [markOf(0, 0), markOf(0, 1)] });

  document.getElementById('reset').click();
  await app.ready;

  assert.equal(app.marks.size, 0);
  assert.equal(boxes(document).some(box => box.checked), false);
  assert.equal(document.getElementById('progress').value, 0);
});

// Пятнадцать тапов подряд — это не пятнадцать записей: при мёртвой сети каждая
// ждала бы свой таймаут в очереди. Склейка безопасна, потому что сохраняется
// набор целиком, и последнее изменение в неё обязано попасть.
test('частые отметки склеиваются в одну запись с актуальным набором', async t => {
  const cloud = fakeCloud();
  const { document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });
  await app.ready;

  const marked = boxes(document).slice(0, 3);
  for (const box of marked) box.click();
  assert.deepEqual(cloud.calls.filter(call => call.startsWith('set:')), [], 'сразу не пишем');

  await settle(700);
  const writes = cloud.calls.filter(call => call.startsWith('set:'));
  assert.equal(writes.length, 1, 'три тапа — одна запись');
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]).sort(), marked.map(box => box.dataset.mark).sort());
});

test('уход в фон дописывает отметку, не дожидаясь склейки', async t => {
  const cloud = fakeCloud();
  const { window, document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });
  await app.ready;

  const box = boxes(document)[0];
  box.click();
  Object.defineProperty(window.document, 'hidden', { value: true, configurable: true });
  window.document.dispatchEvent(new window.Event('visibilitychange'));

  // Ждём микрозадачу очереди записей в storage.js, а не задержку склейки:
  // она втрое длиннее и к этому моменту ещё не истекла.
  await settle(0);
  assert.deepEqual(cloud.calls.filter(call => call.startsWith('set:')),
    [`set:${JSON.stringify([box.dataset.mark])}`]);
});

// В Safari и на iOS visibilitychange при уходе со страницы приходит не всегда.
test('pagehide дописывает отложенную отметку так же, как уход в фон', async t => {
  const cloud = fakeCloud();
  const { window, document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });
  await app.ready;

  const box = boxes(document)[0];
  box.click();
  window.dispatchEvent(new window.Event('pagehide'));

  await settle(0);
  assert.deepEqual(cloud.calls.filter(call => call.startsWith('set:')),
    [`set:${JSON.stringify([box.dataset.mark])}`]);
});

// ФИНАЛЬНОЕ РЕВЬЮ, пункт 1: дописка на выгрузке — это обращение к облаку,
// ответа которого страница уже не дождётся. Пока localStorage писался только в
// ветке отказа облака, отметка не доживала до следующего открытия: приложение
// убивали раньше, чем облако успевало отказать. Проверка нарочно синхронная,
// без единого await после pagehide: это и есть «страницы больше нет».
test('выгрузка страницы сразу после отметки оставляет её в localStorage', async t => {
  const cloud = fakeCloud({ delay: 30 });   // облако исправно, но ответит уже некому
  const { window, document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });
  await app.ready;

  const box = boxes(document)[0];
  box.click();
  window.dispatchEvent(new window.Event('pagehide'));

  assert.deepEqual(JSON.parse(window.localStorage.getItem(todayKey())), [box.dataset.mark]);
});

// Уход с глаз — это не повод писать: каждое сворачивание мини-аппа без единого
// изменения тратило бы обращение к облаку впустую.
test('уход со страницы без несохранённых изменений ничего не пишет', async t => {
  const cloud = fakeCloud({ data: { [todayKey()]: JSON.stringify([markOf(0, 0)]) } });
  const { window, document, app } = mount(t, { webApp: fakeWebApp({ cloud }) });
  await app.ready;

  // Отметка есть, но она уже сохранена: ждём, пока склейка отработает сама.
  boxes(document)[1].click();
  await settle(700);
  const written = cloud.calls.filter(call => call.startsWith('set:')).length;

  Object.defineProperty(window.document, 'hidden', { value: true, configurable: true });
  window.document.dispatchEvent(new window.Event('visibilitychange'));
  window.dispatchEvent(new window.Event('pagehide'));
  await settle(0);

  assert.equal(cloud.calls.filter(call => call.startsWith('set:')).length, written,
    'ни visibilitychange, ни pagehide не добавили записи');
});

// CloudStorage появился в Bot API 6.9. В клиенте постарше (и в обычном браузере,
// где SDK представляется версией 6.0) каждый его вызов пишет ошибку в консоль
// и бросает — поэтому облако там не берут вовсе.
test('клиент старше 6.9 не получает ни одного обращения в CloudStorage', async t => {
  const cloud = fakeCloud({ data: { [todayKey()]: JSON.stringify([markOf(0, 0)]) } });
  const { window, document, app } = mount(t, { webApp: fakeWebApp({ version: '6.0', cloud }) });
  await app.ready;

  assert.deepEqual(cloud.calls, [], 'даже читать не пробуем');
  assert.equal(app.marks.size, 0, 'отметки взяты из localStorage, а он пуст');

  const box = boxes(document)[0];
  box.click();
  await settle(700);
  assert.deepEqual(cloud.calls, []);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(todayKey())), [box.dataset.mark]);
});

// Объект WebApp приходит от чужой программы: клиенты и сборки SDK разные, и
// приложение обязано пережить любой их состав. Пустой объект — крайний случай:
// ни версии, ни методов, и облака у такого клиента нет.
test('пустой объект WebApp не роняет приложение и не мешает отметкам', async t => {
  const { window, document, app } = mount(t, { webApp: {} });
  await app.ready;

  assert.equal(boxes(document).length, TOTAL, 'страница собралась');
  const box = boxes(document)[0];
  box.click();
  await settle(700);

  assert.deepEqual([...app.marks], [box.dataset.mark]);
  assert.deepEqual(JSON.parse(window.localStorage.getItem(todayKey())), [box.dataset.mark]);
});

test('таймер на странице: пресет, старт, шаг, сброс', t => {
  const { document, app } = mount(t);
  const value = document.getElementById('timer-value');
  const toggle = document.getElementById('timer-toggle');
  const status = document.getElementById('timer-status');

  document.querySelector('.presets button[data-time="20"]').click();
  assert.equal(value.textContent, '00:20');
  assert.equal(document.querySelector('.presets button[data-time="20"]').getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('.presets button[data-time="60"]').getAttribute('aria-pressed'), 'false');

  assert.equal(status.textContent, 'Готов к старту');

  toggle.click();
  assert.equal(toggle.textContent, 'Пауза');
  assert.equal(status.textContent, 'Восстанавливай дыхание');

  app.timer.tick();
  assert.equal(value.textContent, '00:19');

  document.getElementById('timer-reset').click();
  assert.equal(value.textContent, '00:20');
  assert.equal(toggle.textContent, 'Старт');
  assert.equal(status.textContent, 'Готов к старту');
  assert.equal(app.timer.running, false);
});

// Подписи — дословно из src-original/app.js. «Выбери время» на паузе врало бы:
// время уже выбрано, а отдых поставлен на паузу.
test('подписи таймера: свежая страница, пауза, возобновление, сброс', t => {
  const { document } = mount(t);
  const status = document.getElementById('timer-status');
  const toggle = document.getElementById('timer-toggle');

  assert.equal(status.textContent, 'Выбери время', 'на свежей странице человек ещё ничего не выбирал');

  document.querySelector('.presets button[data-time="45"]').click();
  assert.equal(status.textContent, 'Готов к старту');

  toggle.click();
  assert.equal(status.textContent, 'Восстанавливай дыхание');

  toggle.click();
  assert.equal(status.textContent, 'На паузе');
  assert.equal(toggle.textContent, 'Старт');

  toggle.click();
  assert.equal(status.textContent, 'Восстанавливай дыхание');

  document.getElementById('timer-reset').click();
  assert.equal(status.textContent, 'Готов к старту');
});

test('конец отдыха: панель гаснет в ноль и кнопка снова зовёт стартовать', t => {
  const { document, app } = mount(t);
  const status = document.getElementById('timer-status');
  const toggle = document.getElementById('timer-toggle');

  document.querySelector('.presets button[data-time="20"]').click();
  toggle.click();
  for (let i = 0; i < 20; i += 1) app.timer.tick();

  assert.equal(document.getElementById('timer-value').textContent, '00:00');
  assert.equal(status.textContent, 'Отдых закончен');
  assert.equal(toggle.textContent, 'Ещё раз', 'старт на отработавшем таймере начинает заново');
  assert.equal(document.querySelector('.timer').classList.contains('done'), true);

  toggle.click();
  assert.equal(document.getElementById('timer-value').textContent, '00:20');
  assert.equal(toggle.textContent, 'Пауза');
  assert.equal(document.querySelector('.timer').classList.contains('done'), false);
});

// #timer-status — область aria-live: каждое значение в ней диктор произносит.
// Значение, которое тут же перетирается, он всё равно проговорит, поэтому за
// весь отдых их должно быть ровно столько, сколько событий.
test('в области aria-live не появляется значений, которых никто не видел', async t => {
  const { window, document, app } = mount(t);
  const status = document.getElementById('timer-status');
  const said = [];
  const observer = new window.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) said.push(node.textContent);
  });
  observer.observe(status, { childList: true });

  document.querySelector('.presets button[data-time="20"]').click();
  document.getElementById('timer-toggle').click();
  for (let i = 0; i < 20; i += 1) app.timer.tick();
  await settle(0);

  assert.deepEqual(said, ['Готов к старту', 'Восстанавливай дыхание', 'Отдых закончен']);
});

// Отсчёт идёт по настоящим часам, а не по числу срабатываний интервала:
// первая секунда отдыха обязана быть секундой, а не остатком чужого периода.
test('таймер отсчитывает настоящее время', async t => {
  const { document, app } = mount(t);
  const value = document.getElementById('timer-value');

  document.querySelector('.presets button[data-time="20"]').click();
  document.getElementById('timer-toggle').click();
  assert.equal(value.textContent, '00:20');

  await settle(300);
  assert.equal(value.textContent, '00:20', 'за треть секунды не уходит целая');
  await settle(900);
  assert.equal(value.textContent, '00:19', 'через 1,2 с прошла ровно одна секунда');
  await settle(1000);
  assert.equal(value.textContent, '00:18', 'через 2,2 с — ровно две');
  assert.equal(app.timer.running, true);
});

// Телефон в кармане: клиент Telegram останавливает таймеры свёрнутого мини-аппа,
// браузер прореживает их в фоновой вкладке. Вернувшись, человек обязан увидеть
// настоящее оставшееся время, а не то, на котором экран заснул.
test('время, пока приложение было свёрнуто, досчитывается при возвращении', async t => {
  const { window, document, app } = mount(t, { freezeTimers: true });
  const value = document.getElementById('timer-value');

  document.querySelector('.presets button[data-time="20"]').click();
  document.getElementById('timer-toggle').click();

  await settle(2200);
  assert.equal(value.textContent, '00:20', 'пока интервал мёртв, экран стоит');

  window.document.dispatchEvent(new window.Event('visibilitychange'));
  assert.equal(value.textContent, '00:18', 'вернулись — и остаток пересчитан по часам');
  assert.equal(app.timer.running, true);
});

// Отдых, который кончился сам, а не по кнопке: интервал обязан погаснуть.
// Иначе он до конца сеанса дёргает catchUp каждые 200 мс и сажает батарею —
// и именно этот путь не проверяли тесты конца отдыха, доводившие таймер до
// нуля прямыми вызовами tick(), минуя интервал.
test('отдых, доигравший до конца сам, гасит интервал', t => {
  const { document, app, clock } = mount(t, { fakeClock: true });
  const value = document.getElementById('timer-value');

  document.querySelector('.presets button[data-time="20"]').click();
  document.getElementById('timer-toggle').click();
  assert.equal(clock.liveIntervals, 1, 'отсчёт идёт по интервалу');

  clock.advance(1000);
  assert.equal(value.textContent, '00:19', 'секунды снимает именно интервал, а не тест');

  clock.advance(19000);
  assert.equal(value.textContent, '00:00');
  assert.equal(document.getElementById('timer-status').textContent, 'Отдых закончен');
  assert.equal(app.timer.running, false);
  assert.equal(clock.liveIntervals, 0, 'живых интервалов после конца отдыха не осталось');

  // И дальше часы идут, а таймер стоит: погашенный интервал ничего не считает.
  clock.advance(5000);
  assert.equal(value.textContent, '00:00');
});

// Сброс и загрузка встречаются в одном окне времени: подтверждение
// асинхронное, а хранилище ещё не ответило. Ниже — все четыре порядка.
const RACE_SAVED = [markOf(0, 0), markOf(0, 1), markOf(1, 0), markOf(1, 1), markOf(1, 2)];

function mountRace(t) {
  const cloud = fakeCloud({ data: { [todayKey()]: JSON.stringify(RACE_SAVED) }, delay: 700 });
  const webApp = fakeWebApp({ cloud });
  return { ...mount(t, { webApp }), cloud, webApp };
}

test('сброс до ответа хранилища, потом отметка: приехавшее не возвращается', async t => {
  const { document, app, cloud } = mountRace(t);

  document.getElementById('reset').click();      // набор пуст — спрашивать не о чем
  const box = document.querySelector('#legs1 input[data-mark]');
  box.click();

  await app.ready;
  assert.deepEqual([...app.marks], [box.dataset.mark], 'на экране только своя отметка');
  assert.equal(document.getElementById('progress').value, 1);

  await settle(700);
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]), [box.dataset.mark]);
});

test('отметка, затем подтверждённый сброс до ответа хранилища', async t => {
  const { document, app, cloud, webApp } = mountRace(t);
  document.querySelector('#legs1 input[data-mark]').click();

  document.getElementById('reset').click();
  assert.deepEqual(webApp.confirms.map(ask => ask.message), ['Сбросить все отметки за сегодня?']);
  webApp.confirms[0].answer(true);
  await settle(0);
  assert.equal(app.marks.size, 0);

  await app.ready;
  assert.equal(app.marks.size, 0, 'приехавшее не отменяет только что сделанный сброс');
  assert.equal(document.getElementById('progress').value, 0);

  await settle(700);
  assert.equal(todayKey() in cloud.data, false, 'поверх очистки ничего не дописано');
});

test('отметка, затем отклонённый сброс: приехавшее объединяется как обычно', async t => {
  const { document, app, cloud, webApp } = mountRace(t);
  const box = document.querySelector('#legs1 input[data-mark]');
  box.click();

  document.getElementById('reset').click();
  webApp.confirms[0].answer(false);
  await settle(0);
  assert.equal(app.marks.size, 1, 'отказ ничего не менял');

  await app.ready;
  const expected = [...RACE_SAVED, box.dataset.mark].sort();
  assert.deepEqual([...app.marks].sort(), expected, 'отказ от сброса не отменяет слияние');

  await settle(700);
  assert.deepEqual(JSON.parse(cloud.data[todayKey()]).sort(), expected);
});

test('два сброса подряд до ответа хранилища', async t => {
  const { document, app, cloud, webApp } = mountRace(t);
  document.querySelector('#legs1 input[data-mark]').click();

  document.getElementById('reset').click();
  document.getElementById('reset').click();
  assert.equal(webApp.confirms.length, 2, 'второй вопрос задан, пока отметка ещё на экране');

  webApp.confirms[0].answer(true);
  webApp.confirms[1].answer(true);
  await settle(0);
  await app.ready;

  assert.equal(app.marks.size, 0);
  assert.equal(boxes(document).some(box => box.checked), false);
  assert.equal(document.getElementById('progress').value, 0);

  await settle(700);
  assert.equal(todayKey() in cloud.data, false);
});

// Пятый порядок, которого не было в списке: человек думал над вопросом дольше,
// чем отвечало хранилище. Сброс обязан распространиться на объединённый набор —
// он про «забыть сегодняшнее», а не про «забыть то, что было на экране».
test('подтверждение, пришедшее после ответа хранилища, чистит объединённый набор', async t => {
  const { document, app, cloud, webApp } = mountRace(t);
  document.querySelector('#legs1 input[data-mark]').click();
  document.getElementById('reset').click();

  await app.ready;
  assert.equal(app.marks.size, 6, 'пока человек думает, старые отметки приехали');

  webApp.confirms[0].answer(true);
  await settle(0);
  assert.equal(app.marks.size, 0);
  assert.equal(document.getElementById('progress').value, 0);

  document.getElementById('reset').click();
  assert.equal(webApp.confirms.length, 1, 'на пустом наборе больше не спрашиваем');

  await settle(700);
  assert.equal(todayKey() in cloud.data, false);
});

// Пауза обязана замирать на настоящем остатке, а не на округлённой секунде:
// иначе каждая пара «пауза — старт» дарит человеку почти секунду отдыха,
// и за подход из пяти пауз отдых растягивается на пять секунд.
test('пауза и возобновление не добавляют человеку отдыха', async t => {
  const { document } = mount(t);
  const toggle = document.getElementById('timer-toggle');

  document.querySelector('.presets button[data-time="20"]').click();
  for (let i = 0; i < 5; i += 1) {
    toggle.click();            // старт
    await settle(600);
    toggle.click();            // пауза
  }

  // Отдыхали ровно три секунды из двадцати, пять раз прервавшись.
  assert.equal(document.getElementById('timer-value').textContent, '00:17');
});

// На паузе экран показывает то, что показывают часы, а не то, что успел
// нарисовать интервал: между срабатываниями он отстаёт, а в свёрнутом
// приложении не срабатывает вовсе.
test('пауза замирает на том, что показывают часы', async t => {
  const { document, app } = mount(t, { freezeTimers: true });
  const toggle = document.getElementById('timer-toggle');

  document.querySelector('.presets button[data-time="20"]').click();
  toggle.click();
  await settle(2200);
  assert.equal(document.getElementById('timer-value').textContent, '00:20', 'интервал мёртв');

  toggle.click();
  assert.equal(document.getElementById('timer-value').textContent, '00:18');
  assert.equal(document.getElementById('timer-status').textContent, 'На паузе');
  assert.equal(app.timer.running, false);
});

// «Пауза», нажатая ровно тогда, когда отдых уже кончился по часам: конец
// обрабатывается, но отсчёт не начинается заново от кнопки паузы.
test('пауза, нажатая после конца отдыха, не запускает его снова', async t => {
  const { document, app } = mount(t, { freezeTimers: true });
  const toggle = document.getElementById('timer-toggle');
  const preset = document.querySelector('.presets button[data-time="20"]');

  preset.dataset.time = '2';
  preset.click();
  toggle.click();
  await settle(2200);

  toggle.click();
  assert.equal(document.getElementById('timer-value').textContent, '00:00');
  assert.equal(document.getElementById('timer-status').textContent, 'Отдых закончен');
  assert.equal(toggle.textContent, 'Ещё раз');
  assert.equal(app.timer.running, false);
});

// Человек на отдыхе смотрит не в экран, поэтому конец отдыха обязан быть
// слышен. Отдыхаем до конца через таймер напрямую: ждать двадцать секунд
// в тесте незачем, а путь onDone тот же самый.
function restToTheEnd({ window, document, app }) {
  const buzz = [];
  Object.defineProperty(window.navigator, 'vibrate', { value: pattern => buzz.push(pattern), configurable: true });
  document.querySelector('.presets button[data-time="20"]').click();
  document.getElementById('timer-toggle').click();
  for (let i = 0; i < 20; i += 1) app.timer.tick();
  assert.equal(document.getElementById('timer-status').textContent, 'Отдых закончен');
  return buzz;
}

test('конец отдыха без клиента Telegram отзывается вибрацией устройства', t => {
  assert.deepEqual(restToTheEnd(mount(t)), [[120, 80, 120]]);
});

// Главный случай: страница в обычном браузере. SDK подключён всегда и объект
// WebApp отдаёт даже там — но версии 6.0, в которой HapticFeedback только пишет
// предупреждение в консоль. Проверка «мы внутри Telegram?» тут отвечает «да»
// и оставила бы человека вообще без сигнала.
test('конец отдыха на клиенте без HapticFeedback всё равно отзывается вибрацией', t => {
  const webApp = fakeWebApp({ version: '6.0' });
  const buzz = restToTheEnd(mount(t, { webApp }));

  assert.deepEqual(buzz, [[120, 80, 120]]);
  assert.deepEqual(webApp.calls.filter(call => call.startsWith('notify:')), [], 'клиент отклика не давал');
});

// Вибромотор вправе отказать: на части платформ vibrate бросает, если не
// было жеста пользователя. Конец отдыха всё равно обязан состояться.
test('вибромотор, который бросает, не ломает конец отдыха', t => {
  const mounted = mount(t);
  Object.defineProperty(mounted.window.navigator, 'vibrate', {
    value: () => { throw new Error('нет разрешения'); },
    configurable: true,
  });

  const { document, app } = mounted;
  document.querySelector('.presets button[data-time="20"]').click();
  document.getElementById('timer-toggle').click();
  for (let i = 0; i < 20; i += 1) app.timer.tick();

  assert.equal(document.getElementById('timer-value').textContent, '00:00');
  assert.equal(document.getElementById('timer-status').textContent, 'Отдых закончен');
});

test('на современном клиенте отзывается он сам, а не вибромотор', t => {
  const webApp = fakeWebApp();
  const buzz = restToTheEnd(mount(t, { webApp }));

  assert.deepEqual(buzz, [], 'двойного отклика быть не должно');
  assert.equal(webApp.calls.at(-1), 'notify:success');
});

// Отклик на отметку и на закрытый блок — разный: последний круг блока
// подтверждается заметнее, чем каждый промежуточный.
test('каждая отметка отзывается, а закрытый блок — отдельным откликом', t => {
  const webApp = fakeWebApp();
  const { document } = mount(t, { webApp });
  const block = [...document.querySelectorAll('#legs1 input[data-mark]')];

  for (const box of block) box.click();

  const haptics = webApp.calls.filter(call => call.startsWith('impact:') || call.startsWith('notify:'));
  assert.equal(haptics.length, block.length, 'отзывается каждая отметка');
  assert.deepEqual(haptics.slice(0, -1), Array(block.length - 1).fill('impact:light'));
  assert.equal(haptics.at(-1), 'notify:success', 'последний круг блока — другой отклик');
});

// BackButton.onClick у настоящего клиента накапливает обработчики, а не
// заменяет их, поэтому вешаем ровно один раз.
test('кнопка «назад» получает один обработчик и увозит страницу наверх', t => {
  const webApp = fakeWebApp();
  const { window } = mount(t, { webApp });
  const scrolls = [];
  window.scrollTo = options => scrolls.push(options);

  assert.equal(webApp.backHandlers.length, 1);
  webApp.backHandlers[0]();
  assert.deepEqual(scrolls, [{ top: 0, behavior: 'smooth' }]);
});

test('кнопка «назад» не прокручивает плавно, когда плавность просили выключить', t => {
  const webApp = fakeWebApp();
  const { window } = mount(t, { webApp });
  const scrolls = [];
  window.scrollTo = options => scrolls.push(options);
  window.matchMedia = query => ({ media: query, matches: query.includes('prefers-reduced-motion') });

  webApp.backHandlers[0]();
  assert.deepEqual(scrolls, [{ top: 0, behavior: 'instant' }]);
});

// setBackVisible каждый раз ходит в клиент Telegram, а событий прокрутки за один
// жест десятки: зовём его только когда ответ меняется.
test('кнопка «назад» показывается один раз на весь уход вниз', t => {
  const webApp = fakeWebApp();
  const { window } = mount(t, { webApp });
  const scrollTo = y => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
    window.dispatchEvent(new window.Event('scroll'));
  };

  scrollTo(window.innerHeight * 2);
  scrollTo(window.innerHeight * 3);
  scrollTo(window.innerHeight * 4);
  assert.deepEqual(webApp.calls.filter(call => call.startsWith('back:')), ['back:onClick', 'back:show']);

  scrollTo(0);
  scrollTo(10);
  assert.deepEqual(webApp.calls.filter(call => call.startsWith('back:')),
    ['back:onClick', 'back:show', 'back:hide']);
});

test('плеер подменяет ссылки на видео кнопками', t => {
  const { document } = mount(t);
  assert.equal(document.querySelectorAll('#workout a.video').length, 0);
  assert.ok(document.querySelectorAll('#workout button.video').length > 0);
  const button = document.querySelector('#workout button.video');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

test('Escape закрывает открытый плеер', t => {
  const { window, document } = mount(t);
  const button = document.querySelector('#workout button.video');

  button.click();
  assert.ok(document.querySelector('.player-shell'), 'плеер открылся');
  assert.equal(button.getAttribute('aria-expanded'), 'true');

  document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
  assert.equal(document.querySelector('.player-shell'), null);
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});

// Видео смотрят с телефона в руке: без полноэкранного режима упражнение
// приходится разглядывать в полоске между карточками.
test('встроенному плееру разрешён полный экран', t => {
  const { document } = mount(t);
  document.querySelector('#workout button.video').click();

  const frame = document.querySelector('.player-shell iframe');
  assert.equal(frame.allowFullscreen, true);
  assert.match(frame.allow, /fullscreen/);
});

// Внутри Telegram target="_blank" не работает — внешняя ссылка обязана уходить
// через слой клиента, ради чего openLink и передаётся в setupPlayers.
test('«Открыть в YouTube» уходит через слой Telegram', t => {
  const webApp = fakeWebApp();
  const { document } = mount(t, { webApp });
  document.querySelector('#workout button.video').click();

  document.querySelector('.player-shell .player-external').click();

  const opened = webApp.calls.filter(call => call.startsWith('open:'));
  assert.equal(opened.length, 1);
  assert.match(opened[0], /^open:https:\/\/www\.youtube\.com\/watch\?v=/);
});

test('навигация подсвечивает блок, о котором сообщил наблюдатель', t => {
  const { window, document } = mount(t);
  const [observer] = window.intersectionObservers;

  assert.equal(observer.targets.length, WORKOUT.blocks.length, 'наблюдают за всеми блоками');
  observer.intersect(document.getElementById('legs1'));

  const active = [...document.querySelectorAll('.block-nav a.active')];
  assert.deepEqual(active.map(link => link.hash), ['#legs1']);

  // Наблюдатель сообщает и об уходе блока с экрана — такое сообщение подсветку
  // не переносит, иначе она уезжала бы на блок, которого на экране уже нет.
  observer.intersect(document.getElementById('finish'), false);
  assert.deepEqual([...document.querySelectorAll('.block-nav a.active')].map(link => link.hash), ['#legs1']);
});

// ЗАДАЧА 9: описания упражнений под нажатием. Что в свёрнутой карточке лежит
// внутри области раскрытия, а что снаружи, проверяет render.test.js; здесь —
// поведение на настоящей странице: решение по ширине окна, нажатие и то, что
// сворачивание не задело ни отметки, ни счётчик, ни навигацию.

const howtoPairs = document => [...document.querySelectorAll('#workout .exercise')].map(article => {
  const button = article.querySelector('.howto-toggle');
  return { button, region: document.getElementById(button.getAttribute('aria-controls')) };
});

// Телефон 375px против окна 800px: на узком экране места нет, на широком
// прятать текст незачем. Порог — PHONE_MAX_WIDTH, и обе стороны от него здесь
// проверены на одной и той же странице.
test('на телефоне описания свёрнуты, а в широком окне раскрыты', t => {
  const phone = mount(t, { screenWidth: 375 }).document;
  const wide = mount(t, { screenWidth: 800 }).document;

  const phonePairs = howtoPairs(phone);
  assert.equal(phonePairs.length, 19);
  for (const { button, region } of phonePairs) {
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(region.hidden, true);
  }

  const widePairs = howtoPairs(wide);
  assert.equal(widePairs.length, 19);
  for (const { button, region } of widePairs) {
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(region.hidden, false);
  }
});

// Окно ровно на пороге считается телефоном: в style.css правила телефона
// включает max-width, то есть границу он включает тоже.
test('окно ровно по порогу получает телефонную раскладку описаний', t => {
  const { document } = mount(t, { screenWidth: PHONE_MAX_WIDTH });
  assert.equal(document.querySelector('.howto-toggle').getAttribute('aria-expanded'), 'false');
  const { document: wider } = mount(t, { screenWidth: PHONE_MAX_WIDTH + 1 });
  assert.equal(wider.querySelector('.howto-toggle').getAttribute('aria-expanded'), 'true');
});

// Порог живёт в двух местах: в style.css (размеры) и в app.js (раскрытие
// описаний при отрисовке, медиазапросом атрибут не задать). Разъехавшись, они
// дали бы телефонные размеры с раскрытым текстом или наоборот — на экране это
// выглядит как «просто так получилось», и причину пришлось бы искать в двух
// файлах сразу.
//
// Сверяется условие ИМЕННО ТОГО блока, который задаёт телефонные размеры, а не
// присутствие числа где-нибудь в файле: медиазапросов в style.css шесть, и
// среди них уже есть 520px (силуэты карты) — то самое число, на которое телефонный
// порог скорее всего однажды и поднимут. Прежняя версия теста искала число по
// всем медиазапросам и на PHONE_MAX_WIDTH = 520 оставалась зелёной.
//
// Блок опознаётся по правилу, которого нет ни в одном другом медиазапросе:
// размер названия упражнения. Стили читаются разбором CSSOM, а не регулярным
// выражением по тексту, поэтому условие берётся у настоящего разобранного
// правила.
test('телефонные размеры лежат в медиазапросе ровно на PHONE_MAX_WIDTH', () => {
  const { document } = makeDom();
  const style = document.createElement('style');
  style.textContent = readFileSync(fileURLToPath(new URL('../style.css', import.meta.url)), 'utf8');
  document.head.append(style);

  const media = [...document.styleSheets[0].cssRules].filter(rule => rule.media);
  const marked = media.filter(rule => [...rule.cssRules].some(r => r.selectorText === '.exercise h3'));
  assert.equal(marked.length, 1,
    `блок с телефонным размером .exercise h3 должен быть один, найдено ${marked.length}`);

  const condition = marked[0].media.mediaText;
  const max = /^\(max-width:\s*(\d+)px\)$/.exec(condition);
  assert.ok(max, `условие блока должно быть «(max-width: Npx)», а оно «${condition}»`);
  assert.equal(Number(max[1]), PHONE_MAX_WIDTH,
    `телефонные размеры включаются на ${max[1]}px, а app.js считает порогом ${PHONE_MAX_WIDTH}px`);
});

// Минимальная высота нажимаемого. Требование владельца программы: всё, во что
// тыкают пальцем, не ниже 44px — приложением пользуются между подходами, и
// промах стоит дороже лишних пикселей.
//
// До этого теста требование держалось на одном комментарии в style.css:
// возврат `.timer button{min-height:43px}` в блок 720px и возврат
// `.check{min-height:36px}` оставляли все тесты зелёными.
const MIN_TAP_HEIGHT = 44;

// Всё нажимаемое страницы. Список — из требования Task 9 («чипы блоков, кнопки
// режимов карты, видео, отметка, пресеты таймера, кнопка раскрытия секции»)
// плюс кнопка «Как выполнять», сброс отметок, мышцы в подборе, кнопка секции
// недельного объёма (Task 3 калькулятора) и обе кнопки плеера, которым высоту
// задаёт player.css.
//
// Кого здесь нет и почему:
// - `.check input` (19×19) — сам чекбокс лежит ВНУТРИ метки `.check`, а палец
//   попадает по метке целиком: тап по любому её месту переключает отметку;
// - `a.brand` в шапке и `.player-external` в подвале плеера — им высота в
//   стилях не задана вовсе, она набирается содержимым. В требовании владельца
//   их нет, и придумывать им проверку значит придумывать требование;
// - `.block-number` — не нажимаемое, это номер блока (по медиазапросам он
//   как раз и уезжает 44 → 38 → 34px).
const TAP_TARGETS = [
  '.block-nav a',
  '.text-button',
  '.video',
  '.check',
  '.timer button',
  '.tabbar button',
  '.bodymap-toggle',
  '.bodymap-modes button',
  '.bodymap-pick button',
  '.weekly-toggle',
  '.howto-toggle',
  'button.extra-link',
  '.player-close',
];

const HEIGHT_PROPS = ['min-height', 'height', 'max-height'];

// Проверять можно только пиксели: процент считается от родителя, vh — от окна,
// и «не ниже 44px» о них ничего не говорит. Поэтому не-пиксельное значение у
// нажимаемого — это падение с объяснением, а не молчаливый пропуск.
const tapPixels = (value, where) => {
  const px = /^(\d+(?:\.\d+)?)px$/.exec(value.trim());
  assert.ok(px, `высота нажимаемого задана не в пикселях, проверить её нельзя: ${where}`);
  return Number(px[1]);
};

// Живую раскладку в jsdom не посчитать, поэтому сверяются сами объявления —
// так же, как в тестах про порог телефона и про порядок правил печати.
//
// Объявления подбираются НЕ по совпадению строки селектора, а примеркой на
// настоящие узлы страницы (`node.matches`): правило под другим селектором
// (`.presets button` вместо `.timer button`) или внутри медиазапроса накрывает
// те же кнопки, и сравнение строк его бы не заметило.
//
// Узлы берутся с отрисованной страницы ещё и затем, чтобы сторож не остался
// беззубым молча: селектор, переставший что-либо накрывать (переименованный
// класс), роняет тест на пустой выборке.
test(`ни одно правило не опускает нажимаемое ниже ${MIN_TAP_HEIGHT}px`, t => {
  const { window, document } = mount(t, { screenWidth: 375 });
  // Подбор мышцы и плеер появляются только после нажатий: без них выборки
  // `.bodymap-pick button` и `.player-close` были бы пустыми.
  document.querySelector('.bodymap-toggle').click();
  document.querySelector('.bodymap-anterior polygon')
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  document.querySelector('button.video').click();

  const declarations = [];
  for (const file of ['style.css', 'player.css']) {
    const style = document.createElement('style');
    style.textContent = readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
    document.head.append(style);
    for (const rule of [...style.sheet.cssRules]) {
      const scope = rule.media ? `@media ${rule.media.mediaText} ` : '';
      for (const inner of rule.media ? [...rule.cssRules] : [rule]) {
        if (!inner.style) continue;
        for (const prop of HEIGHT_PROPS) {
          const value = inner.style.getPropertyValue(prop);
          if (!value) continue;
          declarations.push({
            prop,
            value,
            selectors: inner.selectorText.split(',').map(s => s.trim()),
            where: `${file} ${scope}${inner.selectorText}{${prop}:${value}}`,
          });
        }
      }
    }
  }
  const low = [];
  for (const selector of TAP_TARGETS) {
    const nodes = [...document.querySelectorAll(selector)];
    assert.ok(nodes.length > 0,
      `«${selector}» на странице ничего не накрывает — сторож высоты нажимаемого стал беззубым`);

    const applied = declarations.filter(
      declaration => nodes.some(node => declaration.selectors.some(s => node.matches(s))));
    // Высота обязана быть задана: снятое `min-height` вернуло бы высоту по
    // содержимому, и одной проверкой «ни одно объявление не ниже 44px» такое
    // снятие прошло бы мимо — объявлять стало бы нечего.
    const floors = applied.filter(declaration => declaration.prop === 'min-height'
      && tapPixels(declaration.value, declaration.where) >= MIN_TAP_HEIGHT);
    assert.ok(floors.length > 0,
      `у «${selector}» нет объявления min-height не ниже ${MIN_TAP_HEIGHT}px`);

    for (const declaration of applied) {
      if (tapPixels(declaration.value, declaration.where) < MIN_TAP_HEIGHT) low.push(declaration.where);
    }
  }
  assert.deepEqual(low, []);
});

test('нажатие на «Как выполнять» раскрывает описание, повторное — сворачивает', t => {
  const { document } = mount(t, { screenWidth: 375 });
  const [{ button, region }] = howtoPairs(document);

  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(region.hidden, false);

  button.click();
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(region.hidden, true);
});

// Нажимают не по подписи, а по кнопке целиком, и палец часто попадает в
// уголок: у обработчика цель — сам значок, а не кнопка.
test('нажатие по значку-уголку раскрывает описание так же, как по подписи', t => {
  const { document } = mount(t, { screenWidth: 375 });
  const [{ button, region }] = howtoPairs(document);

  button.querySelector('.howto-caret').dispatchEvent(
    new document.defaultView.MouseEvent('click', { bubbles: true }));
  assert.equal(button.getAttribute('aria-expanded'), 'true');
  assert.equal(region.hidden, false);
});

// Не аккордеон: человек вправе раскрыть сразу несколько упражнений — например
// оба упражнения силовой пары, которые делает по кругу одно за другим.
test('раскрытие одного упражнения не сворачивает остальные', t => {
  const { document } = mount(t, { screenWidth: 375 });
  const pairs = howtoPairs(document);

  pairs[0].button.click();
  pairs[1].button.click();

  assert.deepEqual(pairs.slice(0, 2).map(p => p.button.getAttribute('aria-expanded')), ['true', 'true']);
  assert.deepEqual(pairs.slice(0, 2).map(p => p.region.hidden), [false, false]);
  assert.equal(pairs.slice(2).filter(p => p.region.hidden).length, 17, 'остальные так и свёрнуты');
});

// Ревью прошлой итерации ловило дефект «счётчик считал отметки за пределами
// экрана»: в наборе оказывались отметки, которых на странице нет. Сворачивание
// описаний — ровно тот случай, когда отметка могла уехать под hidden: тогда
// счётчик считал бы её, а палец до неё не дотянулся бы.
test('в свёрнутом виде ни одна отметка и ни одно видео не спрятаны под hidden', t => {
  const { document, app } = mount(t, { screenWidth: 375 });

  assert.equal(app.total, TOTAL, 'счётчик знает про все отметки тренировки');
  assert.equal(boxes(document).length, TOTAL);
  assert.equal(boxes(document).filter(box => box.closest('[hidden]')).length, 0);

  const videos = [...document.querySelectorAll('#workout button.video')];
  assert.equal(videos.length, 18, 'плеер подменил все ссылки на видео');
  assert.equal(videos.filter(button => button.closest('[hidden]')).length, 0);
});

test('отметка в свёрнутой карточке работает и двигает счётчик', t => {
  const { document, app } = mount(t, { screenWidth: 375 });
  const exercise = document.querySelector('#legs1 .exercise');
  const [first, second] = [...exercise.querySelectorAll('input[data-mark]')];

  first.click();
  second.click();

  assert.equal(app.marks.size, 2);
  assert.equal(exercise.classList.contains('completed'), true);
  assert.equal(document.getElementById('progress').value, 2);
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 2 из ${TOTAL} отметок`);
});

// Навигация следит за появлением блоков на экране, а не за упражнениями:
// сворачивание описаний не должно было ни убрать блок из-под наблюдения, ни
// сбить подсветку.
test('навигация по блокам работает и при свёрнутых описаниях', t => {
  const { window, document } = mount(t, { screenWidth: 375 });
  const [observer] = window.intersectionObservers;

  assert.equal(observer.targets.length, WORKOUT.blocks.length);
  observer.intersect(document.getElementById('upper2'));
  assert.deepEqual([...document.querySelectorAll('.block-nav a.active')].map(link => link.hash), ['#upper2']);
});

// Обработчик раскрытия висит на всём списке упражнений и видит каждый клик
// внутри него — по отметке, по её подписи, по кнопке видео, по заголовку.
// Без раннего выхода (closest вернул null) он падал бы с TypeError на каждом
// таком клике, и ни один тест этого бы не увидел: исключение из обработчика
// события не доходит до вызова click(). На телефоне оно осталось бы только
// ошибкой в консоли, которую никто не читает, — поэтому ловим необработанные
// исключения окна явно.
test('клик в списке упражнений не оставляет необработанных исключений', t => {
  const { window, document } = mount(t, { screenWidth: 375 });
  const errors = [];
  window.addEventListener('error', event => errors.push(String(event.error ?? event.message)));
  const exercise = document.querySelector('#legs1 .exercise');

  exercise.querySelector('input[data-mark]').click();
  exercise.querySelector('label.check span').click();
  exercise.querySelector('button.video').click();
  exercise.querySelector('h3').click();
  exercise.querySelector('.howto-toggle').click();

  assert.deepEqual(errors, []);
  // Клики по отметке и по её подписи — это два переключения одного чекбокса,
  // то есть набор снова пуст: проверка заодно сторожит, что клики дошли.
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 0 из ${TOTAL} отметок`);
  assert.equal(exercise.querySelector('.howto-toggle').getAttribute('aria-expanded'), 'true');
});

// Медиазапрос специфичности не добавляет: объявление внутри @media print
// перекрывается любым ПОЗЖЕ объявленным правилом с тем же селектором и тем же
// свойством. Именно так и вышло с кнопкой раскрытия: display:none стоял в общем
// блоке печати, а display:flex — в новых правилах карточки, дописанных в конец
// файла, и кнопка печаталась бы на каждой из девятнадцати карточек.
//
// Проверка общая, а не про одно правило: новые стили в этом файле дописывают в
// конец, значит следующий такой случай появится там же. Сверяется только
// style.css — правила player.css идут после него целиком, перекрыть их из
// style.css нельзя.
test('ни одно правило печати не перекрыто более поздним правилом style.css', () => {
  const { document } = makeDom();
  const style = document.createElement('style');
  style.textContent = readFileSync(fileURLToPath(new URL('../style.css', import.meta.url)), 'utf8');
  document.head.append(style);

  const printed = [];
  const rest = [];
  [...document.styleSheets[0].cssRules].forEach((rule, order) => {
    const into = rule.media ? (rule.media.mediaText === 'print' ? printed : rest) : rest;
    const rules = rule.media ? [...rule.cssRules] : [rule];
    for (const r of rules) {
      if (!r.style) continue;
      into.push({ order, selectors: r.selectorText.split(',').map(s => s.trim()), props: [...r.style] });
    }
  });
  assert.ok(printed.length > 0, 'блок @media print в style.css найден');

  const shadowed = [];
  for (const rule of printed) {
    for (const selector of rule.selectors) {
      for (const prop of rule.props) {
        const later = rest.find(other => other.order > rule.order
          && other.selectors.includes(selector) && other.props.includes(prop));
        if (later) shadowed.push(`печать «${selector}{${prop}}» перекрыта правилом «${later.selectors.join(',')}» ниже в файле`);
      }
    }
  }
  assert.deepEqual(shadowed, []);

  // И само правило на месте: на бумаге кнопка не нужна (в блоке печати рядом
  // так же скрыты отметки), а текст техники печатается, хотя на экране он
  // свёрнут атрибутом hidden. Без этой проверки удаление всего блока печати
  // прошло бы мимо теста: перекрывать стало бы нечего.
  const declared = printed.flatMap(rule => rule.selectors.map(selector => `${selector}{${rule.props.join(',')}}`));
  assert.ok(declared.includes('.howto-toggle{display}'), `.howto-toggle не скрыт при печати: ${declared.join(' ')}`);
  assert.ok(declared.includes('.howto-body{display}'), `.howto-body не раскрыт при печати: ${declared.join(' ')}`);
});
