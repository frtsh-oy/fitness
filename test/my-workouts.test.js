import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLOUD_KEY } from '../kv.js';
import { serializeCompact } from '../builder/compact.js';
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

  // Запись легла, а пометка «не подтверждено» нет: без пометки следующий list
  // принял бы запись за удалённую на другом устройстве и стёр бы её. Поэтому
  // сохранённой на устройстве такая запись не считается.
  const noFlag = fakeLocal({}, { rejects: key => key.endsWith(':pending') });
  assert.deepEqual(
    await createMyWorkouts({ cloud: deadCloud(), local: noFlag, cloudTimeout: 20 }).save('my-a', C),
    { ok: false, reason: 'device' },
  );

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
