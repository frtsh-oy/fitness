// Печатает, каких упражнений не хватает каждому уровню и каждой зоне упора:
// по этому списку владелец решает, какие видео разбирать следующими. Читает ту
// же проверку, что и генератор (availability), поэтому «нет» здесь — это ровно
// тот отказ, который генератор назвал бы человеку.
//
// Запуск: node tools/library-report.js
import { fileURLToPath } from 'node:url';
import { LIBRARY } from '../exercises/index.js';
import { groupsPhrase } from '../muscles.js';
import { LEVELS, ZONES } from '../builder/rules.js';
import { availability } from '../builder/generator.js';

// По уровню: строка про основные группы без упражнения пула, затем строка на
// каждую зону — есть ли для упора опора из двух упражнений на одну группу.
export function buildLibraryReport(library = LIBRARY) {
  const lines = [];
  for (const [id, level] of Object.entries(LEVELS)) {
    const { missing, zones } = availability(library, id);
    lines.push(missing.length === 0
      ? `${level.label}: все основные группы закрыты.`
      : `${level.label}: нет ${level.poolWords} на: ${groupsPhrase(missing)}.`);
    for (const [zone, ok] of Object.entries(zones)) {
      lines.push(`  упор «${ZONES[zone].label}»: ${ok ? 'можно' : 'не хватает второго упражнения на ту же группу'}`);
    }
  }
  return lines;
}

function isMainModule() {
  return process.argv[1] === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  console.log(buildLibraryReport().join('\n'));
}
