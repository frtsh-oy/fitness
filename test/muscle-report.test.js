import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildReportLines } from '../tools/muscle-report.js';
import { MUSCLES, muscleLabel } from '../muscles.js';
import legsMwf from '../workouts/legs-mwf.js';

const VALID_LABELS = new Set(Object.values(MUSCLES).map(m => m.ru));

// Строки вида «| Ягодичные | 6 |» — ровно две колонки, число во второй.
// У таблицы «упражнение → мышцы» колонок пять, под этот шаблон она не попадает.
function totalsRowLabels(text) {
  const labels = [];
  for (const line of text.split('\n')) {
    const m = /^\| ([^|]+) \| [\d.]+ \|$/.exec(line.trim());
    if (m) labels.push(m[1].trim());
  }
  return labels;
}

function untouchedLabels(text) {
  const m = /Не задействованы ни в одном упражнении: (.+)/.exec(text);
  assert.ok(m, 'в отчёте нет строки «Не задействованы»');
  return m[1] === '—' ? [] : m[1].split(', ');
}

test('в сводку попадают все упражнения тренировки, без потерь и дублей', () => {
  const text = buildReportLines().join('\n');
  const names = legsMwf.blocks.flatMap(b => b.items).map(i => i.name);
  assert.equal(names.length, 19, 'в legs-mwf ожидается 19 упражнений — проверь фикстуру, если данные изменились');

  for (const name of names) {
    assert.ok(text.includes(name), `в отчёте нет упражнения «${name}»`);
  }
  // Строка таблицы «упражнение → мышцы» кончается меткой типа — по ней и считаем ряды,
  // отдельно от заголовков и от строк сводных таблиц подходов.
  const rows = text.split('\n').filter(line => /\| (Разминка|Силовое|Заминка) \|$/.test(line));
  assert.equal(rows.length, 19, 'число строк таблицы должно совпадать с числом упражнений');
});

test('подписи групп мышц в отчёте — из словаря MUSCLES, а не свои строки', () => {
  const text = buildReportLines().join('\n');
  const labels = totalsRowLabels(text);
  assert.ok(labels.length > 0, 'сводные таблицы подходов пусты — тест ничего не проверяет');
  for (const label of labels) {
    assert.ok(VALID_LABELS.has(label), `«${label}» не найдена в словаре MUSCLES`);
  }
  for (const label of untouchedLabels(text)) {
    assert.ok(VALID_LABELS.has(label), `«${label}» из строки «Не задействованы» не найдена в словаре MUSCLES`);
  }
  // И конкретика, а не только «есть в словаре»: известный id даёт известную подпись.
  assert.ok(text.includes(muscleLabel('glutes')), 'нет подписи для glutes (Ягодичные)');
});

test('«Не задействованы» согласована с load по ВСЕМ упражнениям тренировки (любого kind)', () => {
  const text = buildReportLines().join('\n');
  const untouched = new Set(untouchedLabels(text));
  const touchedIds = new Set(legsMwf.blocks.flatMap(b => b.items).flatMap(i => Object.keys(i.load)));

  for (const id of Object.keys(MUSCLES)) {
    const label = muscleLabel(id);
    if (touchedIds.has(id)) {
      assert.ok(!untouched.has(label), `«${label}» размечена хотя бы в одном упражнении, но названа незадействованной`);
    } else {
      assert.ok(untouched.has(label), `«${label}» нигде не размечена, но не упомянута как незадействованная`);
    }
  }
});

// Регрессия на конкретный дефект из ревью: старая версия генератора считала
// «Не задействованы» от totals одних силовых упражнений. Группа, занятая
// только в разминке, тогда попадала в этот список — прямая ложь для человека,
// который как раз и вычитывает разметку. Фикстура ниже не зависит от того,
// что сейчас размечено в legs-mwf.js, и ловит именно эту ошибку, если она
// вернётся.
function fixtureWorkouts() {
  return {
    fixture: {
      title: 'Фикстура для регрессии',
      blocks: [{
        nav: 'Блок',
        rounds: 3,
        items: [
          { name: 'Разминочное упражнение', load: { traps: 0.5 }, kind: 'warmup' },
          { name: 'Силовое упражнение', load: { glutes: 1 }, kind: 'strength' },
        ],
      }],
    },
  };
}

test('регрессия: группа, занятая только в разминке, не попадает в «Не задействованы»', () => {
  const text = buildReportLines(fixtureWorkouts()).join('\n');
  const untouched = new Set(untouchedLabels(text));

  assert.ok(!untouched.has(muscleLabel('traps')), 'трапеции размечены в разминке, но названы незадействованными');
  assert.ok(!untouched.has(muscleLabel('glutes')), 'ягодичные размечены в силовом, но названы незадействованными');
  assert.ok(untouched.has(muscleLabel('calves')), 'икроножные нигде не размечены и должны быть в списке');

  // И сама разминочная сводка не потеряла запись — иначе «не соврали» случайно,
  // выкинув строку целиком, а не потому что честно посчитали.
  assert.match(text, new RegExp(`${muscleLabel('traps')} \\| 1\\.5`));
});
