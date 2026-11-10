// Деканат+ — концепт личного кабинета студента СПбГУ для конкурса.
// Не официальный сервис университета. Все данные вымышленные.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');

const { db, tx } = require('./src/db');
const { seedIfEmpty, ensureDemoChanges, publicId, verifyCode } = require('./src/seed');
const { buildWeek, todayInfo } = require('./src/schedule');
const { nowSpb, addDays, isoNow } = require('./src/time');
const { REQUEST_TYPES, BY_ID, validateRequest } = require('./src/catalog');
const assistant = require('./src/assistant');

seedIfEmpty();
ensureDemoChanges();
setInterval(ensureDemoChanges, 6 * 3600 * 1000).unref();

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_DAYS = 7;

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
}));
app.use(express.json({ limit: '20kb' }));

// ---------- Сессии ----------
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function setSessionCookie(res, token, maxAgeSec) {
  const attrs = [`sid=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSec}`];
  if (IS_PROD) attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

const getSession = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token_hash = ? AND s.expires_at > ?`);

function auth(req, res, next) {
  const token = parseCookies(req.headers.cookie).sid;
  const user = token ? getSession.get(sha256(token), Date.now()) : null;
  if (!user) return res.status(401).json({ error: 'Войдите в кабинет' });
  req.user = user;
  next();
}
const onlyRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'Нет доступа к этому разделу' });

// Защита от подделки запросов: изменяющие запросы принимаются только от нашего фронтенда
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'dekanat') {
    return res.status(403).json({ error: 'Запрос отклонён' });
  }
  next();
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Подождите 15 минут.' },
});

// Хеш-заглушка, чтобы время ответа не выдавало, существует ли логин
const DUMMY_HASH = bcrypt.hashSync('dummy-password-not-used', 10);

app.post('/api/login', loginLimiter, (req, res) => {
  const login = String(req.body?.login || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!login || !password) return res.status(400).json({ error: 'Введите логин и пароль' });
  const user = db.prepare('SELECT * FROM users WHERE login = ?').get(login);
  const ok = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) return res.status(401).json({ error: 'Неверный логин или пароль' });

  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)')
    .run(sha256(token), user.id, Date.now() + SESSION_DAYS * 86400000);
  setSessionCookie(res, token, SESSION_DAYS * 86400);
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  const token = parseCookies(req.headers.cookie).sid;
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  setSessionCookie(res, '', 0);
  res.json({ ok: true });
});

function publicUser(u) {
  const { password_hash, ...rest } = u;
  return rest;
}

app.get('/api/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// ---------- Расписание ----------
app.get('/api/schedule', auth, onlyRole('student'), (req, res) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : nowSpb().date;
  res.json({ today: nowSpb().date, ...buildWeek(req.user.group_name, date) });
});

// ---------- Успеваемость ----------
const subjectsStmt = db.prepare('SELECT * FROM subjects WHERE user_id = ? ORDER BY semester, id');
const checkpointsStmt = db.prepare(`SELECT c.* FROM checkpoints c JOIN subjects s ON s.id = c.subject_id
  WHERE s.user_id = ? ORDER BY c.due_date`);

const isExamLike = (control) => control !== 'Зачёт';

function study(userId) {
  const today = nowSpb().date;
  const subjects = subjectsStmt.all(userId);
  const cps = checkpointsStmt.all(userId);
  const current = subjects.filter((s) => s.semester === 'current').map((s) => {
    const list = cps.filter((c) => c.subject_id === s.id).map((c) => ({
      ...c, overdue: c.status === 'pending' && c.due_date && c.due_date < today,
    }));
    // Баллы считаются из заданий; всё, что не покрыто заданиями, — итоговая аттестация
    const score = list.filter((c) => c.status === 'done').reduce((a, c) => a + (c.points || 0), 0);
    const finalPart = Math.max(0, 100 - list.reduce((a, c) => a + c.max_points, 0));
    const pendingMax = list.filter((c) => c.status === 'pending').reduce((a, c) => a + c.max_points, 0);
    const remaining = pendingMax + finalPart;
    const doneMax = list.filter((c) => c.status === 'done').reduce((a, c) => a + c.max_points, 0);
    const pct = doneMax ? score / doneMax : 1;
    const overdue = list.filter((c) => c.overdue).length;
    const soon = list.filter((c) => c.status === 'pending' && !c.overdue && c.due_date <= addDays(today, 7)).length;
    const status = overdue || pct < 0.55 ? 'risk' : soon ? 'attention' : 'ok';
    const target = isExamLike(s.control) ? 90 : 50;
    const needForTarget = Math.max(0, target - score);
    return {
      ...s, score, checkpoints: list, remaining, finalPart, pendingMax, status, overdue, soon,
      target, targetLabel: isExamLike(s.control) ? '«отлично»' : 'зачёт',
      needForTarget, reachable: needForTarget <= remaining,
    };
  });
  const past = subjects.filter((s) => s.semester === 'past');
  const graded = past.filter((s) => isExamLike(s.control));
  const excellent = graded.filter((s) => s.result === 'отлично').length;
  const hasSatisfactory = graded.some((s) => s.result === 'удовлетворительно');
  const honorsPct = graded.length ? Math.round((excellent / graded.length) * 100) : 0;
  const lastTerm = past[0]?.term_name;
  const lastTermResults = past.filter((s) => s.term_name === lastTerm);
  const scholarship = lastTermResults.every((s) => ['отлично', 'хорошо', 'зачтено'].includes(s.result));
  const terms = [...new Set(past.map((s) => s.term_name))].map((t) => ({
    name: t, subjects: past.filter((s) => s.term_name === t),
  }));
  return {
    current, terms,
    summary: {
      honorsPct, honorsOk: honorsPct >= 75 && !hasSatisfactory, hasSatisfactory,
      scholarship, lastTerm,
      risk: current.filter((s) => s.status === 'risk').length,
      credits: current.reduce((a, s) => a + s.credits, 0),
      examsStart: current.map((s) => s.exam_date).filter(Boolean).sort()[0] || null,
    },
  };
}

app.get('/api/study', auth, onlyRole('student'), (req, res) => res.json(study(req.user.id)));

// ---------- Заявки и справки ----------
app.get('/api/request-types', auth, (req, res) => res.json({ types: REQUEST_TYPES }));

const STATUS_LABEL = {
  submitted: 'Отправлена', in_progress: 'В работе', ready: 'Готова', done: 'Выполнена', rejected: 'Отклонена',
};

function requestView(r, withEvents) {
  const out = { ...r, details: JSON.parse(r.details), statusLabel: STATUS_LABEL[r.status], typeInfo: BY_ID[r.type] ? { title: BY_ID[r.type].title, eta: BY_ID[r.type].eta } : null };
  delete out.verify_code;
  out.hasDocument = r.status === 'ready' && !!r.verify_code;
  if (withEvents) out.events = db.prepare('SELECT status, comment, author, created_at FROM request_events WHERE request_id = ? ORDER BY id').all(r.id);
  return out;
}

app.get('/api/requests', auth, onlyRole('student'), (req, res) => {
  const rows = db.prepare('SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ requests: rows.map((r) => requestView(r, true)) });
});

// Ключевая проверка безопасности: заявку ищем сразу по id И владельцу.
// Чужая заявка для студента «не существует» — 404, без подсказок.
const ownRequest = db.prepare('SELECT * FROM requests WHERE id = ? AND user_id = ?');

app.get('/api/requests/:id', auth, onlyRole('student'), (req, res) => {
  const r = ownRequest.get(Number(req.params.id), req.user.id);
  if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
  res.json({ request: requestView(r, true) });
});

app.post('/api/requests', auth, onlyRole('student'), (req, res) => {
  const v = validateRequest(req.body?.type, req.body?.details);
  if (v.error) return res.status(400).json({ error: v.error });
  const open = db.prepare("SELECT COUNT(*) AS c FROM requests WHERE user_id = ? AND status IN ('submitted','in_progress')").get(req.user.id).c;
  if (open >= 10) return res.status(429).json({ error: 'У вас уже 10 заявок в работе. Дождитесь ответа по ним.' });
  const now = isoNow();
  const id = tx(() => {
    const newId = db.prepare(`INSERT INTO requests (public_id, user_id, type, title, details, status, created_at, updated_at)
      VALUES (?,?,?,?,?,'submitted',?,?)`).run(publicId(), req.user.id, v.type.id, v.type.title, JSON.stringify(v.details), now, now).lastInsertRowid;
    db.prepare("INSERT INTO request_events (request_id, status, created_at) VALUES (?, 'submitted', ?)").run(newId, now);
    return newId;
  });
  res.status(201).json({ request: requestView(ownRequest.get(id, req.user.id), true) });
});

// Электронная справка с QR-кодом (только своя и только готовая)
app.get('/doc/:id', auth, async (req, res) => {
  const r = ownRequest.get(Number(req.params.id), req.user.id);
  if (!r || r.status !== 'ready' || !r.verify_code) return res.status(404).send('Документ не найден');
  const url = `${req.protocol}://${req.get('host')}/verify/${r.verify_code}`;
  const qr = await QRCode.toString(url, { type: 'svg', margin: 0, width: 120 });
  const d = JSON.parse(r.details);
  const u = req.user;
  const issued = new Date(r.updated_at).toLocaleDateString('ru-RU');
  res.type('html').send(docPage(`
    <p class="demo">Демонстрационный документ. Не является официальной справкой СПбГУ.</p>
    <h1>${esc(r.title)} № ${esc(r.public_id)}</h1>
    <p>Дана ${esc(u.full_name)} в том, что ${u.full_name.endsWith('на') || u.full_name.endsWith('вна') ? 'она' : 'он'} действительно обучается
    на ${u.course} курсе, уровень образования — ${esc(u.level.toLowerCase())}, по образовательной программе
    «${esc(u.program)}», ${esc(u.faculty)}, группа ${esc(u.group_name)}, очная форма обучения.</p>
    <p>Справка выдана для предъявления: ${esc(d.destination || 'по месту требования')}.</p>
    <div class="sign"><div>Дата выдачи: ${issued}<br>Подписано электронной подписью<br>Учебное управление (демо)</div>${qr}</div>
    <p class="small">Проверьте подлинность: отсканируйте QR-код или откройте ${esc(url)}</p>
    <button id="print" type="button">Распечатать или сохранить в PDF</button>`));
});

app.get('/verify/:code', (req, res) => {
  const r = db.prepare(`SELECT r.public_id, r.title, r.updated_at, u.full_name FROM requests r JOIN users u ON u.id = r.user_id
    WHERE r.verify_code = ? AND r.status = 'ready'`).get(String(req.params.code));
  if (!r) return res.status(404).type('html').send(docPage('<h1>Документ не найден</h1><p>Такой справки нет или она отозвана.</p>'));
  // Показываем минимум данных: фамилию и инициалы
  const [last, first, middle] = r.full_name.split(' ');
  res.type('html').send(docPage(`
    <p class="demo">Проверка демонстрационного документа</p>
    <h1>Документ действителен</h1>
    <p>${esc(r.title)} № ${esc(r.public_id)}<br>Выдана: ${esc(last)} ${esc(first[0])}. ${esc(middle ? middle[0] + '.' : '')}<br>
    Дата выдачи: ${new Date(r.updated_at).toLocaleDateString('ru-RU')}</p>`));
});

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function docPage(body) {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Документ · Деканат+</title><link rel="stylesheet" href="/doc.css"></head><body><main>${body}</main>
  <script src="/doc.js"></script></body></html>`;
}

// ---------- Уведомления ----------
function notificationsFor(u) {
  return db.prepare(`SELECT n.*, (r.user_id IS NOT NULL) AS read FROM notifications n
    LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
    WHERE n.audience_type = 'all'
       OR (n.audience_type = 'faculty' AND n.audience_value = ?)
       OR (n.audience_type = 'group' AND n.audience_value = ?)
       OR (n.audience_type = 'user' AND n.audience_value = ?)
    ORDER BY n.created_at DESC LIMIT 100`).all(u.id, u.faculty, u.group_name, String(u.id))
    .map((n) => ({ ...n, read: !!n.read }));
}

function deadlinesFor(userId, days = 14) {
  const today = nowSpb().date;
  return db.prepare(`SELECT c.id, c.title, c.due_date, c.max_points, s.name AS subject FROM checkpoints c
    JOIN subjects s ON s.id = c.subject_id
    WHERE s.user_id = ? AND c.status = 'pending' AND c.due_date <= ?
    ORDER BY c.due_date`).all(userId, addDays(today, days))
    .map((c) => ({ ...c, overdue: c.due_date < today, daysLeft: Math.round((new Date(c.due_date) - new Date(today)) / 86400000) }));
}

app.get('/api/notifications', auth, (req, res) => {
  res.json({ notifications: notificationsFor(req.user), deadlines: req.user.role === 'student' ? deadlinesFor(req.user.id) : [] });
});

app.post('/api/notifications/read', auth, (req, res) => {
  const visible = new Set(notificationsFor(req.user).map((n) => n.id));
  const ids = req.body?.all ? [...visible] : (Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : []);
  const ins = db.prepare('INSERT OR IGNORE INTO notification_reads (user_id, notification_id) VALUES (?,?)');
  tx(() => ids.filter((id) => visible.has(id)).forEach((id) => ins.run(req.user.id, id)));
  res.json({ ok: true });
});

// ---------- Главная «Сегодня» ----------
app.get('/api/today', auth, onlyRole('student'), (req, res) => {
  const t = todayInfo(req.user.group_name);
  const notes = notificationsFor(req.user);
  const reqs = db.prepare("SELECT * FROM requests WHERE user_id = ? AND (status IN ('submitted','in_progress','ready') OR updated_at > ?) ORDER BY updated_at DESC LIMIT 3")
    .all(req.user.id, new Date(Date.now() - 3 * 86400000).toISOString()).map((r) => requestView(r, false));
  const st = study(req.user.id);
  res.json({
    ...t,
    deadlines: deadlinesFor(req.user.id, 7),
    requests: reqs,
    unread: notes.filter((n) => !n.read).length,
    important: notes.filter((n) => !n.read && ['important', 'change'].includes(n.category)).slice(0, 2),
    studySummary: st.summary,
  });
});

// ---------- Помощник «Спроси деканат» ----------
const askLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, message: { error: 'Слишком много вопросов подряд. Подождите минуту.' } });
app.get('/api/assistant/suggestions', auth, (req, res) => res.json({ suggestions: assistant.suggestions }));
app.post('/api/assistant', auth, askLimiter, async (req, res) => {
  const q = String(req.body?.question || '').trim();
  if (q.length < 3) return res.status(400).json({ error: 'Напишите вопрос чуть подробнее' });
  res.json(await assistant.ask(q.slice(0, 1000), req.user));
});

// ---------- Кабинет сотрудника ----------
app.get('/api/staff/requests', auth, onlyRole('staff'), (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.full_name, u.group_name, u.faculty FROM requests r JOIN users u ON u.id = r.user_id
    ORDER BY CASE r.status WHEN 'submitted' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, r.created_at DESC`).all();
  res.json({ requests: rows.map((r) => ({ ...requestView(r, true), student: { name: r.full_name, group: r.group_name, faculty: r.faculty } })) });
});

app.patch('/api/staff/requests/:id', auth, onlyRole('staff'), (req, res) => {
  const status = String(req.body?.status || '');
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  if (!STATUS_LABEL[status]) return res.status(400).json({ error: 'Неизвестный статус' });
  if (status === 'rejected' && !comment) return res.status(400).json({ error: 'Объясните студенту причину отказа' });
  const r = db.prepare('SELECT * FROM requests WHERE id = ?').get(Number(req.params.id));
  if (!r) return res.status(404).json({ error: 'Заявка не найдена' });
  const now = isoNow();
  const author = req.user.full_name.split(' ').map((p, i) => (i === 0 ? p : p[0] + '.')).join(' ');
  tx(() => {
    const needsCode = status === 'ready' && BY_ID[r.type]?.electronic && JSON.parse(r.details).format === 'electronic' && !r.verify_code;
    db.prepare('UPDATE requests SET status = ?, updated_at = ?, verify_code = COALESCE(verify_code, ?) WHERE id = ?')
      .run(status, now, needsCode ? verifyCode() : null, r.id);
    db.prepare('INSERT INTO request_events (request_id, status, comment, author, created_at) VALUES (?,?,?,?,?)')
      .run(r.id, status, comment || null, author, now);
    const text = {
      in_progress: 'Сотрудник взял заявку в работу.',
      ready: 'Документ готов. Откройте заявку, чтобы скачать или узнать, где забрать.',
      done: 'Заявка выполнена.',
      rejected: `Заявка отклонена: ${comment}`,
      submitted: 'Заявка возвращена в очередь.',
    }[status];
    db.prepare(`INSERT INTO notifications (audience_type, audience_value, category, title, body, link, created_at)
      VALUES ('user', ?, 'request', ?, ?, ?, ?)`).run(String(r.user_id), `${r.title}: ${STATUS_LABEL[status].toLowerCase()}`,
      comment && status !== 'rejected' ? `${text} Комментарий: ${comment}` : text, `#/requests/${r.id}`, now);
  });
  res.json({ ok: true });
});

app.get('/api/staff/groups', auth, onlyRole('staff'), (req, res) => {
  res.json({ groups: db.prepare("SELECT DISTINCT group_name AS g, faculty FROM users WHERE role = 'student'").all() });
});

app.post('/api/staff/announcements', auth, onlyRole('staff'), (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 140);
  const body = String(req.body?.body || '').trim().slice(0, 1000);
  const category = ['important', 'news', 'change', 'deadline'].includes(req.body?.category) ? req.body.category : 'news';
  const group = String(req.body?.group || '');
  if (!title || !body) return res.status(400).json({ error: 'Заполните заголовок и текст' });
  const groups = db.prepare("SELECT DISTINCT group_name AS g FROM users WHERE role = 'student'").all().map((x) => x.g);
  if (group && !groups.includes(group)) return res.status(400).json({ error: 'Такой группы нет' });
  db.prepare('INSERT INTO notifications (audience_type, audience_value, category, title, body, created_at) VALUES (?,?,?,?,?,?)')
    .run(group ? 'group' : 'all', group || null, category, title, body, isoNow());
  res.status(201).json({ ok: true });
});

// ---------- Статика и SPA ----------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: IS_PROD ? '1h' : 0, index: 'index.html' }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Что-то пошло не так на сервере. Попробуйте ещё раз.' });
});

app.listen(PORT, () => console.log(`Деканат+ запущен: http://localhost:${PORT}`));
