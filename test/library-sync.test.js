// Скрипт таблицы tools/library-sync.gs живёт в Google Apps Script, а здесь
// проверяются его чистые части: лист → CSV, разбор лога GitHub Actions,
// порядок запросов к GitHub — и что скрипт и .github/workflows/library-sync.yml
// говорят об одном и том же (ветка, путь, имя шага импорта).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseCsv } from '../tools/import-exercises.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const SCRIPT = read('../tools/library-sync.gs');
const WORKFLOW = read('../.github/workflows/library-sync.yml');

// Скрипт исполняется в своём контексте, как в Apps Script; объекты оттуда —
// из другого «мира», поэтому сравниваются после JSON.
const gs = (() => {
  const context = vm.createContext({});
  vm.runInContext(`${SCRIPT}\n;globalThis.api = { toCsv, errorsFromLog, pushCsv, REPO, BRANCH, CSV_PATH };`, context);
  return context.api;
})();
const plain = value => JSON.parse(JSON.stringify(value));

test('лист → CSV: неизменённая таблица даёт exercises/library.csv байт в байт', () => {
  const csv = read('../exercises/library.csv');
  assert.equal(gs.toCsv(parseCsv(csv)), csv);
});

test('лист → CSV: запятая, кавычка, перенос строки и пустая ячейка читаются импортом как были', () => {
  const rows = [
    ['Ключ', 'Название', 'Техника'],
    ['a-1', 'Жим, лёжа', 'Сказать «"тише"»\nи выдохнуть'],
    ['b-2', '', ' пробел по краям '],
  ];
  assert.deepEqual(parseCsv(gs.toCsv(rows)), rows);
});

test('лист → CSV: пустые строки в конце листа отрезаются, в середине остаются', () => {
  const rows = [['Ключ', 'Название'], ['', ''], ['a-1', 'Присед'], ['', ' '], ['', '']];
  assert.equal(gs.toCsv(rows), '"Ключ","Название"\n"",""\n"a-1","Присед"\n');
});

test('лист → CSV: числа и логические значения из листа становятся строками', () => {
  assert.equal(gs.toCsv([['Ключ', 'Доля'], ['a-1', 0.5]]), '"Ключ","Доля"\n"a-1","0.5"\n');
});

const LOG = [
  '2026-10-19T10:00:01.1234567Z ##[group]Run node tools/import-exercises.mjs "$RUNNER_TEMP/library.csv"',
  '2026-10-19T10:00:01.1234567Z node tools/import-exercises.mjs "$RUNNER_TEMP/library.csv"',
  '2026-10-19T10:00:01.1234567Z shell: /usr/bin/bash -e {0}',
  '2026-10-19T10:00:01.1234567Z ##[endgroup]',
  '2026-10-19T10:00:02.1234567Z Строка 5, «Сложность»: «лёгкое» — нет такого значения',
  '2026-10-19T10:00:02.1234567Z ',
  '2026-10-19T10:00:02.1234567Z Ошибок: 1. Файлы не записаны.',
  '2026-10-19T10:00:02.1234567Z ##[error]Process completed with exit code 1.',
  '2026-10-19T10:00:03.1234567Z Post job cleanup.',
].join('\n');

test('лог: из упавшего шага берётся вывод между заголовком шага и ошибкой, без меток времени', () => {
  assert.deepEqual(plain(gs.errorsFromLog(LOG)), [
    'Строка 5, «Сложность»: «лёгкое» — нет такого значения',
    'Ошибок: 1. Файлы не записаны.',
  ]);
});

test('лог: без ошибки — пусто; с \\r\\n — то же, что с \\n', () => {
  assert.deepEqual(plain(gs.errorsFromLog(LOG.replace(/^.*##\[error\].*$/m, ''))), []);
  assert.deepEqual(plain(gs.errorsFromLog(LOG.replaceAll('\n', '\r\n'))), plain(gs.errorsFromLog(LOG)));
});

test('лог: не больше тридцати строк', () => {
  const many = Array.from({ length: 50 }, (_, i) => `Строка ${i + 2}, «Ключ»: пусто`);
  const log = ['##[endgroup]', ...many, '##[error]Process completed with exit code 1.'].join('\n');
  assert.deepEqual(plain(gs.errorsFromLog(log)), many.slice(0, 30));
});

// Подставной GitHub: отвечает по методу и пути, запоминает запросы.
function fakeGithub(overrides = {}) {
  const calls = [];
  const answers = {
    'GET /repos/frtsh-oy/fitness/git/ref/heads/main': { status: 200, json: { object: { sha: 'main-sha' } } },
    'GET /repos/frtsh-oy/fitness/git/commits/main-sha': { status: 200, json: { tree: { sha: 'main-tree' } } },
    'POST /repos/frtsh-oy/fitness/git/blobs': { status: 201, json: { sha: 'blob-sha' } },
    'POST /repos/frtsh-oy/fitness/git/trees': { status: 201, json: { sha: 'tree-sha' } },
    'POST /repos/frtsh-oy/fitness/git/commits': { status: 201, json: { sha: 'commit-sha' } },
    'PATCH /repos/frtsh-oy/fitness/git/refs/heads/library-sync': { status: 200, json: {} },
    'POST /repos/frtsh-oy/fitness/git/refs': { status: 201, json: {} },
    ...overrides,
  };
  const call = (method, path, body) => {
    calls.push({ method, path, body });
    const answer = answers[`${method} ${path}`];
    if (!answer) throw new Error(`неожиданный запрос ${method} ${path}`);
    return { text: '', ...answer };
  };
  return { call, calls };
}

test('отправка: коммит только с library.csv поверх main, ветка переставляется принудительно', () => {
  const { call, calls } = fakeGithub();
  assert.deepEqual(plain(gs.pushCsv(call, '"Ключ"\n')), { main: 'main-sha', commit: 'commit-sha' });
  const sent = plain(calls);
  assert.deepEqual(sent.find(c => c.path.endsWith('/git/blobs')).body, { content: '"Ключ"\n', encoding: 'utf-8' });
  assert.deepEqual(sent.find(c => c.path.endsWith('/git/trees')).body, {
    base_tree: 'main-tree',
    tree: [{ path: 'exercises/library.csv', mode: '100644', type: 'blob', sha: 'blob-sha' }],
  });
  assert.deepEqual(sent.find(c => c.path.endsWith('/git/commits')).body,
    { message: 'Таблица упражнений', tree: 'tree-sha', parents: ['main-sha'] });
  assert.deepEqual(sent.at(-1), {
    method: 'PATCH', path: '/repos/frtsh-oy/fitness/git/refs/heads/library-sync', body: { sha: 'commit-sha', force: true },
  });
});

test('отправка: ветки library-sync ещё нет — она создаётся на новом коммите', () => {
  const { call, calls } = fakeGithub({
    'PATCH /repos/frtsh-oy/fitness/git/refs/heads/library-sync': { status: 422, json: { message: 'Reference does not exist' } },
  });
  gs.pushCsv(call, '"Ключ"\n');
  assert.deepEqual(plain(calls).at(-1), {
    method: 'POST', path: '/repos/frtsh-oy/fitness/git/refs', body: { ref: 'refs/heads/library-sync', sha: 'commit-sha' },
  });
});

test('отправка: токен не принят или без доступа — понятная причина, ничего не создано', () => {
  for (const [status, words] of [[401, 'неверный или истёк'], [403, 'нет доступа'], [404, 'нет доступа']]) {
    const { call, calls } = fakeGithub({
      'GET /repos/frtsh-oy/fitness/git/ref/heads/main': { status, json: { message: 'nope' } },
    });
    assert.throws(() => gs.pushCsv(call, '"Ключ"\n'), error => error.message.includes(words), `ответ ${status}`);
    assert.equal(calls.length, 1, `после ответа ${status} запросов больше нет`);
  }
});

test('скрипт и действие GitHub договорены: ветка, путь к таблице, имя шага импорта', () => {
  assert.equal(gs.REPO, 'frtsh-oy/fitness');
  assert.match(WORKFLOW, new RegExp(`branches: \\[${gs.BRANCH}\\]`));
  assert.ok(WORKFLOW.includes(`"$GITHUB_SHA:${gs.CSV_PATH}"`), 'действие берёт тот файл, который кладёт скрипт');
  // failureText показывает построчные ошибки только для шага с этим именем.
  assert.match(WORKFLOW, /- name: Импорт\n\s+run: node tools\/import-exercises\.mjs /);
  assert.ok(SCRIPT.includes("step.name !== 'Импорт'"));
});
