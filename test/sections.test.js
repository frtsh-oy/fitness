// Переключение разделов. Разделы — это показ и скрытие, а не переходы по
// адресам, поэтому проверяется именно видимость узлов, а не состояние истории.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';
import { renderWorkouts } from '../workouts-view.js';
import { WORKOUTS } from '../workouts/index.js';

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
  assert.match(marked[0].textContent, /Сейчас в «Сегодня»/);
});

test('нажатие на карточку тренировки открывает «Сегодня»', () => {
  // Карточка текущей тренировки ничего не меняет, а лишь возвращает человека
  // туда, откуда он и хотел тренироваться; смена тренировки — в test/switch.test.js.
  const { window, document } = mount();
  startApp(window);
  document.querySelector('[data-section="workouts"]').click();
  document.querySelector('#screen-workouts .workout-card').click();
  assert.deepEqual(shown(document), ['screen-today']);
});

test('после сохранения раздел говорит об этом: у сохранённой на устройстве — другим текстом', () => {
  const { document } = mount();
  const host = document.createElement('div');
  const draw = saved => {
    renderWorkouts({ host, ready: WORKOUTS, mine: [], currentId: 'legs-mwf', saved, onPick() {}, onDelete() {} });
    return host.querySelector('.workouts-saved');
  };

  assert.equal(draw(null), null, 'без сохранения сообщения нет');
  const saved = draw({ localOnly: false });
  assert.equal(saved.getAttribute('role'), 'status');
  assert.equal(saved.textContent, 'Тренировка сохранена');
  assert.equal(draw({ localOnly: true }).textContent,
    'Тренировка сохранена на этом устройстве: облако Telegram не ответило. Отправим её туда при следующем запуске.');
});

test('«Конструктор» открывается на входе: как устроена тренировка и две дороги — собрать самому и сгенерировать', () => {
  const { window, document } = mount();
  startApp(window);
  document.querySelector('[data-section="builder"]').click();
  const screen = document.querySelector('#screen-builder');
  assert.equal(screen.querySelector('h2').textContent, 'Конструктор');
  assert.equal(screen.querySelectorAll('.builder-path').length, 2);
  assert.equal(screen.querySelectorAll('.builder-steps li').length, 4);
  assert.doesNotMatch(screen.textContent, /платн/i, 'раздел бесплатный');
});

test('у каждой своей тренировки есть «Изменить», у готовых нет, и нажатие отдаёт id', () => {
  const { document } = mount();
  const host = document.createElement('div');
  const own = { id: 'my-test0001', compact: { v: 1, name: 'Моя', days: [1], level: null, zones: [], warmup: [], circuit: [], strength: ['rdl'], focus: [], cooldown: [], t: 1 }, localOnly: false };
  const edited = [];
  renderWorkouts({ host, ready: WORKOUTS, mine: [own], currentId: 'legs-mwf', onPick() {}, onDelete() {}, onEdit: id => edited.push(id) });

  const buttons = host.querySelectorAll('.workout-edit');
  assert.equal(buttons.length, 1, 'готовые тренировки менять нельзя');
  assert.equal(buttons[0].textContent, 'Изменить');
  assert.equal(buttons[0].getAttribute('aria-label'), 'Изменить: Моя');
  assert.equal(buttons[0].closest('.workout-item'), host.querySelector('.workout-delete').closest('.workout-item'),
    'рядом с «Удалить», в той же строке');
  buttons[0].click();
  assert.deepEqual(edited, ['my-test0001']);
});

// Раздел красит страницу: ведущий цвет задаёт data-tint на body (style.css).
test('каждый раздел открывается в своём цвете', () => {
  const { window, document } = mount();
  startApp(window);
  const tint = () => document.body.dataset.tint;

  assert.equal(tint(), 'rose', '«Сегодня» — пудра');
  document.querySelector('[data-section="workouts"]').click();
  assert.equal(tint(), 'sky');
  document.querySelector('[data-section="builder"]').click();
  assert.equal(tint(), 'butter');
  document.querySelector('[data-section="today"]').click();
  assert.equal(tint(), 'rose');
});

test('раздел из хранилища открывается сразу в своём цвете', () => {
  const { window, document } = mount();
  window.localStorage.setItem('section', 'builder');
  startApp(window);
  assert.equal(document.body.dataset.tint, 'butter');
});
