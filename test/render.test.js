import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeDom } from './setup.js';
import { renderWorkout, renderIntro, markId, videoUrl, scheduleShort, scheduleLong } from '../render.js';
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

// Страница для renderIntro — те же узлы, что в index.html, включая оба места
// с расписанием. Первым стоит чужой .eyebrow: на реальной странице тем же
// классом набран заголовок «ДАЛЬШЕ — СИЛЬНЕЕ» в .guide, и выборка по классу
// взяла бы его.
const INTRO_PAGE = `<!doctype html><html><body>
  <header class="masthead"><span class="schedule">ПН · СР · ПТ</span></header>
  <p class="eyebrow">ДАЛЬШЕ — СИЛЬНЕЕ</p>
  <p class="eyebrow" id="kicker"></p><h1></h1><p class="intro-copy"></p>
  <div class="facts"></div><nav class="block-nav"></nav>
  <div class="equipment"></div><ol id="progression-list"></ol><div id="care"></div>
  <footer>Понедельник · Среда · Пятница<span>Между тренировками — день восстановления.</span></footer>
</body></html>`;

test('markId собирает идентификатор из блока, ключа упражнения и круга', () => {
  assert.equal(markId('legs1', 'rdl', 1), 'legs1-rdl-1');
  assert.equal(markId('circuit', 'knee-raise', 2), 'circuit-knee-raise-2');
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

test('идентификатор отметки строится по item.key, а не по позиции упражнения', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const legs3 = fragment.querySelector('#legs3');
  const exercises = [...legs3.querySelectorAll('.exercise')];
  const idsOf = article => [...article.querySelectorAll('input[data-mark]')].map(i => i.dataset.mark);

  // Ни один идентификатор не содержит позиции: оба упражнения блока — по ключу.
  assert.deepEqual(idsOf(exercises[0]), ['legs3-side-leg-raise-1', 'legs3-side-leg-raise-2']);
  assert.deepEqual(idsOf(exercises[1]), ['legs3-bird-dog-1', 'legs3-bird-dog-2']);
});

// key обязателен у каждого упражнения — это проверяет валидатор. Рендерер
// на его отсутствие не рассчитывает, и подстраховки «взять индекс» у него нет:
// такая подстраховка тихо вернула бы переезжающие отметки.
test('идентификаторы всех отметок построены по ключам упражнений', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const expected = legsMwf.blocks.flatMap(block => block.items.flatMap(
    item => Array.from({ length: block.rounds }, (_, r) => `${block.id}-${item.key}-${r + 1}`)));
  const actual = [...fragment.querySelectorAll('input[data-mark]')].map(i => i.dataset.mark);
  assert.deepEqual(actual, expected);
});

// Ради чего key вообще нужен: вставка или перестановка упражнений не должна
// переносить чужие отметки. Раньше этим свойством обладали три упражнения из
// девятнадцати, у остальных идентификатор строился по позиции.
test('перестановка упражнений внутри блока не меняет ни одного идентификатора отметки', () => {
  const { document: doc1 } = makeDom();
  const before = renderWorkout(legsMwf, doc1);
  const idsOf = fragment => [...fragment.querySelector('#legs3').querySelectorAll('input[data-mark]')]
    .map(i => i.dataset.mark).sort();

  const reordered = structuredClone(legsMwf);
  reordered.blocks.find(b => b.id === 'legs3').items.reverse();
  const { document: doc2 } = makeDom();
  const after = renderWorkout(reordered, doc2);

  assert.deepEqual(idsOf(after), idsOf(before));
  assert.deepEqual(idsOf(before),
    ['legs3-bird-dog-1', 'legs3-bird-dog-2', 'legs3-side-leg-raise-1', 'legs3-side-leg-raise-2']);
});

// Та же проверка для вставки нового упражнения в начало блока: именно этот
// случай ломал отметки шестнадцати упражнений из девятнадцати.
test('вставка упражнения в начало блока не трогает идентификаторы соседей', () => {
  const { document: doc1 } = makeDom();
  const before = renderWorkout(legsMwf, doc1);
  const idsOf = fragment => [...fragment.querySelector('#legs2').querySelectorAll('input[data-mark]')]
    .map(i => i.dataset.mark);

  const withNew = structuredClone(legsMwf);
  const block = withNew.blocks.find(b => b.id === 'legs2');
  block.items.unshift({ ...block.items[0], key: 'новое', name: 'Новое упражнение' });
  const { document: doc2 } = makeDom();
  const after = renderWorkout(withNew, doc2);

  const newIds = idsOf(after).filter(id => id.includes('новое'));
  assert.equal(newIds.length, block.rounds, 'новое упражнение не получило своих отметок');
  assert.deepEqual(idsOf(after).filter(id => !id.includes('новое')), idsOf(before));
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
  // Первым стоит чужой .eyebrow — на реальной странице тем же классом набран
  // заголовок «ДАЛЬШЕ — СИЛЬНЕЕ» в .guide. Выборка по классу взяла бы его.
  const { document } = makeDom(INTRO_PAGE);
  renderIntro(legsMwf, document);
  assert.equal(document.getElementById('kicker').textContent, legsMwf.kicker);
  assert.equal(document.querySelector('.eyebrow').textContent, 'ДАЛЬШЕ — СИЛЬНЕЕ', 'чужой .eyebrow не тронут');
  assert.equal(document.querySelector('h1').childNodes[0].textContent, 'Всё тело.');
  assert.equal(document.querySelector('h1').querySelector('span').textContent, 'Акцент на ноги.');
  assert.equal(document.querySelector('.intro-copy').textContent, legsMwf.lead);
  assert.equal(document.querySelectorAll('.facts > div').length, legsMwf.stats.length);
  assert.equal(document.querySelector('.equipment').textContent, legsMwf.equipment);
  assert.equal(document.querySelectorAll('#progression-list li').length, legsMwf.progression.length);
});

test('renderIntro строит навигацию по реальным блокам', () => {
  const { document } = makeDom(INTRO_PAGE);
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

// ФИНАЛЬНОЕ РЕВЬЮ, пункты 4 и 7: расписание было зашито в index.html дважды и
// не рендерилось ниоткуда. Тренировка с другими днями получала бы чужое
// расписание в обоих местах, и ни один тест бы этого не заметил.

test('scheduleShort и scheduleLong строят обе формы расписания из дней недели', () => {
  assert.equal(scheduleShort([1, 3, 5]), 'ПН · СР · ПТ');
  assert.equal(scheduleLong([1, 3, 5]), 'Понедельник · Среда · Пятница');
  assert.equal(scheduleShort([2, 4]), 'ВТ · ЧТ');
  assert.equal(scheduleLong([6, 7]), 'Суббота · Воскресенье');
});

test('неизвестный день недели роняет рендер, а не печатает undefined', () => {
  assert.throws(() => scheduleShort([8]), /8/);
});

test('renderIntro ставит расписание и в шапку, и в подвал — из дней тренировки', () => {
  const { document } = makeDom(INTRO_PAGE);
  renderIntro(legsMwf, document);
  assert.equal(document.querySelector('.masthead .schedule').textContent, 'ПН · СР · ПТ');
  assert.equal(document.querySelector('footer').textContent,
    'Понедельник · Среда · ПятницаМежду тренировками — день восстановления.');
});

// Та же страница и другая тренировка: если бы расписание бралось из разметки,
// оба места остались бы понедельничными и тест бы этого не показал.
test('тренировка с другими днями получает своё расписание в обоих местах', () => {
  const { document } = makeDom(INTRO_PAGE);
  renderIntro({ ...legsMwf, days: [2, 4] }, document);
  assert.equal(document.querySelector('.masthead .schedule').textContent, 'ВТ · ЧТ');
  assert.match(document.querySelector('footer').textContent, /^Вторник · Четверг/);
  assert.match(document.querySelector('footer').textContent,
    /Между тренировками — день восстановления\.$/, 'примечание в подвале потерялось');
});

// ЗАДАЧА 9: описания упражнений под нажатием. Карточка была высотой от 309 до
// 636px, и девятнадцать таких карточек растягивали страницу телефона 375×812
// на шестнадцать экранов. Под кнопку ушли только тексты техники (text, detail,
// extra) — то, что нужно в первые разы; всё, чем пользуются по ходу
// тренировки, осталось на виду.

// Область раскрытия ищем внутри фрагмента, а не через document.getElementById:
// фрагмент в документ не вставлен, и getElementById его содержимого не видит.
// Селектор по атрибуту, а не #id: ключи упражнений бывают с кириллицей
// (см. тест про вставку упражнения выше), и её пришлось бы экранировать.
function howtoOf(fragment, article) {
  const button = article.querySelector('.howto-toggle');
  assert.ok(button, 'у упражнения есть кнопка раскрытия');
  const id = button.getAttribute('aria-controls');
  return { button, region: fragment.querySelector(`[id="${id}"]`) };
}

test('у каждого из 19 упражнений есть кнопка «Как выполнять» с aria-expanded', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const buttons = [...fragment.querySelectorAll('.exercise .howto-toggle')];
  assert.equal(buttons.length, 19);
  for (const button of buttons) {
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.type, 'button');
    assert.match(button.textContent, /^Как выполнять/);
    assert.ok(button.hasAttribute('aria-expanded'), 'кнопка несёт aria-expanded');
  }

  // Имя для диктора называет упражнение — как у ссылки на видео и у отметок.
  // Без этого при обходе по кнопкам девятнадцать раз подряд звучит одно и то
  // же «Как выполнять». Видимая подпись стоит в начале имени: так кнопку
  // находит и голосовое управление.
  const names = buttons.map(button => button.getAttribute('aria-label'));
  assert.equal(new Set(names).size, 19, 'имена кнопок различны');
  for (const [index, article] of [...fragment.querySelectorAll('.exercise')].entries()) {
    assert.equal(names[index], `Как выполнять: ${article.querySelector('h3').textContent}`);
  }
});

// Если бы уголок нарисовали текстом или забыли, поворачивать в раскрытом виде
// было бы нечего: поворот задан в style.css селектором по этому классу.
test('в кнопке раскрытия есть значок-уголок, спрятанный от диктора', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const caret = fragment.querySelector('.exercise .howto-toggle .howto-caret');
  assert.ok(caret, 'уголок нарисован');
  assert.equal(caret.getAttribute('aria-hidden'), 'true');
});

// Главная проверка: текст техники лежит ВНУТРИ управляемой области и больше
// нигде. Без второй половины (в остатке карточки текста нет) тест прошёл бы и
// на карточке, где абзацы просто продублированы наружу, — то есть где
// сворачивание ничего не сворачивает.
test('text, detail и extra лежат внутри области, которой управляет кнопка', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const item = legsMwf.blocks.find(block => block.id === 'legs1').items
    .find(candidate => candidate.key === 'adduction');
  const article = [...fragment.querySelectorAll('#legs1 .exercise')]
    .find(node => node.querySelector('h3').textContent === item.name);
  const { region } = howtoOf(fragment, article);

  assert.ok(region, 'aria-controls указывает на существующий узел');
  for (const [field, text] of [['text', item.text], ['detail', item.detail], ['extra', item.extra]]) {
    assert.ok(region.textContent.includes(text), `${field} внутри области раскрытия`);
  }

  const rest = article.cloneNode(true);
  rest.querySelector(`[id="${region.id}"]`).remove();
  for (const [field, text] of [['text', item.text], ['detail', item.detail], ['extra', item.extra]]) {
    assert.ok(!rest.textContent.includes(text), `${field} нигде, кроме области раскрытия`);
  }
});

test('у упражнения без detail и extra в области раскрытия ровно один абзац', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const item = legsMwf.blocks.find(block => block.id === 'finish').items
    .find(candidate => candidate.key === 'breathing');
  assert.equal(item.detail, undefined, 'у дыхания и правда нет подробностей');
  const article = [...fragment.querySelectorAll('#finish .exercise')]
    .find(node => node.querySelector('h3').textContent === item.name);
  const { region } = howtoOf(fragment, article);

  const paragraphs = [...region.querySelectorAll('p')];
  assert.equal(paragraphs.length, 1, 'пустых абзацев не рисуется');
  assert.equal(paragraphs[0].textContent, item.text);
});

// Кнопка обязана управлять своей областью: одинаковые id развели бы
// aria-controls по чужим карточкам, и диктор с уголком показывали бы соседа.
test('каждая кнопка управляет областью своего упражнения', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const articles = [...fragment.querySelectorAll('.exercise')];
  const ids = [];
  for (const article of articles) {
    const { button, region } = howtoOf(fragment, article);
    ids.push(button.getAttribute('aria-controls'));
    assert.ok(region, `область ${button.getAttribute('aria-controls')} существует`);
    assert.equal(region.closest('.exercise'), article, 'область лежит в своей карточке');
  }
  assert.equal(new Set(ids).size, 19, 'все идентификаторы областей разные');
});

// Требование владельца: в свёрнутом виде остаются название, повторы, мышцы,
// ссылка на видео и отметка. Ревью прошлой итерации ловило дефект «счётчик
// считал отметки за пределами экрана» — этот тест сторожит ровно его причину:
// ни одна отметка и ни одна ссылка на видео не должна оказаться под hidden.
test('свёрнутая карточка скрывает только тексты техники', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document, { expandDescriptions: false });
  const articles = [...fragment.querySelectorAll('.exercise')];
  assert.equal(articles.length, 19);

  for (const article of articles) {
    const { button, region } = howtoOf(fragment, article);
    assert.equal(button.getAttribute('aria-expanded'), 'false');
    assert.equal(region.hidden, true, 'область текста скрыта');

    for (const selector of ['h3', '.reps', '.muscles', 'a.video', 'input[data-mark]', '.howto-toggle']) {
      for (const node of article.querySelectorAll(selector)) {
        assert.equal(node.closest('[hidden]'), null, `${selector} остался на виду`);
      }
    }
  }
  // Ровно то, что ниже проверяется поимённо: отметок на странице столько же,
  // сколько их всего у тренировки, и ни одна не спрятана.
  const marks = [...fragment.querySelectorAll('input[data-mark]')];
  assert.equal(marks.length, countMarks(legsMwf));
  assert.equal(marks.filter(box => box.closest('[hidden]')).length, 0);
});

test('на широком экране описания отрисованы раскрытыми', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document, { expandDescriptions: true });
  const articles = [...fragment.querySelectorAll('.exercise')];
  assert.equal(articles.length, 19);
  for (const article of articles) {
    const { button, region } = howtoOf(fragment, article);
    assert.equal(button.getAttribute('aria-expanded'), 'true');
    assert.equal(region.hidden, false, 'область текста видна');
  }
});

// Значение по умолчанию — это обещание в сигнатуре renderWorkout: вызов без
// параметров рисует телефонное состояние. Без этой проверки обещание держалось
// бы только на словах комментария: все остальные тесты передают флаг явно.
test('renderWorkout без параметров рисует описания свёрнутыми', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const { button, region } = howtoOf(fragment, fragment.querySelector('.exercise'));
  assert.equal(button.getAttribute('aria-expanded'), 'false');
  assert.equal(region.hidden, true);
});

// РАУНД ПРАВОК 2: кнопка «Как выполнять» и ссылка на видео — в одну строку,
// отметки — своей строкой ниже. Строка из трёх (с отметками) не влезает никогда:
// отметок на карточке от одной до трёх, и с подписями «Круг N» трём элементам
// нужно от 348 до 591px при 317 доступных на экране 375px.
//
// Раскладку в jsdom не посчитать, поэтому тест сторожит то, на чём она держится:
// состав строки. Видео за её пределами вернуло бы столбик, а отметки внутри —
// раскладку, которая по ширине не сходится и у которой палец промахивается.
test('в строке карточки только кнопка «Как выполнять» и видео, отметки — снаружи', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  const articles = [...fragment.querySelectorAll('.exercise')];
  assert.equal(articles.length, 19);

  let withVideo = 0;
  for (const article of articles) {
    const refs = article.querySelector('.exercise-refs');
    assert.ok(refs, 'строка есть у каждого упражнения');
    assert.equal(refs.firstElementChild, article.querySelector('.howto-toggle'),
      'кнопка раскрытия — первая в строке');

    const video = article.querySelector('a.video');
    if (video) {
      withVideo += 1;
      assert.equal(video.parentNode, refs, 'ссылка на видео лежит в той же строке');
      assert.equal(refs.children.length, 2, 'в строке ровно два элемента');
      assert.equal(refs.lastElementChild, video, 'видео — второе, а не перед кнопкой');
    } else {
      assert.equal(refs.children.length, 1, 'без видео в строке остаётся одна кнопка');
    }

    // Отметки — своей строкой: ни одна не внутри строки, и .checks — прямой
    // ребёнок карточки, а не её часть.
    assert.equal(refs.querySelectorAll('input[data-mark]').length, 0);
    assert.equal(refs.querySelector('.checks'), null);
    assert.equal(article.querySelector('.checks').parentNode, article);
  }
  assert.equal(withVideo, 18, 'видео есть у восемнадцати упражнений из девятнадцати');
});

// Область с текстом раскрывается ПОД строкой, а не между кнопкой и видео:
// иначе раскрытие разрывало бы строку пополам.
test('область раскрытия стоит следом за строкой, а не внутри неё', () => {
  const { document } = makeDom();
  const fragment = renderWorkout(legsMwf, document);
  for (const article of [...fragment.querySelectorAll('.exercise')]) {
    const { region } = howtoOf(fragment, article);
    const refs = article.querySelector('.exercise-refs');
    assert.equal(region.parentNode, article, 'область — прямой ребёнок карточки');
    assert.equal(refs.nextElementSibling, region, 'область идёт сразу за строкой');
  }
});
