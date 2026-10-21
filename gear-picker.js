// Переключатели «Что есть дома»: по кнопке на каждый вид инвентаря из gear.js.
// Один блок на генератор и библиотеку: оба показывают одно и то же и должны
// выглядеть и вести себя одинаково. Выбор здесь не хранится: что делать с
// изменением, решает тот, кто вызвал (onChange), — так блок проверяется без
// конструктора и без хранилища.
import { GEAR } from './gear.js';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Подписи в словаре строчные, как внутри фразы; отдельной подписью на кнопке
// слово начинается с заглавной.
const capitalized = text => text[0].toUpperCase() + text.slice(1);

// owned — что отмечено сейчас; idPrefix делает id заголовка уникальным на
// странице (переключатели бывают и в генераторе, и в библиотеке, а aria-labelledby
// ссылается по id). onChange(newOwned, id) зовётся после нажатия: newOwned — в
// порядке словаря, id — тот вид, что переключили.
export function renderGearPicker(document, { owned, onChange, idPrefix }) {
  // Своё множество, а не переданный массив: его не меняем и не держим.
  const current = new Set(owned);

  const root = el(document, 'div', 'gear-picker');
  const title = el(document, 'h3', 'builder-group-title', 'Что есть дома');
  title.id = `${idPrefix}-title`;
  const hint = el(document, 'p', 'gear-hint', 'Отметь, что у тебя есть. Упражнения без инвентаря доступны всегда.');
  const group = el(document, 'div', 'zone-chips');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', title.id);

  for (const [id, label] of GEAR) {
    // Классы чипа зоны дают внешний вид: свой вид у переключателя был бы
    // вторым чипом, который придётся чинить вместе с первым.
    const button = el(document, 'button', 'zone-chip gear-chip', capitalized(label));
    button.type = 'button';
    button.dataset.gear = id;
    button.setAttribute('aria-pressed', String(current.has(id)));
    button.addEventListener('click', () => {
      if (current.has(id)) current.delete(id);
      else current.add(id);
      button.setAttribute('aria-pressed', String(current.has(id)));
      onChange(GEAR.map(([gearId]) => gearId).filter(gearId => current.has(gearId)), id);
    });
    group.append(button);
  }

  root.append(title, hint, group);
  return root;
}
