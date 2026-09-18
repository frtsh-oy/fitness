// Границы недельного объёма и вердикт по нему.
//
// Все числа — СОПОСТАВИМЫЕ подходы в неделю на группу мышц: только целевые
// доли, односторонние по сторонам (см. weekly.js и спеку). Подставлять сюда
// наше внутреннее число нельзя: ориентиры получены в другой системе счёта, и у
// ягодичных это 12 против 18.
//
// У каждой полосы ссылка на источник. Менять числа можно, не трогая расчёт, —
// для этого таблица и вынесена в свой файл.
const bands = [
  {
    max: 0,
    verdict: 'не тренируется целенаправленно',
    why: 'ни одного упражнения, где эта группа — целевая. Лечится добавлением упражнения, а не числом подходов.',
    source: 'https://sportrxiv.org/index.php/server/preprint/view/460',
  },
  {
    max: 3,
    verdict: 'ниже минимума',
    why: 'минимум, при котором рост измерим, начинается примерно с четырёх подходов в неделю.',
    source: 'https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth',
  },
  {
    max: 9,
    verdict: 'поддержание',
    why: 'около шести подходов хватает, чтобы удержать набранное; меньше пяти работает, но не оптимально.',
    source: 'https://pubmed.ncbi.nlm.nih.gov/27433992/',
  },
  {
    max: 20,
    verdict: 'рабочий объём',
    why: 'десять и больше подходов в неделю дали лучший результат; рабочая полоса примерно до восемнадцати.',
    source: 'https://pubmed.ncbi.nlm.nih.gov/27433992/',
  },
  {
    max: Infinity,
    verdict: 'у предела восстановления',
    why: 'выше двадцати—двадцати пяти подходов в неделю объём перестаёт восстанавливаться у большинства.',
    source: 'https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth',
  },
];

export const LOAD_BANDS = Object.freeze(bands.map(band => Object.freeze(band)));

export function verdictFor(sets) {
  if (typeof sets !== 'number' || Number.isNaN(sets)) {
    throw new Error(`объём должен быть числом, получено: ${sets}`);
  }
  if (sets < 0) {
    throw new Error(`объём не может быть отрицательным: ${sets}`);
  }
  // Полосы отсортированы по возрастанию, поэтому первая подходящая и есть
  // ответ. Последняя с max: Infinity гарантирует, что find всегда что-то найдёт.
  return LOAD_BANDS.find(band => sets <= band.max);
}
