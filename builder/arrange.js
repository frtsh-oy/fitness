// Порядок силовых упражнений и разбиение на пары. Чистая функция от записей
// библиотеки: ни случайности, ни обращения к хранилищу, поэтому одна и та же
// тренировка всегда раскладывается одинаково — как при подборе, так и при
// развёртке сохранённой записи.
import { BIG_GROUPS } from './rules.js';

// Целевые группы упражнения — те, где доля 1. Вспомогательная (0.5) группой
// упражнения не считается: она нагружается «заодно», и ради неё пару не делят.
const targets = entry => Object.keys(entry.load).filter(group => entry.load[group] === 1);

const hasBigTarget = entry => targets(entry).some(group => BIG_GROUPS.includes(group));

const sharesTarget = (a, b) => targets(a).some(group => b.load[group] === 1);

// Ключи библиотеки — только [a-z0-9-], поэтому сравнение кодовых единиц тут
// сравнение по алфавиту, а localeCompare зависел бы от языка устройства и мог
// бы по-разному сортировать на двух телефонах одного человека.
const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

// Сначала многосуставные (на них уходят силы), затем те, что целят крупную
// группу, затем по ключу: порядок полностью определён и от порядка на входе не
// зависит.
function compare(a, b) {
  if (Boolean(a.compound) !== Boolean(b.compound)) return a.compound ? -1 : 1;
  const bigA = hasBigTarget(a);
  const bigB = hasBigTarget(b);
  if (bigA !== bigB) return bigA ? -1 : 1;
  return byKey(a, b);
}

// Пары жадно: берём первое оставшееся, в партнёры — первое оставшееся без общей
// целевой группы (иначе обе работы пары били бы по одной мышце, и отдых между
// ними не отдыхал бы), а если такого нет — просто первое оставшееся. Нечётное
// упражнение остаётся одно последним блоком.
export function arrangeStrength(entries) {
  const rest = [...entries].sort(compare);
  const pairs = [];
  while (rest.length > 0) {
    const first = rest.shift();
    if (rest.length === 0) {
      pairs.push([first]);
      break;
    }
    const found = rest.findIndex(other => !sharesTarget(first, other));
    const [partner] = rest.splice(found === -1 ? 0 : found, 1);
    pairs.push([first, partner]);
  }
  return pairs;
}
