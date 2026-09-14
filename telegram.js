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
      if (available && typeof webApp.openLink === 'function') {
        safely(() => webApp.openLink(url));
        return;
      }
      win.open?.(url, '_blank', 'noopener');
    },

    haptic(kind) {
      if (!available) return;
      const h = webApp.HapticFeedback;
      if (!h) return;
      if (kind === 'done') safely(() => h.notificationOccurred('success'));
      else safely(() => h.impactOccurred('light'));
    },

    onBack(handler) {
      if (!available || !webApp.BackButton) return;
      safely(() => webApp.BackButton.onClick(handler));
    },

    setBackVisible(visible) {
      if (!available || !webApp.BackButton) return;
      safely(() => (visible ? webApp.BackButton.show() : webApp.BackButton.hide()));
    },
  };
}
