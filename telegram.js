// Слой поверх Telegram WebApp. Всё опционально: приложение обязано
// работать в обычном браузере, где window.Telegram отсутствует.
const BRAND_BG = '#152d4a';

// Отвечает, удалось ли позвать клиента: большинству вызовов ответ не нужен,
// но haptic по нему решает, был ли отклик вообще.
const safely = fn => { try { fn(); return true; } catch { return false; } };

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

    // Отвечает, получил ли человек отклик. Ответ нужен вызывающему: по «нет» он
    // сигналит сам, вибромотором устройства.
    //
    // Версию спрашиваем отдельно и до вызова. HapticFeedback появился в Bot API
    // 6.1, а на клиенте постарше — и в обычном браузере, где подключённый со
    // страницы SDK всё равно отдаёт объект WebApp и представляется версией 6.0, —
    // метод существует и молча пишет предупреждение в консоль. Ни исключения,
    // ни возвращаемого значения, по которым можно было бы узнать отказ, нет:
    // без проверки версии слой отвечал бы «отклик был» там, где его не было.
    //
    // Проверка available тоже обязательна: webApp === null вне safely, обращение
    // к его полям бросило бы прямо здесь.
    haptic(kind) {
      if (!available || !webApp.isVersionAtLeast?.('6.1')) return false;
      const h = webApp.HapticFeedback;
      return kind === 'done'
        ? safely(() => h.notificationOccurred('success'))
        : safely(() => h.impactOccurred('light'));
    },

    // Подтверждение опасного действия. Всегда обещание: вызывающий код не должен
    // зависеть от того, какой из путей сработал.
    //
    // Проверка версии здесь обязательна и не заменяется на safely: на клиенте
    // старше 6.2 showConfirm существует как функция, но ничего не делает и не
    // бросает — колбэк не придёт никогда, и обещание зависло бы навсегда,
    // а вместе с ним и действие, которого ждёт человек. Проверено на живом SDK:
    // неподдерживаемые методы только пишут предупреждение в консоль.
    //
    // Отдельной проверки «а функция ли showConfirm» нет: по той же модели SDK
    // решение уже принято версией, а если метода всё же не окажется, вызов
    // бросит — и это тот самый случай, ради которого стоит try/catch.
    confirm(message) {
      return new Promise(resolve => {
        if (available && webApp.isVersionAtLeast?.('6.2')) {
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
