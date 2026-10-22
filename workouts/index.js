import legsMwf from './legs-mwf.js';
import coreArmsLegs from './core-arms-legs.js';
import balancedFullBody from './balanced-full-body.js';

export const WORKOUTS = {
  'legs-mwf': legsMwf,
  'core-arms-legs': coreArmsLegs,
  'balanced-full-body': balancedFullBody,
};

export const DEFAULT_WORKOUT_ID = 'legs-mwf';

export function getWorkout(id) {
  return WORKOUTS[id] ?? WORKOUTS[DEFAULT_WORKOUT_ID];
}
