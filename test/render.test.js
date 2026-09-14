import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { renderWorkout, renderIntro, markId, videoUrl } from '../render.js';
import { countMarks } from '../workouts/schema.js';
import legsMwf from '../workouts/legs-mwf.js';

// Достаёт заголовок и текст вставки pairRules прямо из src-original/app.js
// (а не из константы, набранной руками) — так тест сверяет наш рендер
// с оригиналом, а не с чьим-то пересказом оригинала.
function extractOriginalPairRules() {
  const appPath = fileURLToPath(new URL('../src-original/app.js', import.meta.url));
  const appSrc = fs.readFileSync(appPath, 'utf8');
  const m = appSrc.match(/const pairRules=(['"])((?:\\.|(?!\1)[\s\S])*)\1;/);
  assert.ok(m, 'pairRules не найден в src-original/app.js');
  const literal = m[0].replace(/^const pairRules=/, '').replace(/;$/, '');
  // eslint-disable-next-line no-new-func
  const html = Function(`"use strict"; return (${literal});`)();
  const { document } = makeDom(`<!doctype html><html><body>${html}</body></html>`);
  return {
    title: document.querySelector('.pair-rules h2').textContent,
    paragraphs: [...document.querySelectorAll('.pair-rules p')].map(p => p.textContent),
  };
}

test('markId собирает идентификатор из блока, идентификатора упражнения и круга', () => {
  assert.equal(markId('legs1', 0, 1), 'legs1-0-1');
  assert.equal(markId('circuit', 3, 2), 'circuit-3-2');
  assert.equal(markId('legs3', 'bird-dog', 2), 'legs3-bird-dog-2');
});

test('videoUrl собирает ссылку с таймкодом', () => {
  assert.equal(videoUrl(['VZ3f0pSTObM', 20, '0:20']), 'https://www.youtube.com/watch?v=VZ3f0pSTObM&t=20s');
});

test('рендерятся все восемь блоков с якорями', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const sections = fragment.querySelectorAll('section.workout-block');
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
  assert.equal(fragment.querySelectorAll('input[data-mark]').length, countMarks(legsMwf));
});

test('идентификаторы отметок уникальны', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const ids = [...fragment.querySelectorAll('input[data-mark]')].map(b => b.dataset.mark);
  assert.equal(new Set(ids).size, ids.length);
});

test('идентификатор отметки строится по item.key, если он есть, иначе по индексу упражнения', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const legs3 = fragment.querySelector('#legs3');
  const exercises = [...legs3.querySelectorAll('.exercise')];
  const idsOf = article => [...article.querySelectorAll('input[data-mark]')].map(i => i.dataset.mark);

  // item[0] «Подъём верхней ноги лёжа на боку» — key не задан, id по индексу (0).
  assert.deepEqual(idsOf(exercises[0]), ['legs3-0-1', 'legs3-0-2']);
  // item[1] «Птица-собака» — key: 'bird-dog', id по key, а не по индексу (1).
  assert.deepEqual(idsOf(exercises[1]), ['legs3-bird-dog-1', 'legs3-bird-dog-2']);
});

test('перестановка упражнений внутри блока не меняет идентификатор отметки у упражнения с key', () => {
  const { document: doc1 } = makeDom();
  const before = renderWorkout(legsMwf, doc1);
  const beforeAll = [...before.querySelector('#legs3').querySelectorAll('input[data-mark]')].map(i => i.dataset.mark);

  const reordered = structuredClone(legsMwf);
  reordered.blocks.find(b => b.id === 'legs3').items.reverse();
  const { document: doc2 } = makeDom();
  const after = renderWorkout(reordered, doc2);
  const afterAll = [...after.querySelector('#legs3').querySelectorAll('input[data-mark]')].map(i => i.dataset.mark);

  // Суть находки: у упражнения с key ('bird-dog') идентификатор не меняется,
  // хотя оно переехало с позиции 1 на позицию 0.
  const keyedBefore = beforeAll.filter(id => id.includes('bird-dog'));
  const keyedAfter = afterAll.filter(id => id.includes('bird-dog'));
  assert.deepEqual(keyedAfter, keyedBefore);
  assert.deepEqual(keyedBefore, ['legs3-bird-dog-1', 'legs3-bird-dog-2']);

  // Контраст: у упражнения без key идентификатор строится по индексу и поэтому
  // меняется вместе с позицией (было legs3-0-*, стало legs3-1-*).
  const indexedBefore = beforeAll.filter(id => id.startsWith('legs3-0-'));
  const indexedAfter = afterAll.filter(id => id.startsWith('legs3-1-'));
  assert.deepEqual(indexedBefore, ['legs3-0-1', 'legs3-0-2']);
  assert.deepEqual(indexedAfter, ['legs3-1-1', 'legs3-1-2']);
});

test('у блока с одним кругом отметка подписана «Готово», у многокруговых — «Круг N»', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const start = fragment.querySelector('#start');
  assert.equal(start.querySelector('label.check').textContent, 'Готово');
  const circuit = fragment.querySelector('#circuit');
  const labels = [...circuit.querySelectorAll('.exercise')[0].querySelectorAll('label.check')].map(b => b.textContent);
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

test('вставка «как выполнять силовые пары» стоит между блоками circuit и legs1', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const order = [...fragment.children].map(n => (n.classList.contains('pair-rules') ? 'pair-rules' : n.id));
  const circuitIndex = order.indexOf('circuit');
  const pairIndex = order.indexOf('pair-rules');
  const legs1Index = order.indexOf('legs1');
  assert.equal(pairIndex, circuitIndex + 1, 'preamble должен идти сразу после circuit');
  assert.equal(legs1Index, pairIndex + 1, 'legs1 должен идти сразу после preamble');
});

test('в preamble ровно два элемента strong — с длительностями отдыха', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const strongs = [...fragment.querySelectorAll('.pair-rules strong')];
  assert.deepEqual(strongs.map(s => s.textContent), ['30–45 с отдыха', '60–90 с отдыха']);
});

test('заголовок preamble совпадает с оригиналом из src-original/app.js', () => {
  const original = extractOriginalPairRules();
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const h2 = fragment.querySelector('.pair-rules h2');
  assert.equal(h2.textContent, original.title);
});

test('текст preamble совпадает с оригиналом из src-original/app.js', () => {
  const original = extractOriginalPairRules();
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const ours = [...fragment.querySelectorAll('.pair-rules p')].map(p => p.textContent);
  assert.deepEqual(ours, original.paragraphs);
});

test('блок без preamble не порождает секцию pair-rules', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  // preamble задан только у одного из восьми блоков — секция должна быть ровно одна.
  assert.equal(fragment.querySelectorAll('.pair-rules').length, 1);
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
