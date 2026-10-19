// Раздел «Тренировки»: свои тренировки человека («Мои») и готовые из реестра
// («Готовые»). Карточка делает тренировку текущей, «Удалить» убирает свою;
// что именно при этом происходит, решает app.js, здесь только разметка.
import { scheduleShort } from './render.js';
import { LEVELS } from './builder/rules.js';
import { expandWorkout, exerciseCount } from './builder/compact.js';
import { plural } from './builder/texts.js';
import { LIBRARY } from './exercises/index.js';

const SAVED = 'Тренировка сохранена';
const SAVED_LOCAL_ONLY = 'Тренировка сохранена на этом устройстве: облако Telegram не ответило. Отправим её туда при следующем запуске.';
const NO_OWN = 'Своих тренировок пока нет — собери первую в «Конструкторе».';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Карточка: название и строка под ним. Текущая помечена и в разметке для
// диктора (aria-current), и подписью для глаза.
function card(document, { title, kicker, current, onPick }) {
  const button = el(document, 'button', 'workout-card');
  button.type = 'button';
  if (current) button.setAttribute('aria-current', 'true');
  button.append(
    el(document, 'span', 'workout-card-title', title),
    el(document, 'span', 'workout-card-kicker', kicker),
  );
  if (current) button.append(el(document, 'span', 'workout-card-now', 'Сейчас в «Сегодня»'));
  button.addEventListener('click', onPick);
  return button;
}

// Строка под названием своей тренировки. Число упражнений — то, что человек
// увидит в «Сегодня»: без ключей, которых уже нет в библиотеке. Сырое число из
// записи разошлось бы с экраном «Сегодня» на величину убранного.
function ownKicker({ id, compact, localOnly }, library) {
  const { removed } = expandWorkout(id, compact, library);
  const count = exerciseCount(compact) - removed.length;
  const parts = [
    compact.level ? `${LEVELS[compact.level].label} уровень` : 'Своя сборка',
    scheduleShort(compact.days),
    `${count} ${plural(count, ['упражнение', 'упражнения', 'упражнений'])}`,
  ];
  if (localOnly) parts.push('только на этом устройстве');
  return parts.join(' · ');
}

// mine — результат list() или null, пока список ещё не пришёл: облако отвечает
// до пяти секунд, а «Своих тренировок пока нет» человеку, у которого они есть,
// было бы неправдой. Пока списка нет, под заголовком «Мои» пусто.
// library — откуда брать упражнения для счёта: та же, по которой открывается
// своя тренировка в «Сегодня».
export function renderWorkouts({ host, ready, mine, currentId, saved = null, library = LIBRARY, onPick, onDelete }) {
  const document = host.ownerDocument;
  host.textContent = '';

  if (saved) {
    const note = el(document, 'p', 'workouts-saved', saved.localOnly ? SAVED_LOCAL_ONLY : SAVED);
    note.setAttribute('role', 'status');
    host.append(note);
  }

  host.append(el(document, 'h2', 'workouts-title', 'Мои'));
  if (mine?.length === 0) host.append(el(document, 'p', 'workouts-empty', NO_OWN));
  for (const own of mine ?? []) {
    const item = el(document, 'div', 'workout-item');
    const remove = el(document, 'button', 'workout-delete', 'Удалить');
    remove.type = 'button';
    // Кнопок «Удалить» в списке несколько, и диктору по голой подписи не
    // отличить одну от другой. Видимая подпись стоит в начале имени.
    remove.setAttribute('aria-label', `Удалить: ${own.compact.name}`);
    remove.addEventListener('click', () => onDelete(own.id));
    item.append(
      card(document, {
        title: own.compact.name,
        kicker: ownKicker(own, library),
        current: own.id === currentId,
        onPick: () => onPick(own.id),
      }),
      remove,
    );
    host.append(item);
  }

  host.append(el(document, 'h2', 'workouts-title', 'Готовые'));
  for (const [id, workout] of Object.entries(ready)) {
    host.append(card(document, {
      title: workout.title,
      kicker: workout.kicker,
      current: id === currentId,
      onPick: () => onPick(id),
    }));
  }
}
