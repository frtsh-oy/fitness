// Переключатели «Что есть дома»: разметка, состояние переключателей и то, что уходит
// наружу при нажатии. Выбор в блоке не хранится — это проверяет тот, кто его
// использует, — поэтому тест обходится без конструктора и без хранилища.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { GEAR } from '../gear.js';
import { renderGearPicker } from '../gear-picker.js';

const { document } = makeDom();

function mount({ owned = ['band_long', 'loop_short'], idPrefix = 'test-gear', onChange = () => {} } = {}) {
  const picker = renderGearPicker(document, { owned, onChange, idPrefix });
  document.body.replaceChildren(picker);
  return picker;
}

const buttons = picker => [...picker.querySelectorAll('button')];
const byId = (picker, id) => picker.querySelector(`[data-gear="${id}"]`);
const checkedIds = picker => buttons(picker).filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.dataset.gear);

test('разметка: заголовок, подсказка и группа переключателей, связанная с заголовком', () => {
  const picker = mount({ idPrefix: 'generator-gear' });
  assert.equal(picker.tagName, 'DIV');
  assert.equal(picker.className, 'gear-picker');

  const title = picker.querySelector('h2.builder-group-title');
  assert.equal(title.textContent, 'Что есть дома');
  assert.equal(title.id, 'generator-gear-title');

  const hint = picker.querySelector('p.gear-hint');
  assert.equal(hint.textContent, 'Отметь, что у тебя есть. Упражнения без инвентаря доступны всегда.');

  const group = picker.querySelector('ul.gear-list');
  assert.equal(group.getAttribute('role'), 'group');
  assert.equal(group.getAttribute('aria-labelledby'), title.id);
  assert.equal(document.getElementById(group.getAttribute('aria-labelledby')), title);

  // Порядок на экране: заголовок, подсказка, переключатели.
  assert.deepEqual([...picker.children], [title, hint, group]);
});

test('кнопка на каждый вид из словаря, по порядку; «без инвентаря» среди них нет', () => {
  const picker = mount();
  const switches = buttons(picker);

  assert.deepEqual(switches.map(b => b.dataset.gear), GEAR.map(([id]) => id));
  assert.deepEqual(switches.map(b => b.textContent),
    ['Длинная резинка', 'Мини-петля', 'Резинка с ручками', 'Гантели', 'Гиря']);
  for (const item of switches) {
    assert.equal(item.type, 'button', item.textContent);
    // Включить или выключить то, что есть дома, — настройка: роль switch, а не чип.
    assert.equal(item.getAttribute('role'), 'switch', item.textContent);
    assert.ok(item.classList.contains('gear-switch'));
    assert.equal(item.parentElement.parentElement, picker.querySelector('.gear-list'));
    assert.ok(item.querySelector('.sw[aria-hidden="true"]'), 'дорожка — украшение: состояние читается по aria-checked');
  }
  assert.equal(picker.querySelector('[data-gear="none"]'), null);
});

test('aria-checked повторяет owned', () => {
  assert.deepEqual(checkedIds(mount({ owned: ['band_long', 'loop_short'] })), ['band_long', 'loop_short']);
  assert.deepEqual(checkedIds(mount({ owned: ['kettlebell', 'dumbbells'] })), ['dumbbells', 'kettlebell']);
  assert.deepEqual(checkedIds(mount({ owned: [] })), [], 'ничего не отмечено — законно');

  const all = mount({ owned: GEAR.map(([id]) => id) });
  assert.ok(buttons(all).every(b => b.getAttribute('aria-checked') === 'true'));
  // Атрибут стоит у каждой кнопки, в том числе у ненажатых: «false», а не отсутствие.
  const none = mount({ owned: [] });
  assert.ok(buttons(none).every(b => b.getAttribute('aria-checked') === 'false'));
});

test('нажатие переключает вид и зовёт onChange с новым набором в порядке словаря и id вида', () => {
  const calls = [];
  const picker = mount({ owned: ['band_long', 'loop_short'], onChange: (owned, id) => calls.push([owned, id]) });

  byId(picker, 'kettlebell').click();
  assert.deepEqual(calls, [[['band_long', 'loop_short', 'kettlebell'], 'kettlebell']]);
  assert.equal(byId(picker, 'kettlebell').getAttribute('aria-checked'), 'true');

  // Порядок словаря, а не порядок нажатий: гантели стоят перед гирей.
  byId(picker, 'dumbbells').click();
  assert.deepEqual(calls.at(-1), [['band_long', 'loop_short', 'dumbbells', 'kettlebell'], 'dumbbells']);

  // Повторное нажатие снимает вид.
  byId(picker, 'band_long').click();
  assert.deepEqual(calls.at(-1), [['loop_short', 'dumbbells', 'kettlebell'], 'band_long']);
  assert.equal(byId(picker, 'band_long').getAttribute('aria-checked'), 'false');
  assert.deepEqual(checkedIds(picker), ['loop_short', 'dumbbells', 'kettlebell']);
  assert.equal(calls.length, 3, 'по одному вызову на нажатие');
});

test('можно снять всё: onChange получает пустой набор', () => {
  const calls = [];
  const picker = mount({ owned: ['dumbbells'], onChange: owned => calls.push(owned) });
  byId(picker, 'dumbbells').click();
  assert.deepEqual(calls, [[]]);
  assert.deepEqual(checkedIds(picker), []);
});

test('к моменту onChange состояние переключателя уже обновлено', () => {
  const seen = [];
  const picker = mount({
    owned: [],
    onChange: (owned, id) => seen.push(byId(picker, id).getAttribute('aria-checked')),
  });
  byId(picker, 'dumbbells').click();
  assert.deepEqual(seen, ['true']);
});

test('переданный owned не меняется и не удерживается', () => {
  const owned = ['band_long'];
  const calls = [];
  const picker = mount({ owned, onChange: next => calls.push(next) });

  byId(picker, 'dumbbells').click();
  assert.deepEqual(owned, ['band_long'], 'массив вызывающего не тронут');

  // Правка массива после отрисовки на блок не действует: свой набор у него свой.
  owned.push('kettlebell');
  byId(picker, 'loop_short').click();
  assert.deepEqual(calls.at(-1), ['band_long', 'loop_short', 'dumbbells']);
});

test('id заголовков разных блоков различаются по idPrefix', () => {
  const generator = renderGearPicker(document, { owned: [], onChange: () => {}, idPrefix: 'generator-gear' });
  const library = renderGearPicker(document, { owned: [], onChange: () => {}, idPrefix: 'library-gear' });
  document.body.replaceChildren(generator, library);

  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.deepEqual(ids, ['generator-gear-title', 'library-gear-title']);
  assert.equal(generator.querySelector('.gear-list').getAttribute('aria-labelledby'), 'generator-gear-title');
  assert.equal(library.querySelector('.gear-list').getAttribute('aria-labelledby'), 'library-gear-title');
});
