import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_KEY } from '../kv.js';
import { serializeCompact, parseCompact, VALUE_MAX } from '../builder/compact.js';
import { OWN_LIMIT, recordKey, newWorkoutId, createMyWorkouts } from '../my-workouts.js';

// rejects — какие ключи устройство отказывается писать (переполненная квота):
// читает при этом исправно, а запись бросает, как настоящий localStorage.
function fakeLocal(initial = {}, { rejects = () => false } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      if (rejects(k)) throw new Error('квота');
      map.set(k, String(v));
    },
    removeItem: k => map.delete(k),
    key: i => [...map.keys()][i] ?? null,
    get length() { return map.size; },
    _map: map,
  };
}

// Облако в памяти (data — то, что в нём лежит; calls — сколько раз позвали
// каждый метод) с отказами «первые N вызовов метода»: silentX — колбэк не
// зовётся (это ловит таймаут), failX — колбэк с ошибкой. Сначала проверяется
// silent, так что { silentRemove: 1, failRemove: 2 } — первый вызов молчит,
// второй отвечает ошибкой, остальные работают. Infinity — отказ насовсем.
function flakyCloud({ data = {}, ...faults } = {}) {
  const calls = { setItem: 0, removeItem: 0, getKeys: 0, getItems: 0 };
  const SUFFIX = { setItem: 'Set', removeItem: 'Remove', getKeys: 'Keys', getItems: 'Items' };
  const answer = (method, cb, run) => {
    const n = (calls[method] += 1);
    if (n <= (faults[`silent${SUFFIX[method]}`] ?? 0)) return;
    if (n <= (faults[`fail${SUFFIX[method]}`] ?? 0)) { cb(new Error('отказ облака')); return; }
    cb(null, run());
  };
  return {
    data,
    calls,
    setItem: (k, v, cb) => answer('setItem', cb, () => { data[k] = v; return true; }),
    removeItem: (k, cb) => answer('removeItem', cb, () => { delete data[k]; return true; }),
    getKeys: cb => answer('getKeys', cb, () => Object.keys(data)),
    getItems: (keys, cb) => answer('getItems', cb, () => Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]))),
  };
}

// Облако, которое отвечает, когда скажет тест: каждый вызов встаёт в очередь
// held и ждёт answer(). Чтение (getKeys, getItems) снимает ответ в момент вызова,
// как облако, получившее запрос, — поэтому ответ, полученный позже, бывает
// устаревшим. Запись ложится в data, только когда на неё ответили успехом.
function heldCloud({ data = {} } = {}) {
  const held = [];
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const hold = (method, args, cb, value, apply = () => {}) => {
    held.push({
      method,
      args,
      reply: ok => {
        if (!ok) { cb(new Error('отказ облака')); return; }
        apply();
        cb(null, value);
      },
    });
  };
  return {
    data,
    held,
    setItem: (k, v, cb) => hold('setItem', [k, v], cb, true, () => { data[k] = v; }),
    removeItem: (k, cb) => hold('removeItem', [k], cb, true, () => { delete data[k]; }),
    getKeys: cb => hold('getKeys', [], cb, Object.keys(data)),
    getItems: (keys, cb) => hold('getItems', [keys], cb, Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]]))),
    // Отвечает на самый ранний вызов метода (с подходящими аргументами) и даёт
    // коду модуля дойти до следующего обращения к облаку. Пока вызова нет, ждёт.
    async answer(method, ok = true, match = () => true) {
      const find = () => held.findIndex(call => call.method === method && match(call.args));
      for (let i = 0; i < 20 && find() === -1; i += 1) await tick();
      const index = find();
      assert.notEqual(index, -1, `облако не получило ${method}`);
      held.splice(index, 1)[0].reply(ok);
      await tick();
    },
  };
}

const T0 = 1760000000000;
// Запись достаточна для parseCompact; ключей библиотеки он не сверяет, так что
// упражнения здесь — просто допустимые по шаблону ключи.
const compactAt = (t, name = 'Моя тренировка') => ({
  v: 1, name, days: [1, 3, 5], level: null, zones: [],
  warmup: ['pelvic-tilt'], circuit: ['chinese-squat'], strength: ['rdl'], focus: [],
  cooldown: ['breathing'], t,
});
const C = compactAt(T0);
const ser = serializeCompact;
const idsOf = list => list.map(own => own.id);

test('сохранённая тренировка читается обратно; без облака localOnly — false', async () => {
  const bare = createMyWorkouts({ local: fakeLocal() });
  assert.deepEqual(await bare.save('my-a', C), { ok: true, localOnly: false });
  assert.deepEqual(await bare.list(), [{ id: 'my-a', compact: C, localOnly: false }]);

  // Облако приняло: пометка «не подтверждено» ушла, и запись лежит в облаке
  const cloud = flakyCloud();
  const local = fakeLocal();
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });
  assert.deepEqual(await store.save('my-a', C), { ok: true, localOnly: false });
  assert.equal(cloud.data['u_my-a'], ser(C));
  assert.equal(local.getItem('u_my-a:pending'), null);
  assert.deepEqual(await store.list(), [{ id: 'my-a', compact: C, localOnly: false }]);
});

test('облако не подтвердило — localOnly, при следующем list она досылается и пометка снимается', async () => {
  // Отказ ошибкой и молчание (таймаут) для сохранения одно и то же: не подтвердило
  for (const fault of [{ failSet: 1 }, { silentSet: 1 }]) {
    const cloud = flakyCloud(fault);
    const local = fakeLocal();
    const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });
    assert.deepEqual(await store.save('my-a', C), { ok: true, localOnly: true });
    assert.equal(local.getItem('u_my-a:pending'), '1');
    assert.equal(cloud.data['u_my-a'], undefined);

    const [own] = await store.list();
    assert.equal(own.localOnly, false);
    assert.equal(cloud.data['u_my-a'], ser(C));
    assert.equal(local.getItem('u_my-a:pending'), null);
  }
});

test('не удалось записать никуда — reason device; на устройство не удалось, облако приняло — сохранено', async () => {
  const full = () => fakeLocal({}, { rejects: () => true });
  const deadCloud = () => flakyCloud({ failSet: Infinity });

  assert.deepEqual(
    await createMyWorkouts({ cloud: deadCloud(), local: full(), cloudTimeout: 20 }).save('my-a', C),
    { ok: false, reason: 'device' },
  );
  assert.deepEqual(await createMyWorkouts({ local: full() }).save('my-a', C), { ok: false, reason: 'device' });

  // Не легла пометка «не подтверждено»: текст не пишем. Текст без пометки
  // следующий list принял бы за удалённый на другом устройстве и стёр бы.
  const noFlag = fakeLocal({}, { rejects: key => key.endsWith(':pending') });
  assert.deepEqual(
    await createMyWorkouts({ cloud: deadCloud(), local: noFlag, cloudTimeout: 20 }).save('my-a', C),
    { ok: false, reason: 'device' },
  );
  assert.equal(noFlag.getItem('u_my-a'), null, 'без пометки текст не пишется');

  // Не лёг текст: пометку возвращаем, как была. Без неё не оставляем (иначе list
  // досылал бы то, чего нет), а у прошлой недосланной версии оставляем (иначе
  // следующий list стёр бы её как удалённую на другом устройстве).
  const noText = () => fakeLocal({}, { rejects: key => key === 'u_my-a' });
  const fresh = noText();
  assert.deepEqual(
    await createMyWorkouts({ cloud: deadCloud(), local: fresh, cloudTimeout: 20 }).save('my-a', C),
    { ok: false, reason: 'device' },
  );
  assert.equal(fresh.getItem('u_my-a:pending'), null);

  const old = compactAt(T0 - 1, 'Прошлая версия');
  const withOld = fakeLocal({ 'u_my-a': ser(old), 'u_my-a:pending': '1' }, { rejects: key => key === 'u_my-a' });
  assert.deepEqual(
    await createMyWorkouts({ cloud: deadCloud(), local: withOld, cloudTimeout: 20 }).save('my-a', C),
    { ok: false, reason: 'device' },
  );
  assert.equal(withOld.getItem('u_my-a'), ser(old));
  assert.equal(withOld.getItem('u_my-a:pending'), '1');

  const cloud = flakyCloud();
  const store = createMyWorkouts({ cloud, local: full(), cloudTimeout: 20 });
  assert.deepEqual(await store.save('my-a', C), { ok: true, localOnly: false });
  assert.equal(cloud.data['u_my-a'], ser(C));
});

test('пятьдесят первую сохранить нельзя, перезаписать существующую — можно', async () => {
  // Битая запись на устройстве человеку не видна и места среди пятидесяти не занимает
  const cloud = flakyCloud();
  const store = createMyWorkouts({ cloud, local: fakeLocal({ 'u_my-broken': 'не json' }), cloudTimeout: 20 });
  for (let i = 0; i < OWN_LIMIT; i += 1) {
    assert.deepEqual(await store.save(`my-${i}`, compactAt(T0 + i)), { ok: true, localOnly: false }, `запись ${i}`);
  }

  assert.deepEqual(await store.save('my-extra', C), { ok: false, reason: 'limit' });
  assert.equal(store.peek('my-extra'), null);
  assert.equal(cloud.calls.setItem, OWN_LIMIT, 'отказ по лимиту до облака не дошёл');

  const renamed = compactAt(T0 + 7, 'Новое имя');
  assert.deepEqual(await store.save('my-7', renamed), { ok: true, localOnly: false });
  assert.equal(store.peek('my-7').name, 'Новое имя');
  assert.equal((await store.list()).length, OWN_LIMIT);

  // Удалили одну — место освободилось
  await store.remove('my-0');
  assert.deepEqual(await store.save('my-extra', C), { ok: true, localOnly: false });
});

test('удалённая на другом устройстве пропадает и здесь, изменённая там — показывается их версия', async () => {
  const cloud = flakyCloud();
  const local = fakeLocal();
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });
  await store.save('my-a', compactAt(T0 + 1));
  await store.save('my-b', compactAt(T0 + 2));
  await store.save('my-c', compactAt(T0 + 3));

  // На другом устройстве: a удалили, b изменили, d добавили
  delete cloud.data['u_my-a'];
  const edited = compactAt(T0 + 5, 'Изменена там');
  cloud.data['u_my-b'] = ser(edited);
  const added = compactAt(T0 + 4, 'Добавлена там');
  cloud.data['u_my-d'] = ser(added);

  const list = await store.list();
  assert.deepEqual(idsOf(list), ['my-b', 'my-d', 'my-c'], 'по времени сохранения, новые выше');
  assert.deepEqual(list[0].compact, edited);
  assert.deepEqual(list[1].compact, added);
  assert.ok(list.every(own => own.localOnly === false));

  // Версия из облака переписана на устройство, удалённая стёрта
  assert.equal(local.getItem('u_my-a'), null);
  assert.equal(local.getItem('u_my-b'), ser(edited));
  assert.equal(local.getItem('u_my-d'), ser(added));
  assert.equal(store.peek('my-a'), null);
  assert.deepEqual(store.peek('my-b'), edited);

  // Следующий запуск видит то же и без обращения к списку прошлого запуска
  const next = createMyWorkouts({ cloud, local, cloudTimeout: 20 });
  assert.deepEqual(idsOf(await next.list()), ['my-b', 'my-d', 'my-c']);
});

test('удаление при молчащем облаке не воскрешает тренировку, удаление досылается при list', async () => {
  // Первое удаление молчит, повтор из list отвечает ошибкой, третья попытка проходит
  const cloud = flakyCloud({ silentRemove: 1, failRemove: 2 });
  const local = fakeLocal();
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });
  await store.save('my-a', compactAt(T0 + 1));
  await store.save('my-b', compactAt(T0 + 2));

  await store.remove('my-a');
  assert.equal(store.peek('my-a'), null);
  assert.equal(local.getItem('u_my-a:deleted'), '1');
  assert.ok('u_my-a' in cloud.data, 'облако удаление не получило');

  // Облако отвечает и всё ещё хранит запись — но человек её удалил
  assert.deepEqual(idsOf(await store.list()), ['my-b']);
  assert.equal(local.getItem('u_my-a:deleted'), '1', 'повтор не подтверждён — пометка остаётся');
  assert.deepEqual(idsOf(await store.list()), ['my-b']);

  assert.equal(local.getItem('u_my-a:deleted'), null);
  assert.equal(cloud.data['u_my-a'], undefined);
  assert.equal(cloud.calls.removeItem, 3);
  assert.deepEqual(idsOf(await store.list()), ['my-b']);
});

test('облако молчит при list — показываем то, что на устройстве', async () => {
  const a = compactAt(T0 + 1);
  const b = compactAt(T0 + 2);
  const gone = compactAt(T0 + 3);
  const seed = () => fakeLocal({
    'u_my-a': ser(a),
    'u_my-b': ser(b), 'u_my-b:pending': '1',
    'u_my-gone': ser(gone), 'u_my-gone:deleted': '1',
  });

  // getKeys не ответил; getKeys ответил, а getItems — нет: список облака неполон
  for (const fault of [{ silentKeys: Infinity }, { failItems: Infinity }]) {
    const cloud = flakyCloud({ data: { 'u_my-other': ser(compactAt(T0 + 9)) }, ...fault });
    const local = seed();
    const list = await createMyWorkouts({ cloud, local, cloudTimeout: 20 }).list();
    assert.deepEqual(list, [
      { id: 'my-b', compact: b, localOnly: true },
      { id: 'my-a', compact: a, localOnly: false },
    ]);

    // Ничего не стёрто и не снято: «нет в облаке» тут значит «облако не ответило»
    assert.equal(local.getItem('u_my-a'), ser(a));
    assert.equal(local.getItem('u_my-b:pending'), '1');
    assert.equal(local.getItem('u_my-gone:deleted'), '1');
    assert.deepEqual(Object.keys(cloud.data), ['u_my-other']);
  }
});

test('битая запись не роняет list и не удаляется', async () => {
  const good = compactAt(T0 + 1);
  const cloud = flakyCloud({ data: { 'u_my-good': ser(good), 'u_my-cloud-bad': '{"v":2}', 'u_my-cloud-empty': '' } });
  const local = fakeLocal({
    'u_my-dev-bad': 'не json',
    'u_my-pending-bad': '{"v":1}', 'u_my-pending-bad:pending': '1',
  });
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });

  assert.deepEqual(idsOf(await store.list()), ['my-good']);
  // Ни у кого не стёрто: не в облаке, не на устройстве, и пометка досылки на месте
  assert.equal(cloud.data['u_my-cloud-bad'], '{"v":2}');
  assert.equal(cloud.data['u_my-cloud-empty'], '');
  assert.equal(local.getItem('u_my-dev-bad'), 'не json');
  assert.equal(local.getItem('u_my-pending-bad'), '{"v":1}');
  assert.equal(local.getItem('u_my-pending-bad:pending'), '1');
  assert.equal(cloud.data['u_my-pending-bad'], undefined, 'битую запись в облако не шлём');

  // Облако молчит — тот же итог
  const silent = createMyWorkouts({ cloud: flakyCloud({ silentKeys: Infinity }), local, cloudTimeout: 20 });
  assert.deepEqual(idsOf(await silent.list()), ['my-good']);
  assert.equal(local.getItem('u_my-dev-bad'), 'не json');
});

test('peek читает с устройства синхронно', () => {
  const cloud = flakyCloud();
  const store = createMyWorkouts({
    cloud, cloudTimeout: 20,
    local: fakeLocal({ 'u_my-a': ser(C), 'u_my-bad': 'не json' }),
  });
  assert.deepEqual(store.peek('my-a'), C);
  assert.equal(store.peek('my-нет'), null);
  assert.equal(store.peek('my-bad'), null);
  assert.deepEqual(cloud.calls, { setItem: 0, removeItem: 0, getKeys: 0, getItems: 0 }, 'облако не спрашивали');
});

test('пометки «не подтверждено» и «удалено» ставятся до ответа облака', async () => {
  // Приложение могут закрыть, пока запрос в облако ещё в пути: ответа не будет,
  // и пометки должны уже лежать на устройстве
  const local = fakeLocal();
  const cloud = flakyCloud({ silentSet: Infinity, silentRemove: Infinity });
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });

  const saving = store.save('my-a', C);
  assert.equal(local.getItem('u_my-a'), ser(C));
  assert.equal(local.getItem('u_my-a:pending'), '1');
  await saving;

  const removing = store.remove('my-a');
  assert.equal(local.getItem('u_my-a'), null);
  assert.equal(local.getItem('u_my-a:pending'), null, 'слать в облако больше нечего');
  assert.equal(local.getItem('u_my-a:deleted'), '1');
  await removing;
  assert.equal(local.getItem('u_my-a:deleted'), '1');
});

test('ключ записи и новый id проходят правило CloudStorage', () => {
  assert.equal(recordKey('my-abc12345'), 'u_my-abc12345');
  for (let i = 0; i < 200; i += 1) {
    const id = newWorkoutId();
    assert.match(id, /^my-[a-z0-9]{8}$/);
    assert.match(recordKey(id), CLOUD_KEY);
  }

  // Каждый из восьми знаков берётся своим вызовом random и из всего алфавита
  let n = 0;
  const id = newWorkoutId(() => (n++ * 5 % 36) / 36);
  assert.equal(n, 8);
  assert.equal(new Set(id.slice(3)).size, 8);
  assert.notEqual(newWorkoutId(() => 0), newWorkoutId(() => 0.999));
  assert.match(newWorkoutId(() => 0.999), /^my-[a-z0-9]{8}$/);
});

test('list не затирает правку, сделанную во время досылки: пометка остаётся, следующий list досылает новую версию', async () => {
  const v1 = compactAt(T0 + 1, 'V1');
  const v2 = compactAt(T0 + 2, 'V2');
  const text = c => ([, value]) => value === ser(c);
  // V1 уже на устройстве и не дослана
  const local = fakeLocal({ 'u_my-x': ser(v1), 'u_my-x:pending': '1' });
  const cloud = heldCloud();
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 1000 });

  const listing = store.list();
  await cloud.answer('getKeys'); // облако пусто; list начинает досылать V1
  const saving = store.save('my-x', v2);
  await cloud.answer('setItem', false, text(v2)); // V2 облако не подтвердило
  assert.deepEqual(await saving, { ok: true, localOnly: true });
  await cloud.answer('setItem', true, text(v1)); // досылка V1 удалась

  assert.deepEqual(await listing, [{ id: 'my-x', compact: v2, localOnly: true }]);
  assert.equal(local.getItem('u_my-x'), ser(v2));
  assert.equal(local.getItem('u_my-x:pending'), '1', 'подтверждена V1, а не V2');

  // В облаке теперь V1, но пометка на месте: следующий list шлёт V2, а не берёт V1
  const next = store.list();
  await cloud.answer('getKeys');
  await cloud.answer('getItems');
  await cloud.answer('setItem', true, text(v2));
  assert.deepEqual(await next, [{ id: 'my-x', compact: v2, localOnly: false }]);
  assert.equal(cloud.data['u_my-x'], ser(v2));
  assert.equal(local.getItem('u_my-x:pending'), null);
  assert.equal(cloud.held.length, 0);
});

test('list не возвращает запись, удалённую во время чтения облака, и не пишет её на устройство', async () => {
  const x = compactAt(T0 + 1);
  const local = fakeLocal({ 'u_my-x': ser(x) });
  const cloud = heldCloud({ data: { 'u_my-x': ser(x) } });
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 1000 });

  const listing = store.list();
  await cloud.answer('getKeys');
  // Запрос значений ушёл, и облако уже отдало запись; пока ответ идёт, человек удаляет
  const removing = store.remove('my-x');
  await cloud.answer('removeItem');
  await removing;
  assert.equal(local.getItem('u_my-x:deleted'), null, 'удаление подтверждено, пометки нет');
  await cloud.answer('getItems'); // ответ про запись, которой в облаке уже нет

  assert.deepEqual(await listing, []);
  assert.equal(local.getItem('u_my-x'), null);
  assert.equal(cloud.data['u_my-x'], undefined);
  assert.equal(cloud.held.length, 0);
});

test('подтверждение старой записи не снимает пометку у новой', async () => {
  const a = compactAt(T0 + 1, 'Первая');
  const b = compactAt(T0 + 2, 'Вторая');
  const text = c => ([, value]) => value === ser(c);
  const local = fakeLocal();
  const cloud = heldCloud();
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 1000 });

  // Вторая запись той же тренировки уходит, пока первая ещё без ответа
  const first = store.save('my-x', a);
  const second = store.save('my-x', b);
  await cloud.answer('setItem', true, text(a));
  assert.deepEqual(await first, { ok: true, localOnly: false });
  assert.equal(local.getItem('u_my-x:pending'), '1', 'вторая ещё не подтверждена');
  await cloud.answer('setItem', false, text(b));
  assert.deepEqual(await second, { ok: true, localOnly: true });
  assert.equal(local.getItem('u_my-x:pending'), '1');

  // В облаке первая версия, но list шлёт вторую, а не принимает облачную
  const listing = store.list();
  await cloud.answer('getKeys');
  await cloud.answer('getItems');
  await cloud.answer('setItem', true, text(b));
  assert.deepEqual(await listing, [{ id: 'my-x', compact: b, localOnly: false }]);
  assert.equal(cloud.data['u_my-x'], ser(b));
});

test('сохранение и удаление без облака оставляют пометки: когда облако появится, они сработают', async () => {
  const a = compactAt(T0 + 1, 'Сохранена без связи');
  const b = compactAt(T0 + 2, 'Удалена без связи');
  const local = fakeLocal();
  const bare = createMyWorkouts({ local });
  await bare.save('my-a', a);
  await bare.save('my-b', b);
  await bare.remove('my-b');
  assert.equal(local.getItem('u_my-a:pending'), '1');
  assert.equal(local.getItem('u_my-b:deleted'), '1');
  assert.deepEqual(await bare.list(), [{ id: 'my-a', compact: a, localOnly: false }]);

  // Следующий запуск уже с облаком, а удалённая там ещё лежит
  const cloud = flakyCloud({ data: { 'u_my-b': ser(b) } });
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });
  assert.deepEqual(await store.list(), [{ id: 'my-a', compact: a, localOnly: false }]);
  assert.equal(cloud.data['u_my-a'], ser(a), 'сохранённая без связи дошла до облака');
  assert.equal(cloud.data['u_my-b'], undefined, 'удалённая не вернулась');
  assert.equal(local.getItem('u_my-a:pending'), null);
  assert.equal(local.getItem('u_my-b:deleted'), null);
  assert.equal(local.getItem('u_my-b'), null);
});

test('сохранение поверх id с пометкой «удалено» снимает пометку', async () => {
  const first = compactAt(T0 + 1, 'Первая');
  const second = compactAt(T0 + 2, 'Вторая');

  // Удаление облако не получило, а новое сохранение не подтвердило: пометка
  // «удалено» не должна пережить сохранение, иначе list сотрёт новую в облаке
  const cloud = flakyCloud({ silentRemove: 1, failSet: 2 });
  const local = fakeLocal();
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });
  await store.save('my-a', first);
  await store.remove('my-a');
  assert.equal(local.getItem('u_my-a:deleted'), '1');
  assert.deepEqual(await store.save('my-a', second), { ok: true, localOnly: true });
  assert.equal(local.getItem('u_my-a:deleted'), null);
  assert.deepEqual(await store.list(), [{ id: 'my-a', compact: second, localOnly: false }]);
  assert.equal(cloud.data['u_my-a'], ser(second));
  assert.equal(cloud.calls.removeItem, 1, 'повторного удаления нет');

  // Устройство не приняло ничего, облако приняло: пометка снимается по ответу облака
  const deviceFull = fakeLocal({ 'u_my-b:deleted': '1' }, { rejects: () => true });
  const cloudB = flakyCloud();
  const storeB = createMyWorkouts({ cloud: cloudB, local: deviceFull, cloudTimeout: 20 });
  assert.deepEqual(await storeB.save('my-b', second), { ok: true, localOnly: false });
  assert.equal(deviceFull.getItem('u_my-b:deleted'), null);
  assert.deepEqual(idsOf(await storeB.list()), ['my-b']);
});

test('save отвергает запись, которую не прочитает parseCompact или не вместит облако', async () => {
  const cloud = flakyCloud();
  const local = fakeLocal();
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });

  await assert.rejects(store.save('my-a', { ...C, v: 2 }), /не прошла проверку формата/);
  await assert.rejects(store.save('my-a', { ...C, name: '   ' }), /не прошла проверку формата/);
  await assert.rejects(store.save('my-a', undefined), /не прошла проверку формата/);

  // Читается, но не помещается в одно значение облака
  const long = { ...C, strength: Array.from({ length: 120 }, (_, i) => `k${i}`.padEnd(40, 'x')) };
  assert.notEqual(parseCompact(ser(long)), null);
  assert.ok(ser(long).length > VALUE_MAX);
  await assert.rejects(store.save('my-a', long), /не помещается в одну запись/);

  assert.equal(local._map.size, 0, 'на устройство ничего не записано');
  assert.equal(cloud.calls.setItem, 0, 'облаку ничего не отдано');
  assert.deepEqual(await store.save('my-a', C), { ok: true, localOnly: false });
});

test('при пустом облаке getItems не вызывается', async () => {
  // Чужая запись (отметка) не тренировка; недосланная тренировка по-прежнему досылается
  const cloud = flakyCloud({ data: { 'm_legs-mwf_2026-09-01': '[]' } });
  const local = fakeLocal({ 'u_my-p': ser(C), 'u_my-p:pending': '1' });
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 20 });

  assert.deepEqual(await store.list(), [{ id: 'my-p', compact: C, localOnly: false }]);
  assert.equal(cloud.calls.getKeys, 1);
  assert.equal(cloud.calls.getItems, 0);
  assert.equal(cloud.data['u_my-p'], ser(C));
});

test('подтверждение старого удаления не снимает пометку у нового', async () => {
  const x = compactAt(T0 + 1);
  const again = compactAt(T0 + 2, 'Сохранена заново');
  const local = fakeLocal({ 'u_my-x': ser(x) });
  const cloud = heldCloud({ data: { 'u_my-x': ser(x) } });
  const store = createMyWorkouts({ cloud, local, cloudTimeout: 1000 });

  // Удалили, сохранили заново и удалили снова, пока первое удаление без ответа
  const first = store.remove('my-x');
  const saving = store.save('my-x', again);
  const last = store.remove('my-x');
  await cloud.answer('removeItem'); // облако подтвердило первое удаление
  await first;
  assert.equal(local.getItem('u_my-x:deleted'), '1', 'последнее удаление ещё не подтверждено');

  await cloud.answer('setItem'); // заново сохранённая лежит в облаке
  await saving;
  await cloud.answer('removeItem', false); // а последнее удаление облако не получило
  await last;
  assert.equal(cloud.data['u_my-x'], ser(again));
  assert.equal(local.getItem('u_my-x:deleted'), '1');

  // list повторяет удаление, а не возвращает тренировку из облака
  const listing = store.list();
  await cloud.answer('getKeys');
  await cloud.answer('getItems');
  await cloud.answer('removeItem');
  assert.deepEqual(await listing, []);
  assert.equal(cloud.data['u_my-x'], undefined);
  assert.equal(local.getItem('u_my-x'), null);
  assert.equal(local.getItem('u_my-x:deleted'), null);
  assert.equal(cloud.held.length, 0);
});
