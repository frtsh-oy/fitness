// Печатает, каких упражнений не хватает каждому уровню и каждой зоне упора:
// по этому списку владелец решает, какие видео разбирать следующими. Строится
// по availability, той же проверке, на которой генератор решает, отказать ли.
// Но генератор называет человеку одну причину, а отчёт показывает все: и группы
// без единого упражнения, и зоны, которым не хватает второго.
//
// Хватает ли упражнений, зависит от того, что есть у человека (gear.js), поэтому
// командная строка печатает отчёт по трём профилям: у кого есть весь инвентарь,
// у кого только резинки (выбор по умолчанию) и у кого нет ничего. По нему видно,
// кому генератор пока откажет.
//
// Запуск: node tools/library-report.js
import { fileURLToPath } from 'node:url';
import { LIBRARY } from '../exercises/index.js';
import { groupsPhrase } from '../muscles.js';
import { LEVELS, ZONES } from '../builder/rules.js';
import { availability } from '../builder/generator.js';
import { GEAR, DEFAULT_OWNED, fitLibrary, gearLabel } from '../gear.js';

// Строка про зону. Причины идут по тяжести: нет ни одного упражнения на группу
// зоны (это и есть отказ уровня, второе упражнение тут ещё рано), нет второго
// упражнения на ту же группу, и только затем «зона годится» — с оговоркой, если
// уровень в целом не закрыт: генератор откажет ему раньше, чем дойдёт до упора.
function zoneState(zone, ok, missing) {
  const absent = ZONES[zone].groups.filter(group => missing.includes(group));
  if (absent.length > 0) return `нет ни одного упражнения на: ${groupsPhrase(absent)}`;
  if (!ok) return 'не хватает второго упражнения на ту же группу';
  if (missing.length > 0) return 'на зону хватает, но сначала нужны упражнения на весь уровень';
  return 'можно';
}

// По уровню: строка про основные группы без упражнения пула, затем строка на
// каждую зону.
export function buildLibraryReport(library = LIBRARY) {
  const lines = [];
  for (const [id, level] of Object.entries(LEVELS)) {
    const { missing, zones } = availability(library, id);
    lines.push(missing.length === 0
      ? `${level.label}: все основные группы закрыты.`
      : `${level.label}: нет ${level.poolWords} на: ${groupsPhrase(missing)}.`);
    for (const [zone, ok] of Object.entries(zones)) lines.push(`  упор «${ZONES[zone].label}»: ${zoneState(zone, ok, missing)}`);
  }
  return lines;
}

// Тот же отчёт по упражнениям, которые подошли бы человеку каждого из трёх
// профилей, и перед каждым профилем — заголовок. buildLibraryReport при этом
// остаётся отчётом по всей библиотеке без фильтра.
export function buildGearReport(library = LIBRARY) {
  const profiles = [
    ['Весь инвентарь', GEAR.map(([id]) => id)],
    [`Только резинки: ${DEFAULT_OWNED.map(gearLabel).join(', ')}`, DEFAULT_OWNED],
    ['Без инвентаря', []],
  ];
  return profiles.flatMap(([title, owned]) => [`== ${title} ==`, ...buildLibraryReport(fitLibrary(library, owned))]);
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  console.log(buildGearReport().join('\n'));
}
