// renderWeekly в изоляции от app.js и от реального реестра тренировок: своя
// синтетическая тренировка вместо WORKOUTS. Нужно затем, что реальная
// программа (legs-mwf, три дня в неделю) ни разу не поднимает сопоставимый
// объём выше 12 (см. test/weekly.test.js) — полосы «работает, но не
// оптимально» (1–4) и «выше изученного» (21+) через неё вообще не
// показать, а значит и пометку «наша линия» у «выше изученного» через
// test/weekly-section.test.js не проверить. Расчёт (weekly.js) и полосы
// (load-bands.js) проверены отдельно — здесь только разметка.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { renderWeekly } from '../weekly-view.js';

function host() {
  const { document } = makeDom('<!doctype html><html><body><div id="host"></div></body></html>');
  return document.getElementById('host');
}

// Один день, один блок, один пункт: rounds — то же самое, что и сопоставимый
// объём при days=[1], sides=1, share=1, поэтому границу полосы можно задеть
// напрямую числом кругов.
function fixture(load, rounds) {
  return {
    id: 'fixture',
    days: [1],
    blocks: [{
      id: 'b', n: '01', nav: 'Б', title: 'Блок', rounds,
      items: [{
        key: 'x', name: 'Упражнение', muscles: 'Мышцы', reps: '10', text: 'Текст',
        load, pattern: 'isolation', gear: ['none'], unilateral: false, kind: 'strength',
      }],
    }],
  };
}

function rowFor(h, ruName) {
  return [...h.querySelectorAll('.weekly-row')].find(row => row.textContent.includes(ruName));
}

test('«выше изученного» (21+, basis целиком наша линия) помечен пометкой', () => {
  const h = host();
  renderWeekly({ host: h, workouts: [fixture({ chest: 1 }, 22)] });
  const row = rowFor(h, 'Грудные');
  assert.match(row.querySelector('.weekly-verdict').textContent, /выше изученного/);
  const mark = row.querySelector('.weekly-basis');
  assert.ok(mark, 'нет пометки «наша линия» у вердикта, который весь — наша линия');
  assert.equal(mark.textContent, 'наша линия');
});

test('«работает, но не оптимально» (1–4, basis: источник) — без пометки', () => {
  const h = host();
  renderWeekly({ host: h, workouts: [fixture({ triceps: 1 }, 3)] });
  const row = rowFor(h, 'Трицепс');
  assert.match(row.querySelector('.weekly-verdict').textContent, /работает, но не оптимально/);
  assert.equal(row.querySelector('.weekly-basis'), null,
    'у границы, подтверждённой источником, не должно быть пометки «наша линия»');
});

test('«поддержание и слабый рост» (5–9, basis: источник) — без пометки', () => {
  const h = host();
  renderWeekly({ host: h, workouts: [fixture({ biceps: 1 }, 6)] });
  const row = rowFor(h, 'Бицепс');
  assert.match(row.querySelector('.weekly-verdict').textContent, /поддержание и слабый рост/);
  assert.equal(row.querySelector('.weekly-basis'), null);
});

// Раунд правок 1 (task-3-review.md, критическая находка 1): у «рабочего
// объёма» (10–20) basis смешанный — «низ из источника, верх — наша линия», и
// раньше пилюля стояла тут тоже (includes вместо ===). Но классификация ЛЮБОГО
// числа от 10 до 20 в эту полосу идёт по нижней границе — она из источника
// (Schoenfeld 2017: «десять и больше»), а не по нашей верхней. Прямой тест на
// это раньше был только через реальные данные (test/weekly-section.test.js,
// у ягодичных), теперь есть и на уровне модуля — 15 внутри диапазона, не на
// границе, чтобы не путать с потолком 20.
test('«рабочий объём» (10–20, basis: низ из источника, верх — наша линия) — без пометки', () => {
  const h = host();
  renderWeekly({ host: h, workouts: [fixture({ chest: 1 }, 15)] });
  const row = rowFor(h, 'Грудные');
  assert.match(row.querySelector('.weekly-verdict').textContent, /рабочий объём/);
  assert.equal(row.querySelector('.weekly-basis'), null,
    'вход в «рабочий объём» подтверждён источником — пометки «наша линия» тут быть не должно');
});

test('«не тренируется целенаправленно» (basis: определение) — тоже без пометки', () => {
  const h = host();
  // Пустая нагрузка: все двадцать групп получают ноль сопоставимых подходов.
  renderWeekly({ host: h, workouts: [fixture({}, 0)] });
  const row = rowFor(h, 'Бицепс');
  assert.match(row.querySelector('.weekly-verdict').textContent, /не тренируется целенаправленно/);
  assert.equal(row.querySelector('.weekly-basis'), null,
    '«определение» — не то же самое, что «наша линия», пометки быть не должно');
});

// Ревью (находка 7): .replace('.', ',') в formatSets ни разу не срабатывает на
// сегодняшних данных (у силовых блоков legs-mwf rounds всегда чётный, поэтому
// доля 0.5 всегда даёт целое) — ни один тест дробное число через эту функцию
// не гонял. Вход есть: доля 0.5 при нечётном rounds (здесь rounds:1) даёт
// дробное «наше» число, которое нельзя показывать с точкой — в русском тексте
// разделитель запятая. Сопоставимое при этом остаётся целым (нулём): доля 0.5
// в него не попадает вовсе (weekly.js).
test('дробное «наше» число показано через запятую, а не точку', () => {
  const h = host();
  renderWeekly({ host: h, workouts: [fixture({ chest: 0.5 }, 1)] });
  const row = rowFor(h, 'Грудные');
  assert.equal(row.querySelector('.weekly-ours').textContent, '0,5');
  assert.equal(row.querySelector('.weekly-main').textContent, '0');
});

// Ревью (находка 7): host.textContent = '' в начале renderWeekly ни разу не
// проверялась — сегодняшний единственный вызывающий (app.js) гарантирует не
// более одного вызова на host. Но renderWeekly — экспортируемая, отдельно
// тестируемая функция, а не деталь app.js, и её контракт («заполняет host» —
// см. её же комментарий-сигнатуру в шапке файла) не обещает «только один
// раз». Проверяем контракт напрямую: второй вызов на том же host заменяет
// содержимое, а не добавляет к нему.
test('повторный вызов renderWeekly на том же host заменяет разметку, а не добавляет к ней', () => {
  const h = host();
  renderWeekly({ host: h, workouts: [fixture({ chest: 1 }, 6)] });
  assert.equal(h.querySelectorAll('.weekly-row').length, 20, 'первый вызов должен дать все двадцать групп');
  renderWeekly({ host: h, workouts: [fixture({ biceps: 1 }, 6)] });
  assert.equal(h.querySelectorAll('.weekly-row').length, 20,
    'после второго вызова строк вдвое больше — старая разметка не была стёрта');
});
