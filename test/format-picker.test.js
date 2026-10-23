// Переключатели «Формат занятия»: разметка, нажатое состояние и то, что уходит
// наружу при нажатии. Выбор в блоке не хранится — им распоряжается тот, кто его
// использует, — поэтому тест обходится без конструктора и без черновика: свой
// state и свои onBlock и onFormat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDom } from './setup.js';
import { FORMATS, OPTIONAL_SLOTS } from '../builder/format.js';
import { SLOT_LABELS } from '../exercises/index.js';
import { renderFormatPicker } from '../format-picker.js';

const { document } = makeDom();

// Состояние живёт у теста, как у конструктора живёт черновик. onBlock по
// умолчанию переключает блок, onFormat — меняет формат; calls хранит вызовы.
function mount({ blocks = { warmup: true, circuit: true, cooldown: true }, format = 'pairs', idPrefix = 'test-format', onBlock, onFormat } = {}) {
  const current = { blocks: { ...blocks }, format };
  const calls = [];
  const picker = renderFormatPicker(document, {
    idPrefix,
    state: () => ({ blocks: { ...current.blocks }, format: current.format }),
    onBlock(slot) {
      calls.push(['block', slot]);
      if (onBlock) return onBlock(slot, current);
      current.blocks[slot] = !current.blocks[slot];
      return null;
    },
    onFormat(id) {
      calls.push(['format', id]);
      if (onFormat) onFormat(id, current);
      else current.format = id;
    },
  });
  document.body.replaceChildren(picker);
  return { picker, current, calls };
}

const blockButtons = picker => [...picker.querySelectorAll('.block-chip')];
const formatButtons = picker => [...picker.querySelectorAll('.format-chip')];
const block = (picker, slot) => picker.querySelector(`[data-block="${slot}"]`);
const format = (picker, id) => picker.querySelector(`[data-format="${id}"]`);
const pressedBlocks = picker => blockButtons(picker).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.block);
const pressedFormats = picker => formatButtons(picker).filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.format);
const reasonOf = picker => picker.querySelector('.format-reason');

// Имя группы для диктора: текст узла, на который указывает aria-labelledby.
const nameOf = group => group.closest('.format-picker').querySelector(`#${group.getAttribute('aria-labelledby')}`)?.textContent;

test('разметка: заголовок, две подписанные группы кнопок, пояснение и причина по порядку', () => {
  const { picker } = mount({ idPrefix: 'build-format' });
  assert.equal(picker.tagName, 'DIV');
  assert.equal(picker.className, 'format-picker');

  const title = picker.querySelector('h2.builder-group-title');
  assert.equal(title.textContent, 'Формат занятия');
  assert.equal(title.id, 'build-format-title');

  const [blocksLabel, formatLabel] = picker.querySelectorAll('p.format-label');
  assert.equal(blocksLabel.textContent, 'Блоки');
  assert.equal(formatLabel.textContent, 'Силовая часть');
  assert.equal(blocksLabel.id, 'build-format-blocks');
  assert.equal(formatLabel.id, 'build-format-strength');

  const [blocksGroup, formatGroup] = picker.querySelectorAll('div.zone-chips, div.seg');
  assert.ok(blocksGroup.classList.contains('zone-chips'), 'блоки — чипы');
  assert.ok(formatGroup.classList.contains('seg'), 'силовая часть — сегмент');
  for (const [group, label] of [[blocksGroup, 'Блоки'], [formatGroup, 'Силовая часть']]) {
    assert.equal(group.getAttribute('role'), 'group', label);
    assert.equal(nameOf(group), label);
    assert.equal(group.getAttribute('aria-label'), null, 'имя одно — от видимой подписи, без копии');
  }

  const hint = picker.querySelector('p.format-hint');
  const reason = reasonOf(picker);
  assert.equal(reason.tagName, 'P');
  assert.deepEqual([...picker.children], [title, blocksLabel, blocksGroup, formatLabel, formatGroup, hint, reason]);
});

test('кнопки блоков — по слоту из OPTIONAL_SLOTS с подписями из SLOT_LABELS', () => {
  const { picker } = mount();
  const chips = blockButtons(picker);
  assert.deepEqual(chips.map(b => b.dataset.block), OPTIONAL_SLOTS);
  assert.deepEqual(chips.map(b => b.textContent), ['Разминка', 'Разогрев', 'Завершение']);
  assert.deepEqual(chips.map(b => b.textContent), OPTIONAL_SLOTS.map(slot => SLOT_LABELS[slot]));
  for (const chip of chips) {
    assert.equal(chip.type, 'button', chip.textContent);
    assert.ok(chip.classList.contains('zone-chip'), 'вид чипа даёт .zone-chip');
    assert.ok(chip.querySelector('svg.tick'), 'галочка нажатого чипа — значок, а не символ шрифта');
    assert.equal(nameOf(chip.parentElement), 'Блоки');
  }
});

test('кнопки формата — по одной на формат из FORMATS, с его подписью', () => {
  const { picker } = mount();
  const chips = formatButtons(picker);
  assert.deepEqual(chips.map(b => b.dataset.format), Object.keys(FORMATS));
  assert.deepEqual(chips.map(b => b.textContent), ['Пары', 'Круг', 'Подходы']);
  for (const chip of chips) {
    assert.equal(chip.type, 'button', chip.textContent);
    assert.ok(!chip.classList.contains('zone-chip'), 'формат — кнопка сегмента, не чип');
    assert.ok(!chip.classList.contains('block-chip'));
    assert.ok(chip.parentElement.classList.contains('seg'));
    assert.equal(nameOf(chip.parentElement), 'Силовая часть');
  }
});

test('начальные aria-pressed берутся из state(): блоки и формат', () => {
  const all = mount();
  assert.deepEqual(pressedBlocks(all.picker), ['warmup', 'circuit', 'cooldown']);
  assert.deepEqual(pressedFormats(all.picker), ['pairs']);

  const some = mount({ blocks: { warmup: false, circuit: true, cooldown: false }, format: 'sets' });
  assert.deepEqual(pressedBlocks(some.picker), ['circuit']);
  assert.deepEqual(pressedFormats(some.picker), ['sets']);
  // aria-pressed стоит у каждой кнопки: «не нажата» тоже должно быть сказано.
  for (const button of [...blockButtons(some.picker), ...formatButtons(some.picker)]) {
    assert.ok(['true', 'false'].includes(button.getAttribute('aria-pressed')), button.textContent);
  }

  const none = mount({ blocks: { warmup: false, circuit: false, cooldown: false } });
  assert.deepEqual(pressedBlocks(none.picker), []);
});

test('пояснение — подсказка текущего формата', () => {
  for (const [id, { hint }] of Object.entries(FORMATS)) {
    assert.equal(mount({ format: id }).picker.querySelector('.format-hint').textContent, hint, id);
  }
});

test('причина в начале пуста и скрыта, у неё роль alert: диктор озвучит появившееся', () => {
  const { picker } = mount();
  const reason = reasonOf(picker);
  assert.equal(reason.hidden, true);
  assert.equal(reason.textContent, '');
  assert.equal(reason.getAttribute('role'), 'alert');
});

test('клик по блоку зовёт onBlock с нужным слотом и перечитывает state', () => {
  const { picker, calls, current } = mount();
  block(picker, 'circuit').click();
  assert.deepEqual(calls, [['block', 'circuit']]);
  assert.equal(current.blocks.circuit, false);
  assert.deepEqual(pressedBlocks(picker), ['warmup', 'cooldown']);

  block(picker, 'circuit').click();
  block(picker, 'warmup').click();
  assert.deepEqual(calls.map(([, slot]) => slot), ['circuit', 'circuit', 'warmup']);
  assert.deepEqual(pressedBlocks(picker), ['circuit', 'cooldown']);
});

test('state() читается после нажатия заново, а не копится в блоке', () => {
  // Вызывающий вправе поправить состояние по-своему: блок показывает, что он
  // сказал, а не то, что нажали.
  const { picker, current } = mount({
    onBlock(slot, state) {
      state.blocks.warmup = false;
      state.blocks.cooldown = false;
      return null;
    },
  });
  block(picker, 'circuit').click();
  assert.deepEqual(pressedBlocks(picker), ['circuit']);
  assert.equal(current.format, 'pairs');
});

test('причина показывается, пока блок не включился, и снимается любым следующим нажатием', () => {
  const reason = 'Для блока «Разогрев» нет подходящих упражнений.';
  const { picker, current } = mount({
    blocks: { warmup: true, circuit: false, cooldown: true },
    onBlock: (slot, state) => (slot === 'circuit' ? reason : (state.blocks[slot] = !state.blocks[slot], null)),
  });

  block(picker, 'circuit').click();
  assert.equal(reasonOf(picker).hidden, false);
  assert.equal(reasonOf(picker).textContent, reason);
  assert.deepEqual(pressedBlocks(picker), ['warmup', 'cooldown'], 'блок остался выключенным');

  // Тот же отказ повторяется, а не копится.
  block(picker, 'circuit').click();
  assert.equal(reasonOf(picker).textContent, reason);

  block(picker, 'warmup').click();
  assert.equal(reasonOf(picker).hidden, true, 'другой блок снял причину');
  assert.equal(reasonOf(picker).textContent, '');

  block(picker, 'circuit').click();
  assert.equal(reasonOf(picker).hidden, false);
  format(picker, 'loop').click();
  assert.equal(reasonOf(picker).hidden, true, 'смена формата тоже снимает причину');
  assert.equal(current.format, 'loop');
});

test('onBlock без ответа не показывает причину', () => {
  const { picker } = mount({ onBlock: (slot, state) => { state.blocks[slot] = !state.blocks[slot]; } });
  block(picker, 'warmup').click();
  assert.equal(reasonOf(picker).hidden, true);
  assert.deepEqual(pressedBlocks(picker), ['circuit', 'cooldown']);
});

test('клик по формату зовёт onFormat, меняет нажатую кнопку и пояснение, блоки не трогает', () => {
  const { picker, calls } = mount({ blocks: { warmup: false, circuit: true, cooldown: true } });
  format(picker, 'sets').click();
  assert.deepEqual(calls, [['format', 'sets']]);
  assert.deepEqual(pressedFormats(picker), ['sets']);
  assert.equal(picker.querySelector('.format-hint').textContent, FORMATS.sets.hint);
  assert.deepEqual(pressedBlocks(picker), ['circuit', 'cooldown']);

  format(picker, 'loop').click();
  assert.deepEqual(pressedFormats(picker), ['loop']);
  assert.equal(picker.querySelector('.format-hint').textContent, FORMATS.loop.hint);
});

test('кнопка блока не зовёт onFormat, а кнопка формата — onBlock', () => {
  const { picker, calls } = mount();
  block(picker, 'cooldown').click();
  format(picker, 'sets').click();
  assert.deepEqual(calls, [['block', 'cooldown'], ['format', 'sets']]);
});

test('узел один на всё время экрана: после нажатия те же кнопки на месте, фокус остаётся на нажатой', () => {
  const { picker } = mount();
  const chip = block(picker, 'warmup');
  const formatChip = format(picker, 'loop');
  const all = [...picker.querySelectorAll('button')];

  chip.focus();
  chip.click();
  assert.equal(document.activeElement, chip);
  formatChip.focus();
  formatChip.click();
  assert.equal(document.activeElement, formatChip);

  assert.equal(document.body.firstElementChild, picker);
  assert.deepEqual([...picker.querySelectorAll('button')], all, 'кнопки те же узлы');
  assert.ok(all.every(button => button.isConnected));
});

test('два блока с разными idPrefix не дают одинаковых id', () => {
  const first = renderFormatPicker(document, { state: () => ({ blocks: {}, format: 'pairs' }), onBlock: () => null, onFormat() {}, idPrefix: 'build-format' });
  const second = renderFormatPicker(document, { state: () => ({ blocks: {}, format: 'pairs' }), onBlock: () => null, onFormat() {}, idPrefix: 'result-format' });
  document.body.replaceChildren(first, second);
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.deepEqual(ids, ['build-format-title', 'build-format-blocks', 'build-format-strength', 'result-format-title', 'result-format-blocks', 'result-format-strength']);
  assert.equal(new Set(ids).size, ids.length);
});

test('незнакомый формат в state() читается как «Пары»: блок не падает', () => {
  const { picker } = mount({ format: 'zzz' });
  assert.deepEqual(pressedFormats(picker), ['pairs']);
  assert.equal(picker.querySelector('.format-hint').textContent, FORMATS.pairs.hint);
});
