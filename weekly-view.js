// Экран недельного объёма: собирает разметку из чисел (weekly.js), полос
// (load-bands.js) и названий групп (muscles.js). Своего расчёта здесь нет.
import { weeklySets } from './weekly.js';
import { verdictFor } from './load-bands.js';
import { muscleLabel } from './muscles.js';

// Дробные значения бывают только у нашего числа: вспомогательная доля 0.5 на
// нечётном числе кругов даёт половину. Сопоставимое всегда целое.
function formatSets(sets) {
  return String(sets).replace('.', ',');
}

function el(document, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Пометка «наша линия»: ровно у двух полос из пяти basis содержит эти слова
// («рабочий объём» — низ из источника, верх наш; «выше изученного» — целиком
// наш, общего порога перегрузки в источниках нет). Остальные три — «источник»
// (граница есть в исследовании) или «определение» (у «нуля» источника нет по
// смыслу, это не измерение) — специальной пометки не получают: смешивать их с
// «наша линия» значило бы стереть ровно ту разницу, ради которой пометка
// вообще существует.
//
// Показываем читателю сам факт, а не дословный basis: у полос он разной длины
// и формы («низ из источника, верх — наша линия» против «наша линия»), и
// пересказ целиком превратил бы строку с вердиктом в кашу из разнородного
// текста. Значение одно и то же для обеих полос: часть или вся граница —
// наше решение, не цитата.
const OUR_LINE = 'наша линия';

function verdictCell(document, band) {
  const cell = el(document, 'span', 'weekly-verdict', band.verdict);
  if (band.basis.includes(OUR_LINE)) {
    cell.append(' ', el(document, 'span', 'weekly-basis', OUR_LINE));
  }
  return cell;
}

export function renderWeekly({ host, workouts }) {
  const document = host.ownerDocument;
  host.textContent = '';

  const rows = [...weeklySets(workouts)]
    .map(([group, sets]) => ({ group, ...sets, band: verdictFor(sets.comparable) }))
    // По убыванию сопоставимого: вердикт считается по нему, и сверху должно
    // быть самое нагруженное. При равенстве — по нашему числу, потом по
    // названию, чтобы порядок не зависел от порядка словаря.
    .sort((a, b) => b.comparable - a.comparable
      || b.ours - a.ours
      || muscleLabel(a.group).localeCompare(muscleLabel(b.group), 'ru'));

  const list = el(document, 'div', 'weekly-list');
  for (const row of rows) {
    const line = el(document, 'div', 'weekly-row');
    line.append(
      el(document, 'span', 'weekly-name', muscleLabel(row.group)),
      el(document, 'span', 'weekly-main', formatSets(row.comparable)),
      el(document, 'span', 'weekly-ours', formatSets(row.ours)),
      verdictCell(document, row.band),
    );
    list.append(line);
  }

  host.append(
    el(document, 'p', 'weekly-head',
      'Подходов в неделю на группу мышц. Первое число — целевая работа, по нему и вердикт. Второе — как считает карта: вспомогательная работа идёт половиной.'),
    list,
    el(document, 'p', 'weekly-note',
      'Калькулятор считает количество, а не качество: доводите вы подход до отказа или нет, из данных не видно.'),
    el(document, 'p', 'weekly-note',
      'Односторонние упражнения в первом числе считаются по сторонам. Это наше чтение: договорённости об этом в проверенных источниках нет, в отличие от вспомогательной работы, для которой коэффициент половины назван прямо.'),
    el(document, 'p', 'weekly-note',
      'Пометка «наша линия» у вердикта — там, где границу провели мы, а не источник: общего порога в проверенных источниках нет, и число — наше решение.'),
  );
}
