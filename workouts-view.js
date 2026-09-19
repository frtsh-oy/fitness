// Список тренировок из реестра. Платных тренировок сегодня нет, поэтому
// заблокированных карточек здесь тоже нет: показываем то, что есть.
export function renderWorkouts({ host, workouts, currentId, onPick }) {
  const document = host.ownerDocument;
  host.textContent = '';
  for (const [id, workout] of Object.entries(workouts)) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'workout-card';
    if (id === currentId) card.setAttribute('aria-current', 'true');
    const title = document.createElement('span');
    title.className = 'workout-card-title';
    title.textContent = workout.title;
    const kicker = document.createElement('span');
    kicker.className = 'workout-card-kicker';
    kicker.textContent = workout.kicker;
    card.append(title, kicker);
    card.addEventListener('click', () => onPick(id));
    host.append(card);
  }
}
