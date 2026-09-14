import { isMuscleId } from '../muscles.js';

export const PATTERNS = ['hinge', 'squat', 'lunge', 'push', 'pull', 'core', 'mobility', 'stretch'];
export const GEAR = ['band_long', 'loop_short', 'none'];
export const KINDS = ['warmup', 'strength', 'cooldown'];
export const LOAD_VALUES = [0.5, 1];

const WORKOUT_FIELDS = ['id', 'kicker', 'title', 'titleLines', 'lead', 'schedule', 'stats', 'gear', 'blocks', 'progression', 'caution'];
const BLOCK_FIELDS = ['id', 'n', 'nav', 'title', 'sub', 'rounds', 'items'];
const ITEM_FIELDS = ['name', 'muscles', 'reps', 'text', 'load', 'pattern', 'gear', 'unilateral', 'kind'];

export function validateWorkout(workout) {
  const problems = [];

  for (const field of WORKOUT_FIELDS) {
    if (workout[field] === undefined) problems.push(`Тренировка: нет поля ${field}`);
  }
  if (!Array.isArray(workout.titleLines) || workout.titleLines.length < 1 || workout.titleLines.length > 2
      || workout.titleLines.some(line => typeof line !== 'string' || line.length === 0)) {
    problems.push('Тренировка: titleLines должен быть массивом из одной или двух непустых строк');
  }
  if (!Array.isArray(workout.blocks)) return problems;

  for (const block of workout.blocks) {
    const where = `Блок ${block.id ?? '?'}`;
    for (const field of BLOCK_FIELDS) {
      if (block[field] === undefined) problems.push(`${where}: нет поля ${field}`);
    }
    if (!Number.isInteger(block.rounds) || block.rounds < 1) {
      problems.push(`${where}: rounds должен быть целым числом не меньше 1, получено ${block.rounds}`);
    }
    if (!Array.isArray(block.items)) continue;

    for (const item of block.items) {
      const at = `${where}, упражнение «${item.name ?? '?'}»`;
      for (const field of ITEM_FIELDS) {
        if (item[field] === undefined) problems.push(`${at}: нет поля ${field}`);
      }
      if (!PATTERNS.includes(item.pattern)) problems.push(`${at}: неизвестный pattern ${item.pattern}`);
      if (!KINDS.includes(item.kind)) problems.push(`${at}: неизвестный kind ${item.kind}`);
      if (typeof item.unilateral !== 'boolean') problems.push(`${at}: unilateral должен быть true или false`);

      for (const g of item.gear ?? []) {
        if (!GEAR.includes(g)) problems.push(`${at}: неизвестный инвентарь ${g}`);
      }

      const load = item.load ?? {};
      const entries = Object.entries(load);
      if (item.kind === 'strength' && entries.length === 0) {
        problems.push(`${at}: силовому упражнению нужен непустой load`);
      }
      for (const [id, value] of entries) {
        if (!isMuscleId(id)) problems.push(`${at}: неизвестная группа мышц ${id}`);
        if (!LOAD_VALUES.includes(value)) problems.push(`${at}: load[${id}] должен быть 1 или 0.5, получено ${value}`);
      }
    }
  }
  return problems;
}

export function countMarks(workout) {
  return workout.blocks.reduce((sum, block) => sum + block.rounds * block.items.length, 0);
}
