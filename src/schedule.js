const { db } = require('./db');
const { SLOTS, toMin, addDays, mondayOf, nowSpb } = require('./time');

// Примерное время в пути между корпусами, минут (общественный транспорт)
const TRAVEL = {
  'vo1|vo-mend': 12,
  'vo1|smolny': 40,
  'vo1|peterhof': 75,
  'vo-mend|smolny': 40,
  'vo-mend|peterhof': 70,
  'smolny|peterhof': 90,
};
function travelMinutes(a, b) {
  if (a === b) return 0;
  return TRAVEL[`${a}|${b}`] ?? TRAVEL[`${b}|${a}`] ?? 45;
}

const campusStmt = db.prepare('SELECT * FROM campuses');
function campusMap() {
  const m = {};
  for (const c of campusStmt.all()) m[c.id] = c;
  return m;
}

const slotsStmt = db.prepare('SELECT * FROM schedule_slots WHERE group_name = ? ORDER BY weekday, slot');
const changesStmt = db.prepare('SELECT * FROM schedule_changes WHERE group_name = ? AND date BETWEEN ? AND ?');

function lessonFrom(base, slot, extra) {
  const [start, end] = SLOTS[slot];
  return { ...base, slot, start, end, ...extra };
}

// Собирает расписание группы на неделю, применяя изменения деканата
function buildWeek(group, anyDateInWeek) {
  const monday = mondayOf(anyDateInWeek);
  const sunday = addDays(monday, 6);
  const campuses = campusMap();
  const slots = slotsStmt.all(group);
  const changes = changesStmt.all(group, monday, sunday);
  const byKey = new Map(changes.map((c) => [`${c.date}|${c.slot}`, c]));

  const days = [];
  for (let wd = 1; wd <= 7; wd++) {
    const date = addDays(monday, wd - 1);
    const lessons = [];
    for (const s of slots.filter((x) => x.weekday === wd)) {
      const base = {
        subject: s.subject, kind: s.kind, room: s.room,
        campus: campuses[s.campus_id], teacher: s.teacher,
      };
      const ch = byKey.get(`${date}|${s.slot}`);
      if (!ch) { lessons.push(lessonFrom(base, s.slot, { status: 'ok' })); continue; }
      if (ch.change === 'cancelled') {
        lessons.push(lessonFrom(base, s.slot, { status: 'cancelled', note: ch.note }));
      } else if (ch.change === 'room') {
        lessons.push(lessonFrom(base, s.slot, {
          status: 'room', note: ch.note, oldRoom: s.room,
          room: ch.new_room || s.room,
          campus: campuses[ch.new_campus_id] || base.campus,
        }));
      } else if (ch.change === 'moved') {
        lessons.push(lessonFrom(base, ch.new_slot, {
          status: 'moved', note: ch.note, oldTime: `${SLOTS[s.slot][0]}–${SLOTS[s.slot][1]}`,
          room: ch.new_room || s.room,
          campus: campuses[ch.new_campus_id] || base.campus,
        }));
      }
    }
    // Добавленные занятия (консультации и т. п.)
    for (const ch of changes.filter((c) => c.date === date && c.change === 'added')) {
      lessons.push(lessonFrom({
        subject: ch.subject, kind: ch.kind, room: ch.new_room,
        campus: campuses[ch.new_campus_id], teacher: ch.teacher,
      }, ch.slot, { status: 'added', note: ch.note }));
    }
    lessons.sort((a, b) => toMin(a.start) - toMin(b.start));

    // Пересадки: смена корпуса между соседними парами
    const active = lessons.filter((l) => l.status !== 'cancelled');
    for (let i = 1; i < active.length; i++) {
      const prev = active[i - 1], cur = active[i];
      if (prev.campus.id !== cur.campus.id) {
        const gap = toMin(cur.start) - toMin(prev.end);
        const travel = travelMinutes(prev.campus.id, cur.campus.id);
        cur.transfer = { from: prev.campus.name, to: cur.campus.name, gap, travel, tight: travel > gap };
      }
    }
    days.push({ date, weekday: wd, lessons });
  }
  return { monday, days };
}

// «Что сейчас»: текущая или следующая пара сегодня
function todayInfo(group) {
  const now = nowSpb();
  const week = buildWeek(group, now.date);
  const today = week.days.find((d) => d.date === now.date);
  const active = today.lessons.filter((l) => l.status !== 'cancelled');
  const current = active.find((l) => toMin(l.start) <= now.minutes && now.minutes < toMin(l.end)) || null;
  const next = active.find((l) => toMin(l.start) > now.minutes) || null;
  let nextDay = null;
  if (!next) {
    for (let i = 1; i <= 7 && !nextDay; i++) {
      const d = addDays(now.date, i);
      const w = buildWeek(group, d).days.find((x) => x.date === d);
      const first = w.lessons.find((l) => l.status !== 'cancelled');
      if (first) nextDay = { date: d, lesson: first };
    }
  }
  return { now, today, current, next, nextDay };
}

module.exports = { buildWeek, todayInfo, travelMinutes };
