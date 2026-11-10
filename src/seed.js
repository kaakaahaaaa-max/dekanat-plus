// Демонстрационные данные. ВСЕ люди, оценки и номера — вымышленные.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { db, tx } = require('./db');
const { nowSpb, addDays, mondayOf, isoNow } = require('./time');

const GROUP_ANNA = '24.М07-ж';
const GROUP_MAX = '23.Б05-пу';

const randomDigits = (n) => Array.from(crypto.randomBytes(n), (b) => b % 10).join('');
const publicId = () => `СП-${randomDigits(6)}`;
const verifyCode = () => crypto.randomBytes(9).toString('base64url');

function seedIfEmpty() {
  const { c } = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (c > 0) return false;

  tx(() => {
    // Корпуса
    const campus = db.prepare('INSERT INTO campuses (id, name, address, metro) VALUES (?,?,?,?)');
    campus.run('vo1', 'Васильевский, 1-я линия', '1-я линия В. О., 26', 'Василеостровская');
    campus.run('vo-mend', 'Васильевский, Менделеевская', 'Менделеевская линия, 5', 'Василеостровская');
    campus.run('smolny', 'Смольный', 'ул. Смольного, 1/3', 'Чернышевская');
    campus.run('peterhof', 'Петергоф', 'Университетский пр., 35', 'электричка до Университета');

    // Пользователи (пароли сразу хешируются)
    const user = db.prepare(`INSERT INTO users
      (login, password_hash, role, full_name, short_name, faculty, program, profile, level, course, group_name, record_book, email, position, home_campus)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const h = (p) => bcrypt.hashSync(p, 10);
    const anna = user.run('anna', h('Anna2026!'), 'student', 'Волкова Анна Сергеевна', 'Анна',
      'Высшая школа журналистики и массовых коммуникаций', 'Реклама и связи с общественностью',
      'Медиакоммуникации', 'Магистратура', 2, GROUP_ANNA, '000000-ДЕМО-1', 'anna.demo@example.com', null, 'vo1').lastInsertRowid;
    const max = user.run('maxim', h('Maxim2026!'), 'student', 'Петренко Максим Олегович', 'Максим',
      'Факультет прикладной математики — процессов управления', 'Прикладная математика и информатика',
      'Математическое моделирование', 'Бакалавриат', 3, GROUP_MAX, '000000-ДЕМО-2', 'maxim.demo@example.com', null, 'peterhof').lastInsertRowid;
    user.run('staff', h('Staff2026!'), 'staff', 'Соколова Елена Викторовна', 'Елена Викторовна',
      'Учебное управление', null, null, null, null, null, null, 'staff.demo@example.com', 'Специалист по учебно-методической работе', 'vo1');

    // Расписание (недельный шаблон)
    const slot = db.prepare('INSERT INTO schedule_slots (group_name, weekday, slot, subject, kind, room, campus_id, teacher) VALUES (?,?,?,?,?,?,?,?)');
    const A = (wd, s, subj, kind, room, c, t) => slot.run(GROUP_ANNA, wd, s, subj, kind, room, c, t);
    A(1, 3, 'Корпоративные медиакоммуникации', 'Семинар', 'ауд. 302', 'vo1', 'Тихонова М. А.');
    A(1, 4, 'Big Social Data', 'Лекция', 'ауд. 115', 'vo1', 'Ершов Д. К.');
    A(1, 5, 'Академическое письмо', 'Практика', 'ауд. 2-14', 'smolny', 'Лаптева О. Н.');
    A(2, 2, 'Прикладная аксиология массмедиа', 'Лекция', 'ауд. 210', 'vo1', 'Кравец Л. П.');
    A(2, 3, 'Аудиовизуальная журналистика', 'Практика', 'студия 018', 'vo1', 'Мельников А. Г.');
    A(3, 4, 'Научно-исследовательский семинар', 'Семинар', 'ауд. 3-02', 'smolny', 'Белова Н. С.');
    A(3, 5, 'Иностранный язык в профессиональной коммуникации', 'Практика', 'ауд. 3-11', 'smolny', 'Гусева Е. В.');
    A(4, 3, 'Big Social Data', 'Практика', 'комп. класс 410', 'vo-mend', 'Ершов Д. К.');
    A(4, 4, 'Визуальные коммуникации в соцмедиа', 'Лекция', 'ауд. 115', 'vo1', 'Орлова К. Д.');
    A(5, 2, 'Медиапланирование', 'Семинар', 'ауд. 302', 'vo1', 'Тихонова М. А.');
    A(5, 3, 'Прикладная аксиология массмедиа', 'Семинар', 'ауд. 210', 'vo1', 'Кравец Л. П.');

    const M = (wd, s, subj, kind, room, c, t) => slot.run(GROUP_MAX, wd, s, subj, kind, room, c, t);
    M(1, 1, 'Методы оптимизации', 'Лекция', 'ауд. 405', 'peterhof', 'Зайцев И. Р.');
    M(1, 2, 'Методы оптимизации', 'Практика', 'ауд. 405', 'peterhof', 'Зайцев И. Р.');
    M(1, 3, 'Базы данных', 'Лабораторная', 'комп. класс 2427', 'peterhof', 'Абрамова Т. С.');
    M(2, 2, 'Теория вероятностей и матстатистика', 'Лекция', 'ауд. 101', 'peterhof', 'Лебедев П. А.');
    M(2, 3, 'Теория вероятностей и матстатистика', 'Практика', 'ауд. 309', 'peterhof', 'Лебедев П. А.');
    M(2, 5, 'Английский язык', 'Практика', 'ауд. 21', 'vo-mend', 'Данилова С. М.');
    M(3, 1, 'Функциональный анализ', 'Лекция', 'ауд. 101', 'peterhof', 'Григорьев В. Е.');
    M(3, 2, 'Функциональный анализ', 'Практика', 'ауд. 312', 'peterhof', 'Григорьев В. Е.');
    M(3, 3, 'Машинное обучение', 'Лекция', 'ауд. 405', 'peterhof', 'Морозова А. И.');
    M(4, 2, 'Базы данных', 'Лекция', 'ауд. 101', 'peterhof', 'Абрамова Т. С.');
    M(4, 3, 'Машинное обучение', 'Практика', 'комп. класс 2427', 'peterhof', 'Морозова А. И.');
    M(4, 4, 'Физическая культура', 'Практика', 'спорткомплекс', 'peterhof', 'Кириллов О. В.');
    M(5, 1, 'Теория управления', 'Лекция', 'ауд. 405', 'peterhof', 'Савельев Н. Б.');
    M(5, 2, 'Теория управления', 'Семинар', 'ауд. 312', 'peterhof', 'Савельев Н. Б.');

    seedStudy(anna, max);
    seedRequests(anna, max);
    seedNotifications(anna, max);
  });
  return true;
}

function seedStudy(anna, max) {
  const today = nowSpb().date;
  const d = (n) => addDays(today, n);
  const subj = db.prepare(`INSERT INTO subjects (user_id, semester, term_name, name, control, credits, teacher, score, result, ects, exam_date, exam_room)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  const cp = db.prepare('INSERT INTO checkpoints (subject_id, title, due_date, status, points, max_points) VALUES (?,?,?,?,?,?)');
  const CUR = 'Осенний семестр 2026';

  // Анна — текущий семестр
  let s = subj.run(anna, 'current', CUR, 'Корпоративные медиакоммуникации', 'Экзамен', 4, 'Тихонова М. А.', 40, null, null, '2026-12-23 10:00', 'ауд. 302, 1-я линия').lastInsertRowid;
  cp.run(s, 'Эссе о репутации бренда', d(-20), 'done', 18, 20);
  cp.run(s, 'Разбор кейса', d(-9), 'done', 22, 25);
  cp.run(s, 'Аудит медиакоммуникаций компании (презентация)', d(4), 'pending', null, 25);
  s = subj.run(anna, 'current', CUR, 'Big Social Data', 'Дифференцированный зачёт', 3, 'Ершов Д. К.', 20, null, null, '2026-12-18 13:40', 'комп. класс 410').lastInsertRowid;
  cp.run(s, 'Сбор и парсинг данных', d(-12), 'done', 20, 25);
  cp.run(s, 'Кластеризация сообщений', d(2), 'pending', null, 25);
  cp.run(s, 'Итоговый исследовательский проект', d(25), 'pending', null, 50);
  s = subj.run(anna, 'current', CUR, 'Академическое письмо', 'Зачёт', 2, 'Лаптева О. Н.', 19, null, null, null, null).lastInsertRowid;
  cp.run(s, 'Задание 1. TITLE', d(-25), 'done', 10, 10);
  cp.run(s, 'Задание 2. ABSTRACT', d(-11), 'done', 9, 10);
  cp.run(s, 'Черновик статьи', d(16), 'pending', null, 30);
  s = subj.run(anna, 'current', CUR, 'Прикладная аксиология массмедиа', 'Экзамен', 3, 'Кравец Л. П.', 12, null, null, '2026-12-27 10:00', 'ауд. 210, 1-я линия').lastInsertRowid;
  cp.run(s, 'Тест по ценностным моделям', d(-15), 'done', 12, 20);
  cp.run(s, 'Концепция мероприятия по брифу', d(7), 'pending', null, 30);
  s = subj.run(anna, 'current', CUR, 'Аудиовизуальная журналистика', 'Дифференцированный зачёт', 3, 'Мельников А. Г.', 15, null, null, '2026-12-20 11:15', 'студия 018').lastInsertRowid;
  cp.run(s, 'Сценарий и раскадровка', d(-6), 'done', 15, 20);
  cp.run(s, 'Командный видеопроект', d(13), 'pending', null, 40);
  s = subj.run(anna, 'current', CUR, 'Визуальные коммуникации в соцмедиа', 'Зачёт', 2, 'Орлова К. Д.', 46, null, null, null, null).lastInsertRowid;
  cp.run(s, 'Анализ визуальной стратегии бренда', d(-18), 'done', 24, 25);
  cp.run(s, 'Мудборд и гайдлайн', d(-4), 'done', 22, 25);

  // Анна — прошлые семестры
  const past = (term, name, control, cr, res, ects) => subj.run(anna, 'past', term, name, control, cr, null, null, res, ects, null, null);
  past('Весенний семестр 2026', 'Теория и практика медиакоммуникаций', 'Экзамен', 4, 'отлично', 'A');
  past('Весенний семестр 2026', 'Методология медиаисследований', 'Экзамен', 4, 'отлично', 'A');
  past('Весенний семестр 2026', 'Брендинг', 'Дифференцированный зачёт', 3, 'хорошо', 'C');
  past('Весенний семестр 2026', 'Иностранный язык', 'Зачёт', 2, 'зачтено', 'B');
  past('Осенний семестр 2025', 'Стратегические коммуникации', 'Экзамен', 4, 'отлично', 'A');
  past('Осенний семестр 2025', 'Медиаэкономика', 'Экзамен', 3, 'отлично', 'B');
  past('Осенний семестр 2025', 'Цифровые медиа', 'Зачёт', 3, 'зачтено', 'A');

  // Максим — текущий семестр
  s = subj.run(max, 'current', CUR, 'Методы оптимизации', 'Экзамен', 5, 'Зайцев И. Р.', 18, null, null, '2026-12-24 10:00', 'ауд. 405, Петергоф').lastInsertRowid;
  cp.run(s, 'Контрольная работа 1', d(-21), 'done', 18, 30);
  cp.run(s, 'Домашнее задание: симплекс-метод', d(-3), 'pending', null, 20);
  cp.run(s, 'Контрольная работа 2', d(10), 'pending', null, 30);
  s = subj.run(max, 'current', CUR, 'Функциональный анализ', 'Экзамен', 5, 'Григорьев В. Е.', 14, null, null, '2026-12-29 10:00', 'ауд. 101, Петергоф').lastInsertRowid;
  cp.run(s, 'Коллоквиум', d(-14), 'done', 14, 30);
  cp.run(s, 'Индивидуальное задание', d(5), 'pending', null, 20);
  s = subj.run(max, 'current', CUR, 'Машинное обучение', 'Дифференцированный зачёт', 4, 'Морозова А. И.', 52, null, null, '2026-12-19 13:40', 'комп. класс 2427').lastInsertRowid;
  cp.run(s, 'Лабораторная: линейные модели', d(-20), 'done', 19, 20);
  cp.run(s, 'Лабораторная: деревья решений', d(-7), 'done', 18, 20);
  cp.run(s, 'Соревнование на открытых данных', d(12), 'pending', null, 30);
  s = subj.run(max, 'current', CUR, 'Базы данных', 'Зачёт', 3, 'Абрамова Т. С.', 35, null, null, null, null).lastInsertRowid;
  cp.run(s, 'Проект схемы БД', d(-10), 'done', 20, 25);
  cp.run(s, 'SQL-практикум', d(-1), 'done', 15, 25);
  cp.run(s, 'Защита проекта', d(9), 'pending', null, 30);
  s = subj.run(max, 'current', CUR, 'Теория вероятностей и матстатистика', 'Экзамен', 4, 'Лебедев П. А.', 30, null, null, '2026-12-26 10:00', 'ауд. 101, Петергоф').lastInsertRowid;
  cp.run(s, 'Контрольная работа', d(-8), 'done', 30, 40);
  cp.run(s, 'Типовой расчёт', d(6), 'pending', null, 20);
  s = subj.run(max, 'current', CUR, 'Английский язык', 'Зачёт', 2, 'Данилова С. М.', 44, null, null, null, null).lastInsertRowid;
  cp.run(s, 'Презентация по специальности', d(-5), 'done', 24, 25);
  cp.run(s, 'Эссе', d(-16), 'done', 20, 25);

  const pastM = (term, name, control, cr, res, ects) => subj.run(max, 'past', term, name, control, cr, null, null, res, ects, null, null);
  pastM('Весенний семестр 2026', 'Дифференциальные уравнения', 'Экзамен', 5, 'хорошо', 'C');
  pastM('Весенний семестр 2026', 'Алгоритмы и структуры данных', 'Экзамен', 5, 'отлично', 'A');
  pastM('Весенний семестр 2026', 'Комплексный анализ', 'Экзамен', 4, 'удовлетворительно', 'E');
  pastM('Весенний семестр 2026', 'Физическая культура', 'Зачёт', 1, 'зачтено', 'A');
  pastM('Осенний семестр 2025', 'Математический анализ', 'Экзамен', 6, 'хорошо', 'B');
  pastM('Осенний семестр 2025', 'Программирование на Python', 'Дифференцированный зачёт', 3, 'отлично', 'A');
}

function addRequest(userId, type, title, details, status, events, withVerify) {
  const created = events[0][2];
  const id = db.prepare(`INSERT INTO requests (public_id, user_id, type, title, details, status, verify_code, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).run(publicId(), userId, type, title, JSON.stringify(details), status,
    withVerify ? verifyCode() : null, created, events[events.length - 1][2]).lastInsertRowid;
  const ev = db.prepare('INSERT INTO request_events (request_id, status, comment, author, created_at) VALUES (?,?,?,?,?)');
  for (const [st, comment, at, author] of events) ev.run(id, st, comment, author || null, at);
  return id;
}

const ago = (hours) => new Date(Date.now() - hours * 3600000).toISOString();

function seedRequests(anna, max) {
  addRequest(anna, 'study_certificate', 'Справка об обучении',
    { destination: 'По месту требования', copies: 1, format: 'electronic' }, 'ready',
    [['submitted', null, ago(30)], ['in_progress', null, ago(26), 'Учебный отдел'], ['ready', 'Справка подписана электронной подписью', ago(20), 'Соколова Е. В.']], true);
  addRequest(anna, 'employer_call', 'Справка-вызов для работодателя',
    { destination: 'ООО «Пример Медиа»', period: 'winter' }, 'in_progress',
    [['submitted', null, ago(10)], ['in_progress', 'Передано на подпись', ago(4), 'Соколова Е. В.']]);
  addRequest(max, 'military', 'Справка для военкомата',
    { destination: 'Военный комиссариат (демо)', copies: 1 }, 'submitted',
    [['submitted', null, ago(3)]]);
  addRequest(max, 'financial_aid', 'Заявление на материальную помощь',
    { reason: 'hardship', document: 'не указан' }, 'rejected',
    [['submitted', null, ago(120)], ['in_progress', null, ago(100), 'Учебный отдел'],
     ['rejected', 'Не приложен подтверждающий документ. Подайте заявление ещё раз с документом.', ago(96), 'Соколова Е. В.']]);
}

function seedNotifications() {
  const n = db.prepare('INSERT INTO notifications (audience_type, audience_value, category, title, body, link, created_at) VALUES (?,?,?,?,?,?,?)');
  n.run('all', null, 'important', 'Запись на межфакультетские курсы до 20 ноября',
    'Выберите курс на весенний семестр в разделе «Учёба». После 20 ноября запись закрывается.', '#/study', ago(50));
  n.run('all', null, 'news', 'Библиотека работает до 22:00 в период сессии',
    'С 15 декабря читальные залы на Васильевском острове открыты дольше. Бронируйте место заранее.', null, ago(70));
  n.run('faculty', 'Высшая школа журналистики и массовых коммуникаций', 'news',
    'Открыт приём заявок на конференцию «Медиа в цифровую эпоху»',
    'Тезисы принимаются до 1 декабря. Лучшие доклады войдут в сборник.', null, ago(28));
  n.run('group', GROUP_ANNA, 'change', 'Аксиология массмедиа: лекция во вторник перенесена',
    'Лекция Кравец Л. П. переносится на 15:25 в ту же аудиторию 210.', '#/schedule', ago(6));
  n.run('group', GROUP_MAX, 'change', 'Методы оптимизации: практика в понедельник отменена',
    'Преподаватель на конференции. Задание на самостоятельную работу — в курсе в Blackboard (демо).', '#/schedule', ago(8));
  n.run('faculty', 'Факультет прикладной математики — процессов управления', 'important',
    'Автобус до Петергофа 11 ноября ходит по изменённому расписанию',
    'Из-за ремонта дороги первый рейс отправится в 08:10. Учтите это, если у вас первая пара.', null, ago(15));
}

// Изменения в расписании на текущую и следующую неделю — чтобы демо всегда было «живым»
function ensureDemoChanges() {
  const monday = mondayOf(nowSpb().date);
  const ins = db.prepare(`INSERT OR IGNORE INTO schedule_changes
    (group_name, date, slot, change, new_slot, new_room, new_campus_id, subject, kind, teacher, note)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  for (const w of [0, 7]) {
    const day = (wd) => addDays(monday, w + wd - 1);
    ins.run(GROUP_ANNA, day(2), 2, 'moved', 4, null, null, null, null, null, 'Перенос по просьбе преподавателя');
    ins.run(GROUP_ANNA, day(4), 4, 'room', null, 'ауд. 220', 'vo1', null, null, null, 'Аудитория 115 занята под защиту диссертаций');
    ins.run(GROUP_ANNA, day(5), 3, 'cancelled', null, null, null, null, null, null, 'Преподаватель болеет, задание в почте группы');
    ins.run(GROUP_ANNA, day(3), 6, 'added', null, 'ауд. 3-02', 'smolny', 'Консультация по ВКР', 'Консультация', 'Белова Н. С.', 'Для тех, кто выступает на предзащите');
    ins.run(GROUP_MAX, day(1), 2, 'cancelled', null, null, null, null, null, null, 'Преподаватель на конференции');
    ins.run(GROUP_MAX, day(3), 3, 'room', null, 'ауд. 3510', 'peterhof', null, null, null, 'Замена аудитории');
    ins.run(GROUP_MAX, day(4), 5, 'added', null, 'ауд. 405', 'peterhof', 'Консультация по курсовой', 'Консультация', 'Савельев Н. Б.', 'Запись у старосты');
  }
}

module.exports = { seedIfEmpty, ensureDemoChanges, publicId, verifyCode };
