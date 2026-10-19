// Слой ключ-значение поверх двух хранилищ: CloudStorage внутри Telegram и
// localStorage на устройстве. Здесь только доступ без последствий: ни одна
// функция не бросает и не реджектится, а что делать с отказом — решают те, кто
// зовёт (storage.js — отметки, дальше — свои тренировки).

// Ключ CloudStorage: 1–128 символов из латиницы, цифр, подчёркивания и дефиса.
// Правило Telegram (https://core.telegram.org/bots/webapps, раздел CloudStorage).
// Сам скрипт Telegram ключ не проверяет и отдаёт как есть, так что нарушение
// видно только по ошибке в колбэке — а её callCloud гасит. Поэтому правило
// вынесено сюда и по нему тесты проверяют ключи, которые получило облако.
export const CLOUD_KEY = /^[A-Za-z0-9_-]{1,128}$/;

export function createKv({ cloud = null, local = null, cloudTimeout = 5000 } = {}) {
  // Любое обращение к localStorage может бросить: приватный режим Safari,
  // урезанный WebView, исчерпанная квота. Обёртки ниже — единственный путь
  // к local для всех, кто строится на этом модуле, поэтому необёрнутых
  // обращений у них просто нет.
  // Важно в том числе внутри setTimeout: там исключение роняет не промис, а окружение.
  const localGet = key => {
    try { return local?.getItem(key) ?? ''; } catch { return ''; }
  };
  // Отвечает, удалась ли запись: тем, кому важно знать, что значение легло на
  // устройство (своя тренировка), нужен ответ, а не молчаливый пропуск.
  // Хранилища нет вовсе — это тоже «не удалось», писать некуда.
  const localSet = (key, value) => {
    try {
      if (!local) return false;
      local.setItem(key, value);
      return true;
    } catch {
      return false; // приватный режим — молча пропускаем
    }
  };
  const localRemove = key => {
    try { local?.removeItem(key); } catch { /* см. выше */ }
  };
  // Снимок всех ключей устройства. Исключение посреди обхода даёт пустой
  // список, а не половину: по неполному списку чистка сочла бы недосчитанные
  // ключи чужими, а своё — отсутствующим.
  const localKeys = () => {
    try {
      const keys = [];
      for (let i = 0; i < (local?.length ?? 0); i += 1) keys.push(local.key(i));
      return keys;
    } catch {
      return [];
    }
  };

  // Один вызов облака с тремя способами отказа: ошибка в колбэке, синхронное
  // исключение, отсутствие колбэка (таймаут). Никогда не реджектится;
  // ok === false означает «облако не подтвердило операцию».
  // Отдельного сторожа «мы уже ответили» здесь нет намеренно: промис принимает
  // первый исход и молча игнорирует последующие. Опоздавший после таймаута
  // колбэк и повторный вызов колбэка и так ни на что не влияют, а сторож только
  // изображал бы решение, ничего не решая.
  const callCloud = (method, args) => new Promise(resolve => {
    const timer = setTimeout(() => resolve({ ok: false, value: '' }), cloudTimeout);

    try {
      cloud[method](...args, (err, value) => {
        clearTimeout(timer);
        // Значение при ошибке отбрасываем: оно может быть обрезанным или чужим
        resolve(err ? { ok: false, value: '' } : { ok: true, value: value ?? '' });
      });
    } catch {
      clearTimeout(timer);
      resolve({ ok: false, value: '' });
    }
  });

  return { hasCloud: Boolean(cloud), localGet, localSet, localRemove, localKeys, callCloud };
}
