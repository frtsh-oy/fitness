// Связывание проверяем на настоящем index.html: так тест заодно сторожит, что
// страница не потеряла ни одного узла, за который цепляется app.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';
import { storageKey } from '../storage.js';
import { getWorkout } from '../workouts/index.js';
import { countMarks } from '../workouts/schema.js';

const PAGE = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');
const WORKOUT = getWorkout(null);
const TOTAL = countMarks(WORKOUT);

// Та же дата, что подставит storage.js по умолчанию.
const todayKey = () => storageKey(WORKOUT.id, new Date().toISOString().slice(0, 10));

// startApp заводит setInterval для таймера, поэтому окно закрываем: иначе
// таймеры jsdom удержат процесс тестов после последней проверки.
function mount(t, seedMarks = null) {
  const { window, document } = makeDom(PAGE);
  t.after(() => window.close());
  if (seedMarks) window.localStorage.setItem(todayKey(), JSON.stringify(seedMarks));
  return { window, document, app: startApp(window) };
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
  assert.equal(document.querySelector('.eyebrow').textContent, WORKOUT.kicker);
  assert.equal(document.querySelectorAll('#progression-list li').length, WORKOUT.progression.length);
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
  assert.deepEqual(JSON.parse(window.localStorage.getItem(todayKey())), [box.dataset.mark]);
});

test('сохранённые отметки проставляются, когда хранилище ответило', async t => {
  const saved = ['start-0-1', 'start-1-1'];
  const { document, app } = mount(t, saved);

  assert.equal(app.marks.size, 0, 'до ответа хранилища разметка уже на экране, но пустая');
  assert.equal(boxes(document).length, TOTAL, 'экран не пустой ещё до загрузки отметок');

  await app.ready;
  assert.deepEqual([...app.marks].sort(), [...saved].sort());
  assert.equal(document.getElementById('progress').value, 2);
  assert.equal(document.querySelector('#start .exercise').classList.contains('completed'), true);
});

test('сброс очищает набор, экран и хранилище', async t => {
  const { window, document, app } = mount(t, ['start-0-1']);
  await app.ready;
  assert.equal(app.marks.size, 1);

  document.getElementById('reset').click();

  assert.equal(app.marks.size, 0);
  assert.equal(boxes(document).some(box => box.checked), false);
  assert.equal(document.querySelectorAll('#workout .exercise.completed').length, 0);
  assert.equal(document.getElementById('progress').value, 0);
  assert.equal(document.getElementById('progress-text').textContent, `Сегодня: 0 из ${TOTAL} отметок`);
  assert.equal(window.localStorage.getItem(todayKey()), null);
});

// load асинхронный, и пользователь успевает нажать раньше ответа хранилища.
// Тогда главнее его действие: иначе приехавшие отметки молча отменили бы сброс.
test('сброс, сделанный до ответа хранилища, не отменяется приехавшими отметками', async t => {
  const { document, app } = mount(t, ['start-0-1', 'start-1-1']);

  document.getElementById('reset').click();
  await app.ready;

  assert.equal(app.marks.size, 0);
  assert.equal(boxes(document).some(box => box.checked), false);
  assert.equal(document.getElementById('progress').value, 0);
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

  toggle.click();
  assert.equal(toggle.textContent, 'Пауза');
  assert.equal(status.textContent, 'Идёт отдых');

  app.timer.tick();
  assert.equal(value.textContent, '00:19');

  document.getElementById('timer-reset').click();
  assert.equal(value.textContent, '00:20');
  assert.equal(toggle.textContent, 'Старт');
  assert.equal(app.timer.running, false);
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
  assert.equal(toggle.textContent, 'Старт');
  assert.equal(document.querySelector('.timer').classList.contains('done'), true);

  toggle.click();
  assert.equal(document.getElementById('timer-value').textContent, '00:20');
  assert.equal(document.querySelector('.timer').classList.contains('done'), false);
});

test('плеер подменяет ссылки на видео кнопками', t => {
  const { document } = mount(t);
  assert.equal(document.querySelectorAll('#workout a.video').length, 0);
  assert.ok(document.querySelectorAll('#workout button.video').length > 0);
  const button = document.querySelector('#workout button.video');
  assert.equal(button.getAttribute('aria-expanded'), 'false');
});
