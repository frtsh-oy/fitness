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

    // ПРАВИЛО 1: Если облако отказало — читаем из localStorage
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; resolve(local?.getItem(key) ?? ''); }, cloudTimeout);

    try {
      cloud.getItem(key, (err, value) => {
        clearTimeout(timer);
        if (!timedOut) {
          // Успешный ответ берём как есть, даже если пусто (не подменяем локальными)
          if (err) {
            // Ошибка → читаем из localStorage
            resolve(local?.getItem(key) ?? '');
          } else {
            resolve(value ?? '');
          }
        }
      });
    } catch {
      clearTimeout(timer);
      // Синхронное исключение → читаем из localStorage
      resolve(local?.getItem(key) ?? '');
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
      const timer = setTimeout(() => {
        timedOut = true;
        // ПРАВИЛО 2: Таймаут → пишем в localStorage
        try { local?.setItem(key, value); } catch { /* приватный режим */ }
        resolveWrite();
      }, cloudTimeout);

      try {
        cloud.setItem(key, value, (err) => {
          clearTimeout(timer);
          if (!timedOut) {
            if (err) {
              // ПРАВИЛО 2: Ошибка → пишем в localStorage
              try { local?.setItem(key, value); } catch { /* приватный режим */ }
            }
            // Успех → не пишем в localStorage, облако уже сохранил
            resolveWrite();
          }
        });
      } catch {
        clearTimeout(timer);
        // ПРАВИЛО 2: Синхронное исключение → пишем в localStorage
        try { local?.setItem(key, value); } catch { /* приватный режим */ }
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
      const timer = setTimeout(() => {
        timedOut = true;
        // ПРАВИЛО 3: Таймаут → чистим localStorage
        try { local?.removeItem(key); } catch { /* приватный режим */ }
        resolveDrop();
      }, cloudTimeout);

      try {
        cloud.removeItem(key, (err) => {
          clearTimeout(timer);
          if (!timedOut) {
            // ПРАВИЛО 3: Всегда чистим localStorage (успех или ошибка)
            try { local?.removeItem(key); } catch { /* приватный режим */ }
            resolveDrop();
          }
        });
      } catch {
        clearTimeout(timer);
        // ПРАВИЛО 3: Синхронное исключение → чистим localStorage
        try { local?.removeItem(key); } catch { /* приватный режим */ }
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
