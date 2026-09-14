import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { renderWorkout, renderIntro, markId, videoUrl } from '../render.js';
import legsMwf from '../workouts/legs-mwf.js';

test('markId собирает идентификатор из блока, индекса и круга', () => {
  assert.equal(markId('legs1', 0, 1), 'legs1-0-1');
  assert.equal(markId('circuit', 3, 2), 'circuit-3-2');
});

test('videoUrl собирает ссылку с таймкодом', () => {
  assert.equal(videoUrl(['VZ3f0pSTObM', 20, '0:20']), 'https://www.youtube.com/watch?v=VZ3f0pSTObM&t=20s');
});

test('рендерятся все восемь блоков с якорями', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const sections = fragment.querySelectorAll('section.block');
  assert.equal(sections.length, 8);
  assert.deepEqual(
    [...sections].map(s => s.id),
    ['start', 'circuit', 'legs1', 'legs2', 'legs3', 'upper1', 'upper2', 'finish'],
  );
});

test('рендерятся все 19 упражнений', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  assert.equal(fragment.querySelectorAll('.exercise').length, 19);
});

test('число кнопок отметок совпадает с countMarks', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  assert.equal(fragment.querySelectorAll('button[data-mark]').length, 37);
});

test('идентификаторы отметок уникальны', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const ids = [...fragment.querySelectorAll('button[data-mark]')].map(b => b.dataset.mark);
  assert.equal(new Set(ids).size, ids.length);
});

test('у блока с одним кругом кнопка подписана «Готово», у многокруговых — «Круг N»', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const start = fragment.querySelector('#start');
  assert.equal(start.querySelector('button[data-mark]').textContent, 'Готово');
  const circuit = fragment.querySelector('#circuit');
  const labels = [...circuit.querySelectorAll('.exercise')[0].querySelectorAll('button[data-mark]')].map(b => b.textContent);
  assert.deepEqual(labels, ['Круг 1', 'Круг 2', 'Круг 3']);
});

test('ссылка на видео ведёт на YouTube с таймкодом', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const link = fragment.querySelector('#start a.video');
  assert.equal(link.href, 'https://www.youtube.com/watch?v=VZ3f0pSTObM&t=20s');
});

test('упражнение без видео не получает ссылку', () => {
  const { document } = makeDom();
  const workout = structuredClone(legsMwf);
  delete workout.blocks[0].items[0].v;
  const fragment = renderWorkout(workout, document);
  // Селектор нарочно сужен до конкретного (первого) упражнения блока: у второго
  // упражнения того же блока видео есть, и общий селектор по всему блоку прошёл бы
  // независимо от того, как отрендерилось именно проверяемое упражнение.
  const first = fragment.querySelector('#start .exercise');
  assert.equal(first.querySelector('a.video'), null);
});

test('renderIntro заполняет шапку из данных, а не из статики HTML', () => {
  const { document } = makeDom(`<!doctype html><html><body>
    <p class="eyebrow"></p><h1></h1><p class="intro-copy"></p>
    <div class="facts"></div><nav class="block-nav"></nav>
    <div class="equipment"></div><ol id="progression-list"></ol><div id="care"></div>
  </body></html>`);
  renderIntro(legsMwf, document);
  assert.equal(document.querySelector('.eyebrow').textContent, legsMwf.kicker);
  assert.equal(document.querySelector('h1').childNodes[0].textContent, 'Всё тело.');
  assert.equal(document.querySelector('h1').querySelector('span').textContent, 'Акцент на ноги.');
  assert.equal(document.querySelector('.intro-copy').textContent, legsMwf.lead);
  assert.equal(document.querySelectorAll('.facts > div').length, legsMwf.stats.length);
  assert.equal(document.querySelector('.equipment').textContent, legsMwf.gear);
  assert.equal(document.querySelectorAll('#progression-list li').length, legsMwf.progression.length);
});

test('renderIntro строит навигацию по реальным блокам', () => {
  const { document } = makeDom(`<!doctype html><html><body>
    <p class="eyebrow"></p><h1></h1><p class="intro-copy"></p>
    <div class="facts"></div><nav class="block-nav"></nav>
    <div class="equipment"></div><ol id="progression-list"></ol><div id="care"></div>
  </body></html>`);
  renderIntro(legsMwf, document);
  const links = [...document.querySelectorAll('.block-nav a')];
  assert.equal(links.length, 8);
  assert.deepEqual(links.map(a => a.getAttribute('href')), legsMwf.blocks.map(b => `#${b.id}`));
  assert.deepEqual(links.map(a => a.textContent), ['Старт', 'Разогрев', 'Ноги 1', 'Ноги 2', 'Ноги 3', 'Верх 1', 'Верх 2', 'Финиш']);
});

test('тексты упражнения попадают в разметку', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const first = fragment.querySelector('#start .exercise');
  assert.equal(first.querySelector('h3').textContent, 'Подкручивание таза лёжа');
  assert.match(first.textContent, /8–10 раз/);
  assert.match(first.textContent, /Ляг на спину/);
});
