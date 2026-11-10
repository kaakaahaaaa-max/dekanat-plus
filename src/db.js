// Слой данных. SQLite (встроенный в Node 22) — для прототипа;
// схема написана на переносимом SQL, поэтому при росте нагрузки
// её можно без переделки логики перенести в PostgreSQL.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'dekanat.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  login         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,           -- bcrypt, пароль в открытом виде не хранится
  role          TEXT NOT NULL CHECK (role IN ('student','staff')),
  full_name     TEXT NOT NULL,
  short_name    TEXT NOT NULL,
  faculty       TEXT,
  program       TEXT,
  profile       TEXT,
  level         TEXT,
  course        INTEGER,
  group_name    TEXT,
  record_book   TEXT,
  email         TEXT,
  position      TEXT,
  home_campus   TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,            -- в базе хранится только SHA-256 от токена
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS campuses (
  id      TEXT PRIMARY KEY,
  name    TEXT NOT NULL,
  address TEXT NOT NULL,
  metro   TEXT
);

CREATE TABLE IF NOT EXISTS schedule_slots (
  id         INTEGER PRIMARY KEY,
  group_name TEXT NOT NULL,
  weekday    INTEGER NOT NULL,            -- 1 = понедельник
  slot       INTEGER NOT NULL,            -- номер пары
  subject    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  room       TEXT NOT NULL,
  campus_id  TEXT NOT NULL REFERENCES campuses(id),
  teacher    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schedule_changes (
  id            INTEGER PRIMARY KEY,
  group_name    TEXT NOT NULL,
  date          TEXT NOT NULL,            -- YYYY-MM-DD
  slot          INTEGER NOT NULL,
  change        TEXT NOT NULL CHECK (change IN ('moved','cancelled','room','added')),
  new_slot      INTEGER,
  new_room      TEXT,
  new_campus_id TEXT,
  subject       TEXT,
  kind          TEXT,
  teacher       TEXT,
  note          TEXT,
  UNIQUE (group_name, date, slot)
);

CREATE TABLE IF NOT EXISTS subjects (
  id        INTEGER PRIMARY KEY,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  semester  TEXT NOT NULL,                -- 'current' | 'past'
  term_name TEXT NOT NULL,
  name      TEXT NOT NULL,
  control   TEXT NOT NULL,                -- экзамен / зачёт / дифференцированный зачёт
  credits   INTEGER NOT NULL,
  teacher   TEXT,
  score     INTEGER,                      -- текущий балл из 100
  result    TEXT,                         -- итог: отлично / хорошо / зачтено ...
  ects      TEXT,
  exam_date TEXT,
  exam_room TEXT
);

CREATE TABLE IF NOT EXISTS checkpoints (
  id         INTEGER PRIMARY KEY,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  due_date   TEXT,
  status     TEXT NOT NULL CHECK (status IN ('done','pending')),
  points     INTEGER,
  max_points INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id          INTEGER PRIMARY KEY,
  public_id   TEXT UNIQUE NOT NULL,        -- номер для людей, не угадывается
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  details     TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL CHECK (status IN ('submitted','in_progress','ready','done','rejected')),
  verify_code TEXT UNIQUE,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS request_events (
  id         INTEGER PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  comment    TEXT,
  author     TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id             INTEGER PRIMARY KEY,
  audience_type  TEXT NOT NULL CHECK (audience_type IN ('user','group','faculty','all')),
  audience_value TEXT,
  category       TEXT NOT NULL CHECK (category IN ('important','deadline','change','news','request')),
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,
  link           TEXT,
  created_at     TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_reads (
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, notification_id)
);

CREATE INDEX IF NOT EXISTS idx_requests_user ON requests(user_id);
CREATE INDEX IF NOT EXISTS idx_subjects_user ON subjects(user_id);
CREATE INDEX IF NOT EXISTS idx_slots_group ON schedule_slots(group_name, weekday);
`);

// Небольшая обёртка над транзакцией
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { db, tx };
