import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasOwn } from '../own.js';

// Ключи приходят из ненадёжных мест (localStorage, облако, ссылка), поэтому
// «есть» значит «положено в сам объект»: унаследованные имена не считаются.
test('hasOwn: собственный ключ есть, унаследованного и отсутствующего нет', () => {
  const object = { level: 1, empty: undefined };
  assert.equal(hasOwn(object, 'level'), true);
  assert.equal(hasOwn(object, 'empty'), true, 'ключ со значением undefined — всё равно ключ');
  assert.equal(hasOwn(object, 'missing'), false);
  for (const inherited of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(hasOwn(object, inherited), false, inherited);
  }
});

// Объект без прототипа не имеет метода hasOwnProperty, и вызов через него упал бы.
test('hasOwn работает и на объекте без прототипа', () => {
  const bare = Object.assign(Object.create(null), { level: 1 });
  assert.equal(hasOwn(bare, 'level'), true);
  assert.equal(hasOwn(bare, 'missing'), false);
});
