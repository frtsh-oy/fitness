import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';

test('jsdom поднимается и отдаёт документ', () => {
  const { document } = makeDom('<!doctype html><html><body><p id="x">привет</p></body></html>');
  assert.equal(document.getElementById('x').textContent, 'привет');
});
