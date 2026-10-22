// Переключатели «Формат занятия»: какие из блоков разминки, разогрева и
// завершения есть в тренировке и как выстроена силовая часть (пары, круг,
// подходы). Один блок на сборку и на результат генератора: оба правят одну
// тренировку и должны выглядеть и вести себя одинаково. Выбор здесь не хранится:
// что значит нажатие и что сейчас выбрано, знает тот, кто вызвал (state, onBlock,
// onFormat), — так блок проверяется без конструктора и без черновика.
import { SLOT_LABELS } from './exercises/index.js';
import { FORMATS, OPTIONAL_SLOTS, formatOf } from './builder/format.js';

const el = (document, tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// state() → { blocks: { warmup, circuit, cooldown }: bool, format }: что нажато
// сейчас. onBlock(slot) → строка с причиной, если блок не включился, иначе null:
// включить блок, для которого нет подходящих упражнений, нельзя, и сказать об
// этом должен тот, кто знает почему. onFormat(id) ничего не возвращает.
// idPrefix делает id заголовка и подписей уникальными на странице: сборка и результат не
// видны одновременно, но блок от этого не должен зависеть.
export function renderFormatPicker(document, { state, onBlock, onFormat, idPrefix }) {
  const root = el(document, 'div', 'format-picker');
  const title = el(document, 'h3', 'builder-group-title', 'Формат занятия');
  title.id = `${idPrefix}-title`;

  // Группы чипов — те же .zone-chips и .zone-chip, что у зон и инвентаря: свой
  // вид у переключателя был бы ещё одним чипом, который чинить вместе с первым.
  // Имя группе даёт видимая подпись над ней (aria-labelledby), а не копия в
  // aria-label: иначе диктор прочтёт её дважды.
  const chips = (labelId, className, items) => {
    const group = el(document, 'div', 'zone-chips');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-labelledby', labelId);
    const buttons = items.map(([id, text]) => {
      const button = el(document, 'button', `zone-chip ${className}`, text);
      button.type = 'button';
      group.append(button);
      return [id, button];
    });
    return { group, buttons };
  };

  const label = (id, text) => {
    const node = el(document, 'p', 'format-label', text);
    node.id = `${idPrefix}-${id}`;
    return node;
  };
  const blocksLabel = label('blocks', 'Блоки');
  const formatsLabel = label('strength', 'Силовая часть');
  const blocks = chips(blocksLabel.id, 'block-chip', OPTIONAL_SLOTS.map(slot => [slot, SLOT_LABELS[slot]]));
  const formats = chips(formatsLabel.id, 'format-chip', Object.entries(FORMATS).map(([id, format]) => [id, format.label]));
  for (const [slot, button] of blocks.buttons) button.dataset.block = slot;
  for (const [id, button] of formats.buttons) button.dataset.format = id;

  const hint = el(document, 'p', 'format-hint');
  // Причина стоит в разметке заранее и лишь показывается: с ролью alert диктор
  // озвучит появившееся, а на узле, которого не было, он промолчал бы. Как у
  // отказа генератора (builder-view.js, alertNote).
  const reason = el(document, 'p', 'format-reason');
  reason.setAttribute('role', 'alert');
  reason.hidden = true;

  // Всё, что на экране, берётся из state(), а не копится здесь: нажатые кнопки и
  // пояснение не расходятся с тем, что у вызывающего. Узел живёт столько же,
  // сколько экран, поэтому фокус остаётся на нажатой кнопке.
  function paint(refusal) {
    const current = state();
    const format = formatOf(current);
    for (const [slot, button] of blocks.buttons) button.setAttribute('aria-pressed', String(current.blocks[slot] === true));
    for (const [id, button] of formats.buttons) button.setAttribute('aria-pressed', String(id === format));
    hint.textContent = FORMATS[format].hint;
    reason.hidden = refusal === null;
    reason.textContent = refusal ?? '';
  }

  for (const [slot, button] of blocks.buttons) {
    button.addEventListener('click', () => paint(onBlock(slot) ?? null));
  }
  for (const [id, button] of formats.buttons) {
    button.addEventListener('click', () => {
      onFormat(id);
      paint(null);
    });
  }

  root.append(title, blocksLabel, blocks.group, formatsLabel, formats.group, hint, reason);
  paint(null);
  return root;
}
