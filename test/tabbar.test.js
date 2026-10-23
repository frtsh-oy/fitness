// Таймер в навигации. Само поведение таймера проверено в существующих тестах —
// здесь только его новое место: шторка и подпись пункта.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { startApp } from '../app.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const mount = () => {
  const { window } = makeDom(html);
  return { window, document: window.document };
};

test('полосы таймера во всю ширину больше нет', () => {
  const { window, document } = mount();
  startApp(window);
  assert.equal(document.querySelector('aside.timer'), null,
    'прежняя полоса должна быть убрана, а не спрятана стилями');
});

test('шторка закрыта по умолчанию и открывается пунктом «Отдых»', () => {
  const { window, document } = mount();
  startApp(window);
  const sheet = document.getElementById('timer-sheet');
  assert.equal(sheet.hidden, true);
  document.getElementById('timer-open').click();
  assert.equal(sheet.hidden, false);
  assert.equal(document.getElementById('timer-open').getAttribute('aria-expanded'), 'true');
});

test('крестик закрывает шторку', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  document.getElementById('timer-close').click();
  assert.equal(document.getElementById('timer-sheet').hidden, true);
});

test('пока отдых идёт, пункт показывает время вместо подписи', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  document.getElementById('timer-toggle').click();
  const label = document.getElementById('timer-open').textContent.trim();
  assert.match(label, /\d\d:\d\d/, `в пункте должно быть время, а не «${label}»`);
});

test('в покое пункт подписан «Отдых»', () => {
  const { window, document } = mount();
  startApp(window);
  assert.equal(document.getElementById('timer-open').textContent.trim(), 'Отдых');
});

// Спека требует: «пока отдых идёт — подсвечивается», и это про отсчёт, а не
// про открытую шторку. Закрытие шторки крестиком не останавливает отдых, и
// подсветка обязана пережить закрытие — иначе единственный намёк на идущее
// время исчезает, хотя оно всё ещё тикает.
test('подсветка пункта держится на отсчёте, а не на открытости шторки', () => {
  const { window, document } = mount();
  const app = startApp(window);
  const openButton = document.getElementById('timer-open');
  assert.equal(openButton.dataset.running, 'false', 'в покое пункт не подсвечен');

  openButton.click();
  document.getElementById('timer-toggle').click();
  assert.equal(openButton.dataset.running, 'true', 'во время отдыха пункт подсвечен');

  document.getElementById('timer-close').click();
  assert.equal(openButton.getAttribute('aria-expanded'), 'false', 'шторка и правда закрыта');
  // Тик после закрытия — не для отсчёта времени (он и так идёт), а чтобы
  // заставить перерисовку случиться уже ПОСЛЕ закрытия шторки: привязка к
  // sheet.hidden в этот момент дала бы false и погасила бы подсветку, привязка
  // к running — нет. Без этого тика мутация на sheet.hidden проходит случайно:
  // последняя перерисовка была ещё при открытой шторке.
  app.timer.tick();
  assert.equal(app.timer.running, true, 'отдых всё ещё идёт');
  assert.equal(openButton.dataset.running, 'true',
    'закрытие шторки не должно гасить подсветку идущего отсчёта');
});

// Раздел бесплатный: замка на пункте нет, и подписи про платность тоже. Значок и
// подпись держались вместе (значок для глаза, aria-label для диктора), поэтому
// сторожится и то и другое: остаться могло бы любое из двух.
test('у «Конструктора» нет замка и подписи про платность', () => {
  const { window, document } = mount();
  startApp(window);
  const button = document.querySelector('[data-section="builder"]');

  assert.equal(button.querySelector('.lock-badge'), null, 'значка платности нет');
  assert.equal(button.hasAttribute('aria-label'), false,
    'подпись пункта — его текст, а не отдельный aria-label про платность');
  assert.equal(button.textContent, 'Конструктор');

  button.click();
  assert.equal(document.getElementById('screen-builder').hidden, false,
    'пункт открывает раздел по тому же клику');
});

// Панель плавает над нижним краем, а шторка таймера стоит над панелью. Обе
// отсчитывают нижний край от одной и той же переменной безопасной зоны
// устройства, а не от двух экземпляров одной длинной формулы, которые кто-нибудь
// однажды поправит только в одном месте: иначе шторка либо наедет на подписи
// навигации на iPhone с домашней чертой, либо оставит над ней щель. Разбор идёт
// по CSSOM (как в тесте про порог телефона), а не по тексту файла: важно
// именно значение объявленного свойства.
test('.timer-sheet и .tabbar отсчитывают нижний край от общей CSS-переменной', () => {
  const { document } = makeDom();
  const style = document.createElement('style');
  style.textContent = readFileSync(fileURLToPath(new URL('../style.css', import.meta.url)), 'utf8');
  document.head.append(style);

  const rules = [...document.styleSheets[0].cssRules];
  const root = rules.find(rule => rule.selectorText === ':root');
  assert.ok(root, 'переменная безопасной зоны низа должна быть объявлена на :root');
  const formula = root.style.getPropertyValue('--tabbar-safe-bottom');
  assert.match(formula, /^max\(/, '--tabbar-safe-bottom обязана брать max(), а не сумму: env() и --tg-safe-area-inset-bottom описывают одну и ту же полосу устройства');

  const tabbar = rules.find(rule => rule.selectorText === '.tabbar');
  const sheet = rules.find(rule => rule.selectorText === '.timer-sheet');
  assert.ok(tabbar && sheet, 'правила .tabbar и .timer-sheet должны быть найдены');

  const bottomOf = rule => {
    const value = rule.style.getPropertyValue('bottom');
    const match = /^calc\((\d+)px \+ var\(--tabbar-safe-bottom\)\)$/.exec(value);
    assert.ok(match, `bottom обязан быть «calc(Npx + var(--tabbar-safe-bottom))», а он «${value}»`);
    return Number(match[1]);
  };
  const height = Number.parseInt(tabbar.style.getPropertyValue('height'), 10);
  assert.ok(height > 0, 'высота панели задана в пикселях');

  // Шторка над панелью с зазором 12px — тем же, что поле панели от края экрана.
  assert.equal(bottomOf(sheet), bottomOf(tabbar) + height + 12,
    'нижний край шторки: от панели вверх на её высоту и зазор 12px');
});

test('пункт «Отдых» не переключает раздел', () => {
  const { window, document } = mount();
  startApp(window);
  document.getElementById('timer-open').click();
  const shown = [...document.querySelectorAll('.screen')].filter(s => !s.hidden).map(s => s.id);
  assert.deepEqual(shown, ['screen-today'], 'шторка не должна менять раздел');
});

// До этой правки #timer-status жил внутри .timer-sheet, а шторка в покое
// стоит с атрибутом hidden (display:none). Штатный сценарий — человек включил
// отдых и закрыл шторку крестиком или вовсе не открывал её — оставлял запись
// в textContent недостижимой для экранного диктора: скрытый узел выпадает из
// дерева доступности вместе со всеми потомками. textContent при этом менялся
// как ни в чём не бывало, поэтому обычная проверка status.textContent эту
// поломку не ловит (см. остальные тесты файла и test/app.test.js) — здесь
// проверяется именно то, что скрытие шторки не в состоянии унести с собой.
test('область #timer-status не зависит от того, скрыта ли шторка', () => {
  const { window, document } = mount();
  const app = startApp(window);
  const status = document.getElementById('timer-status');

  const hasHiddenAncestor = () => {
    for (let node = status.parentElement; node; node = node.parentElement) {
      if (node.hidden) return true;
    }
    return false;
  };

  // Шторка закрыта по умолчанию (см. тест выше) — именно в этом состоянии
  // сообщение обязано быть достижимым для диктора.
  assert.equal(document.getElementById('timer-sheet').hidden, true);
  assert.equal(hasHiddenAncestor(), false,
    'ни один предок статуса не должен быть скрыт атрибутом hidden');

  // И сообщение по-прежнему доходит: конец отдыха, начатого с закрытой
  // шторкой, обязан дописаться в тот же узел, а не потеряться.
  document.querySelector('.presets button[data-time="20"]').click();
  document.getElementById('timer-toggle').click();
  for (let i = 0; i < 20; i += 1) app.timer.tick();
  assert.equal(status.textContent, 'Отдых закончен');
  assert.equal(hasHiddenAncestor(), false);
});
