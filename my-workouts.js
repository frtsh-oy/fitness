// Свои тренировки человека: одна тренировка — одна запись `u_<id>` в
// CloudStorage Telegram и копия на устройстве. Запись хранится сжатой
// (builder/compact.js), полную тренировку из неё собирает expandWorkout.
//
// Доступ к обоим хранилищам идёт через kv.js: отказ хранилища здесь не бросает и
// не реджектится, а «облако не подтвердило» — обычный исход, не ошибка. Реджект
// один — save на нечитаемой или слишком длинной записи: это ошибка вызова, а не
// состояние хранилища.
//
// Служебные признаки живут ТОЛЬКО на устройстве, в облако не уходят и ключом
// облака быть не могут (двоеточие в ключе CloudStorage недопустимо):
//   u_<id>:pending — устройство пишет в облако, подтверждения нет;
//   u_<id>:deleted — удалили здесь, а облако об этом не знает.
// Оба ставятся ДО запроса, а не по его отказу: «не подтверждено» — это и запрос,
// ответа на который мы не дождались, потому что приложение закрыли. Для
// следующего запуска он ничем не отличается от отказавшего. И ставятся они
// всегда, в том числе без облака: когда оно появится при следующем запуске,
// сохранённая без связи тренировка должна быть досланной, а не стёртой как
// «удалена на другом устройстве», удалённая — удалённой, а не воскресшей.
//
// Почему здесь недосланное досылается при запуске, а у отметок (storage.js) нет.
// Отметки приложение пересохраняет целиком при каждом нажатии, так что первое же
// удачное сохранение после появления связи донесёт их с актуальным набором на
// руках, а досылка из устаревшей копии только откатила бы то, что за это время
// записало другое устройство. Своя тренировка пишется один раз, при сохранении,
// и повторного сохранения, которое донесло бы её, может не случиться никогда, а
// без досылки она осталась бы только на этом устройстве. Поэтому решение спеки:
// «при следующем запуске она досылается». Цена: если одну и ту же тренировку
// правили на двух устройствах и одно из них было без связи, выигрывает та
// запись, что дошла до облака последней, — как и при любой записи в облако.
import { createKv } from './kv.js';
import { serializeCompact, parseCompact, VALUE_MAX } from './builder/compact.js';

// Не больше пятидесяти своих тренировок: с запасом укладывается в 1024 записи
// CloudStorage на человека вместе с отметками, которые чистит storage.prune().
export const OWN_LIMIT = 50;

export const recordKey = id => `u_${id}`;

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

// Случайный id для новой тренировки: `my-` и восемь знаков. С префиксом `u_`
// ключ остаётся в правиле CloudStorage (латиница, цифры, `_`, `-`).
export function newWorkoutId(random = Math.random) {
  let tail = '';
  for (let i = 0; i < 8; i += 1) tail += ALPHABET[Math.floor(random() * ALPHABET.length)];
  return `my-${tail}`;
}

// id внутри ключа: 128 знаков ключа минус «u_». Двоеточия нет, так что признаки
// `:pending` и `:deleted` под шаблон записи не подходят и записью не считаются.
const ID = '[A-Za-z0-9_-]{1,126}';
const RECORD_KEY = new RegExp(`^u_(${ID})$`);
const DELETED_KEY = new RegExp(`^u_(${ID}):deleted$`);

const pendingKey = key => `${key}:pending`;
const deletedKey = key => `${key}:deleted`;

export function createMyWorkouts({ cloud = null, local = null, cloudTimeout = 5000 } = {}) {
  const { hasCloud, localGet, localSet, localRemove, localKeys, callCloud } = createKv({ cloud, local, cloudTimeout });

  const isPending = key => localGet(pendingKey(key)) === '1';
  const isDeleted = key => localGet(deletedKey(key)) === '1';

  // Счётчик правок по id: save и remove увеличивают его синхронно, до первого
  // await. list, пока ждёт облако, держит устаревшее: снимок устройства и ответ
  // облака. Если после ожидания счётчик id сдвинулся, значит его уже правили, и
  // решать по старому снимку нельзя — иначе откатили бы свежее (досылка старой
  // версии сняла бы пометку у новой, ответ облака до удаления воскресил бы
  // удалённое). Такой id list не трогает, а показывает как есть на устройстве.
  const revisions = new Map();
  const revisionOf = id => revisions.get(id) ?? 0;
  const touch = id => {
    revisions.set(id, revisionOf(id) + 1);
    return revisionOf(id);
  };

  // Что устройство знает о своих тренировках: id записей и id с пометкой
  // «удалено» (самой записи у них уже нет, но облаку удаление ещё не дошло).
  const scanDevice = () => {
    const records = [];
    const deleted = [];
    for (const key of localKeys()) {
      const record = RECORD_KEY.exec(key);
      if (record) records.push(record[1]);
      const gone = DELETED_KEY.exec(key);
      if (gone) deleted.push(gone[1]);
    }
    return { records, deleted };
  };

  // Ответ облака — Map(id → текст записи) или null, если облако не ответило. Не
  // ответило и тогда, когда ответ неполон (список ключей пришёл, а значения нет):
  // по неполному ответу «нет в облаке» нельзя принимать за «удалено на другом
  // устройстве».
  const readCloud = async () => {
    const keys = await callCloud('getKeys', []);
    if (!keys.ok || !Array.isArray(keys.value)) return null;
    const own = keys.value.filter(key => RECORD_KEY.test(key));
    if (own.length === 0) return new Map();

    const items = await callCloud('getItems', [own]);
    if (!items.ok || typeof items.value !== 'object' || items.value === null) return null;
    return new Map(own.map(key => {
      const text = items.value[key];
      return [RECORD_KEY.exec(key)[1], typeof text === 'string' ? text : ''];
    }));
  };

  // Тренировка так, как она сейчас на устройстве, или null: удалённая (пометка
  // «удалено») и нечитаемая не показываются. «Только на этом устройстве» бывает
  // лишь там, где облако есть: без него «не подтверждено» подтверждать нечем.
  const deviceEntry = id => {
    const key = recordKey(id);
    if (isDeleted(key)) return null;
    const compact = parseCompact(localGet(key));
    return compact ? { id, compact, localOnly: hasCloud && isPending(key) } : null;
  };

  // Облако не ответило: показываем всё, что есть на устройстве. Ничего не
  // стираем и не снимаем: молчание облака не значит «удалено на другом устройстве».
  const fromDevice = ({ records }) => records.map(deviceEntry).filter(Boolean);

  // Облако ответило: сверяем с ним каждую запись. Запись, которую нельзя
  // прочитать (parseCompact → null), не показывается и нигде не стирается:
  // это может быть тренировка из более новой версии приложения, и стереть её
  // значило бы потерять данные человека без шанса вернуть.
  // seen — счётчики правок на момент снимка устройства, см. revisions.
  const reconcile = async (device, inCloud, seen) => {
    const ids = new Set([...device.records, ...device.deleted, ...inCloud.keys()]);
    const jobs = [...ids].map(async id => {
      const key = recordKey(id);
      const stale = () => revisionOf(id) !== (seen.get(id) ?? 0);

      // Пока ждали облако, тренировку уже правили: и снимок устройства, и ответ
      // облака про неё устарели.
      if (stale()) return deviceEntry(id);

      // Удалили здесь, а облако не подтвердило: повторяем удаление и в список не
      // берём, даже если облако ещё хранит запись — иначе она воскресла бы.
      if (isDeleted(key)) {
        const removed = (await callCloud('removeItem', [key])).ok;
        if (stale()) return deviceEntry(id);
        if (removed) localRemove(deletedKey(key));
        return null;
      }

      const localText = localGet(key);
      // Записана здесь, облако не подтвердило: досылаем и показываем свою версию.
      if (localText && isPending(key)) {
        const compact = parseCompact(localText);
        if (!compact) return null;
        const sent = (await callCloud('setItem', [key, localText])).ok;
        // Пометку снимает только досылка той версии, что сейчас на устройстве:
        // за время запроса её могли заменить (сохранили новую и облако её не
        // подтвердило), и тогда подтверждена старая, а не эта.
        if (stale() || localGet(key) !== localText) return deviceEntry(id);
        if (sent) localRemove(pendingKey(key));
        return { id, compact, localOnly: !sent };
      }

      // Есть в облаке, признаков нет: правда в облаке (правили или добавили на
      // другом устройстве). Копию на устройстве переписываем.
      if (inCloud.has(id)) {
        const text = inCloud.get(id);
        const compact = parseCompact(text);
        if (!compact) return null;
        if (localText !== text) localSet(key, text);
        return { id, compact, localOnly: false };
      }

      // Только на устройстве, признаков нет, а облако ответило без неё: удалили
      // на другом устройстве, здесь тоже убираем.
      if (localText && parseCompact(localText)) localRemove(key);
      return null;
    });
    return (await Promise.all(jobs)).filter(Boolean);
  };

  const list = async () => {
    // Снимок устройства и счётчики правок берутся вместе, ДО обращения к облаку.
    // Тренировка, которую сохранили, пока облако отвечало, в снимок не попала, и
    // ответ облака, не знающий о ней, её не сотрёт; остальные сверяются по счётчикам.
    const device = scanDevice();
    const seen = new Map(revisions);
    const inCloud = hasCloud ? await readCloud() : null;
    const own = inCloud ? await reconcile(device, inCloud, seen) : fromDevice(device);
    return own.sort((a, b) => b.compact.t - a.compact.t);
  };

  // Только устройство, без обращения к облаку: экраны открывают свою
  // тренировку сразу, не дожидаясь ответа облака.
  const peek = id => parseCompact(localGet(recordKey(id)));

  const save = async (id, compact) => {
    const key = recordKey(id);
    const text = serializeCompact(compact);

    // Ошибка вызова, а не отказ хранилища: генератор и конструктор сами держат
    // формат и лимит. Нечитаемую запись list не показал бы никогда, а слишком
    // длинную облако не приняло бы, и она вечно числилась бы «только здесь».
    if (typeof text !== 'string' || parseCompact(text) === null) {
      throw new Error('Тренировка не прошла проверку формата, сохранять её нельзя');
    }
    if (text.length > VALUE_MAX) {
      throw new Error(`Тренировка не помещается в одну запись облака: ${text.length} знаков, можно не больше ${VALUE_MAX}`);
    }

    // Перезапись известной тренировки лимит не трогает: он про число, а не про
    // запись. Считаются только читаемые записи — битую человек не видит, и
    // «пятьдесят из пятидесяти» при сорока девяти в списке сбило бы с толку.
    const known = scanDevice().records.filter(other => parseCompact(localGet(recordKey(other))));
    if (known.length >= OWN_LIMIT && !known.includes(id)) return { ok: false, reason: 'limit' };

    const mine = touch(id);

    // Сначала устройство и синхронно: сохранение должно пережить закрытие
    // приложения посреди запроса. Пометка раньше текста, а не после: текст без
    // пометки следующий list принял бы за удалённый на другом устройстве и
    // стёр. Не легла пометка — текст не пишем, на устройство «не удалось». Не лёг
    // текст — пометку возвращаем, как была: раньше она могла стоять у прошлой,
    // ещё не досланной версии, и снять её значило бы потерять ту версию.
    const wasPending = isPending(key);
    const flagged = localSet(pendingKey(key), '1');
    const onDevice = flagged && localSet(key, text);
    if (flagged && !onDevice && !wasPending) localRemove(pendingKey(key));
    // Тренировка снова есть, пометка «удалено» от прошлого удаления больше не
    // верна: list повторил бы удаление и стёр бы её в облаке.
    if (onDevice) localRemove(deletedKey(key));
    if (!hasCloud) return onDevice ? { ok: true, localOnly: false } : { ok: false, reason: 'device' };

    if ((await callCloud('setItem', [key, text])).ok) {
      // Пометки снимает только последняя правка этой тренировки: пока шёл запрос,
      // её могли сохранить ещё раз (новая версия не подтверждена) или удалить, и
      // подтверждение старой записи не вправе объявить подтверждённой новую.
      // Пометка снимается и при неудаче на устройстве: облако получило эту версию,
      // а пометка от прошлой заставила бы следующий list прислать устаревшую
      // копию с устройства поверх неё. Так же с «удалено»: облако эту тренировку
      // приняло, повторять удаление нельзя.
      if (revisionOf(id) === mine) {
        localRemove(pendingKey(key));
        localRemove(deletedKey(key));
      }
      return { ok: true, localOnly: false };
    }
    return onDevice ? { ok: true, localOnly: true } : { ok: false, reason: 'device' };
  };

  const remove = async id => {
    const key = recordKey(id);
    const mine = touch(id);
    localRemove(key);
    // Слать в облако больше нечего: недосланная версия удалённой не нужна
    localRemove(pendingKey(key));

    // Пометка до запроса: закрыли приложение посреди удаления — следующий list
    // всё равно его повторит, а не воскресит тренировку из облака. И без облака:
    // оно появится при следующем запуске и ещё может хранить эту тренировку.
    localSet(deletedKey(key), '1');
    if (!hasCloud) return;
    // Пометку снимает только последняя правка: подтверждение старого удаления не
    // вправе снять её у нового. Удалили, сохранили заново и удалили снова, а
    // последнее удаление облако не получило — без этого list вернул бы тренировку.
    if ((await callCloud('removeItem', [key])).ok && revisionOf(id) === mine) localRemove(deletedKey(key));
  };

  return { list, peek, save, remove };
}
