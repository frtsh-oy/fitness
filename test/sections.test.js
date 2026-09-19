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
  // Подмена по месту, как в test/app.test.js:1001 — не заводим вторую
  // глобальную заглушку ради того же самого.
  const scrolls = [];
  window.scrollTo = options => scrolls.push(options);
  window.scrollY = 900;
  document.querySelector('[data-section="workouts"]').click();
  document.querySelector('[data-section="today"]').click();
  assert.deepEqual(scrolls.at(-1), { top: 900, behavior: 'instant' },
    'при возврате в «Сегодня» прокрутка должна восстанавливаться');
});

test('прочие разделы открываются сверху', () => {
  const { window, document } = mount();
  startApp(window);
  const scrolls = [];
  window.scrollTo = options => scrolls.push(options);
  window.scrollY = 900;
  document.querySelector('[data-section="workouts"]').click();
  assert.deepEqual(scrolls.at(-1), { top: 0, behavior: 'instant' });

  // Первого захода мало: у ещё не посещённого раздела нет запомненной позиции,
  // и «сверху» получится даже если бы раздел на самом деле умел её помнить.
  // Проверяем повторный заход после прокрутки внутри — «Тренировки» не должны
  // вернуться на 500, если запоминать умеет только «Сегодня».
  window.scrollY = 500;
  document.querySelector('[data-section="builder"]').click();
  window.scrollY = 300;
  document.querySelector('[data-section="workouts"]').click();
  assert.deepEqual(scrolls.at(-1), { top: 0, behavior: 'instant' });
});
