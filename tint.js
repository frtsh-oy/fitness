// Цвета вкладок вне CSS. В style.css цвет вкладки — атрибут data-tint на body и
// токены семейств (--butter, --rose и так далее); здесь те же основы нужны тем,
// кто красится не стилями: шапке Telegram и theme-color браузера. Что таблица
// совпадает с токенами, сторожит test/redesign-assets.test.js.
export const TINT_BASE = {
  butter: '#F6E7AD',
  peach: '#FDD9C4',
  rose: '#F8D5DD',
  mint: '#CDEADB',
  sky: '#CFE3F6',
  lilac: '#DED5F4',
};

// Бумага: фон приложения. Им красится и фон за страницей в Telegram: за
// пределами прокрутки видна именно она, а не цвет вкладки.
export const PAPER = '#FBF8F9';

// Тон вкладки по умолчанию — розовая пудра «Сегодня».
export const DEFAULT_TINT = 'rose';
