import legsMwf from './legs-mwf.js';

export const WORKOUTS = {
  'legs-mwf': legsMwf,
};

export const DEFAULT_WORKOUT_ID = 'legs-mwf';

export function getWorkout(id) {
  return WORKOUTS[id] ?? WORKOUTS[DEFAULT_WORKOUT_ID];
}
