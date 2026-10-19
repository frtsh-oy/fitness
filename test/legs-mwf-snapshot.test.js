import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import legsMwf from '../workouts/legs-mwf.js';

// Снимок снят с workouts/legs-mwf.js до того, как он перешёл на упражнения из
// библиотеки (item('key')). Это страховка того перехода: тренировка обязана
// остаться той же до последнего поля, а не «примерно той же». Сравниваем после
// JSON-круга, потому что снимок и есть JSON: поля со значением undefined в нём
// нет, и у тренировки они тоже не должны ронять тест. Порядок полей JSON хранит,
// но deepStrictEqual к нему нечувствителен, так что перестановка полей в
// тренировке тест не роняет.
const SNAPSHOT = JSON.parse(readFileSync(new URL('./fixtures/legs-mwf.json', import.meta.url), 'utf8'));

test('готовая тренировка совпадает со снимком целиком', () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(legsMwf)), SNAPSHOT);
});
