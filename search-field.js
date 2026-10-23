// Поле поиска упражнений: капсула со значком слева и очисткой справа. Одно на
// библиотеку и на шторку замены. Что делать с текстом, решает вызывающий
// (onChange(value)): сам список поле не знает.
//
// Кегль в поле — 16px (style.css): iOS приближает страницу при фокусе в поле
// мельче, и экран после ввода остаётся увеличенным. Крестик виден, пока поле не
// пустое, и всегда остаётся тем же узлом: его прячет атрибут hidden.
import { icon } from './icons.js';

const el = (document, tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

// label — имя поля для диктора и подсказка в нём; className добавляется к
// капсуле (где она стоит, там и отступы). set(value) подставляет текст и
// уведомляет вызывающего: так «Сбросить» очищает поле тем же путём, что и
// человек. Фокус при очистке крестиком возвращается в поле: после нажатия
// сам крестик исчезает.
export function searchField(document, { label, className = '', onChange }) {
  const input = el(document, 'input');
  input.type = 'search';
  input.placeholder = label;
  input.setAttribute('aria-label', label);
  input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off');
  input.spellcheck = false;
  input.enterKeyHint = 'search';

  const clear = el(document, 'button', 's-clear');
  clear.type = 'button';
  clear.setAttribute('aria-label', 'Очистить поиск');
  clear.append(icon(document, 'close'));
  clear.hidden = true;

  const field = el(document, 'div', `search ${className}`.trim());
  field.setAttribute('role', 'search');
  field.append(icon(document, 'search'), input, clear);

  function set(value) {
    input.value = value;
    clear.hidden = value === '';
    onChange(value);
  }
  input.addEventListener('input', () => {
    clear.hidden = input.value === '';
    onChange(input.value);
  });
  clear.addEventListener('click', () => {
    set('');
    input.focus();
  });

  return { field, input, clear, set };
}
