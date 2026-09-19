// Переключение разделов приложения.
//
// Разделы — это показ и скрытие блоков одной страницы, а не переходы по
// адресам: приложение статическое и загружается один раз, а настоящая
// маршрутизация добавила бы историю переходов, восстановление состояния и
// обработку неизвестных адресов ради четырёх экранов, между которыми
// переключаются нажатием.
const KEY = 'section';
const DEFAULT_ID = 'today';

// «Сегодня» — длинный раздел, и возвращаться в его начало при каждом
// переключении неудобно. Остальные короткие и открываются сверху.
const REMEMBERS_SCROLL = new Set(['today']);

export function createSections({ win, onShow }) {
  const document = win.document;
  const buttons = [...document.querySelectorAll('.tabbar button[data-section]')];
  const ids = buttons.map(button => button.dataset.section);
  const scrollAt = new Map();
  let current = DEFAULT_ID;

  function show(id) {
    // Значение приходит и из разметки, и из хранилища, которое переживает
    // смену версии приложения и правку руками. Неизвестное — не повод падать
    // на запуске, но и не повод показать пустой экран: открываем раздел по
    // умолчанию.
    const next = ids.includes(id) ? id : DEFAULT_ID;
    if (REMEMBERS_SCROLL.has(current)) scrollAt.set(current, win.scrollY);

    for (const button of buttons) {
      const mine = button.dataset.section === next;
      document.getElementById(`screen-${button.dataset.section}`).hidden = !mine;
      if (mine) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    current = next;

    // Здесь намеренно 'instant', а не scrollBehavior(win) из app.js: тот
    // отдаёт 'smooth' всем, кто не просил убрать плавность, и это уместно для
    // кнопки «назад», которая именно прокручивает. Переключение разделов —
    // не прокрутка, а смена экрана: анимировать её незачем, а у html стоит
    // scroll-behavior: smooth, из-за которого плавная прокрутка ещё и
    // возвращает управление до своего окончания.
    win.scrollTo({ top: REMEMBERS_SCROLL.has(next) ? (scrollAt.get(next) ?? 0) : 0, behavior: 'instant' });

    try { win.localStorage.setItem(KEY, next); } catch { /* приватный режим */ }
    if (onShow) onShow(next);
  }

  for (const button of buttons) {
    button.addEventListener('click', () => show(button.dataset.section));
  }

  return { show };
}

export function savedSection(win) {
  try { return win.localStorage.getItem(KEY); } catch { return null; }
}
