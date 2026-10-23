// Раздел «Тренировки»: свои тренировки человека («Мои») и готовые из реестра
// («Готовые»). Карточка делает тренировку текущей, «Изменить» открывает свою в
// конструкторе, «Удалить» убирает; что именно при этом происходит, решает
// app.js, здесь только разметка.
import { scheduleShort } from './render.js';
import { icon } from './icons.js';
import { renderHero } from './hero.js';
import { LEVELS } from './builder/rules.js';
import { expandWorkout, exerciseCount } from './builder/compact.js';
import { plural } from './builder/texts.js';
import { LIBRARY } from './exercises/index.js';

const LEAD = 'Выбери, какая будет в «Сегодня». Свою можно собрать в конструкторе.';
const SAVED = 'Тренировка сохранена';
const SAVED_LOCAL_ONLY = 'Тренировка сохранена на этом устройстве: облако Telegram не ответило. Отправим её туда при следующем запуске.';
const NO_OWN_TITLE = 'Своих тренировок пока нет';
const NO_OWN_HINT = 'Собери первую в «Конструкторе».';
const BUILD = 'Собрать тренировку';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// Карточка: название, описание (его нет у своей тренировки) и строка под ним.
// Текущая помечена и в разметке для диктора (aria-current), и подписью с
// галочкой для глаза: смысл не держится на одном цвете фона.
function card(document, { title, lead, kicker, current, onPick }) {
  const button = el(document, 'button', 'workout-card');
  button.type = 'button';
  if (current) button.setAttribute('aria-current', 'true');
  button.append(el(document, 'span', 'workout-card-title', title));
  if (lead) button.append(el(document, 'span', 'workout-card-lead', lead));
  button.append(el(document, 'span', 'workout-card-kicker', kicker));
  if (current) {
    const now = el(document, 'span', 'workout-card-now');
    now.append(icon(document, 'tick', 'ic ic-hand'), 'Сейчас в «Сегодня»');
    button.append(now);
  }
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

// «Своих тренировок пока нет»: приглашение, а не тупик. Кнопка ведёт в
// «Конструктор» — раздел переключает app.js (onBuild).
function emptyOwn(document, onBuild) {
  const box = el(document, 'div', 'workouts-empty');
  const build = el(document, 'button', 'workouts-build', BUILD);
  build.type = 'button';
  build.addEventListener('click', () => onBuild?.());
  box.append(
    icon(document, 'loop', 'ic ic-loop'),
    el(document, 'p', 'workouts-empty-title', NO_OWN_TITLE),
    el(document, 'p', 'workouts-empty-hint', NO_OWN_HINT),
    build,
  );
  return box;
}

// mine — результат list() или null, пока список ещё не пришёл: облако отвечает
// до пяти секунд, а «Своих тренировок пока нет» человеку, у которого они есть,
// было бы неправдой. Пока списка нет, под заголовком «Мои» пусто.
// library — откуда брать упражнения для счёта: та же, по которой открывается
// своя тренировка в «Сегодня».
export function renderWorkouts({ host, ready, mine, currentId, saved = null, library = LIBRARY, onPick, onDelete, onEdit, onBuild }) {
  const document = host.ownerDocument;
  // Шапка и список: шапка во всю ширину, список в колонке.
  const list = el(document, 'div', 'wrap workouts-list');
  host.replaceChildren(renderHero(document, { title: 'Тренировки', lead: LEAD }), list);

  if (saved) {
    const note = el(document, 'p', 'workouts-saved', saved.localOnly ? SAVED_LOCAL_ONLY : SAVED);
    note.setAttribute('role', 'status');
    list.append(note);
  }

  list.append(el(document, 'h2', 'workouts-title', 'Мои'));
  if (mine?.length === 0) list.append(emptyOwn(document, onBuild));
  for (const own of mine ?? []) {
    const item = el(document, 'div', own.id === currentId ? 'workout-item is-current' : 'workout-item');
    const remove = el(document, 'button', 'workout-delete', 'Удалить');
    remove.type = 'button';
    // Кнопок «Удалить» в списке несколько, и диктору по голой подписи не
    // отличить одну от другой. Видимая подпись стоит в начале имени.
    remove.setAttribute('aria-label', `Удалить: ${own.compact.name}`);
    remove.addEventListener('click', () => onDelete(own.id));
    const edit = el(document, 'button', 'workout-edit', 'Изменить');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Изменить: ${own.compact.name}`);
    edit.addEventListener('click', () => onEdit(own.id));
    // Две текстовые кнопки под карточкой, в одной панели с ней: подсвеченная
    // панель текущей тренировки (.is-current) охватывает и их.
    const actions = el(document, 'div', 'workout-actions');
    actions.append(edit, remove);
    item.append(
      card(document, {
        title: own.compact.name,
        kicker: ownKicker(own, library),
        current: own.id === currentId,
        onPick: () => onPick(own.id),
      }),
      actions,
    );
    list.append(item);
  }

  list.append(el(document, 'h2', 'workouts-title', 'Готовые'));
  for (const [id, workout] of Object.entries(ready)) {
    list.append(card(document, {
      title: workout.title,
      lead: workout.lead,
      kicker: `${workout.kicker} · ${scheduleShort(workout.days)}`,
      current: id === currentId,
      onPick: () => onPick(id),
    }));
  }
}
