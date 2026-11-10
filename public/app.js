/* Деканат+ — клиентская часть. Без фреймворков: один файл, хеш-маршрутизация.
   Все данные приходят с сервера только для вошедшего пользователя. */
'use strict';

// ---------- Утилиты ----------
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  return m10 === 1 && m100 !== 11 ? one : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many;
};
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const WD_FULL = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const parseD = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-').map(Number); return { y, m, d }; };
const fmtDate = (iso) => { const { m, d } = parseD(iso); return `${d} ${MONTHS[m - 1]}`; };
const addDays = (iso, n) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const weekday = (iso) => (new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7; // 0 = пн
const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const fmtDateTime = (isoTs) => new Date(isoTs).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
function ago(isoTs) {
  const min = Math.round((Date.now() - new Date(isoTs)) / 60000);
  if (min < 1) return 'только что';
  if (min < 60) return `${min} ${plural(min, 'минуту', 'минуты', 'минут')} назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
  return fmtDateTime(isoTs);
}
function inMinutes(n) {
  if (n < 60) return `через ${n} ${plural(n, 'минуту', 'минуты', 'минут')}`;
  const h = Math.floor(n / 60), m = n % 60;
  return `через ${h} ч${m ? ` ${m} мин` : ''}`;
}
const dueText = (d) => d.overdue ? `просрочено на ${-d.daysLeft} ${plural(-d.daysLeft, 'день', 'дня', 'дней')}`
  : d.daysLeft === 0 ? 'сегодня' : d.daysLeft === 1 ? 'завтра' : `через ${d.daysLeft} ${plural(d.daysLeft, 'день', 'дня', 'дней')}`;

// ---------- Иконки (собственные, обводка 2px) ----------
const P = {
  home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5h13V10"/><path d="M10 19.5v-5h4v5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  study: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c3.5 2.5 7.5 2.5 11 0v-5"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8.5 9.5h7M8.5 12.5h4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.3-3.7 4.2-5.5 7.5-5.5s6.2 1.8 7.5 5.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  alert: '<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 8v.01"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  right: '<path d="m9 5 7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6.5L14 17v4M8 11l3-3.5 4 1.5 2 3.5M11 8l-1.5 6"/>',
  send: '<path d="M4 12 20 4l-4 16-4-7z"/><path d="m12 13 8-9"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  logout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  coffee: '<path d="M4.5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z"/><path d="M16.5 10.5h1.5a2.5 2.5 0 0 1 0 5h-2M8 3.5v2.5M12 3.5v2.5"/>',
  inbox: '<path d="M3.5 13.5 6 5h12l2.5 8.5V19h-17z"/><path d="M3.5 13.5H9l1 2h4l1-2h5.5"/>',
  megaphone: '<path d="M4 10v4h3l9 5V5L7 10z"/><path d="M19 9.5a3.5 3.5 0 0 1 0 5"/>',
  shield: '<path d="M12 3.5 19 6v6c0 4.5-3 7.5-7 8.5-4-1-7-4-7-8.5V6z"/><path d="m9 12 2 2 4-4"/>',
  spark: '<path d="M12 3.5 13.8 9 19.5 10.5 13.8 12 12 17.5 10.2 12 4.5 10.5 10.2 9z"/><path d="M18.5 16v4M16.5 18h4"/>',
};
const icon = (name, cls = '') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
const BRIDGE = `<svg class="bridge" viewBox="0 0 64 64" aria-hidden="true"><path d="M12 40h12l6-17M52 40H40l-6-17" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 48c4 0 4-2.5 8-2.5s4 2.5 8 2.5 4-2.5 8-2.5 4 2.5 8 2.5 4-2.5 8-2.5 4 2.5 8 2.5" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>`;
const campusColor = (id) => (id === 'smolny' ? 'var(--c-smolny)' : id === 'peterhof' ? 'var(--c-peterhof)' : 'var(--c-vo)');

// ---------- Сеть ----------
class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'dekanat' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.', 0);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/api/login') { state.me = null; renderLogin(); throw new ApiError(data.error || 'Войдите в кабинет', 401); }
  if (!res.ok) throw new ApiError(data.error || 'Что-то пошло не так. Попробуйте ещё раз.', res.status);
  return data;
}

let toastTimer;
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
}

// ---------- Состояние ----------
const state = { me: null, unread: 0, chat: [], renderId: 0, requestTypes: null };

// ---------- Маршрутизация ----------
function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [p, q] = raw.split('?');
  return { path: p, parts: p.split('/').filter(Boolean), query: new URLSearchParams(q || '') };
}

const STUDENT_NAV = [
  ['/', 'Сегодня', 'home'],
  ['/schedule', 'Расписание', 'calendar'],
  ['/study', 'Учёба', 'study'],
  ['/requests', 'Заявки', 'doc'],
  ['/assistant', 'Помощник', 'chat'],
];
const STAFF_NAV = [
  ['/', 'Заявки', 'inbox'],
  ['/announce', 'Объявления', 'megaphone'],
];

function navActive(path, href) {
  if (href === '/') return path === '/' ;
  return path === href || path.startsWith(href + '/');
}

function renderShell() {
  const { path } = parseHash();
  const nav = state.me.role === 'staff' ? STAFF_NAV : STUDENT_NAV;
  const initials = state.me.full_name.split(' ').slice(0, 2).map((s) => s[0]).reverse().join('');
  const brand = `<a class="brand" href="#/"><img src="/logo.svg" alt="" width="32" height="32"><span>Деканат+<small>${state.me.role === 'staff' ? 'кабинет сотрудника · концепт' : 'СПбГУ · концепт для конкурса'}</small></span></a>`;
  const links = (cls) => nav.map(([href, label, ic]) => `<a class="${cls}" href="#${href}" ${navActive(path, href) ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></a>`).join('');
  $('#app').innerHTML = `
  <div class="shell">
    <nav class="sidenav" aria-label="Разделы">${brand}${links('nav')}
      <div class="foot">Концепт для конкурса «Цифровой деканат будущего». Не официальный сервис СПбГУ. Все данные вымышленные.</div>
    </nav>
    <header class="topbar">
      ${brand}
      ${state.me.role === 'student' ? `<a class="icon-btn" href="#/notifications" aria-label="Уведомления${state.unread ? `, непрочитанных: ${state.unread}` : ''}">${icon('bell')}${state.unread ? `<span class="badge">${state.unread > 9 ? '9+' : state.unread}</span>` : ''}</a>` : ''}
      <a class="avatar" href="#/profile" aria-label="Профиль">${esc(initials)}</a>
    </header>
    <main class="view" id="view" tabindex="-1"></main>
    <nav class="tabbar" aria-label="Разделы" style="grid-template-columns: repeat(${nav.length}, 1fr)">${links('')}</nav>
  </div>`;
}

async function route() {
  if (!state.me) return;
  renderShell();
  const { parts, query } = parseHash();
  const view = $('#view');
  const id = ++state.renderId;
  const isCurrent = () => id === state.renderId;
  const r = state.me.role === 'staff' ? staffRoutes : studentRoutes;
  const handler = r[parts[0] || ''] || notFound;
  try {
    await handler({ view, parts, query, isCurrent });
  } catch (e) {
    if (!isCurrent() || e.status === 401) return;
    view.innerHTML = errorState(e.message);
  }
  if (isCurrent()) window.scrollTo(0, 0);
}

const studentRoutes = {
  '': pageToday, schedule: pageSchedule, study: pageStudy, requests: pageRequests,
  notifications: pageNotifications, assistant: pageAssistant, profile: pageProfile,
};
const staffRoutes = { '': pageStaffRequests, announce: pageStaffAnnounce, profile: pageProfile };

function notFound({ view }) {
  view.innerHTML = empty('Такой страницы нет', 'Возможно, ссылка устарела. Вернитесь на главную — там всё самое важное.', 'home', '<a class="btn" href="#/">На главную</a>');
}

// ---------- Общие куски ----------
const empty = (title, text, ic = 'inbox', action = '') =>
  `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
const errorState = (msg) => `<div class="notice bad" role="alert" style="margin-top:16px">${icon('alert')}<div><b>Не удалось загрузить</b><p>${esc(msg)}</p>
  <button class="btn small secondary" style="margin-top:10px" data-action="retry">Повторить</button></div></div>`;
const skeleton = (blocks = [180, 120, 220]) => blocks.map((h) => `<div class="skeleton" style="height:${h}px;margin-top:14px"></div>`).join('');

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="retry"]')) { if (state.me) route(); else location.reload(); }
});

// ---------- Линия дня ----------
function lineOfDay(lessons, { nowMin = null, isToday = false } = {}) {
  if (!lessons.length) return '';
  const items = [];
  for (const l of lessons) {
    if (l.transfer) {
      const t = l.transfer;
      items.push(`<li class="transfer ${t.tight ? 'tight' : ''}"><div></div><div class="rail"></div>
        <div class="note">${icon(t.tight ? 'alert' : 'walk')}<span><b>Пересадка: ${esc(t.to)}.</b> В пути около ${t.travel} мин, перерыв ${t.gap} мин.
        ${t.tight ? 'Не успеваете — предупредите преподавателя заранее.' : 'Успеваете спокойно.'}</span></div></li>`);
    }
    const now = isToday && nowMin !== null && l.status !== 'cancelled' && toMin(l.start) <= nowMin && nowMin < toMin(l.end);
    const change = {
      moved: `<span class="chip warn">Перенос</span><span>было в <span class="old">${esc(l.oldTime)}</span></span>`,
      room: `<span class="chip warn">Новая аудитория</span><span>вместо <span class="old">${esc(l.oldRoom)}</span></span>`,
      cancelled: '<span class="chip bad">Отменено</span>',
      added: '<span class="chip info">Добавлено</span>',
    }[l.status];
    items.push(`<li class="stop ${l.status} ${now ? 'now' : ''}" style="--c:${campusColor(l.campus?.id)}">
      <div class="t"><b>${l.start}</b><small>${l.end}</small></div>
      <div class="rail"><span class="station"></span></div>
      <div class="info">
        <div class="subj">${esc(l.subject)}</div>
        <div class="meta">${esc(l.kind)}, ${esc(l.room)}, ${esc(l.campus?.name || '')}</div>
        <div class="meta">${esc(l.teacher)}</div>
        ${now ? '<div class="change"><span class="chip warn">Идёт сейчас</span></div>' : ''}
        ${change ? `<div class="change">${change}</div>${l.note ? `<div class="meta">${esc(l.note)}</div>` : ''}` : ''}
      </div></li>`);
  }
  return `<ol class="line panel" aria-label="Занятия по порядку">${items.join('')}</ol>`;
}

const trackOf = (r) => {
  const steps = ['submitted', 'in_progress', r.status === 'done' ? 'done' : 'ready'];
  if (r.status === 'rejected') return '<div class="track" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="bad"></i></div>';
  const idx = steps.indexOf(r.status);
  return `<div class="track" aria-hidden="true">${steps.map((s, i) => `<i class="${i <= idx ? (idx === 2 ? 'ok' : 'on') : ''}"></i>`).join('')}</div>`;
};
const statusChip = (r) => {
  const cls = { submitted: 'info', in_progress: 'warn', ready: 'ok', done: 'ok', rejected: 'bad' }[r.status];
  return `<span class="chip ${cls}">${esc(r.statusLabel)}</span>`;
};

// ---------- Страница: Сегодня ----------
async function pageToday({ view, isCurrent }) {
  view.innerHTML = skeleton([60, 200, 260]);
  const d = await api('/api/today');
  if (!isCurrent()) return;
  state.unread = d.unread;
  const bell = $('.topbar .icon-btn');
  if (bell) bell.outerHTML = `<a class="icon-btn" href="#/notifications" aria-label="Уведомления">${icon('bell')}${d.unread ? `<span class="badge">${d.unread > 9 ? '9+' : d.unread}</span>` : ''}</a>`;

  const nowMin = d.now.minutes;
  const hour = Math.floor(nowMin / 60);
  const hello = hour < 5 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
  const dateLine = `${WD_FULL[d.now.weekday - 1][0].toUpperCase() + WD_FULL[d.now.weekday - 1].slice(1)}, ${fmtDate(d.now.date)}`;

  let hero;
  if (d.current) {
    const l = d.current, total = toMin(l.end) - toMin(l.start), done = nowMin - toMin(l.start);
    hero = `<section class="hero" aria-label="Текущая пара">${BRIDGE}
      <div class="label">Идёт сейчас, до конца ${toMin(l.end) - nowMin} мин</div>
      <div class="clock range">${l.start}<span>–</span>${l.end}</div>
      <h2>${esc(l.subject)}</h2>
      <div class="where"><span>${icon('pin')}${esc(l.room)}, ${esc(l.campus.name)}</span><span>${icon('user')}${esc(l.teacher)}</span></div>
      <div class="progress"><i style="width:${Math.round((done / total) * 100)}%"></i></div></section>`;
  } else if (d.next) {
    const l = d.next;
    hero = `<section class="hero" aria-label="Следующая пара">${BRIDGE}
      ${l.status === 'moved' || l.status === 'room' ? '<span class="tag">Есть изменения</span>' : ''}
      <div class="label">Следующая пара ${inMinutes(toMin(l.start) - nowMin)}</div>
      <div class="clock">${l.start}</div>
      <h2>${esc(l.subject)}</h2>
      <div class="where"><span>${icon('pin')}${esc(l.room)}, ${esc(l.campus.name)}</span><span>${icon('user')}${esc(l.teacher)}</span></div></section>`;
  } else {
    const nd = d.nextDay;
    hero = `<section class="hero quiet" aria-label="Пары на сегодня">
      <div class="label">${d.today.lessons.length ? 'На сегодня пары закончились' : 'Сегодня пар нет'}</div>
      <div class="clock" style="font-size:40px">${icon('coffee')}</div>
      ${nd ? `<h2>Дальше: ${WD_FULL[weekday(nd.date)]}, ${nd.lesson.start}</h2><div class="where"><span>${esc(nd.lesson.subject)}, ${esc(nd.lesson.room)}, ${esc(nd.lesson.campus.name)}</span></div>` : '<h2>Отдыхайте</h2>'}
    </section>`;
  }

  const tight = d.today.lessons.find((l) => l.transfer?.tight);
  const changes = d.today.lessons.filter((l) => l.status !== 'ok').length;

  const deadlines = d.deadlines.length ? `<ul class="list panel">${d.deadlines.slice(0, 4).map((x) => `
      <li><a class="row" href="#/study">${icon(x.overdue ? 'alert' : 'clock', '')}
        <div class="grow"><div class="title">${esc(x.title)}</div><div class="meta">${esc(x.subject)}</div></div>
        <span class="chip ${x.overdue ? 'bad' : x.daysLeft <= 2 ? 'warn' : 'plain'}">${dueText(x)}</span></a></li>`).join('')}</ul>`
    : `<div class="panel">${empty('Дедлайнов на неделю нет', 'Все задания на ближайшие 7 дней сданы. Можно заняться проектами на будущее.', 'check')}</div>`;

  const reqs = d.requests.length ? `<ul class="list panel">${d.requests.map((r) => `
      <li><a class="row" href="#/requests/${r.id}"><div class="grow"><div class="title">${esc(r.title)}</div>
        <div class="meta">№ ${esc(r.public_id)}, обновлено ${ago(r.updated_at)}</div>${trackOf(r)}</div>${statusChip(r)}</a></li>`).join('')}</ul>`
    : `<div class="panel">${empty('Активных заявок нет', 'Справку или заявление можно оформить онлайн за минуту.', 'doc', '<a class="btn small" href="#/requests/new">Заказать справку</a>')}</div>`;

  const s = d.studySummary;
  view.innerHTML = `
    <div class="greet"><h1>${hello}, ${esc(state.me.short_name)}</h1><p>${dateLine}</p></div>
    <div class="today-grid">
      <div>
        ${hero}
        ${d.important.map((n) => `<a class="notice ${n.category === 'change' ? 'warn' : 'bad'}" href="#/notifications" style="margin-top:12px;text-decoration:none">${icon(n.category === 'change' ? 'calendar' : 'alert')}<p><b>${esc(n.title)}</b>${esc(n.body)}</p></a>`).join('')}
        <section class="section">
          <div class="section-head"><h2>Линия дня</h2><a href="#/schedule">Вся неделя</a></div>
          ${tight ? `<div class="notice bad" style="margin-bottom:10px">${icon('walk')}<p><b>Сегодня сложная пересадка</b>Между корпусами не успеть за перерыв — посмотрите отметку на линии.</p></div>` : ''}
          ${d.today.lessons.length ? lineOfDay(d.today.lessons, { nowMin, isToday: true }) : `<div class="panel">${empty('Сегодня занятий нет', 'Хороший день, чтобы поработать над заданиями из списка дедлайнов.', 'coffee')}</div>`}
          ${changes ? `<p class="small muted" style="margin:8px 4px 0">Изменений на сегодня: ${changes}. Они уже учтены в линии.</p>` : ''}
        </section>
      </div>
      <div>
        <section class="section">
          <div class="section-head"><h2>Дедлайны на неделю</h2><a href="#/study">Учёба</a></div>
          ${deadlines}
        </section>
        <section class="section">
          <div class="section-head"><h2>Мои заявки</h2><a href="#/requests">Все</a></div>
          ${reqs}
        </section>
        <section class="section">
          <div class="section-head"><h2>Как дела с учёбой</h2></div>
          <div class="stat-row">
            <a class="stat ${s.risk ? 'bad' : 'ok'}" href="#/study"><b>${s.risk}</b><span>${plural(s.risk, 'предмет', 'предмета', 'предметов')} в зоне риска</span></a>
            <a class="stat" href="#/study"><b>${s.examsStart ? fmtDate(s.examsStart).split(' ')[0] + ' ' + fmtDate(s.examsStart).split(' ')[1].slice(0, 3) : '—'}</b><span>начало сессии</span></a>
          </div>
        </section>
      </div>
    </div>
    <p class="concept-note">Концепт для конкурса. Не официальный сервис СПбГУ. Все данные вымышленные.</p>`;
}

// ---------- Страница: Расписание ----------
async function pageSchedule({ view, query, isCurrent }) {
  view.innerHTML = `<div class="page-head"><h1>Расписание</h1></div>${skeleton([40, 64, 300])}`;
  const date = query.get('date');
  const d = await api(`/api/schedule${date ? `?date=${encodeURIComponent(date)}` : ''}`);
  if (!isCurrent()) return;
  const selected = date && d.days.some((x) => x.date === date) ? date
    : d.days.some((x) => x.date === d.today) ? d.today : d.monday;
  const day = d.days.find((x) => x.date === selected);
  const sunday = addDays(d.monday, 6);
  const sameMonth = parseD(d.monday).m === parseD(sunday).m;
  const range = sameMonth ? `${parseD(d.monday).d}–${fmtDate(sunday)}` : `${fmtDate(d.monday)} – ${fmtDate(sunday)}`;
  const isThisWeek = d.days.some((x) => x.date === d.today);
  const allChanges = d.days.flatMap((x) => x.lessons.filter((l) => l.status !== 'ok').map((l) => ({ ...l, date: x.date })));
  const campuses = [...new Map(d.days.flatMap((x) => x.lessons).map((l) => [l.campus.id, l.campus])).values()];

  view.innerHTML = `
    <div class="page-head"><div><h1>Расписание</h1><p>Группа ${esc(state.me.group_name)}</p></div>
      ${isThisWeek ? '' : `<a class="btn small secondary" href="#/schedule">К текущей неделе</a>`}</div>
    <div class="weekbar">
      <a class="icon-btn" href="#/schedule?date=${addDays(d.monday, -7)}" aria-label="Предыдущая неделя">${icon('left')}</a>
      <div class="range">${range}${isThisWeek ? ' <span class="muted small">· эта неделя</span>' : ''}</div>
      <a class="icon-btn" href="#/schedule?date=${addDays(d.monday, 7)}" aria-label="Следующая неделя">${icon('right')}</a>
    </div>
    <div class="days" role="group" aria-label="Дни недели">
      ${d.days.map((x, i) => {
        const active = x.lessons.filter((l) => l.status !== 'cancelled');
        return `<button data-date="${x.date}" aria-pressed="${x.date === selected}" class="${x.date === d.today ? 'today' : ''} ${active.length ? '' : 'off'}" aria-label="${WD_FULL[i]}, ${fmtDate(x.date)}, пар: ${active.length}">
          <small>${WD[i]}</small><b>${parseD(x.date).d}</b>
          <span class="dots">${x.lessons.slice(0, 4).map((l) => `<i class="${l.status !== 'ok' ? 'chg' : ''}"></i>`).join('')}</span></button>`;
      }).join('')}
    </div>
    <div class="two-col">
      <section>
        <div class="section-head"><h2>${WD_FULL[weekday(selected)][0].toUpperCase() + WD_FULL[weekday(selected)].slice(1)}, ${fmtDate(selected)}</h2></div>
        ${day.lessons.length ? lineOfDay(day.lessons, { nowMin: selected === d.today ? nowMinutesSpb() : null, isToday: selected === d.today })
          : `<div class="panel">${empty('Занятий нет', weekday(selected) >= 5 ? 'Выходной — можно отдохнуть или сходить в библиотеку.' : 'В этот день у группы нет пар.', 'coffee')}</div>`}
        <div class="legend">${campuses.map((c) => `<span><i style="background:${campusColor(c.id)}"></i>${esc(c.name)}</span>`).join('')}</div>
      </section>
      <section class="section" style="margin-top:0">
        <div class="section-head"><h2>Изменения недели</h2></div>
        ${allChanges.length ? `<ul class="list panel">${allChanges.map((l) => `<li><button class="row note-item" style="display:flex" data-date="${l.date}">
          <span class="chip ${l.status === 'cancelled' ? 'bad' : l.status === 'added' ? 'info' : 'warn'}">${{ moved: 'Перенос', room: 'Аудитория', cancelled: 'Отмена', added: 'Добавлено' }[l.status]}</span>
          <span class="grow"><span class="title" style="display:block">${esc(l.subject)}</span><span class="meta">${WD[weekday(l.date)]}, ${fmtDate(l.date)}, ${l.start}${l.note ? `. ${esc(l.note)}` : ''}</span></span></button></li>`).join('')}</ul>`
          : `<div class="panel">${empty('Изменений нет', 'Всё по плану. Если деканат что-то поменяет, изменение появится здесь и в уведомлениях.', 'check')}</div>`}
      </section>
    </div>`;
  view.querySelectorAll('[data-date]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/schedule?date=${b.dataset.date}`; }));
}

function nowMinutesSpb() {
  const d = new Date(Date.now() + 180 * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

// ---------- Страница: Учёба ----------
async function pageStudy({ view, query, isCurrent }) {
  view.innerHTML = `<div class="page-head"><h1>Учёба</h1></div>${skeleton([110, 300])}`;
  const d = await api('/api/study');
  if (!isCurrent()) return;
  const tab = query.get('tab') === 'book' ? 'book' : 'current';
  const s = d.summary;

  const subjects = d.current.map((x) => {
    const pct = x.score, left = x.remaining;
    const chip = x.status === 'risk' ? `<span class="chip bad">${x.overdue ? `Просрочено: ${x.overdue}` : 'Мало баллов'}</span>`
      : x.status === 'attention' ? `<span class="chip warn">Сдать на неделе: ${x.soon}</span>` : '<span class="chip ok">Всё по плану</span>';
    const advice = x.needForTarget === 0 ? `Уже набрано на ${x.targetLabel}. Отличная работа!`
      : x.needForTarget <= x.pendingMax ? `Чтобы выйти на ${x.targetLabel}, нужно ещё ${x.needForTarget} ${plural(x.needForTarget, 'балл', 'балла', 'баллов')} — их можно набрать на оставшихся заданиях.`
      : `Чтобы выйти на ${x.targetLabel}, нужно ещё ${x.needForTarget} ${plural(x.needForTarget, 'балл', 'балла', 'баллов')}: задания дадут до ${x.pendingMax}, остальное — ${x.control.toLowerCase()} (до ${x.finalPart}).`;
    return `<details class="subject" ${x.status === 'risk' ? 'open' : ''}>
      <summary>
        <div><div class="name">${esc(x.name)}</div><div class="ctrl">${esc(x.control)}, ${x.credits} з. е.</div></div>
        <div class="score">${pct}<small> / 100</small></div>
        <div class="bar" role="img" aria-label="Набрано ${pct} из 100, ещё можно получить ${left}">
          <i class="got" style="width:${pct}%"></i><i class="left" style="width:${left}%"></i><span class="mark" style="left:${x.target}%"></span></div>
        <div class="status">${chip}<span class="muted">Отметка — порог на ${x.targetLabel}</span></div>
      </summary>
      <ul class="cps">${x.finalPart ? '' : ''}${x.checkpoints.map((c) => `<li class="${c.overdue ? 'overdue' : c.status}">${icon(c.status === 'done' ? 'check' : c.overdue ? 'alert' : 'circle')}
        <div><div>${esc(c.title)}</div><div class="when">${c.status === 'done' ? 'Сдано' : c.overdue ? `Срок прошёл ${fmtDate(c.due_date)}` : `Срок: ${fmtDate(c.due_date)}`}</div></div>
        <div class="pts">${c.status === 'done' ? `${c.points}/${c.max_points}` : `—/${c.max_points}`}</div></li>`).join('')}
        ${x.finalPart ? `<li class="pending">${icon('study')}<div><div>${esc(x.control)}</div><div class="when">${x.exam_date ? fmtDate(x.exam_date) : 'в сессию'}</div></div><div class="pts">—/${x.finalPart}</div></li>` : ''}</ul>
      <div class="advice">${esc(advice)}</div>
      ${x.exam_date ? `<div class="exam">${icon('calendar')}${esc(x.control)}: ${fmtDate(x.exam_date)}, ${x.exam_date.slice(11)}, ${esc(x.exam_room)}</div>` : ''}
    </details>`;
  }).join('');

  const book = d.terms.map((t) => `<section class="section"><div class="section-head"><h2>${esc(t.name)}</h2></div>
    <div class="panel" style="overflow-x:auto"><table class="gradebook"><thead><tr><th>Дисциплина</th><th>Форма</th><th>Итог</th></tr></thead><tbody>
    ${t.subjects.map((x) => `<tr><td>${esc(x.name)}<div class="small muted">${x.credits} з. е.</div></td><td class="small muted">${esc(x.control)}</td>
      <td class="res">${esc(x.result)} <span class="chip ${x.result === 'отлично' || x.result === 'зачтено' ? 'ok' : x.result === 'хорошо' ? 'info' : 'warn'}">${esc(x.ects)}</span></td></tr>`).join('')}
    </tbody></table></div></section>`).join('');

  view.innerHTML = `
    <div class="page-head"><div><h1>Учёба</h1><p>Осенний семестр 2026, ${s.credits} з. е.</p></div>
      <div class="segmented" role="group" aria-label="Вид">
        <button data-tab="current" aria-pressed="${tab === 'current'}">Текущий семестр</button>
        <button data-tab="book" aria-pressed="${tab === 'book'}">Зачётка</button></div></div>
    <div class="stat-row three">
      <div class="stat ${s.risk ? 'bad' : 'ok'}"><b>${s.risk}</b><span>${plural(s.risk, 'предмет', 'предмета', 'предметов')} в зоне риска</span></div>
      <div class="stat ${s.scholarship ? 'ok' : 'bad'}"><b>${s.scholarship ? 'Есть' : 'Нет'}</b><span>${s.scholarship ? 'стипендия по итогам прошлой сессии' : 'стипендии: в прошлой сессии есть «удовл.»'}</span></div>
      <div class="stat"><b>${s.honorsPct}%</b><span>«отлично» для диплома с отличием (нужно 75%)</span>
        <div class="meter" aria-hidden="true"><i style="width:${s.honorsPct}%;background:${s.honorsOk ? 'var(--ok)' : 'var(--ochre)'}"></i><span class="goal"></span></div></div>
    </div>
    ${tab === 'current' ? `<section class="section"><div class="section-head"><h2>Дисциплины</h2><span class="small muted">Нажмите, чтобы раскрыть задания</span></div>
      <div class="panel">${subjects || empty('Дисциплин пока нет', 'Список появится, когда учебный отдел утвердит план семестра.', 'study')}</div></section>`
      : book || `<div class="panel">${empty('Зачётка пока пуста', 'Оценки появятся после первой сессии.', 'study')}</div>`}
    ${s.hasSatisfactory ? `<div class="notice warn" style="margin-top:20px">${icon('info')}<p><b>Про диплом с отличием</b>В зачётке есть «удовлетворительно». Для диплома с отличием таких оценок быть не должно — уточните в учебном отделе про пересдачу на повышение.</p></div>` : ''}`;
  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.tab === 'book' ? '#/study?tab=book' : '#/study'; }));
}

// ---------- Страница: Заявки ----------
async function loadTypes() {
  if (!state.requestTypes) state.requestTypes = (await api('/api/request-types')).types;
  return state.requestTypes;
}

async function pageRequests(ctx) {
  const { parts } = ctx;
  if (parts[1] === 'new') return pageRequestNew(ctx);
  if (parts[1]) return pageRequestDetail(ctx);
  const { view, isCurrent } = ctx;
  view.innerHTML = `<div class="page-head"><h1>Заявки и справки</h1></div>${skeleton([90, 90, 90])}`;
  const { requests } = await api('/api/requests');
  if (!isCurrent()) return;
  const active = requests.filter((r) => ['submitted', 'in_progress', 'ready'].includes(r.status));
  const archive = requests.filter((r) => !active.includes(r));
  const list = (arr) => `<ul class="list panel">${arr.map((r) => `<li><a class="row" href="#/requests/${r.id}">
    <div class="grow"><div class="title">${esc(r.title)}</div><div class="meta">№ ${esc(r.public_id)}, подана ${fmtDateTime(r.created_at)}</div>${trackOf(r)}</div>
    ${statusChip(r)}${icon('right', 'chev')}</a></li>`).join('')}</ul>`;
  view.innerHTML = `
    <div class="page-head"><div><h1>Заявки и справки</h1><p>Без очередей: подайте онлайн и следите за статусом.</p></div>
      <a class="btn" href="#/requests/new">${icon('plus')}Новая заявка</a></div>
    ${requests.length ? `
      <section class="section"><div class="section-head"><h2>В работе</h2></div>
        ${active.length ? list(active) : `<div class="panel">${empty('Всё готово', 'Нет заявок в работе. Новые можно подать кнопкой выше.', 'check')}</div>`}</section>
      ${archive.length ? `<section class="section"><div class="section-head"><h2>Архив</h2></div>${list(archive)}</section>` : ''}`
      : `<div class="panel">${empty('Заявок пока нет', 'Справку об обучении можно получить электронно уже завтра — без похода в деканат.', 'doc', '<a class="btn" href="#/requests/new">Заказать справку</a>')}</div>`}`;
}

async function pageRequestNew({ view, query, isCurrent }) {
  view.innerHTML = skeleton([60, 300]);
  const types = await loadTypes();
  if (!isCurrent()) return;
  const typeId = query.get('type');
  const type = types.find((t) => t.id === typeId);

  if (!type) {
    const card = (t) => `<a class="type-card" href="#/requests/new?type=${t.id}"><b>${esc(t.title)}</b><span>${esc(t.hint)}</span>
      <div class="eta"><span class="chip plain">${icon('clock')} ${esc(t.eta)}</span>${t.electronic ? '<span class="chip ok">Можно электронно</span>' : ''}</div></a>`;
    view.innerHTML = `
      <a class="btn ghost" href="#/requests">${icon('left')}Заявки</a>
      <div class="page-head"><div><h1>Что оформить?</h1><p>Выберите документ — форма займёт меньше минуты.</p></div></div>
      <section class="section"><div class="section-head"><h2>Справки</h2></div><div class="catalog">${types.filter((t) => t.group === 'certificate').map(card).join('')}</div></section>
      <section class="section"><div class="section-head"><h2>Заявления и обращения</h2></div><div class="catalog">${types.filter((t) => t.group === 'application').map(card).join('')}</div></section>`;
    return;
  }

  const today = new Date(Date.now() + 180 * 60000).toISOString().slice(0, 10);
  const field = (f) => {
    const id = `f-${f.name}`;
    let control;
    if (f.type === 'select' && f.name === 'format') {
      control = `<div class="radio-cards" role="radiogroup" aria-labelledby="${id}-l">${f.options.map(([v, l], i) =>
        `<label><input type="radio" name="${f.name}" value="${v}" ${i === 0 ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div>`;
      return `<div class="field"><label id="${id}-l">${esc(f.label)}</label>${control}</div>`;
    }
    if (f.type === 'select') control = `<select id="${id}" name="${f.name}" ${f.required ? 'required' : ''}>${f.options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') control = `<textarea id="${id}" name="${f.name}" ${f.required ? 'required' : ''} maxlength="${f.max || 500}" placeholder="${esc(f.placeholder || '')}"></textarea>`;
    else if (f.type === 'number') control = `<input id="${id}" name="${f.name}" type="number" inputmode="numeric" min="${f.min}" max="${f.max}" value="${f.default || 1}" required>`;
    else if (f.type === 'date') control = `<input id="${id}" name="${f.name}" type="date" value="${today}" required>`;
    else control = `<input id="${id}" name="${f.name}" type="text" ${f.required ? 'required' : ''} maxlength="${f.max || 200}" placeholder="${esc(f.placeholder || '')}" autocomplete="off">`;
    return `<div class="field"><label for="${id}">${esc(f.label)}${f.required ? '' : ' <span class="muted small">(необязательно)</span>'}</label>${control}</div>`;
  };

  view.innerHTML = `
    <a class="btn ghost" href="#/requests/new">${icon('left')}Все виды заявок</a>
    <div class="page-head"><div><h1>${esc(type.title)}</h1><p>${esc(type.hint)}</p></div></div>
    <form class="panel form" novalidate>
      <div class="notice info">${icon('clock')}<p><b>Срок: ${esc(type.eta)}</b>О смене статуса придёт уведомление.</p></div>
      ${type.fields.map(field).join('')}
      <div class="form-error" role="alert"></div>
      <button class="btn block" type="submit">Отправить заявку</button>
      <p class="small muted" style="margin:0">Данные профиля (ФИО, группа, направление) подставятся автоматически.</p>
    </form>`;

  const form = $('form', view);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', form);
    err.innerHTML = '';
    form.querySelectorAll('.field').forEach((f) => f.classList.remove('invalid'));
    const bad = [...form.querySelectorAll('[required]')].find((el) => !el.value.trim());
    if (bad) {
      bad.closest('.field').classList.add('invalid'); bad.focus();
      err.innerHTML = `<div class="notice bad">${icon('alert')}<p>Заполните поле «${esc(bad.closest('.field').querySelector('label').textContent.trim())}»</p></div>`;
      return;
    }
    const details = Object.fromEntries(new FormData(form).entries());
    const btn = $('button[type=submit]', form);
    btn.disabled = true; btn.textContent = 'Отправляем…';
    try {
      const { request } = await api('/api/requests', { method: 'POST', body: { type: type.id, details } });
      toast('Заявка отправлена');
      location.hash = `#/requests/${request.id}`;
    } catch (ex) {
      err.innerHTML = `<div class="notice bad">${icon('alert')}<p>${esc(ex.message)}</p></div>`;
      btn.disabled = false; btn.textContent = 'Отправить заявку';
    }
  });
}

async function pageRequestDetail({ view, parts, isCurrent }) {
  view.innerHTML = skeleton([60, 200, 200]);
  let r;
  try {
    r = (await api(`/api/requests/${encodeURIComponent(parts[1])}`)).request;
  } catch (e) {
    if (e.status === 404) {
      view.innerHTML = `<a class="btn ghost" href="#/requests">${icon('left')}Заявки</a><div class="panel">${empty('Заявка не найдена', 'Такой заявки нет среди ваших. Проверьте ссылку или откройте список заявок.', 'shield', '<a class="btn" href="#/requests">Мои заявки</a>')}</div>`;
      return;
    }
    throw e;
  }
  if (!isCurrent()) return;
  const types = await loadTypes();
  const t = types.find((x) => x.id === r.type);
  const labelOf = (name, value) => {
    const f = t?.fields.find((x) => x.name === name);
    if (!f) return [name, value];
    if (f.type === 'select') return [f.label, (f.options.find(([v]) => v === value) || [, value])[1]];
    if (f.type === 'date') return [f.label, fmtDate(value)];
    return [f.label, value];
  };
  const flow = r.status === 'rejected' ? ['submitted', 'in_progress', 'rejected']
    : ['submitted', 'in_progress', ['done'].includes(r.status) ? 'done' : 'ready'];
  const LABEL = { submitted: 'Отправлена', in_progress: 'В работе', ready: 'Готова', done: 'Выполнена', rejected: 'Отклонена' };
  const timeline = flow.map((st) => {
    const ev = [...r.events].reverse().find((e) => e.status === st);
    const cls = !ev ? 'future' : st === 'rejected' ? 'bad' : (st === 'ready' || st === 'done') ? 'ok' : '';
    return `<li><span class="pt ${cls}">${ev ? icon(st === 'rejected' ? 'x' : 'check') : ''}</span><div>
      <div class="${ev ? '' : 'muted'}" style="font-weight:600">${LABEL[st]}</div>
      ${ev ? `<div class="when">${fmtDateTime(ev.created_at)}${ev.author ? `, ${esc(ev.author)}` : ''}</div>${ev.comment ? `<div class="small" style="margin-top:4px">${esc(ev.comment)}</div>` : ''}`
        : `<div class="when">${st === 'in_progress' ? 'Сотрудник возьмёт заявку в работу' : `Ориентировочно: ${esc(r.typeInfo?.eta || '')}`}</div>`}
    </div></li>`;
  }).join('');

  const isPaperReady = r.status === 'ready' && !r.hasDocument;
  view.innerHTML = `
    <a class="btn ghost" href="#/requests">${icon('left')}Заявки</a>
    <div class="page-head"><div><h1>${esc(r.title)}</h1><p>№ ${esc(r.public_id)}</p></div>${statusChip(r)}</div>
    ${r.hasDocument ? `<div class="notice ok">${icon('check')}<div><b>Справка готова</b><p>Подписана электронной подписью. QR-код на справке позволяет проверить её подлинность.</p>
      <a class="btn small" style="margin-top:10px" href="/doc/${r.id}" target="_blank" rel="noopener">${icon('download')}Открыть справку</a></div></div>` : ''}
    ${isPaperReady ? `<div class="notice ok">${icon('pin')}<p><b>Можно забрать</b>Учебный отдел, 1-я линия В. О., 26, каб. 105. Пн–пт, 10:00–17:00. Возьмите студенческий билет.</p></div>` : ''}
    ${r.status === 'rejected' ? `<div class="notice bad">${icon('alert')}<div><b>Заявка отклонена</b><p>Прочитайте комментарий ниже и подайте заявку заново.</p>
      <a class="btn small" style="margin-top:10px" href="#/requests/new?type=${r.type}">Подать заново</a></div></div>` : ''}
    <div class="two-col">
      <section class="section"><div class="section-head"><h2>Статус</h2></div><div class="panel" style="padding:16px"><ol class="timeline">${timeline}</ol></div></section>
      <section class="section"><div class="section-head"><h2>Данные заявки</h2></div>
        <dl class="panel dl">${Object.entries(r.details).filter(([k, v]) => v !== '' && t?.fields.some((x) => x.name === k)).map(([k, v]) => { const [l, val] = labelOf(k, v); return `<dt>${esc(l)}</dt><dd>${esc(val)}</dd>`; }).join('')}
        <dt>Подана</dt><dd>${fmtDateTime(r.created_at)}</dd></dl></section>
    </div>`;
}

// ---------- Страница: Уведомления ----------
async function pageNotifications({ view, query, isCurrent }) {
  view.innerHTML = `<div class="page-head"><h1>Уведомления</h1></div>${skeleton([80, 80, 80, 80])}`;
  const d = await api('/api/notifications');
  if (!isCurrent()) return;
  const tab = query.get('tab') || 'all';
  const ICON = { important: 'alert', change: 'calendar', deadline: 'clock', news: 'megaphone', request: 'doc' };
  let items = d.notifications;
  if (tab === 'important') items = items.filter((n) => ['important', 'change', 'request'].includes(n.category));
  const unread = d.notifications.filter((n) => !n.read).length;
  state.unread = unread;

  const notesHtml = items.length ? `<ul class="list panel">${items.map((n) => `<li><button class="note-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-link="${esc(n.link || '')}">
    <span class="ic ${n.category}">${icon(ICON[n.category])}</span>
    <span><span class="t" style="display:block">${esc(n.title)}</span><span class="b" style="display:block">${esc(n.body)}</span><span class="w" style="display:block">${ago(n.created_at)}</span></span></button></li>`).join('')}</ul>`
    : `<div class="panel">${empty('Здесь пусто', 'Новых объявлений нет. Мы сообщим, как только деканат что-то опубликует.', 'bell')}</div>`;
  const deadlinesHtml = d.deadlines.length ? `<ul class="list panel">${d.deadlines.map((x) => `<li><a class="note-item" href="#/study">
    <span class="ic ${x.overdue ? 'important' : 'deadline'}">${icon(x.overdue ? 'alert' : 'clock')}</span>
    <span><span class="t" style="display:block">${esc(x.title)}</span><span class="b" style="display:block">${esc(x.subject)}, срок ${fmtDate(x.due_date)}</span>
    <span class="w" style="display:block">${dueText(x)}</span></span></a></li>`).join('')}</ul>`
    : `<div class="panel">${empty('Дедлайнов нет', 'На ближайшие две недели всё сдано.', 'check')}</div>`;

  view.innerHTML = `
    <div class="page-head"><div><h1>Уведомления</h1><p>${unread ? `Непрочитанных: ${unread}` : 'Всё прочитано'}</p></div>
      ${unread ? '<button class="btn small secondary" data-readall>Прочитать все</button>' : ''}</div>
    <div class="segmented" role="group" aria-label="Фильтр" style="margin-bottom:16px">
      <button data-tab="all" aria-pressed="${tab === 'all'}">Все</button>
      <button data-tab="important" aria-pressed="${tab === 'important'}">Важное</button>
      <button data-tab="deadlines" aria-pressed="${tab === 'deadlines'}">Дедлайны${d.deadlines.length ? ` · ${d.deadlines.length}` : ''}</button></div>
    ${tab === 'deadlines' ? deadlinesHtml : notesHtml}`;

  view.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/notifications?tab=${b.dataset.tab}`; }));
  $('[data-readall]', view)?.addEventListener('click', async () => {
    await api('/api/notifications/read', { method: 'POST', body: { all: true } });
    toast('Все уведомления прочитаны'); route();
  });
  view.querySelectorAll('button.note-item[data-id]').forEach((b) => b.addEventListener('click', async () => {
    b.classList.remove('unread');
    api('/api/notifications/read', { method: 'POST', body: { ids: [Number(b.dataset.id)] } }).catch(() => {});
    if (b.dataset.link) location.hash = b.dataset.link;
  }));
}

// ---------- Страница: Помощник ----------
async function pageAssistant({ view, isCurrent }) {
  const { suggestions } = await api('/api/assistant/suggestions');
  if (!isCurrent()) return;
  const renderMsgs = () => state.chat.map((m) => m.role === 'me'
    ? `<div class="msg me">${esc(m.text)}</div>`
    : m.typing ? '<div class="msg bot typing">Ищу ответ…</div>'
    : `<div class="msg bot">${esc(m.text)}${m.action ? `<div><a class="btn small" href="${esc(m.action.href)}">${esc(m.action.label)}</a></div>` : ''}
        <span class="src">${m.source === 'ai' ? 'Ответ сформулировал ИИ по базе знаний деканата' : m.source === 'kb' ? 'Ответ из базы знаний деканата' : ''}</span></div>`).join('');

  view.innerHTML = `
    <div class="page-head"><div><h1>Спроси деканат</h1><p>Помощник отвечает на вопросы о правилах учёбы и сразу ведёт к нужной заявке.</p></div></div>
    <div class="chat" id="chat">
      <div class="msg bot">Здравствуйте, ${esc(state.me.short_name)}! Спросите о пересдаче, справках, стипендии или академическом отпуске.</div>
      <div id="msgs">${renderMsgs()}</div>
      <div class="suggest">${suggestions.map((s) => `<button type="button" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
    </div>
    <form class="composer" autocomplete="off">
      <label class="sr" for="q">Ваш вопрос</label>
      <input id="q" name="q" placeholder="Например: как пересдать экзамен?" maxlength="500" enterkeyhint="send">
      <button class="btn" type="submit" aria-label="Отправить">${icon('send')}</button>
    </form>
    <p class="small muted" style="margin-top:10px">Помощник не видит оценки других студентов и не хранит переписку. Ключ доступа к ИИ хранится только на сервере.</p>`;
  const msgs = $('#msgs', view);
  msgs.style.display = 'flex'; msgs.style.flexDirection = 'column'; msgs.style.gap = '12px';

  const ask = async (q) => {
    q = q.trim(); if (q.length < 3) return;
    state.chat.push({ role: 'me', text: q }, { role: 'bot', typing: true });
    msgs.innerHTML = renderMsgs();
    msgs.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
    try {
      const a = await api('/api/assistant', { method: 'POST', body: { question: q } });
      state.chat[state.chat.length - 1] = { role: 'bot', text: a.answer, action: a.action, source: a.source };
    } catch (e) {
      state.chat[state.chat.length - 1] = { role: 'bot', text: e.message };
    }
    if (!document.body.contains(msgs)) return;
    msgs.innerHTML = renderMsgs();
    msgs.lastElementChild.scrollIntoView({ block: 'end', behavior: 'smooth' });
  };
  view.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
  $('.composer', view).addEventListener('submit', (e) => { e.preventDefault(); const i = $('#q', view); ask(i.value); i.value = ''; });
}

// ---------- Страница: Профиль ----------
async function pageProfile({ view }) {
  const u = state.me;
  const initials = u.full_name.split(' ').slice(0, 2).map((s) => s[0]).reverse().join('');
  const rows = u.role === 'student'
    ? [['Уровень', u.level], ['Курс', `${u.course}`], ['Группа', u.group_name], ['Направление', u.program], ['Профиль', u.profile], ['Факультет', u.faculty], ['Номер зачётки', u.record_book], ['Почта', u.email]]
    : [['Должность', u.position], ['Подразделение', u.faculty], ['Почта', u.email]];
  view.innerHTML = `
    <div class="page-head"><h1>Профиль</h1></div>
    <div class="idcard">${BRIDGE}<div class="avatar">${esc(initials)}</div><h1>${esc(u.full_name)}</h1>
      <p>${u.role === 'student' ? `${esc(u.level)}, ${u.course} курс, группа ${esc(u.group_name)}` : esc(u.position)}</p></div>
    <section class="section"><div class="section-head"><h2>Данные</h2></div>
      <dl class="panel dl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      <p class="small muted" style="margin:8px 4px 0">Нашли ошибку в данных? Подайте заявку «Вопрос в деканат» — сотрудник исправит.</p></section>
    <section class="section"><div class="section-head"><h2>Безопасность</h2></div>
      <div class="notice info">${icon('shield')}<p><b>Ваши данные видите только вы</b>Пароль хранится в зашифрованном виде, вход защищён от подбора, сеанс завершается через 7 дней.</p></div></section>
    <button class="btn secondary block" style="margin-top:20px" data-logout>${icon('logout')}Выйти из кабинета</button>
    <p class="small muted" style="margin-top:20px">Деканат+ — концепт для конкурса «Цифровой деканат будущего». Это не официальный сервис СПбГУ. Все люди, оценки и документы вымышленные.</p>`;
  $('[data-logout]', view).addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    state.me = null; state.chat = []; state.requestTypes = null;
    location.hash = '#/'; renderLogin();
  });
}

// ---------- Кабинет сотрудника ----------
async function pageStaffRequests({ view, query, isCurrent }) {
  view.innerHTML = `<div class="page-head"><h1>Заявки студентов</h1></div>${skeleton([120, 120, 120])}`;
  const [{ requests }, types] = await Promise.all([api('/api/staff/requests'), loadTypes()]);
  if (!isCurrent()) return;
  const filter = query.get('f') || 'open';
  const shown = requests.filter((r) => filter === 'all' || (filter === 'open' ? ['submitted', 'in_progress'].includes(r.status) : r.status === filter));
  const det = (r) => {
    const t = types.find((x) => x.id === r.type);
    return Object.entries(r.details).filter(([k, v]) => v !== '' && t?.fields.some((x) => x.name === k)).map(([k, v]) => {
      const f = t?.fields.find((x) => x.name === k);
      const val = f?.type === 'select' ? (f.options.find(([o]) => o === v) || [, v])[1] : v;
      return `${esc(f?.label || k)}: ${esc(val)}`;
    }).join('<br>');
  };
  const actions = (r) => {
    const a = [];
    if (r.status === 'submitted') a.push(['in_progress', 'Взять в работу', '']);
    if (['submitted', 'in_progress'].includes(r.status)) {
      a.push([t(r)?.group === 'certificate' ? 'ready' : 'done', t(r)?.group === 'certificate' ? 'Справка готова' : 'Выполнено', '']);
      a.push(['rejected', 'Отклонить', 'danger']);
    }
    return a.map(([s, l, c]) => `<button class="btn small ${c || (s === 'in_progress' ? 'secondary' : '')}" data-set="${s}" data-id="${r.id}">${l}</button>`).join('');
  };
  const t = (r) => types.find((x) => x.id === r.type);
  const count = (f) => requests.filter((r) => f === 'open' ? ['submitted', 'in_progress'].includes(r.status) : r.status === f).length;

  view.innerHTML = `
    <div class="page-head"><div><h1>Заявки студентов</h1><p>Новые сверху. Студент сразу получает уведомление о смене статуса.</p></div></div>
    <div class="segmented" role="group" aria-label="Фильтр" style="margin-bottom:16px">
      ${[['open', `В очереди · ${count('open')}`], ['ready', 'Готовы'], ['rejected', 'Отклонены'], ['all', 'Все']].map(([f, l]) => `<button data-f="${f}" aria-pressed="${filter === f}">${l}</button>`).join('')}</div>
    <div class="panel">${shown.length ? shown.map((r) => `<article class="staff-card">
      <div class="top"><div><b>${esc(r.title)}</b><div class="who">${esc(r.student.name)}, группа ${esc(r.student.group)}</div>
        <div class="who">№ ${esc(r.public_id)}, подана ${ago(r.created_at)}</div></div>${statusChip(r)}</div>
      <p class="det">${det(r)}</p>
      ${actions(r) ? `<textarea placeholder="Комментарий для студента (обязателен при отказе)" aria-label="Комментарий" data-comment="${r.id}"></textarea><div class="actions">${actions(r)}</div>` : ''}
    </article>`).join('') : empty('Очередь пуста', 'Новых заявок нет. Они появятся здесь, как только студент отправит форму.', 'inbox')}</div>`;

  view.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { location.hash = `#/?f=${b.dataset.f}`; }));
  view.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.id;
    const comment = $(`[data-comment="${id}"]`, view)?.value || '';
    b.disabled = true;
    try {
      await api(`/api/staff/requests/${id}`, { method: 'PATCH', body: { status: b.dataset.set, comment } });
      toast('Статус обновлён, студент получил уведомление');
      route();
    } catch (e) { toast(e.message); b.disabled = false; }
  }));
}

async function pageStaffAnnounce({ view, isCurrent }) {
  const { groups } = await api('/api/staff/groups');
  if (!isCurrent()) return;
  view.innerHTML = `
    <div class="page-head"><div><h1>Новое объявление</h1><p>Студенты увидят его в уведомлениях, а важное — ещё и на главной.</p></div></div>
    <form class="panel form" novalidate>
      <div class="field"><label for="a-group">Кому</label><select id="a-group" name="group"><option value="">Всем студентам</option>
        ${groups.map((g) => `<option value="${esc(g.g)}">Группа ${esc(g.g)}</option>`).join('')}</select></div>
      <div class="field"><label for="a-cat">Тип</label><select id="a-cat" name="category">
        <option value="news">Новость</option><option value="important">Важное</option><option value="change">Изменение в расписании</option><option value="deadline">Дедлайн</option></select></div>
      <div class="field"><label for="a-title">Заголовок</label><input id="a-title" name="title" maxlength="140" required></div>
      <div class="field"><label for="a-body">Текст</label><textarea id="a-body" name="body" maxlength="1000" required></textarea></div>
      <div class="form-error" role="alert"></div>
      <button class="btn block" type="submit">Опубликовать</button>
    </form>`;
  const form = $('form', view);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(form).entries());
    try {
      await api('/api/staff/announcements', { method: 'POST', body });
      toast('Объявление опубликовано'); form.reset();
    } catch (ex) { $('.form-error', form).innerHTML = `<div class="notice bad">${icon('alert')}<p>${esc(ex.message)}</p></div>`; }
  });
}

// ---------- Вход ----------
function renderLogin() {
  $('#app').innerHTML = `
  <div class="login">
    <aside class="login-art">${BRIDGE}
      <a class="brand" href="#/"><img src="/logo.svg" alt="" width="32" height="32"><span>Деканат+<small>СПбГУ · концепт для конкурса</small></span></a>
      <div><h2>Вся учёба в одном окне</h2><p>Расписание с пересадками между корпусами, баллы и дедлайны, справки без очереди и деканат, который отвечает сразу.</p></div>
      <p class="small">Не официальный сервис СПбГУ. Все данные вымышленные.</p>
    </aside>
    <div class="login-form">
      <a class="brand" href="#/"><img src="/logo.svg" alt="" width="32" height="32"><span>Деканат+<small>СПбГУ · концепт для конкурса</small></span></a>
      <h1>Вход в кабинет</h1><p>Используйте учётную запись студента или сотрудника.</p>
      <form novalidate>
        <div class="field"><label for="login">Логин</label><input id="login" name="login" autocomplete="username" autocapitalize="off" spellcheck="false" required></div>
        <div class="field"><label for="password">Пароль</label><div class="pw"><input id="password" name="password" type="password" autocomplete="current-password" required>
          <button type="button" data-showpw aria-label="Показать пароль">${icon('eye')}</button></div></div>
        <div class="form-error" role="alert"></div>
        <button class="btn block" type="submit">Войти</button>
      </form>
      <div class="demo-accounts"><h2>Демо-доступ для жюри</h2><p>Нажмите, чтобы подставить логин и пароль.</p>
        <div class="acc">
          <button class="btn small secondary" data-demo="anna|Anna2026!">Анна, магистратура</button>
          <button class="btn small secondary" data-demo="maxim|Maxim2026!">Максим, бакалавриат</button>
          <button class="btn small secondary" data-demo="staff|Staff2026!">Сотрудник деканата</button></div></div>
      <p class="disclaimer">Деканат+ — концепт для конкурса «Цифровой деканат будущего». Не официальный сервис СПбГУ, не подключён к системам университета. Все люди и данные вымышленные.</p>
    </div>
  </div>`;
  const form = $('.login-form form');
  $('[data-showpw]').addEventListener('click', (e) => {
    const i = $('#password'); const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; e.currentTarget.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });
  document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
    const [l, p] = b.dataset.demo.split('|'); $('#login').value = l; $('#password').value = p; $('button[type=submit]', form).focus();
  }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('.form-error', form);
    const login = $('#login').value.trim(), password = $('#password').value;
    if (!login || !password) { err.innerHTML = `<div class="notice bad">${icon('alert')}<p>Введите логин и пароль</p></div>`; return; }
    const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = 'Входим…';
    try {
      const { user } = await api('/api/login', { method: 'POST', body: { login, password } });
      state.me = user;
      if (location.hash && location.hash !== '#/') route(); else { location.hash = '#/'; route(); }
    } catch (ex) {
      err.innerHTML = `<div class="notice bad">${icon('alert')}<p>${esc(ex.message)}</p></div>`;
      btn.disabled = false; btn.textContent = 'Войти';
    }
  });
}

// ---------- Запуск ----------
window.addEventListener('hashchange', route);
(async function boot() {
  try {
    const { user } = await api('/api/me');
    state.me = user;
    route();
  } catch (e) {
    if (e.status !== 401) {
      $('#app').innerHTML = `<main class="view" style="padding-top:40px">${errorState(e.message)}</main>`;
    }
  }
})();
