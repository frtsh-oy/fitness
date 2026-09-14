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

test('openLink откатывается на win.open, если webApp.openLink присутствует, но бросает исключение', () => {
  // Именно этот путь Task 8 использует для видео, когда встроенный плеер
  // YouTube заблокирован в WebView — то есть openLink бросает ровно тогда,
  // когда запасной вариант и нужен. Молча проглоченное исключение оставило бы
  // кнопку «смотреть видео» немой, без какой-либо реакции на нажатие.
  let opened = null;
  const webApp = fakeWebApp({ openLink: () => { throw new Error('WebView заблокировал переход'); } });
  const win = fakeWin(webApp);
  win.open = url => { opened = url; };
  initTelegram(win).openLink('https://youtu.be/x');
  assert.equal(opened, 'https://youtu.be/x');
});

// Тест на haptic проверяет каждый вызов ИЗОЛИРОВАННО (отдельный webApp на
// mark и на done, отдельные счётчики impact/notification), а не общий массив
// calls на "оба вызова вперемешку". Это намеренно: версия с общим массивом
// и .includes(...) — тест-плацебо, который остаётся зелёным при реализации
// "звонить в оба метода при любом kind" (различение потеряно) и при полном
// свопе семантики (mark вызывает success, done вызывает light) — ни один из
// этих двух дефектов не меняет содержимое объединённого массива вызовов
// настолько, чтобы .includes() перестал находить ожидаемые строки. Разбор в
// отчёте Task 7 (раунд правок 1) подтверждает это экспериментально.
test('haptic для отметки вызывает ровно impact и не вызывает notification', () => {
  const impacts = [];
  const notifications = [];
  const webApp = fakeWebApp({
    HapticFeedback: {
      impactOccurred: s => impacts.push(s),
      notificationOccurred: t => notifications.push(t),
    },
  });
  initTelegram(fakeWin(webApp)).haptic('mark');
  assert.deepEqual(impacts, ['light']);
  assert.deepEqual(notifications, []);
});

test('haptic для завершения блока вызывает ровно notification и не вызывает impact', () => {
  const impacts = [];
  const notifications = [];
  const webApp = fakeWebApp({
    HapticFeedback: {
      impactOccurred: s => impacts.push(s),
      notificationOccurred: t => notifications.push(t),
    },
  });
  initTelegram(fakeWin(webApp)).haptic('done');
  assert.deepEqual(notifications, ['success']);
  assert.deepEqual(impacts, []);
});

// Дополнительное покрытие: ненадёжность настоящего Telegram WebApp API.
// На старых клиентах методы, появившиеся в поздних версиях Bot API, либо
// отсутствуют вовсе, либо бросают исключение при вызове — оба случая должны
// переживаться молча, без падения инициализации и без падения последующих
// вызовов слоя.
//
// Таблица описывает, ПО ОТДЕЛЬНОСТИ, каждый метод, которым пользуется
// telegram.js, плюс действие (`exercise`), которое реально заставляет слой
// обратиться именно к этому методу после инициализации — иначе тест на
// «метод сломан» ничего бы не проверял для методов, вызываемых только по
// требованию (openLink/haptic/onBack/setBackVisible), а не при старте.
const METHOD_CASES = [
  { name: 'ready', remove: w => { delete w.ready; }, corrupt: w => { w.ready = () => { throw new Error('boom'); }; }, exercise: () => {} },
  { name: 'expand', remove: w => { delete w.expand; }, corrupt: w => { w.expand = () => { throw new Error('boom'); }; }, exercise: () => {} },
  { name: 'disableVerticalSwipes', remove: w => { delete w.disableVerticalSwipes; }, corrupt: w => { w.disableVerticalSwipes = () => { throw new Error('boom'); }; }, exercise: () => {} },
  { name: 'setHeaderColor', remove: w => { delete w.setHeaderColor; }, corrupt: w => { w.setHeaderColor = () => { throw new Error('boom'); }; }, exercise: () => {} },
  { name: 'setBackgroundColor', remove: w => { delete w.setBackgroundColor; }, corrupt: w => { w.setBackgroundColor = () => { throw new Error('boom'); }; }, exercise: () => {} },
  { name: 'openLink', remove: w => { delete w.openLink; }, corrupt: w => { w.openLink = () => { throw new Error('boom'); }; }, exercise: tg => tg.openLink('https://x.test') },
  { name: 'HapticFeedback (целиком)', remove: w => { delete w.HapticFeedback; }, corrupt: w => { w.HapticFeedback = null; }, exercise: tg => { tg.haptic('mark'); tg.haptic('done'); } },
  { name: 'HapticFeedback.impactOccurred', remove: w => { delete w.HapticFeedback.impactOccurred; }, corrupt: w => { w.HapticFeedback.impactOccurred = () => { throw new Error('boom'); }; }, exercise: tg => tg.haptic('mark') },
  { name: 'HapticFeedback.notificationOccurred', remove: w => { delete w.HapticFeedback.notificationOccurred; }, corrupt: w => { w.HapticFeedback.notificationOccurred = () => { throw new Error('boom'); }; }, exercise: tg => tg.haptic('done') },
  { name: 'BackButton (целиком)', remove: w => { delete w.BackButton; }, corrupt: w => { w.BackButton = null; }, exercise: tg => { tg.onBack(() => {}); tg.setBackVisible(true); tg.setBackVisible(false); } },
  { name: 'BackButton.onClick', remove: w => { delete w.BackButton.onClick; }, corrupt: w => { w.BackButton.onClick = () => { throw new Error('boom'); }; }, exercise: tg => tg.onBack(() => {}) },
  { name: 'BackButton.show', remove: w => { delete w.BackButton.show; }, corrupt: w => { w.BackButton.show = () => { throw new Error('boom'); }; }, exercise: tg => tg.setBackVisible(true) },
  { name: 'BackButton.hide', remove: w => { delete w.BackButton.hide; }, corrupt: w => { w.BackButton.hide = () => { throw new Error('boom'); }; }, exercise: tg => tg.setBackVisible(false) },
];

test('отсутствие любого метода WebApp по отдельности не роняет инициализацию и работу слоя', () => {
  for (const { name, remove, exercise } of METHOD_CASES) {
    const webApp = fakeWebApp();
    remove(webApp);
    assert.doesNotThrow(() => {
      const tg = initTelegram(fakeWin(webApp));
      exercise(tg);
    }, `метод "${name}" отсутствует`);
  }
});

test('исключение из любого метода WebApp по отдельности не роняет инициализацию и работу слоя', () => {
  for (const { name, corrupt, exercise } of METHOD_CASES) {
    const webApp = fakeWebApp();
    corrupt(webApp);
    assert.doesNotThrow(() => {
      const tg = initTelegram(fakeWin(webApp));
      exercise(tg);
    }, `метод "${name}" бросает исключение`);
  }
});

test('window.Telegram есть, а WebApp внутри нет — слой недоступен и не падает', () => {
  const win = { Telegram: {}, location: { search: '' }, open: () => {} };
  let tg;
  assert.doesNotThrow(() => { tg = initTelegram(win); });
  assert.equal(tg.available, false);
  assert.equal(tg.workoutId, null);
  assert.doesNotThrow(() => {
    tg.haptic('mark');
    tg.haptic('done');
    tg.setBackVisible(true);
    tg.setBackVisible(false);
    tg.onBack(() => {});
  });
});

test('WebApp есть, но пустой объект без единого метода — слой доступен и ни один вызов не падает', () => {
  const webApp = {};
  const win = { Telegram: { WebApp: webApp }, location: { search: '' }, open: () => {} };
  let tg;
  assert.doesNotThrow(() => { tg = initTelegram(win); });
  assert.equal(tg.available, true);
  assert.equal(tg.workoutId, null);
  let opened = null;
  win.open = url => { opened = url; };
  assert.doesNotThrow(() => {
    tg.haptic('mark');
    tg.haptic('done');
    tg.setBackVisible(true);
    tg.setBackVisible(false);
    tg.onBack(() => {});
    tg.openLink('https://x.test');
  });
  // Раз у пустого WebApp нет openLink, вызов обязан деградировать до обычного окна,
  // а не молча теряться — иначе доступность (available === true) была бы враньём.
  assert.equal(opened, 'https://x.test');
});

test('HapticFeedback и BackButton отсутствуют одновременно — haptic и работа с кнопкой назад не падают', () => {
  const webApp = fakeWebApp();
  delete webApp.HapticFeedback;
  delete webApp.BackButton;
  const tg = initTelegram(fakeWin(webApp));
  assert.doesNotThrow(() => {
    tg.haptic('mark');
    tg.haptic('done');
    tg.onBack(() => {});
    tg.setBackVisible(true);
    tg.setBackVisible(false);
  });
});
