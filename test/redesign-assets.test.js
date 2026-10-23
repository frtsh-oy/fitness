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
const player = document.createElement('style');
player.textContent = read('player.css');
document.head.append(player);
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

test('статья открывается в цвете «Источников»: data-tint, theme-color и шрифты, как у приложения', () => {
  const { document: page } = makeDom(read('sources.html'));
  assert.equal(page.body.dataset.tint, 'peach');
  assert.equal(page.querySelector('meta[name="theme-color"]').getAttribute('content'), TINT_BASE.peach);
  const hrefs = doc => [...doc.querySelectorAll('link[rel=preload][as=font]')].map(link => link.getAttribute('href'));
  assert.equal(hrefs(page).length, 2);
  assert.deepEqual(hrefs(page), hrefs(makeDom(html).document), 'статья просит те же файлы шрифта, что и приложение');
});

// ---------- цвета только токенами ----------

const SHEETS = ['style.css', 'player.css'];

// Все шестизначные цвета прежнего оформления (тёмно-синий бренд, лаймовый акцент
// и их производные) из style.css, player.css, index.html и sources.html до
// 2026-10-23. Ни в стилях, ни в разметке, ни в значках вернуться не должны.
const OLD_BRAND_COLORS = [
  '101010', '152d4a', '162c19', '193d6a', '294525', '33475f', '344e70', '345316', '39571b', '4267cb',
  '46566b', '486386', '4b6a22', '526278', '526982', '53637a', '557126', '61748b', '657289', '665846',
  '7089a8', '7590b2', '7a4a06', 'a3bc65', 'aac94d', 'c49346', 'cad6e4', 'ceef69', 'd2dce8', 'd4dde8',
  'd7e0ed', 'd8e1eb', 'd9e0e9', 'dbe3ed', 'e0e8f3', 'e0edc2', 'e2e9f2', 'e4edf8', 'e6f0d1', 'e8edf4',
  'edf3fb', 'eef3fa', 'f2f5f8', 'f3f7fc', 'f4f6f9', 'fbe4bd', 'fff8d6', 'fff8ed',
];

test('цвета прежнего оформления нигде не остались: ни в стилях, ни в разметке, ни в значках', () => {
  for (const name of [...SHEETS, 'index.html', 'sources.html']) {
    const text = read(name);
    for (const color of OLD_BRAND_COLORS) {
      assert.doesNotMatch(text, new RegExp(`(?:#|%23)${color}`, 'i'), `${name}: старый цвет #${color}`);
    }
  }
});

test('вне :root цвета записаны токенами, а не числами (допустимы только #fff и #000 в масках)', () => {
  for (const name of SHEETS) {
    const outside = read(name).replace(/:root\{[\s\S]*?\n\}/, '');
    assert.deepEqual(outside.match(/#[0-9a-fA-F]{6}\b/g) ?? [], [], `${name}: цвет записан шестизначным числом, а не токеном`);
  }
});

// Тёмные кнопки владелец просил убрать («из стиля выбивается»): у кнопок, чипов
// и переключателей заливки светлые, тёмные токены (чернила, -d, -i) и цвета
// числом им не годятся. Тёмная заливка фона встречается только там, где это не
// нажимаемое: значок-маска, маркер списка, точка, затемнение за шторкой, фон под
// видео. Каждое такое правило названо здесь с причиной; новое правило с тёмным
// фоном роняет тест и требует либо светлого тона, либо записи в этом списке.
const DARK_FILL = /var\(--(?:ink[23]?|[a-z]+-[di]|lead-[di])\)|#(?!fff\b)[0-9a-f]{3,6}\b|rgba?\((?!\s*255)/i;
const DARK_FILL_ALLOWED = new Map([
  ['.workout-block.is-done .block-number::after', 'галочка «сделано»: чернильный значок-маска'],
  ['.check input:checked+span::after', 'галочка отметки: чернильный значок-маска'],
  ['.guide li::before', 'чёрточка маркера списка'],
  ['.article-app li::before,.article-list li::before', 'точки маркеров статьи'],
  ['.article-app li::before', 'точки маркеров плашки «В приложении»'],
  ['.library-filter .dot', 'точка «фильтры выбраны» на кнопке'],
  ['.scrim', 'затемнение за шторкой: прозрачные чернила'],
  ['.player-shell iframe', 'фон под видео, пока оно не загрузилось'],
]);

function darkFills() {
  const found = [];
  const walk = list => {
    for (const rule of list) {
      if (rule.selectorText && rule.style) {
        for (const prop of ['background', 'background-color']) {
          const value = rule.style.getPropertyValue(prop);
          if (value && DARK_FILL.test(value)) found.push(rule.selectorText.replace(/\s*,\s*/g, ','));
        }
      } else if (rule.cssRules) walk(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) walk(sheet.cssRules);
  return [...new Set(found)];
}

test('тёмная заливка фона — только у значков, маркеров и подложек из списка, не у кнопок', () => {
  const found = darkFills();
  for (const selector of found) {
    assert.ok(DARK_FILL_ALLOWED.has(selector), `правило «${selector}» заливает фон тёмным: у нажимаемого заливка светлая`);
  }
  for (const selector of DARK_FILL_ALLOWED.keys()) {
    assert.ok(found.includes(selector), `правила «${selector}» с тёмным фоном больше нет — убери его из списка`);
  }
});
