// Поиск упражнений по тексту: один на библиотеку и на шторку замены
// (builder/search.js). Экраны проверяют его в деле; здесь — правила самого поиска.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuery, entrySearchText, matchesQuery } from '../builder/search.js';

// Образец: цель — квадрицепсы (доля 1), икроножные — вспомогательная группа
// (доля 0.5) и в подписях нигде не встречаются.
const ENTRY = Object.freeze({
  name: 'Ёлочка с резинкой',
  muscles: 'Бёдра и ягодицы',
  load: Object.freeze({ quads: 1, calves: 0.5 }),
  pattern: 'squat',
  gear: Object.freeze(['band_long']),
});
const BARE = Object.freeze({ ...ENTRY, name: 'Просто присед', gear: Object.freeze(['none']) });

test('нормализация: без регистра, «ё» как «е», без пробелов по краям', () => {
  assert.equal(normalizeQuery('  ЁЛКА '), 'елка');
  assert.equal(normalizeQuery('Бёдра'), 'бедра');
  assert.equal(normalizeQuery(''), '');
});

test('искать можно по названию, подписи мышц, целевой группе, движению и инвентарю', () => {
  for (const query of [
    'елоч', 'ЁЛОЧКА',          // название, «ё» набирают редко
    'бедра', 'ягодиц',         // подпись мышц с карточки
    'квадрицепс',              // целевая группа из словаря: в подписи её нет
    'присед',                  // движение
    'длинная резинка', 'резин', // инвентарь той же подписью, что на карточке
  ]) assert.equal(matchesQuery(ENTRY, query), true, query);
  assert.equal(matchesQuery(BARE, 'без инв'), true, 'по «без инв» находятся упражнения без инвентаря');
  assert.equal(matchesQuery(ENTRY, 'без инв'), false);
});

test('вспомогательная группа (доля меньше 1) в поиск не входит', () => {
  assert.equal(matchesQuery(ENTRY, 'икроножн'), false);
  assert.doesNotMatch(entrySearchText(ENTRY), /икроножн/);
});

test('слова ищутся все и в любом порядке; пустой запрос находит всё', () => {
  assert.equal(matchesQuery(ENTRY, 'резинк ёлоч'), true, 'порядок не важен');
  assert.equal(matchesQuery(ENTRY, 'ёлоч гантел'), false, 'каждое слово должно найтись');
  assert.equal(matchesQuery(ENTRY, ''), true);
  assert.equal(matchesQuery(ENTRY, '   '), true, 'одни пробелы — пустой запрос');
  assert.equal(matchesQuery(ENTRY, ' ёлоч  резин '), true, 'лишние пробелы между словами не мешают');
});

test('текст для поиска собран один раз и нормализован', () => {
  const text = entrySearchText(ENTRY);
  assert.equal(text, text.toLowerCase());
  assert.doesNotMatch(text, /ё/);
  assert.match(text, /квадрицепс/);
});
