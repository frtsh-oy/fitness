/**
 * @OnlyCurrentDoc
 */
// Скрипт таблицы упражнений (Google Apps Script): меню «Приложение» с кнопкой
// «Выложить библиотеку». Скрипт кладёт лист в ветку library-sync репозитория
// одним коммитом поверх main. Дальше работает .github/workflows/library-sync.yml:
// импорт, сводка разметки, тесты и, если всё зелёное, коммит в main, то есть
// в прод. Скрипт ждёт этот прогон и показывает итог прямо в таблице: ошибки
// импорта построчно, как их печатает tools/import-exercises.mjs.
//
// Ставится один раз: Расширения → Apps Script, вставить этот файл, сохранить.
// Токен GitHub хранится в свойствах пользователя (UserProperties): его видит
// только тот, кто его вставил, а не все редакторы таблицы. @OnlyCurrentDoc
// ограничивает доступ скрипта этой таблицей.
//
// Файл лежит в репозитории ради истории и тестов (test/library-sync.test.js);
// в таблицу его копируют руками, сам он оттуда не обновляется.

const REPO = 'frtsh-oy/fitness';
const BRANCH = 'library-sync';
const CSV_PATH = 'exercises/library.csv';
const TOKEN_KEY = 'GITHUB_TOKEN';
// Apps Script обрывает запуск на шестой минуте; прогон обычно идёт 2–3 минуты.
const WAIT_SECONDS = 300;
const POLL_SECONDS = 10;
const LOG_LINES = 30;

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Приложение')
    .addItem('Выложить библиотеку', 'publishLibrary')
    .addItem('Доступ к GitHub…', 'setToken')
    .addToUi();
}

function setToken() {
  const ui = SpreadsheetApp.getUi();
  const answer = ui.prompt('Доступ к GitHub',
    'Вставь токен GitHub (fine-grained, только репозиторий ' + REPO + ': Contents — Read and write, '
    + 'Actions — Read-only). Он хранится только у тебя, другие редакторы таблицы его не видят.',
    ui.ButtonSet.OK_CANCEL);
  if (answer.getSelectedButton() !== ui.Button.OK) return;
  const token = answer.getResponseText().trim();
  if (!token) return;
  // Проверка записью: публичный репозиторий читается любым токеном, так что
  // чтение ничего не доказывает. Пустой файл без коммита ни на что не влияет.
  const check = github(token)('POST', '/repos/' + REPO + '/git/blobs', { content: '', encoding: 'utf-8' });
  if (check.status !== 201) {
    ui.alert('Токен не подошёл', accessProblem(check.status), ui.ButtonSet.OK);
    return;
  }
  PropertiesService.getUserProperties().setProperty(TOKEN_KEY, token);
  ui.alert('Готово', 'Токен сохранён. Теперь: Приложение → Выложить библиотеку.', ui.ButtonSet.OK);
}

function publishLibrary() {
  const ui = SpreadsheetApp.getUi();
  const book = SpreadsheetApp.getActive();
  const token = PropertiesService.getUserProperties().getProperty(TOKEN_KEY);
  if (!token) {
    ui.alert('Нужен доступ к GitHub', 'Сначала: Приложение → Доступ к GitHub…', ui.ButtonSet.OK);
    return;
  }
  // Лист библиотеки — тот, где в A1 «Ключ»: порядок листов и их названия
  // владелец может менять, а заголовок импорт всё равно требует.
  const sheet = book.getSheets().find(s => s.getRange(1, 1).getDisplayValue().trim() === 'Ключ');
  if (!sheet) {
    ui.alert('Не нашла лист', 'Нет листа, где в ячейке A1 написано «Ключ».', ui.ButtonSet.OK);
    return;
  }
  const call = github(token);
  let pushed;
  try {
    pushed = pushCsv(call, toCsv(sheet.getDataRange().getDisplayValues()));
  } catch (error) {
    ui.alert('Не отправилось', error.message, ui.ButtonSet.OK);
    return;
  }
  book.toast('Таблица отправлена. Проверяю импорт и тесты, это 2–3 минуты…', 'Приложение', WAIT_SECONDS);
  const run = waitForRun(call, pushed.commit);
  book.toast('', 'Приложение', 1);
  if (!run) {
    ui.alert('Проверка ещё идёт', 'Итог будет здесь: https://github.com/' + REPO + '/actions', ui.ButtonSet.OK);
    return;
  }
  if (run.conclusion === 'success') {
    const main = call('GET', '/repos/' + REPO + '/git/ref/heads/main');
    const changed = main.status === 200 && main.json.object.sha !== pushed.main;
    ui.alert(changed ? 'Выложено' : 'Изменений нет',
      changed ? 'Библиотека в приложении обновится через 2–3 минуты.' : 'Библиотека в приложении такая же, как в таблице.',
      ui.ButtonSet.OK);
    return;
  }
  ui.alert('Не выложено', failureText(call, run), ui.ButtonSet.OK);
}

// Лист → CSV в том же виде, что exercises/library.csv: каждое поле в кавычках,
// строки через \n, перевод строки в конце. Тогда неизменённая таблица даёт тот
// же файл байт в байт, а в истории git видны только поменявшиеся строки.
// Пустые строки в конце листа отрезаются.
function toCsv(rows) {
  const filled = rows.map(row => row.map(value => String(value)));
  while (filled.length > 0 && filled[filled.length - 1].every(value => value.trim() === '')) filled.pop();
  return filled.map(row => row.map(value => '"' + value.replace(/"/g, '""') + '"').join(',')).join('\n') + '\n';
}

function github(token) {
  return (method, path, body) => {
    const response = UrlFetchApp.fetch('https://api.github.com' + path, {
      method: method.toLowerCase(),
      headers: {
        Authorization: 'Bearer ' + token,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      contentType: 'application/json',
      payload: body === undefined ? undefined : JSON.stringify(body),
      muteHttpExceptions: true,
      followRedirects: false,
    });
    const text = response.getContentText();
    let json = null;
    try { json = JSON.parse(text); } catch (error) { /* не JSON: лог или пусто */ }
    return { status: response.getResponseCode(), json, text, headers: response.getAllHeaders() };
  };
}

function accessProblem(status) {
  if (status === 401) return 'GitHub не принял токен: он неверный или истёк. Создай новый и вставь через Приложение → Доступ к GitHub…';
  return 'У токена нет доступа к ' + REPO + ' на запись (ответ ' + status + '). Нужен fine-grained токен на этот '
    + 'репозиторий с правами Contents — Read and write и Actions — Read-only.';
}

// Коммит «только library.csv поменялся» поверх свежего main, ветка library-sync
// переставляется на него (force). Новый коммит каждый раз, даже если таблица
// не менялась: на него и откликается прогон.
function pushCsv(call, csv) {
  const ok = (response, what) => {
    if (response.status === 401 || response.status === 403 || response.status === 404) {
      throw new Error(accessProblem(response.status));
    }
    if (response.status >= 300) throw new Error(what + ': GitHub ответил ' + response.status + '. ' + response.text.slice(0, 200));
    return response.json;
  };
  const repo = '/repos/' + REPO;
  const main = ok(call('GET', repo + '/git/ref/heads/main'), 'Ветка main').object.sha;
  const baseTree = ok(call('GET', repo + '/git/commits/' + main), 'Коммит main').tree.sha;
  const blob = ok(call('POST', repo + '/git/blobs', { content: csv, encoding: 'utf-8' }), 'Файл').sha;
  const tree = ok(call('POST', repo + '/git/trees', {
    base_tree: baseTree,
    tree: [{ path: CSV_PATH, mode: '100644', type: 'blob', sha: blob }],
  }), 'Дерево').sha;
  const commit = ok(call('POST', repo + '/git/commits', { message: 'Таблица упражнений', tree, parents: [main] }), 'Коммит').sha;
  const moved = call('PATCH', repo + '/git/refs/heads/' + BRANCH, { sha: commit, force: true });
  // Ветки ещё нет — GitHub отвечает 422 «Reference does not exist».
  if (moved.status === 422 || moved.status === 404) {
    ok(call('POST', repo + '/git/refs', { ref: 'refs/heads/' + BRANCH, sha: commit }), 'Ветка ' + BRANCH);
  } else {
    ok(moved, 'Ветка ' + BRANCH);
  }
  return { main, commit };
}

// Прогон для нашего коммита; null — не закончился за WAIT_SECONDS.
function waitForRun(call, commit) {
  const deadline = Date.now() + WAIT_SECONDS * 1000;
  while (Date.now() < deadline) {
    Utilities.sleep(POLL_SECONDS * 1000);
    const runs = call('GET', '/repos/' + REPO + '/actions/runs?branch=' + BRANCH + '&head_sha=' + commit);
    const run = runs.status === 200 && runs.json.workflow_runs[0];
    if (run && run.status === 'completed') return run;
  }
  return null;
}

function failureText(call, run) {
  const link = run.html_url;
  const jobs = call('GET', '/repos/' + REPO + '/actions/runs/' + run.id + '/jobs');
  const job = jobs.status === 200 && jobs.json.jobs[0];
  const step = job && job.steps.find(s => s.conclusion === 'failure');
  if (!step || step.name !== 'Импорт') {
    return 'Таблица прочиталась, но дальше что-то сломалось' + (step ? ' (шаг «' + step.name + '»)' : '')
      + '. Сайт прежний. Это не ошибка в таблице: передай ссылку тому, кто ведёт код.\n' + link;
  }
  // Лог задания: GitHub отвечает переадресацией на временную ссылку, по
  // которой ходят уже без токена.
  const logs = call('GET', '/repos/' + REPO + '/actions/jobs/' + job.id + '/logs');
  const location = logs.headers.Location || logs.headers.location;
  const text = location ? UrlFetchApp.fetch(location, { muteHttpExceptions: true }).getContentText() : '';
  const lines = errorsFromLog(text);
  return 'Импорт отказал, сайт прежний. Поправь в таблице и выложи снова.\n\n'
    + (lines.length > 0 ? lines.join('\n') : 'Подробности: ' + link);
}

// Вывод упавшего шага из лога задания GitHub Actions: строки между концом
// заголовка шага («##[endgroup]») и первой ошибкой («##[error]»), без меток
// времени. Не больше LOG_LINES строк.
function errorsFromLog(text) {
  const lines = text.split(/\r?\n/).map(line => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z ?/, ''));
  const end = lines.findIndex(line => line.startsWith('##[error]'));
  if (end < 0) return [];
  let start = end;
  while (start > 0 && !lines[start - 1].startsWith('##[endgroup]')) start--;
  return lines.slice(start, end).filter(line => line.trim() !== '').slice(0, LOG_LINES);
}
