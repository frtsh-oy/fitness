// weekly-rows.js — общая сборка строк для экрана (weekly-view.js) и отчёта
// (tools/muscle-report.js): расчёт (weekly.js) + вердикт (load-bands.js) +
// подпись группы (muscles.js), отсортированные. Сам расчёт и полосы проверены
// в своих файлах (test/weekly.test.js, test/load-bands.test.js) — здесь
// только композиция и сортировка, то, ради чего модуль и заведён.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyRows } from '../weekly-rows.js';
import { WORKOUTS } from '../workouts/index.js';

const all = Object.values(WORKOUTS);

test('строка соединяет число, вердикт и подпись группы — числа из данных, не из воздуха', () => {
  const rows = weeklyRows(all);
  const glutes = rows.find(r => r.group === 'glutes');
  assert.equal(glutes.label, 'Ягодичные');
  assert.equal(glutes.comparable, 12);
  assert.equal(glutes.ours, 18);
  assert.equal(glutes.band.verdict, 'рабочий объём');
  assert.equal(glutes.band.basis, 'низ из источника, верх — наша линия');

  const forearms = rows.find(r => r.group === 'forearms');
  assert.equal(forearms.label, 'Предплечья');
  assert.equal(forearms.comparable, 0);
  assert.equal(forearms.ours, 18);
  assert.equal(forearms.band.verdict, 'не тренируется целенаправленно');
  assert.equal(forearms.band.basis, 'определение');
});

test('в ответе все двадцать групп', () => {
  assert.equal(weeklyRows(all).length, 20);
});

// Синтетические тренировки, а не реальная программа: каждая фикстура нагружает
// только одну группу, что даёт точный контроль над comparable/ours у неё, не
// трогая остальные девятнадцать (у них будет 0/0, и это не мешает проверке
// относительного порядка двух конкретных групп).
function fixture({ days, rounds, load }) {
  return {
    id: 'f', days,
    blocks: [{ id: 'b', n: '01', nav: 'Б', title: 'Блок', rounds, items: [
      { key: 'x', name: 'Упражнение', muscles: 'Мышцы', reps: '10', text: 'Текст',
        load, pattern: 'isolation', gear: ['none'], unilateral: false, kind: 'strength' },
    ] }],
  };
}

// Числа подобраны так, чтобы comparable и ours у двух групп были в ОБРАТНОМ
// порядке относительно друг друга: у квадрицепсов больше сопоставимое (10
// против 1), но меньше наше (10 против 16 — у задней поверхности бедра
// вспомогательная доля в отдельном блоке той же тренировки поднимает ours,
// не трогая comparable). Первая версия этого теста брала фикстуру, где оба
// числа у каждой группы совпадали (только целевая доля, без вспомогательной)
// — сортировка по ours вместо comparable проходила бы её незамеченной: числа
// совпадали и порядок получался тем же самым. Заменено после того, как
// мутация «сортировать по ours» это подтвердила зелёным.
test('первый уровень сортировки — по убыванию сопоставимого объёма, а не нашего числа', () => {
  const quads = fixture({ days: [1], rounds: 10, load: { quads: 1 } }); // comparable 10, ours 10
  const hamstrings = {
    id: 'h', days: [1],
    blocks: [
      { id: 'b1', n: '01', nav: 'Б', title: 'Блок', rounds: 1,
        items: [{ key: 'x1', name: 'Целевое', muscles: 'М', reps: '10', text: '', load: { hamstrings: 1 },
          pattern: 'isolation', gear: ['none'], unilateral: false, kind: 'strength' }] },
      { id: 'b2', n: '02', nav: 'Б', title: 'Блок 2', rounds: 30,
        items: [{ key: 'x2', name: 'Вспомогательное', muscles: 'М', reps: '10', text: '', load: { hamstrings: 0.5 },
          pattern: 'isolation', gear: ['none'], unilateral: false, kind: 'strength' }] },
    ],
  }; // comparable 1 (только первый блок), ours 1 + 15 = 16

  const rows = weeklyRows([quads, hamstrings]);
  const q = rows.find(r => r.group === 'quads');
  const h = rows.find(r => r.group === 'hamstrings');
  assert.equal(q.comparable, 10);
  assert.equal(h.comparable, 1);
  assert.equal(q.ours, 10);
  assert.equal(h.ours, 16, 'у задней поверхности бедра наше число должно быть больше, чем у квадрицепсов, — иначе тест ничего не отличает');

  assert.deepEqual(rows.slice(0, 2).map(r => r.label), ['Квадрицепсы', 'Задняя поверхность бедра'],
    'сопоставимое у квадрицепсов больше (10 против 1) — они обязаны идти первыми, хотя наше число у них меньше (10 против 16)');
});

// Тай-брейкер 2: равный comparable, разный ours. Триера и бицепс получают
// одинаковый comparable=4 (по одному целевому упражнению на рounds=4), но у
// трицепса вдобавок вспомогательная доля того же блока — она поднимает ours,
// не трогая comparable (weekly.js: share 0.5 не считается в comparable).
// «Бицепс» < «Трицепс» по алфавиту — если бы тай-брейкер по ours был удалён из
// компаратора, сортировка откатилась бы на локаль и поставила бы «Бицепс»
// первым; тест ловит именно такую мутацию.
test('второй уровень сортировки — по убыванию нашего числа при равном сопоставимом', () => {
  const rows = weeklyRows([{
    id: 'f', days: [1],
    blocks: [{ id: 'b', n: '01', nav: 'Б', title: 'Блок', rounds: 4, items: [
      { key: 't1', name: 'T1', muscles: 'М', reps: '10', text: '', load: { triceps: 1 },
        pattern: 'isolation', gear: ['none'], unilateral: false, kind: 'strength' },
      { key: 't2', name: 'T2', muscles: 'М', reps: '10', text: '', load: { triceps: 0.5 },
        pattern: 'isolation', gear: ['none'], unilateral: false, kind: 'strength' },
      { key: 'b1', name: 'B1', muscles: 'М', reps: '10', text: '', load: { biceps: 1 },
        pattern: 'isolation', gear: ['none'], unilateral: false, kind: 'strength' },
    ] }],
  }]);
  const triceps = rows.find(r => r.group === 'triceps');
  const biceps = rows.find(r => r.group === 'biceps');
  assert.equal(triceps.comparable, 4);
  assert.equal(biceps.comparable, 4);
  assert.equal(triceps.ours, 6, 'вспомогательная доля должна поднять наше число трицепса выше сопоставимого');
  assert.equal(biceps.ours, 4);
  assert.deepEqual(rows.slice(0, 2).map(r => r.label), ['Трицепс', 'Бицепс'],
    'при равном сопоставимом большее наше число должно идти первым, вопреки алфавиту («Бицепс» < «Трицепс»)');
});

// Тай-брейкер 3: равны и comparable, и ours — остаётся только алфавит.
// «Грудные» и «Квадрицепсы» получают ровно по одному целевому подходу × 2
// круга: comparable = ours = 2 у обеих, разница может быть только в подписи.
test('третий уровень сортировки — по подписи группы при равенстве обоих чисел', () => {
  const rows = weeklyRows([
    fixture({ days: [1], rounds: 2, load: { quads: 1 } }),
    fixture({ days: [1], rounds: 2, load: { chest: 1 } }),
  ]);
  const chest = rows.find(r => r.group === 'chest');
  const quads = rows.find(r => r.group === 'quads');
  assert.equal(chest.comparable, quads.comparable);
  assert.equal(chest.ours, quads.ours);
  assert.deepEqual(rows.slice(0, 2).map(r => r.label), ['Грудные', 'Квадрицепсы'],
    '«Грудные» должны стоять раньше «Квадрицепсы» по алфавиту при полном равенстве чисел');
});
