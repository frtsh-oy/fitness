// Таймер отдыха. Здесь нет ни setInterval, ни DOM: шаг времени приходит извне
// вызовом tick(), поэтому поведение проверяется тестами без ожидания в реальном
// времени. Кто именно тикает — дело вызывающего кода (app.js).
export function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function createTimer({ onTick = () => {}, onDone = () => {} } = {}) {
  let duration = 60;
  const state = { remaining: 60, running: false };

  return {
    get remaining() { return state.remaining; },
    get running() { return state.running; },

    setDuration(seconds) {
      duration = seconds;
      state.remaining = seconds;
      state.running = false;
      onTick(state.remaining);
    },

    toggle() {
      // Отработавший таймер запускается заново от выбранной длительности:
      // иначе первый же tick снова упёрся бы в ноль и позвал onDone второй раз,
      // а на экране осталось бы 00:00.
      if (!state.running && state.remaining === 0) state.remaining = duration;
      state.running = !state.running;
      onTick(state.remaining);
    },

    reset() {
      state.remaining = duration;
      state.running = false;
      onTick(state.remaining);
    },

    tick() {
      if (!state.running) return;
      state.remaining = Math.max(0, state.remaining - 1);
      // Останавливаемся до onTick, а не после: иначе обработчик, который рисует
      // подпись кнопки по running, на последнем шаге увидел бы «идёт» у нуля
      // и оставил бы на кнопке «Пауза» уже после конца отдыха.
      if (state.remaining === 0) state.running = false;
      onTick(state.remaining);
      if (state.remaining === 0) onDone();
    },
  };
}
