// Что тренировка нагружает целиком: какие основные группы остались без нагрузки
// и какие не дотянули до нижней границы уровня. Счёт — тот же, что у экрана
// недельной нагрузки (weekly.js), и только «сопоставимый»: целевые подходы, как
// в источниках ориентиров. Наша внутренняя единица (ours) с вспомогательными
// долями для сравнения с границами уровня не годится.
import { weeklySets } from '../weekly.js';
import { CORE_GROUPS } from './rules.js';

// Подходов в неделю по основным группам. Дни берутся из самой тренировки: одна
// и та же тренировка на одном дне даёт втрое меньше, чем на трёх.
function comparableByGroup(workout) {
  const sets = weeklySets([workout]);
  return CORE_GROUPS.map(group => [group, sets.get(group).comparable]);
}

// Основные группы, у которых нет ни одного целевого подхода. Предплечья,
// трапеции и сгибатели бедра сюда не попадают — они не основные.
export function zeroGroups(workout) {
  return comparableByGroup(workout).filter(([, sets]) => sets === 0).map(([group]) => group);
}

// Основные группы, у которых подходов в неделю меньше floor. Ровно floor — уже
// не «ниже границы».
export function belowFloor(workout, floor) {
  return comparableByGroup(workout).filter(([, sets]) => sets < floor).map(([group]) => group);
}
