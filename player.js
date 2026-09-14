// Плеер по требованию: на странице живёт не больше одного iframe, удаление
// предыдущего останавливает воспроизведение. Перенос src-original/player.js
// в модуль; поведение то же, кроме внешней ссылки и подсказки об отказе.
//
// openLink приходит из telegram.js: внутри Telegram target="_blank" не работает,
// поэтому «Открыть в YouTube» — кнопка, а не ссылка.
export function setupPlayers(root, openLink) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  let activeVideo = null;

  function closeExerciseVideo(restoreFocus = false) {
    if (!activeVideo) return;
    const { button, panel, failTimer } = activeVideo;
    clearTimeout(failTimer);
    panel.remove();
    button.setAttribute('aria-expanded', 'false');
    activeVideo = null;
    if (restoreFocus) button.focus();
  }

  root.querySelectorAll('.exercise a.video,.exercise a.extra-link').forEach((link, index) => {
    const url = new URL(link.href);
    const id = url.searchParams.get('v');
    if (url.hostname !== 'www.youtube.com' || !id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    const start = Number.parseInt(url.searchParams.get('t') || '0', 10);

    const button = doc.createElement('button');
    button.type = 'button';
    button.className = link.className;
    button.innerHTML = link.innerHTML;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `exercise-video-${index}`);
    const title = link.closest('.exercise').querySelector('h3').textContent;
    button.setAttribute('aria-label', link.getAttribute('aria-label') || `${title}: ${link.textContent}`);
    const source = link.href;
    link.replaceWith(button);

    button.addEventListener('click', () => {
      if (activeVideo?.button === button) { closeExerciseVideo(); return; }
      closeExerciseVideo();

      const panel = doc.createElement('div');
      panel.className = 'player-shell';
      panel.id = `exercise-video-${index}`;

      const frame = doc.createElement('iframe');
      frame.title = `Видео: ${title}`;
      const embed = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
      embed.searchParams.set('start', String(Number.isFinite(start) ? start : 0));
      embed.searchParams.set('playsinline', '1');
      embed.searchParams.set('autoplay', '1');
      embed.searchParams.set('rel', '0');
      embed.searchParams.set('hl', 'ru');
      frame.src = embed.href;
      frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';

      const footer = doc.createElement('div');
      footer.className = 'player-footer';
      const help = doc.createElement('p');
      help.append('Если видео недоступно здесь: ');

      const external = doc.createElement('button');
      external.type = 'button';
      external.className = 'player-external';
      external.textContent = 'Открыть в YouTube';
      external.addEventListener('click', () => openLink(source));
      help.append(external);

      const close = doc.createElement('button');
      close.type = 'button';
      close.className = 'player-close';
      close.textContent = 'Скрыть видео';
      close.addEventListener('click', () => closeExerciseVideo(true));

      footer.append(help, close);
      panel.append(frame, footer);

      // Запасной путь для устройств, где встроенный плеер заблокирован: если за
      // три секунды iframe так и не сообщил о загрузке, подсказка меняется с
      // условной на утвердительную, и остаётся кнопка «Открыть в YouTube».
      // Слушатель ставится до вставки в документ — загрузка начинается с неё.
      const failTimer = setTimeout(() => {
        help.firstChild.textContent = 'Видео не открылось здесь. ';
      }, 3000);
      frame.addEventListener('load', () => clearTimeout(failTimer));

      button.after(panel);
      button.setAttribute('aria-expanded', 'true');
      activeVideo = { button, panel, failTimer };

      win.requestAnimationFrame(() => {
        if (activeVideo?.panel !== panel) return;
        panel.scrollIntoView({
          block: 'center',
          behavior: win.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
        });
      });
    });
  });

  doc.addEventListener('keydown', event => {
    if (event.key === 'Escape' && activeVideo) closeExerciseVideo(true);
  });
}
