// Единственная точка, отвечающая «есть ли подписка». Сервера ещё нет, и
// честный ответ один: подписки нет. Признак оплаты НЕ хранится в хранилище
// Telegram: туда пишет клиент, и «оплачено» впишет туда кто угодно.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasSubscription } from '../access.js';

test('пока сервера нет, подписки нет', () => {
  assert.equal(hasSubscription(), false);
});

test('ответ не зависит от того, что лежит в хранилище', () => {
  const source = readFileSync(new URL('../access.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|CloudStorage/,
    'подписка не должна читаться из хранилища, доступного клиенту на запись');
});
