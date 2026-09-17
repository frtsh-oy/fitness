import { JSDOM } from 'jsdom';

// jsdom — не браузер: часть того, на что приложение вправе рассчитывать в любом
// клиенте Telegram (и в любом браузере не старше 2019 года), в нём просто не
// реализована. Недостающее добавляем здесь, в окружении, а не ветками в коде:
// ветка, живущая только ради тестов, врёт о том, что бывает на устройстве.
function fillBrowserGaps(window) {
  window.matchMedia = query => ({
    media: query,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  });

  window.Element.prototype.scrollIntoView = function scrollIntoView() {};

  // Наблюдатель за пересечениями: настоящий сам сообщает о прокрутке, которой
  // в jsdom нет, поэтому у поддельного есть intersect() для тестов. Созданные
  // экземпляры видны как window.intersectionObservers.
  window.intersectionObservers = [];
  window.IntersectionObserver = class IntersectionObserver {
    constructor(callback, options = {}) {
      this.callback = callback;
      this.options = options;
      this.targets = [];
      window.intersectionObservers.push(this);
    }

    observe(target) { this.targets.push(target); }
    unobserve(target) { this.targets = this.targets.filter(item => item !== target); }
    disconnect() { this.targets = []; }

    intersect(target, isIntersecting = true) { this.callback([{ target, isIntersecting }], this); }
  };
}

export function makeDom(html = '<!doctype html><html><body></body></html>') {
  // pretendToBeVisual: страница считается видимой (document.hidden === false,
  // как во вкладке на переднем плане) и появляется requestAnimationFrame,
  // без которого не открывается плеер.
  const dom = new JSDOM(html, { url: 'https://example.test/', pretendToBeVisual: true });
  fillBrowserGaps(dom.window);
  return { window: dom.window, document: dom.window.document };
}
