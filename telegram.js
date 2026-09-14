// Слой поверх Telegram WebApp. Всё опционально: приложение обязано
// работать в обычном браузере, где window.Telegram отсутствует.
const BRAND_BG = '#152d4a';

const safely = fn => { try { fn(); } catch { /* старый клиент — метода может не быть */ } };

export function initTelegram(win = globalThis) {
  const webApp = win?.Telegram?.WebApp ?? null;
  const available = Boolean(webApp);

  if (available) {
    safely(() => webApp.ready());
    safely(() => webApp.expand());
    safely(() => webApp.disableVerticalSwipes());
    safely(() => webApp.setHeaderColor(BRAND_BG));
    safely(() => webApp.setBackgroundColor(BRAND_BG));
  }

  const fromStart = webApp?.initDataUnsafe?.start_param ?? null;
  const fromQuery = new URLSearchParams(win?.location?.search ?? '').get('w');

  return {
    available,
    webApp,
    workoutId: fromStart || fromQuery || null,

    openLink(url) {
      // webApp.openLink — единственный путь, который Task 8 использует для видео
      // в WebView, где встроенный плеер YouTube заблокирован: это ровно тот
      // случай, когда сам openLink чаще всего и бросает. Поэтому его исключение
      // не глушится молча (safely здесь не годится) — при отказе откатываемся
      // на обычное окно, а не оставляем кнопку немой.
      if (available && typeof webApp.openLink === 'function') {
        try {
          webApp.openLink(url);
          return;
        } catch {
          /* новый путь недоступен — открываем обычным окном ниже */
        }
      }
      win.open?.(url, '_blank', 'noopener');
    },

    haptic(kind) {
      // Эта проверка обязательна: webApp === null вне safely, обращение к
      // webApp.HapticFeedback ниже бросило бы прямо здесь.
      if (!available) return;
      const h = webApp.HapticFeedback;
      if (kind === 'done') safely(() => h.notificationOccurred('success'));
      else safely(() => h.impactOccurred('light'));
    },

    // Подтверждение опасного действия. Всегда обещание: вызывающий код не должен
    // зависеть от того, какой из путей сработал.
    //
    // Проверка версии здесь обязательна и не заменяется на safely: на клиенте
    // старше 6.2 showConfirm существует как функция, но ничего не делает и не
    // бросает — колбэк не придёт никогда, и обещание зависло бы навсегда,
    // а вместе с ним и действие, которого ждёт человек. Проверено на живом SDK:
    // неподдерживаемые методы только пишут предупреждение в консоль.
    confirm(message) {
      return new Promise(resolve => {
        if (available && webApp.isVersionAtLeast?.('6.2') && typeof webApp.showConfirm === 'function') {
          try {
            webApp.showConfirm(message, ok => resolve(ok === true));
            return;
          } catch {
            /* спросить у клиента не вышло — спрашиваем окном ниже */
          }
        }
        try {
          // Отказом считаем только явное «нет». undefined отдаёт окружение без
          // рабочего диалога — там спросить нечем, и выполнить действие человека
          // лучше, чем молча его проглотить.
          resolve(win?.confirm?.(message) !== false);
        } catch {
          resolve(true);
        }
      });
    },

    onBack(handler) {
      safely(() => webApp.BackButton.onClick(handler));
    },

    setBackVisible(visible) {
      safely(() => (visible ? webApp.BackButton.show() : webApp.BackButton.hide()));
    },
  };
}
