// Собирает в dist/ только те файлы, которые нужны странице: обходит граф
// зависимостей от index.html, а не полагается на список, который забудут обновить.
// Тесты, архив исходного сайта и документы разработки в публикацию не попадают.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const read = p => readFileSync(join(ROOT, p), 'utf8');

const needed = new Set();
const external = new Set();

function visitHtml(file) {
  needed.add(file);
  const html = read(file);
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:)?\/\//.test(ref)) { external.add(ref); continue; }
    if (ref.startsWith('data:') || ref.startsWith('#')) continue;
    visit(normalize(join(dirname(file), ref)));
  }
  // точка входа — инлайновый модуль с импортом
  for (const m of html.matchAll(/import\s+[^'"]*['"]([^'"]+)['"]/g)) {
    visit(normalize(join(dirname(file), m[1])));
  }
}

function visit(file) {
  if (needed.has(file)) return;
  if (file.endsWith('.html')) return visitHtml(file);
  needed.add(file);
  if (!file.endsWith('.js')) return;                 // css и прочее листьями
  for (const m of read(file).matchAll(/(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)) {
    const ref = m[1];
    if (/^(https?:)?\/\//.test(ref)) { external.add(ref); continue; }
    if (!ref.startsWith('.')) continue;              // встроенные модули
    visit(normalize(join(dirname(file), ref)));
  }
}

visitHtml('index.html');

rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
for (const file of [...needed].sort()) {
  const dest = join(ROOT, 'dist', file);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, read(file));
}

console.log(`в dist/ собрано файлов: ${needed.size}`);
for (const f of [...needed].sort()) console.log('  ' + f);
console.log('\nвнешние адреса, к которым обращается страница:');
for (const u of [...external].sort()) console.log('  ' + u);
