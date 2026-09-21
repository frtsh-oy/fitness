// renderBuilder в изоляции от ../access.js: hasSubscription передаётся
// параметром, поэтому обе ветки текста проверяются напрямую, без подмены
// импорта. Это же доказывает, что мутация `hasSubscription → true` в
// access.js не проходит незамеченной: app.js зовёт renderBuilder с настоящим
// hasSubscription, и с true экран обязан заговорить иначе — см.
// test/sections.test.js: «Конструктор» объясняет, что это и почему платно».
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { renderBuilder } from '../builder-view.js';

function host() {
  const { document } = makeDom('<!doctype html><html><body><div id="host"></div></body></html>');
  return document.getElementById('host');
}

test('без подписки — что это за раздел, что в нём будет и что он платный', () => {
  const h = host();
  renderBuilder({ host: h, hasSubscription: () => false });
  assert.match(h.textContent, /платн/i);
  assert.match(h.textContent, /упражнени/i);
});

test('с подпиской — честно «ещё не готов», без разговора о цене', () => {
  const h = host();
  renderBuilder({ host: h, hasSubscription: () => true });
  assert.match(h.textContent, /не готов/i);
  assert.doesNotMatch(h.textContent, /платн/i,
    'с подпиской платность уже не новость — повторять её незачем');
});
