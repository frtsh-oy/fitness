// Модальная шторка снизу: затемнение, окно с role=dialog и всё, что к ним
// прилагается. Фокус уходит внутрь, Escape и нажатие на фон закрывают, а всё,
// что стоит под шторкой (экран, нижняя панель, шторка таймера), становится
// inert: Tab ходит только внутри, и диктор не читает то, чем сейчас не
// пользуются. Один код на шторку замены (builder-view.js) и шторку фильтров
// библиотеки (library-view.js): обе должны вести себя одинаково.
//
// Содержимое строит вызывающий и кладёт в sheet до вызова show(). Шторка и
// затемнение ставятся в host рядом с экраном, а не внутрь него: экран под
// шторкой становится inert, и внутри него шторка перестала бы работать.
const el = (document, tag, className) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

// screen — корень экрана под шторкой; labelledBy — id заголовка внутри шторки;
// className и scrimClass добавляют свои классы (по ним тесты и стили находят
// именно эту шторку); opener — кнопка, на которую вернуть фокус при закрытии;
// onClose зовётся после закрытия, любым путём.
export function openSheet({ host, screen, labelledBy, className = '', scrimClass = '', opener = null, onClose = () => {} }) {
  const document = host.ownerDocument;
  const scrim = el(document, 'div', `scrim ${scrimClass}`.trim());
  const sheet = el(document, 'div', `sheet ${className}`.trim());
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-labelledby', labelledBy);
  sheet.tabIndex = -1;

  // Запоминаем, что именно сделали inert, и снимаем только это: узел, уже
  // закрытый другой шторкой, чужим снятием не открывается.
  const behind = [screen, document.querySelector('.tabbar'), document.querySelector('.timer-sheet')]
    .filter(node => node && !node.hasAttribute('inert'));
  for (const node of behind) node.setAttribute('inert', '');

  // После закрытия фокус возвращается туда, откуда шторку открыли (или на focus:
  // после выбора замены это кнопка новой строки): иначе он остался бы на узле,
  // которого уже нет.
  function close(focus = opener) {
    scrim.remove();
    sheet.remove();
    for (const node of behind) node.removeAttribute('inert');
    if (focus?.isConnected) focus.focus();
    onClose();
  }

  scrim.addEventListener('click', () => close());
  sheet.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });

  return {
    sheet,
    close,
    show() {
      host.append(scrim, sheet);
      sheet.focus();
    },
  };
}
