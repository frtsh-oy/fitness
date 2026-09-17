import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWorkout, countMarks, PATTERNS, NO_LOAD_PATTERN } from '../workouts/schema.js';

function minimalWorkout(overrides = {}) {
  return {
    id: 'test',
    kicker: 'ДОМА',
    title: 'Тест один. Тест два.',
    titleLines: ['Тест один.', 'Тест два.'],
    lead: 'Описание',
    days: [1, 3, 5],
    stats: [{ v: '10', l: 'минут' }],
    equipment: 'Коврик',
    blocks: [{
      id: 'b1', n: '01', nav: 'Блок', title: 'Блок', sub: 'Подзаголовок', rounds: 2,
      items: [{
        key: 'ex1', name: 'Упражнение', muscles: 'Ягодицы', reps: '10 раз', text: 'Описание',
        load: { glutes: 1 }, pattern: 'hinge', gear: ['band_long'],
        unilateral: false, kind: 'strength',
      }],
    }],
    progression: ['Совет'],
    caution: 'Осторожно',
    ...overrides,
  };
}

test('корректная тренировка проходит проверку', () => {
  assert.deepEqual(validateWorkout(minimalWorkout()), []);
});

test('отсутствие обязательного поля верхнего уровня попадает в отчёт', () => {
  const w = minimalWorkout();
  delete w.title;
  const problems = validateWorkout(w);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /title/);
});

test('titleLines из трёх строк попадает в отчёт', () => {
  const w = minimalWorkout({ titleLines: ['раз', 'два', 'три'] });
  assert.match(validateWorkout(w).join('\n'), /titleLines/);
});

test('блок без короткой подписи nav попадает в отчёт', () => {
  const w = minimalWorkout();
  delete w.blocks[0].nav;
  assert.match(validateWorkout(w).join('\n'), /nav/);
});

test('неизвестная группа мышц в load попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = { nonexistent: 1 };
  assert.match(validateWorkout(w).join('\n'), /nonexistent/);
});

test('значение load кроме 1 и 0.5 попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = { glutes: 0.7 };
  assert.match(validateWorkout(w).join('\n'), /0\.7/);
});

test('неизвестный pattern попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].pattern = 'flying';
  assert.match(validateWorkout(w).join('\n'), /flying/);
});

test('неизвестный инвентарь попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].gear = ['kettlebell'];
  assert.match(validateWorkout(w).join('\n'), /kettlebell/);
});

// Пустой load запрещён упражнению любого типа, а не только силовому: разметка —
// это ещё и «какие упражнения есть на эту мышцу» для карты тела, а разминку и
// заминку от объёма отделяет kind. Единственное исключение ниже — pattern
// NO_LOAD_PATTERN, и оно намеренно привязано к pattern, а не к kind: заминка —
// это в основном растяжки, и разрешить пустоту всем заминкам значило бы
// сделать их разметку необязательной, то есть терять растяжки на карте молча.
test('разминочному упражнению пустой load запрещён', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].kind = 'warmup';
  w.blocks[0].items[0].load = {};
  assert.match(validateWorkout(w).join('\n'), /load/);
});

test('заминочному упражнению пустой load запрещён', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].kind = 'cooldown';
  w.blocks[0].items[0].load = {};
  assert.match(validateWorkout(w).join('\n'), /load/);
});

test('силовому упражнению пустой load запрещён', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = {};
  assert.match(validateWorkout(w).join('\n'), /load/);
});

// Восстановительное упражнение («Спокойное дыхание») не тренирует ничего, и
// разметка, придуманная ради правила, была бы хуже её отсутствия. Пустоту
// разрешает явная пометка pattern, по которой видно, что нагрузки нет
// намеренно.
test('упражнению с pattern для восстановления пустой load разрешён', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].kind = 'cooldown';
  w.blocks[0].items[0].pattern = NO_LOAD_PATTERN;
  w.blocks[0].items[0].load = {};
  assert.deepEqual(validateWorkout(w), []);
});

// Тест выше прошёл бы и при NO_LOAD_PATTERN, забытом в словаре PATTERNS, —
// нет: забытый дал бы «неизвестный pattern». Зато он прошёл бы при
// послаблении, привязанном к kind === 'cooldown', поэтому парой к нему стоит
// «заминочному упражнению пустой load запрещён» выше: там тот же kind, но
// обычный pattern.
test('pattern для восстановления есть в словаре PATTERNS', () => {
  assert.ok(PATTERNS.includes(NO_LOAD_PATTERN), `${NO_LOAD_PATTERN} нет в PATTERNS`);
});

// Послабление касается только пустоты: если восстановительному упражнению
// всё-таки разметили нагрузку, это обычная разметка и проверяется как обычная.
test('у восстановительного упражнения непустой load проверяется как у любого другого', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].pattern = NO_LOAD_PATTERN;
  w.blocks[0].items[0].load = { nonexistent: 1 };
  assert.match(validateWorkout(w).join('\n'), /nonexistent/);
});

// key: устойчивый идентификатор упражнения, из которого строится идентификатор
// отметки. Обещан контрактом рендерера, а проверять его было некому.

test('упражнение без key попадает в отчёт', () => {
  const w = minimalWorkout();
  delete w.blocks[0].items[0].key;
  assert.match(validateWorkout(w).join('\n'), /key/);
});

test('key не строкой попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].key = 7;
  assert.match(validateWorkout(w).join('\n'), /key/);
});

test('пустая строка в key попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].key = '';
  assert.match(validateWorkout(w).join('\n'), /key/);
});

test('два одинаковых key внутри блока попадают в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items.push({ ...w.blocks[0].items[0], name: 'Второе упражнение' });
  assert.match(validateWorkout(w).join('\n'), /дубликат key/);
});

// Уникальность требуется в пределах блока, а не всей тренировки: в
// идентификатор отметки входит id блока, поэтому одинаковые ключи в разных
// блоках не сталкиваются.
test('одинаковый key в разных блоках разрешён', () => {
  const w = minimalWorkout();
  w.blocks.push({
    id: 'b2', n: '02', nav: 'Второй', title: 'Второй', sub: 'Подзаголовок', rounds: 1,
    items: [{ ...w.blocks[0].items[0] }],
  });
  assert.deepEqual(validateWorkout(w), []);
});

// days — машиночитаемое расписание: из него строятся обе строки на странице,
// и оно же будущая недельная частота.

test('тренировка без days попадает в отчёт', () => {
  const w = minimalWorkout();
  delete w.days;
  assert.match(validateWorkout(w).join('\n'), /days/);
});

test('пустой массив days попадает в отчёт', () => {
  assert.match(validateWorkout(minimalWorkout({ days: [] })).join('\n'), /days/);
});

test('день недели вне 1–7 попадает в отчёт', () => {
  assert.match(validateWorkout(minimalWorkout({ days: [1, 8] })).join('\n'), /8/);
});

test('день недели не целым числом попадает в отчёт', () => {
  assert.match(validateWorkout(minimalWorkout({ days: [1, '3'] })).join('\n'), /день недели/);
});

test('повторённый день недели попадает в отчёт', () => {
  assert.match(validateWorkout(minimalWorkout({ days: [1, 1] })).join('\n'), /дважды/);
});

// v, links, detail, extra, note не проверялись вовсе, хотя README обещает,
// что валидатор проверит форму. item.v = ['abc'] отрисовывал подпись
// «Видео · undefined», и плеер при этом молча не включался.

test('v не массивом попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].v = 'VZ3f0pSTObM';
  assert.match(validateWorkout(w).join('\n'), /v должен быть массивом/);
});

test('v из одного элемента попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].v = ['VZ3f0pSTObM'];
  assert.match(validateWorkout(w).join('\n'), /трёх элементов/);
});

test('v без подписи попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].v = ['VZ3f0pSTObM', 20, ''];
  assert.match(validateWorkout(w).join('\n'), /подпись/);
});

test('нецелый старт ролика попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].v = ['VZ3f0pSTObM', '20', '0:20'];
  assert.match(validateWorkout(w).join('\n'), /старт/);
});

// Не одиннадцать символов — и player.js не подменит ссылку встроенным плеером:
// на телефоне это выглядит как «видео просто не открывается внутри».
test('id ролика не из одиннадцати символов попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].v = ['abc', 0, '0:00'];
  assert.match(validateWorkout(w).join('\n'), /id ролика/);
});

test('корректный v проходит проверку', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].v = ['VZ3f0pSTObM', 20, '0:20'];
  assert.deepEqual(validateWorkout(w), []);
});

test('links не массивом попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].links = ['zMZWyURC6tw', 18, 'Подпись'];
  assert.match(validateWorkout(w).join('\n'), /links\[0\]/);
});

test('битый элемент links попадает в отчёт с его номером', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].links = [['zMZWyURC6tw', 18, 'Подпись'], ['zMZWyURC6tw', 38]];
  assert.match(validateWorkout(w).join('\n'), /links\[1\]/);
});

test('корректный links проходит проверку', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].links = [['zMZWyURC6tw', 18, 'Как установить · 0:18']];
  assert.deepEqual(validateWorkout(w), []);
});

test('пустой detail попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].detail = '';
  assert.match(validateWorkout(w).join('\n'), /detail/);
});

test('extra не строкой попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].extra = ['подсказка'];
  assert.match(validateWorkout(w).join('\n'), /extra/);
});

test('пустой note у блока попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].note = '';
  assert.match(validateWorkout(w).join('\n'), /note/);
});

test('упражнение без необязательных полей проходит проверку', () => {
  const w = minimalWorkout();
  assert.equal(w.blocks[0].items[0].v, undefined);
  assert.equal(w.blocks[0].items[0].links, undefined);
  assert.deepEqual(validateWorkout(w), []);
});

test('countMarks считает rounds умножить на число упражнений по всем блокам', () => {
  const w = minimalWorkout();
  w.blocks.push({
    id: 'b2', n: '02', nav: 'Второй', title: 'Второй', sub: '', rounds: 3,
    items: [w.blocks[0].items[0], { ...w.blocks[0].items[0], key: 'ex2' }],
  });
  // блок 1: 2 круга * 1 упражнение = 2; блок 2: 3 круга * 2 упражнения = 6
  assert.equal(countMarks(w), 8);
});

// Раунд исправлений: закрытие дыр в валидаторе

test('пустая строка в обязательном текстовом поле попадает в отчёт', () => {
  const w = minimalWorkout({ title: '' });
  assert.match(validateWorkout(w).join('\n'), /title/);
});

test('пустой name в упражнении попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].name = '';
  assert.match(validateWorkout(w).join('\n'), /name/);
});

test('дубликат block.id попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks.push({
    id: 'b1', n: '02', nav: 'Второй', title: 'Второй', sub: '', rounds: 1,
    items: [w.blocks[0].items[0]],
  });
  assert.match(validateWorkout(w).join('\n'), /id/);
});

test('пустой массив items в блоке попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items = [];
  assert.match(validateWorkout(w).join('\n'), /items/);
});

test('gear не как массив попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].gear = 'none';
  assert.match(validateWorkout(w).join('\n'), /gear.*массив|gear/);
});

test('stats не как массив попадает в отчёт', () => {
  const w = minimalWorkout({ stats: 'строка' });
  assert.match(validateWorkout(w).join('\n'), /stats/);
});

// Раунд 3: Остаточные пробелы

test('block.items = null попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items = null;
  assert.match(validateWorkout(w).join('\n'), /items.*массив|items/);
});

test('item.load = null попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].items[0].load = null;
  assert.match(validateWorkout(w).join('\n'), /load/);
});

// preamble: вставка перед блоком (title + paragraphs из строк/{b: строка})

test('корректный preamble проходит проверку', () => {
  const w = minimalWorkout();
  w.blocks[0].preamble = {
    title: 'Заголовок вставки',
    paragraphs: [['Обычный текст, ', { b: 'жирный кусок' }, ' и снова обычный.'], ['Второй абзац.']],
  };
  assert.deepEqual(validateWorkout(w), []);
});

test('пустой title в preamble попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].preamble = { title: '', paragraphs: [['текст']] };
  assert.match(validateWorkout(w).join('\n'), /preamble\.title/);
});

test('часть абзаца preamble с пустой строкой попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].preamble = { title: 'Заголовок', paragraphs: [['', { b: 'жирный' }]] };
  assert.match(validateWorkout(w).join('\n'), /preamble\.paragraphs\[0\]\[0\]/);
});

test('объект-часть preamble с лишним ключом попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].preamble = { title: 'Заголовок', paragraphs: [[{ b: 'жирный', extra: 'лишнее' }]] };
  assert.match(validateWorkout(w).join('\n'), /preamble\.paragraphs\[0\]\[0\]/);
});

test('пустой paragraphs в preamble попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].preamble = { title: 'Заголовок', paragraphs: [] };
  assert.match(validateWorkout(w).join('\n'), /preamble\.paragraphs/);
});

test('пустой абзац (пустой массив частей) в preamble попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].preamble = { title: 'Заголовок', paragraphs: [[]] };
  assert.match(validateWorkout(w).join('\n'), /preamble\.paragraphs\[0\]/);
});

test('preamble не объект попадает в отчёт', () => {
  const w = minimalWorkout();
  w.blocks[0].preamble = 'строка';
  assert.match(validateWorkout(w).join('\n'), /preamble/);
});

test('блок без preamble по-прежнему проходит проверку', () => {
  const w = minimalWorkout();
  assert.equal(w.blocks[0].preamble, undefined);
  assert.deepEqual(validateWorkout(w), []);
});
