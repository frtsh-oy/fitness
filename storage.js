// Прогресс живёт в CloudStorage внутри Telegram и в localStorage снаружи.
// Ключ включает дату, поэтому отметки сами сбрасываются на следующий день.
export function storageKey(workoutId, date) {
  return `w:${workoutId}:${date}`;
}

// Признак «локальная копия не подтверждена облаком». Ключ производный от
// основного, поэтому он так же сбрасывается по дате вместе с отметками.
function pendingKey(key) {
  return `${key}:pending`;
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

  // Любое обращение к localStorage может бросить: приватный режим Safari,
  // урезанный WebView, исчерпанная квота. Три обёртки ниже — единственный путь
  // к local во всём модуле, поэтому необёрнутых обращений тут просто нет.
  // Важно в том числе внутри setTimeout: там исключение роняет не промис, а окружение.
  const localGet = key => {
    try { return local?.getItem(key) ?? ''; } catch { return ''; }
  };
  const localSet = (key, value) => {
    try { local?.setItem(key, value); } catch { /* приватный режим — молча пропускаем */ }
  };
  const localRemove = key => {
    try { local?.removeItem(key); } catch { /* см. выше */ }
  };

  const isPending = key => localGet(pendingKey(key)) === '1';
  const markPending = key => localSet(pendingKey(key), '1');
  const clearPending = key => localRemove(pendingKey(key));

  // Один вызов облака с тремя способами отказа: ошибка в колбэке, синхронное
  // исключение, отсутствие колбэка (таймаут). Никогда не реджектится;
  // ok === false означает «облако не подтвердило операцию».
  const callCloud = (method, args) => new Promise(resolve => {
    let settled = false;
    const finish = result => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, value: '' }), cloudTimeout);

    try {
      cloud[method](...args, (err, value) => {
        clearTimeout(timer);
        // Значение при ошибке отбрасываем: оно может быть обрезанным или чужим
        finish(err ? { ok: false, value: '' } : { ok: true, value: value ?? '' });
      });
    } catch {
      clearTimeout(timer);
      finish({ ok: false, value: '' });
    }
  });

  // Ставит задачу в очередь ключа: записи применяются в порядке вызова.
  // Обработчик один на оба исхода предыдущего звена намеренно: очередь не должна
  // вставать из-за чужого сбоя, а сами задачи ниже не реджектятся в принципе.
  const enqueue = (key, task) => {
    const chain = (queues.get(key) || Promise.resolve()).then(task, task);
    queues.set(key, chain);
    return chain;
  };

  const read = async key => {
    if (!cloud) return localGet(key);

    if (isPending(key)) {
      const raw = localGet(key);
      // Признак стоит, но локального значения нет: localStorage не отдал его
      // или отказал на записи самой отметки, приняв только признак. Защищать
      // нечего, а досылка пустоты затёрла бы живые данные в облаке — поэтому
      // такой признак ничего не значит, читаем облако обычным порядком.
      if (raw) {
        // Наша последняя запись не доехала до облака, значит облако заведомо
        // устарело — его ответ (в том числе успешный и пустой) не спрашиваем.
        // Попутно пробуем дослать; удалась досылка — признак снимаем.
        await enqueue(key, async () => {
          if ((await callCloud('setItem', [key, raw])).ok) clearPending(key);
        });
        return raw;
      }
    }

    const { ok, value } = await callCloud('getItem', [key]);
    // Неподтверждённых локальных записей нет, поэтому успешному ответу облака
    // верим как есть, даже пустому: это законный сброс с другого устройства.
    // Отказ любым из трёх способов → читаем localStorage.
    return ok ? value : localGet(key);
  };

  const write = (key, value) => {
    if (!cloud) {
      localSet(key, value);
      return Promise.resolve();
    }

    return enqueue(key, async () => {
      if ((await callCloud('setItem', [key, value])).ok) {
        // Облако подтвердило — локальная копия больше не «неподтверждённая»
        clearPending(key);
      } else {
        // Отказ любым из трёх способов → пишем в localStorage и помечаем,
        // чтобы следующее чтение отдало локальное значение, а не устаревшее облачное
        localSet(key, value);
        markPending(key);
      }
    });
  };

  const drop = key => {
    if (!cloud) {
      // Признак здесь не трогаем: без облака он не ставится и не читается
      localRemove(key);
      return Promise.resolve();
    }

    return enqueue(key, async () => {
      // Исход облака здесь ни на что не влияет и потому не проверяется:
      // localStorage и признак чистим и при успехе, и при отказе, иначе
      // устаревшая копия воскреснет при следующем чтении.
      await callCloud('removeItem', [key]);
      localRemove(key);
      clearPending(key);
    });
  };

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
