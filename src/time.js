// Всё время в кабинете — петербургское (Europe/Moscow, UTC+3, без перехода на летнее время).
const TZ_OFFSET_MIN = 180;

function nowSpb() {
  const d = new Date(Date.now() + TZ_OFFSET_MIN * 60000);
  return {
    date: d.toISOString().slice(0, 10),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    weekday: ((d.getUTCDay() + 6) % 7) + 1, // 1 = пн ... 7 = вс
  };
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayOf(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return ((d.getUTCDay() + 6) % 7) + 1;
}

function mondayOf(iso) {
  return addDays(iso, 1 - weekdayOf(iso));
}

function isoNow() {
  return new Date().toISOString();
}

// Сетка пар СПбГУ
const SLOTS = {
  1: ['09:30', '11:05'],
  2: ['11:15', '12:50'],
  3: ['13:40', '15:15'],
  4: ['15:25', '17:00'],
  5: ['17:10', '18:45'],
  6: ['18:55', '20:30'],
};

const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

module.exports = { nowSpb, addDays, weekdayOf, mondayOf, isoNow, SLOTS, toMin };
