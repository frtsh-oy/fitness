# Статья «На чём построены тренировки» и список литературы

Дата: 2026-10-22. Владелец: «добавь ещё список используемой литературы при
сборке упражнений … в формате статьи для повышения лояльности людей к
использованию продукта». Схему статьи владелец одобрил в чате; ACSM —
с расшифровкой и настоящими ссылками на статьи.

## Главное правило

Доверие даёт прозрачность, а не громкие слова. В статье:

- только источники, которые проект действительно использовал (`load-bands.js`,
  `builder/rules.js`, `builder/texts.js`, спеки недельной нагрузки и
  конструктора), и только то, что в них сказано;
- рядом с выводом — где решали мы сами, отдельным блоком «Решили мы»;
- без «научно доказано», «гарантирует»; оговорки (тенденция вместо значимости,
  состав участников) — в тексте, а не мелким шрифтом;
- литература отвечает за правила сборки тренировки (объём, частота, порядок,
  запас, прогрессия), а не за выбор упражнений и технику: это сказано прямо.

## Где

Отдельная статичная страница `sources.html` в корне: у неё свой адрес, им можно
поделиться. Входы:

- «Конструктор», под «Из чего обычно состоит тренировка» — `sources.html`;
- «Сколько получает каждая мышца за неделю», в конце панели — `#volume`;
- «Как повышать нагрузку» в «Сегодня» — `#progress`.

В Telegram на странице видна системная кнопка «Назад» (назад по истории, без
истории — в приложение), сверху ссылка «← В приложение».

## Сверка утверждений (2026-10-22)

| утверждение в статье | источник | где проверено |
|---|---|---|
| от 10 подходов в неделю на группу мышц — больше рост | [1] | полный текст PMC12965823: «hypertrophy was enhanced by … higher volume (≥10 sets/muscle group/wk)» |
| главная рекомендация: с усилием, минимум дважды в неделю, все основные группы | [1] | «perform RT with high effort … at least twice weekly, with all major muscle groups being engaged» |
| не меньше двух подходов на упражнение | [1] | «healthy adults are advised to complete at least two sets per exercise» |
| отдача для роста мышц падает после ~18–20 подходов в неделю | [1] | «diminishing returns beyond ~2–3 sets/exercise for strength and ~18–20 weekly sets for hypertrophy» |
| при равном объёме частота (1 vs >5 дней) на рост не влияла | [1], [4] | [1]: «did not influence hypertrophy … low (1 d/wk) versus high (>5 d/wk) frequency when total volume was equated»; [4], аннотация, 25 исследований: «individuals can choose a weekly frequency … based on personal preference» |
| сила лучше при ≥2 тренировках в неделю | [1] | «strength was enhanced by RT performed with higher frequency (≥2 d/wk …)» |
| сила растёт с частотой, отдача затухает; объём → рост с затуханием | [5] | аннотация: «strength gains increase with increasing frequency, albeit with diminishing returns»; «both best-fit models suggest diminishing returns» |
| вспомогательный подход — половина | [5] | аннотация: «'fractional' … 0.5 … evidence … strongest» |
| 67 исследований, 2058 участников, 79,1 % мужчин, средний возраст 25 | [5] | аннотация |
| до отказа — нет стабильного преимущества ни силе, ни росту | [1] | «strength was not affected … lifting to fatigue/failure»; «hypertrophy was not affected by … absolute fatigue/failure» |
| упражнение в начале тренировки — больше силы; на рост порядок не влиял | [1] | «at the beginning of training sessions (compared with the end …)»; «or exercise order within training sessions» |
| крупные раньше мелких, многосуставные раньше односуставных | [2] | аннотация |
| определения уровней; 8–12 повторов новичкам; +2–10 % при 1–2 повторах сверх | [2] | аннотация |
| резинки дали прирост силы и мышц по сравнению с отсутствием тренировок | [1] | «muscle hypertrophy was positively affected by … elastic band RT»; «strength was impacted by … elastic band RT» (оба — против контроля) |
| короткий и длинный отдых на силу не различались | [1] | «short (<1 min) versus long (>1 min) between-set rest intervals» |
| 15 исследований, ≈0,37 % за подход, три категории — тенденция P = 0,074 | [3] | аннотация |
| ориентиры считают только целевые подходы; около 6 подходов — поддержание; ориентиры индивидуальны | [6] | страница: «we only count sets where the target muscle is the prime mover…», «typically around 6 working sets…», «Your personal landmarks may vary significantly» |

Не утверждаем: что резинки «равны» свободному весу (прямого сравнения по росту
мышц в [1] нет, а по комплексной функции стандартная силовая была лучше
резинок); поправку на резинку (её нет в источниках).

## Литература

1. Currier B. S. и др. ACSM Position Stand. Resistance Training Prescription
   for Muscle Function, Hypertrophy, and Physical Performance in Healthy Adults:
   An Overview of Reviews. MSSE, 2026, 58(4): 851–872.
   doi:10.1249/MSS.0000000000003897, PubMed 41843416, PMC12965823.
2. ACSM Position Stand. Progression Models in Resistance Training for Healthy
   Adults. MSSE, 2009, 41(3): 687–708. doi:10.1249/MSS.0b013e3181915670,
   PubMed 19204579.
3. Schoenfeld B. J., Ogborn D., Krieger J. W. J Sports Sci, 2017, 35(11):
   1073–1082. doi:10.1080/02640414.2016.1210197, PubMed 27433992.
4. Schoenfeld B. J., Grgic J., Krieger J. J Sports Sci, 2019, 37(11):
   1286–1295. doi:10.1080/02640414.2018.1555906, PubMed 30558493.
5. Pelland J. C. и др. Sports Med, 2026, 56(2): 481–505.
   doi:10.1007/s40279-025-02344-w, PubMed 41343037.
6. Renaissance Periodization. Training Volume Landmarks for Muscle Growth,
   2017 (статья на сайте, автор не указан).

## Сторож

`test/sources-page.test.js`: каждая сноска ведёт на пункт литературы, каждый
пункт процитирован, у научных пунктов есть DOI-ссылка, внешние ссылки https,
входы из приложения ведут на существующие якоря.

## Не цели

- расширять список работами, которые проект не использовал;
- переводить статью в данные или подтягивать тексты из `load-bands.js`
  автоматически (числа статьи сверяются сторожем входов и руками);
- показывать статью внутри разделов приложения.
