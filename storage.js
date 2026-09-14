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

export function createStorage({ cloud = null, local = null, today = () => new Date().toISOString().slice(0, 10), cloudTimeout = 5000 } = {}) {
  // Сериализуем write-операции для каждого ключа (save и clear должны применяться в порядке вызова)
  const queues = new Map();

  const read = key => new Promise(resolve => {
    if (!cloud) {
      try { resolve(local?.getItem(key) ?? ''); } catch { resolve(''); }
      return;
    }

    // Обрабатываем синхронное исключение, ошибку в колбэке и таймаут
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; resolve(''); }, cloudTimeout);

    try {
      cloud.getItem(key, (err, value) => {
        clearTimeout(timer);
        if (!timedOut) {
          // При ошибке возвращаем старые данные, если они есть
          resolve(err ? (value ?? '') : (value ?? ''));
        }
      });
    } catch {
      clearTimeout(timer);
      resolve('');
    }
  });

  const write = (key, value) => new Promise(resolve => {
    if (!cloud) {
      try { local?.setItem(key, value); } catch { /* приватный режим — молча пропускаем */ }
      resolve();
      return;
    }

    // Сериализуем операции на один ключ
    const chain = (queues.get(key) || Promise.resolve()).then(() => new Promise(resolveWrite => {
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; resolveWrite(); }, cloudTimeout);

      try {
        cloud.setItem(key, value, () => {
          clearTimeout(timer);
          if (!timedOut) resolveWrite();
        });
      } catch {
        clearTimeout(timer);
        resolveWrite();
      }
    }));

    queues.set(key, chain);
    chain.then(() => resolve());
  });

  const drop = key => new Promise(resolve => {
    if (!cloud) {
      try { local?.removeItem(key); } catch { /* см. выше */ }
      resolve();
      return;
    }

    // Сериализуем операции на один ключ
    const chain = (queues.get(key) || Promise.resolve()).then(() => new Promise(resolveDrop => {
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; resolveDrop(); }, cloudTimeout);

      try {
        cloud.removeItem(key, () => {
          clearTimeout(timer);
          if (!timedOut) resolveDrop();
        });
      } catch {
        clearTimeout(timer);
        resolveDrop();
      }
    }));

    queues.set(key, chain);
    chain.then(() => resolve());
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
