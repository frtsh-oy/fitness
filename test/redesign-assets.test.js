// Новый вид держится на токенах style.css и на двух файлах шрифта. Тест сторожит
// то, что ломается молча: файл шрифта, на который ссылается CSS, переименовали;
// токен убрали; таблица цветов вкладок в tint.js разошлась с токенами; кнопочный
// тон стал слишком бледным под чернильный текст.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { makeDom } from './setup.js';
import { TINT_BASE, PAPER } from '../tint.js';

const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const html = read('index.html');

const { document } = makeDom();
const style = document.createElement('style');
style.textContent = read('style.css');
document.head.append(style);
const rules = [...document.styleSheets[0].cssRules];
const rootRule = rules.find(rule => rule.selectorText === ':root');
const token = name => rootRule.style.getPropertyValue(name).trim();

const FAMILIES = ['butter', 'peach', 'rose', 'mint', 'sky', 'lilac'];
// Основа, мягкий фон, текст на тоне, насыщенный, кнопочный, средний.
const SUFFIXES = ['', '-s', '-i', '-d', '-b', '-m'];

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map(index => {
    const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

test('все токены цвета объявлены на :root: шесть семейств по шесть тонов и нейтрали', () => {
  assert.ok(rootRule, 'правило :root найдено');
  for (const family of FAMILIES) {
    for (const suffix of SUFFIXES) {
      const name = `--${family}${suffix}`;
      assert.match(token(name), HEX, `${name} объявлен шестизначным цветом`);
    }
  }
  for (const name of ['--paper', '--surface', '--ink', '--ink2', '--ink3']) {
    assert.match(token(name), HEX, `${name} объявлен шестизначным цветом`);
  }
  for (const name of ['--hair', '--tonal', '--tonal2']) {
    assert.match(token(name), /^rgba\(/, `${name} — прозрачная чернильная заливка`);
  }
});

test('таблица цветов вкладок в tint.js совпадает с токенами style.css', () => {
  assert.deepEqual(Object.keys(TINT_BASE).sort(), [...FAMILIES].sort());
  for (const family of FAMILIES) {
    assert.equal(TINT_BASE[family].toLowerCase(), token(`--${family}`).toLowerCase(), family);
  }
  assert.equal(PAPER.toLowerCase(), token('--paper').toLowerCase());
});

test('ведущий цвет: по умолчанию пудра, остальные семейства выбирает data-tint на body', () => {
  const lead = ['', '-s', '-i', '-d', '-b', '-m'];
  for (const suffix of lead) {
    assert.equal(token(`--lead${suffix}`), `var(--rose${suffix})`, `--lead${suffix} по умолчанию — пудра`);
  }
  for (const family of FAMILIES.filter(name => name !== 'rose')) {
    const rule = rules.find(candidate => candidate.selectorText === `body[data-tint=${family}]`);
    assert.ok(rule, `для data-tint=${family} есть правило`);
    for (const suffix of lead) {
      assert.equal(rule.style.getPropertyValue(`--lead${suffix}`), `var(--${family}${suffix})`, `${family}${suffix}`);
    }
  }
});

// Цвет блока задаёт его тип (render.js, blockKind), и соответствие лежит в CSS.
test('цвет блока по типу: разминка — масло, круг — персик, силовые — небо, завершение — мята', () => {
  const expected = { warm: 'butter', circuit: 'peach', strength: 'sky', finish: 'mint' };
  for (const [kind, family] of Object.entries(expected)) {
    const rule = rules.find(candidate => candidate.selectorText === `[data-kind=${kind}]`);
    assert.ok(rule, `для data-kind=${kind} есть правило`);
    assert.equal(rule.style.getPropertyValue('--bc'), `var(--${family})`, kind);
    assert.equal(rule.style.getPropertyValue('--bcs'), `var(--${family}-s)`, kind);
  }
});

// Кнопочный тон светлый, и чернильный текст на нём обязан читаться уверенно:
// именно поэтому «тёмных» кнопок в дизайне нет, а светлое ничем не уступает
// по читаемости. Порог 8:1 — из спеки.
test('чернильный текст на кнопочных тонах — не менее 8:1, на мягких и основах — не менее 8:1', () => {
  for (const family of FAMILIES) {
    for (const suffix of ['', '-s', '-b']) {
      const ratio = contrast(token('--ink'), token(`--${family}${suffix}`));
      assert.ok(ratio >= 8, `--ink на --${family}${suffix}: ${ratio.toFixed(2)}`);
    }
  }
});

test('приглушённый текст читается: не менее 4.5:1 на бумаге и на каждом мягком фоне', () => {
  for (const ink of ['--ink2', '--ink3']) {
    assert.ok(contrast(token(ink), token('--paper')) >= 4.5, `${ink} на бумаге`);
    assert.ok(contrast(token(ink), token('--surface')) >= 4.5, `${ink} на белом`);
  }
  for (const family of FAMILIES) {
    for (const suffix of ['', '-s']) {
      const ratio = contrast(token('--ink2'), token(`--${family}${suffix}`));
      assert.ok(ratio >= 4.5, `--ink2 на --${family}${suffix}: ${ratio.toFixed(2)}`);
    }
  }
});

test('текст на тоне (-i) читается на своём мягком фоне и на основе: не менее 4.5:1', () => {
  for (const family of FAMILIES) {
    for (const suffix of ['', '-s']) {
      const ratio = contrast(token(`--${family}-i`), token(`--${family}${suffix}`));
      assert.ok(ratio >= 4.5, `--${family}-i на --${family}${suffix}: ${ratio.toFixed(2)}`);
    }
  }
});

// Рукописный шрифт — две подгруппы знаков (кириллица и латиница), каждая своим
// файлом, подключённым через unicode-range: браузер берёт только нужную.
// CSSOM jsdom у @font-face оставляет только семейство, начертание и насыщенность
// (src, unicode-range и font-display он отбрасывает), поэтому блоки читаются
// из текста файла.
test('Caveat подключён двумя файлами с unicode-range, и оба лежат в репозитории', () => {
  const faces = [...read('style.css').matchAll(/@font-face\s*\{([^}]*)\}/g)].map(match => match[1]);
  assert.equal(faces.length, 2, 'два @font-face: кириллица и латиница');

  const files = [];
  for (const face of faces) {
    assert.match(face, /font-family:\s*["']?Caveat["']?\s*;/);
    assert.match(face, /font-weight:\s*600\s*;/);
    assert.match(face, /font-display:\s*swap\s*;/, 'пока шрифт грузится, виден запасной');
    assert.match(face, /unicode-range:\s*U\+/, 'у каждой подгруппы свой unicode-range');
    const url = /url\(["']?([^"')]+)["']?\)/.exec(face);
    assert.ok(url, 'src содержит url()');
    assert.match(url[1], /^fonts\/[\w-]+\.woff2$/, 'свой файл из fonts/, а не чужой адрес');
    assert.ok(existsSync(new URL(url[1], root)), `${url[1]} лежит в репозитории`);
    files.push(url[1]);
  }
  assert.equal(new Set(files).size, 2, 'файлы разные');
});

test('лицензия шрифта лежит рядом с ним', () => {
  assert.ok(existsSync(new URL('fonts/OFL.txt', root)));
  assert.match(read('fonts/OFL.txt'), /SIL OPEN FONT LICENSE/i);
});

test('index.html заранее просит оба файла шрифта и берёт только существующие', () => {
  const { document: page } = makeDom(html);
  const preloads = [...page.querySelectorAll('link[rel=preload][as=font]')];
  assert.equal(preloads.length, 2);
  for (const link of preloads) {
    assert.equal(link.getAttribute('type'), 'font/woff2');
    assert.ok(link.hasAttribute('crossorigin'), 'шрифты грузятся с crossorigin, иначе браузер скачает файл дважды');
    assert.ok(existsSync(new URL(link.getAttribute('href'), root)), link.getAttribute('href'));
  }
});

test('страница открывается в цвете «Сегодня»: data-tint и theme-color совпадают с таблицей', () => {
  const { document: page } = makeDom(html);
  assert.equal(page.body.dataset.tint, 'rose');
  assert.equal(page.querySelector('meta[name="theme-color"]').getAttribute('content'), TINT_BASE.rose);
});
