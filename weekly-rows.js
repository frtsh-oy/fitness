// Строки недельного объёма: общая сборка для обоих потребителей одного
// расчёта — экрана (weekly-view.js) и раздела отчёта (tools/muscle-report.js).
// Соединяет расчёт (weekly.js), вердикт по нему (load-bands.js) и подпись
// группы (muscles.js) в готовые к показу строки, отсортированные для чтения.
// Ни DOM, ни разметки Markdown — то и другое чужое одному из двух
// потребителей, поэтому и не годилось быть внутри любого из них: раньше эта
// сборка была продублирована дословно в брифе на оба места (см. план,
// Ruling W9), а дословное повторение блока логики — отдельный дефект-класс.
import { weeklySets } from './weekly.js';
import { verdictFor } from './load-bands.js';
import { muscleLabel } from './muscles.js';

// Каждая строка — { group, label, ours, comparable, band }: band — это объект
// полосы целиком (verdict, basis, why, sources), а не только текст вердикта,
// потому что второму потребителю (отчёту) нужен ещё и basis.
//
// Сортировка — по убыванию сопоставимого: вердикт считается по нему, и сверху
// должно быть самое нагруженное. При равенстве — по нашему числу, потом по
// подписи, чтобы порядок не зависел от порядка словаря MUSCLES: на сегодняшних
// данных ничья — норма (шесть строк на 12, пять на 6, девять на 0), и оба
// тай-брейкера меняют порядок внутри неё (test/weekly-rows.test.js,
// test/weekly-section.test.js — «порядок внутри равного объёма»).
export function weeklyRows(workouts) {
  return [...weeklySets(workouts)]
    .map(([group, sets]) => ({
      group,
      label: muscleLabel(group),
      ours: sets.ours,
      comparable: sets.comparable,
      band: verdictFor(sets.comparable),
    }))
    .sort((a, b) => b.comparable - a.comparable
      || b.ours - a.ours
      || a.label.localeCompare(b.label, 'ru'));
}
