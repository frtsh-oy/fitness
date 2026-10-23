// Статья «На чём построены тренировки» (sources.html). Сторож держит две вещи:
// ссылки (каждая сноска ведёт на источник, каждый источник процитирован, входы
// из приложения попадают в существующие разделы) и числа, которые статья берёт
// из правил приложения: поменяли границу полосы или запас повторов в коде —
// статья не должна молча остаться со старым числом. Смысл каждой фразы сверен
// с источниками руками: таблица в docs/superpowers/specs/2026-10-22-sources-article-design.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { LOAD_BANDS } from '../load-bands.js';
import { LEVELS, SOFT_CEILING } from '../builder/rules.js';
import { renderWeekly } from '../weekly-view.js';

const read = file => readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');
const { document } = makeDom(read('sources.html'));
const ARTICLE = document.querySelector('main.article');
const text = node => node.textContent.replace(/\s+/g, ' ');

const SECTIONS = ['short', 'volume', 'frequency', 'order', 'reserve', 'progress', 'bands', 'ours', 'exercises', 'limits', 'literature'];

test('страница: заголовок, разделы по порядку, дорога назад в приложение', () => {
  assert.equal(document.documentElement.lang, 'ru');
  assert.equal(document.querySelector('h1').textContent, 'На чём построены тренировки');
  assert.deepEqual([...ARTICLE.querySelectorAll('[id]')].map(node => node.id).filter(id => SECTIONS.includes(id)), SECTIONS);
  assert.equal(document.querySelector('.sources-back').getAttribute('href'), './');
  assert.equal(document.body.dataset.tint, 'peach', 'страница красится тоном персика, как в макете');
  // Кнопка «Назад» в Telegram — через тот же слой, что у приложения.
  assert.match(document.querySelector('script[type="module"]').textContent, /from '\.\/telegram\.js'/);
});

test('каждая сноска ведёт на пункт литературы, и каждый пункт процитирован', () => {
  const items = [...document.querySelectorAll('.literature > li')];
  assert.deepEqual(items.map(li => li.id), items.map((_, i) => `lit-${i + 1}`));
  const cites = [...ARTICLE.querySelectorAll('a.cite')];
  assert.ok(cites.length > 0);
  for (const cite of cites) {
    const id = cite.getAttribute('href').slice(1);
    assert.ok(document.getElementById(id)?.closest('.literature'), `сноска ${cite.getAttribute('href')} ведёт мимо литературы`);
    assert.equal(cite.textContent, id.replace('lit-', ''), 'номер сноски совпадает с номером источника');
  }
  for (const item of items) {
    assert.ok(cites.some(cite => cite.getAttribute('href') === `#${item.id}`), `${item.id} в тексте ни разу не процитирован`);
  }
});

test('у научных источников есть DOI, у каждого — что из него взято; внешние ссылки открываются отдельно', () => {
  const items = [...document.querySelectorAll('.literature > li')];
  for (const item of items.slice(0, 5)) {
    assert.ok(item.querySelector('a[href^="https://doi.org/10."]'), `${item.id} без DOI`);
    assert.ok(item.querySelector('a[href^="https://pubmed.ncbi.nlm.nih.gov/"]'), `${item.id} без PubMed`);
  }
  assert.match(text(items[5]), /не научная публикация/, 'статья практиков подписана как таковая');
  for (const item of items) assert.match(item.querySelector('.literature-took').textContent, /^Что взяли: /);
  for (const link of document.querySelectorAll('a[href^="http"]')) {
    assert.match(link.href, /^https:\/\//, link.href);
    assert.equal(link.target, '_blank', link.href);
    assert.equal(link.rel, 'noopener', link.href);
  }
});

// Сноска — маленькая плашка с номером, без квадратных скобок вокруг. Номер
// сам по себе диктору ничего не говорит, поэтому у каждой есть подпись «Источник N».
test('сноски — плашки без скобок, у каждой подпись для чтения с экрана', () => {
  const cites = [...ARTICLE.querySelectorAll('a.cite')];
  assert.ok(cites.length > 0);
  for (const cite of cites) {
    assert.equal(cite.getAttribute('aria-label'), `Источник ${cite.textContent}`);
  }
  assert.doesNotMatch(text(ARTICLE), /\[\d/, 'вокруг сносок остались квадратные скобки');
});

test('ACSM расшифрована при первом упоминании', () => {
  const lead = text(document.querySelector('.article-lead'));
  assert.match(lead, /Американской коллегии спортивной медицины \(American College of Sports Medicine, ACSM\)/);
});

test('числа полос недельной нагрузки — те же, что в load-bands.js', () => {
  const volume = text(document.getElementById('volume'));
  const [none, low, mid, working] = LOAD_BANDS;
  assert.equal(none.max, 0);
  assert.match(volume, new RegExp(`1–${low.max} подхода — «${low.verdict}»`));
  assert.match(volume, new RegExp(`${low.max + 1}–${mid.max} — «${mid.verdict}»`));
  assert.match(volume, new RegExp(`${mid.max + 1}–${working.max} — «${working.verdict}»`));
  assert.equal(working.max, SOFT_CEILING);
  assert.match(volume, new RegExp(`верхнюю границу, ${SOFT_CEILING} подходов`));
});

test('запас повторов и число подходов по уровням — те же, что в builder/rules.js', () => {
  const reserve = text(document.getElementById('reserve'));
  const { beginner, intermediate, advanced } = LEVELS;
  assert.match(reserve, new RegExp(`Начальный уровень — за ${beginner.reserve} повтора, средний — за ${intermediate.reserve}, продвинутый — за ${advanced.reserve}`));
  const ours = text(document.getElementById('ours'));
  assert.equal(beginner.rounds, intermediate.rounds);
  assert.match(ours, new RegExp(`${beginner.rounds} на начальном и среднем уровне, ${advanced.rounds} на продвинутом`));
});

test('входы из приложения ведут на существующие разделы статьи', () => {
  const anchor = href => {
    const [file, hash] = href.split('#');
    assert.equal(file, 'sources.html', href);
    if (hash) assert.ok(document.getElementById(hash), `в статье нет раздела #${hash}`);
  };

  const { document: page } = makeDom(read('index.html'));
  const progression = page.querySelector('#progression .sources-link');
  assert.equal(progression.textContent, 'Почему так — источники');
  anchor(progression.getAttribute('href'));
  assert.equal(progression.getAttribute('href'), 'sources.html#progress');

  const { document: weeklyDoc } = makeDom('<!doctype html><html><body><div id="host"></div></body></html>');
  const host = weeklyDoc.getElementById('host');
  renderWeekly({ host, workouts: [] });
  const weekly = host.querySelector('.sources-link');
  assert.equal(weekly, host.lastElementChild, 'ссылка — последней строкой панели');
  assert.equal(weekly.getAttribute('href'), 'sources.html#volume');
  anchor(weekly.getAttribute('href'));
});
