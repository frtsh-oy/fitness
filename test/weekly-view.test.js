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

test('«не тренируется целенаправленно» (basis: определение) — тоже без пометки', () => {
  const h = host();
  // Пустая нагрузка: все двадцать групп получают ноль сопоставимых подходов.
  renderWeekly({ host: h, workouts: [fixture({}, 0)] });
  const row = rowFor(h, 'Бицепс');
  assert.match(row.querySelector('.weekly-verdict').textContent, /не тренируется целенаправленно/);
  assert.equal(row.querySelector('.weekly-basis'), null,
    '«определение» — не то же самое, что «наша линия», пометки быть не должно');
});
