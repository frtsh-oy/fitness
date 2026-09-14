// Прогресс живёт в CloudStorage внутри Telegram и в localStorage снаружи.
// Ключ включает дату, поэтому отметки сами сбрасываются на следующий день.
export function storageKey(workoutId, date) {
  return `w:${workoutId}:${date}`;
}

function parseMarks(raw) {
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

export function createStorage({ cloud = null, local = null, today = () => new Date().toISOString().slice(0, 10) } = {}) {
  const read = key => new Promise(resolve => {
    if (cloud) {
      cloud.getItem(key, (err, value) => resolve(err ? '' : value));
      return;
    }
    try { resolve(local?.getItem(key) ?? ''); } catch { resolve(''); }
  });

  const write = (key, value) => new Promise(resolve => {
    if (cloud) {
      cloud.setItem(key, value, () => resolve());
      return;
    }
    try { local?.setItem(key, value); } catch { /* приватный режим — молча пропускаем */ }
    resolve();
  });

  const drop = key => new Promise(resolve => {
    if (cloud) {
      cloud.removeItem(key, () => resolve());
      return;
    }
    try { local?.removeItem(key); } catch { /* см. выше */ }
    resolve();
  });

  return {
    async load(workoutId) {
      return parseMarks(await read(storageKey(workoutId, today())));
    },
    async save(workoutId, marks) {
      await write(storageKey(workoutId, today()), JSON.stringify([...marks]));
    },
    async clear(workoutId) {
      await drop(storageKey(workoutId, today()));
    },
  };
}
