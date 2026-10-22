import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS, DEFAULT_FORMAT, OPTIONAL_SLOTS, formatOf } from '../builder/format.js';

// Подписи и пояснения видит человек, а на id опирается запись в облаке: меняется
// одно из них — тест называет, что именно.
test('форматы: id, подписи и пояснения дословно', () => {
  assert.deepEqual(FORMATS, {
    pairs: { label: 'Пары', hint: 'Два упражнения по очереди, отдых после пары.' },
    loop: { label: 'Круг', hint: 'Все силовые подряд, отдых после круга.' },
    sets: { label: 'Подходы', hint: 'Все подходы одного упражнения, потом следующее.' },
  });
  // Порядок — порядок кнопок на экране.
  assert.deepEqual(Object.keys(FORMATS), ['pairs', 'loop', 'sets']);
});

test('по умолчанию «Пары», а выключаются разминка, разогрев и завершение', () => {
  assert.equal(DEFAULT_FORMAT, 'pairs');
  assert.deepEqual(OPTIONAL_SLOTS, ['warmup', 'circuit', 'cooldown']);
  // Силовые выключить нельзя: без них нет тренировки.
  assert.ok(!OPTIONAL_SLOTS.includes('strength'));
});

// id «loop», а не «circuit»: circuit в записи уже слот разогрева.
test('id формата «Круг» не совпадает с id слота разогрева', () => {
  assert.ok(!('circuit' in FORMATS));
  assert.ok('loop' in FORMATS);
});

test('formatOf: нет поля, незнакомое значение и не строка читаются как «Пары»', () => {
  assert.equal(formatOf({}), 'pairs');
  assert.equal(formatOf({ format: 'zzz' }), 'pairs');
  assert.equal(formatOf({ format: 42 }), 'pairs');
  assert.equal(formatOf({ format: null }), 'pairs');
  assert.equal(formatOf({ format: ['sets'] }), 'pairs');
  // Не формат, хотя у любого объекта такое свойство есть.
  for (const word of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
    assert.equal(formatOf({ format: word }), 'pairs', word);
  }
});

test('formatOf: известный формат возвращается как есть', () => {
  for (const id of Object.keys(FORMATS)) assert.equal(formatOf({ format: id }), id);
  assert.equal(formatOf({ format: 'sets' }), 'sets');
});
