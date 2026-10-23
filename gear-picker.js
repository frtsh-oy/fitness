// Переключатели «Что есть дома»: по строке-переключателю на каждый вид
// инвентаря из gear.js. Один блок на генератор и фильтры библиотеки: оба
// показывают одно и то же и должны выглядеть и вести себя одинаково. Выбор здесь
// не хранится: что делать с изменением, решает тот, кто вызвал (onChange), —
// так блок проверяется без конструктора и без хранилища.
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
  const title = el(document, 'h2', 'builder-group-title', 'Что есть дома');
  title.id = `${idPrefix}-title`;
  const hint = el(document, 'p', 'gear-hint', 'Отметь, что у тебя есть. Упражнения без инвентаря доступны всегда.');
  const group = el(document, 'ul', 'gear-list');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-labelledby', title.id);

  for (const [id, label] of GEAR) {
    // Строка целиком — переключатель (role=switch): включить или выключить то,
    // что есть дома, — это настройка, а не выбор из нескольких. Дорожка .sw —
    // украшение, состояние читает диктор по aria-checked.
    const button = el(document, 'button', 'gear-switch');
    button.type = 'button';
    button.setAttribute('role', 'switch');
    button.dataset.gear = id;
    const name = el(document, 'span', 'gear-name', capitalized(label));
    const track = el(document, 'span', 'sw');
    track.setAttribute('aria-hidden', 'true');
    button.append(name, track);
    button.setAttribute('aria-checked', String(current.has(id)));
    button.addEventListener('click', () => {
      if (current.has(id)) current.delete(id);
      else current.add(id);
      button.setAttribute('aria-checked', String(current.has(id)));
      onChange(GEAR.map(([gearId]) => gearId).filter(gearId => current.has(gearId)), id);
    });
    const item = el(document, 'li');
    item.append(button);
    group.append(item);
  }

  root.append(title, hint, group);
  return root;
}
