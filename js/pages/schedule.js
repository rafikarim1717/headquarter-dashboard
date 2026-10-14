/* =========================================================
   Life — Schedule
   (split from js/app.js — see CLAUDE.md for the page map)
========================================================= */

/* ---- reminder / repeat option lists + small time helpers ---- */
const REMINDER_OPTIONS = [
  { value: 'off',    label: 'No reminder' },
  { value: '0',      label: 'At event time' },
  { value: '5',      label: '5 minutes before' },
  { value: '10',     label: '10 minutes before' },
  { value: '15',     label: '15 minutes before' },
  { value: '30',     label: '30 minutes before' },
  { value: '60',     label: '1 hour before' },
  { value: 'custom', label: 'Custom time…' }
];
const REPEAT_OPTIONS = [
  { value: 'none',     label: "Doesn't repeat" },
  { value: 'daily',    label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays (Mon–Fri)' },
  { value: 'weekly',   label: 'Every week' }
];
const REPEAT_LABEL = { daily: 'Daily', weekdays: 'Weekdays', weekly: 'Weekly' };
const RECUR_DAILY_HORIZON_DAYS = 90;   // how far ahead 'daily'/'weekdays' materialize rows
const RECUR_WEEKLY_OCCURRENCES = 26;   // ~6 months of 'weekly' occurrences

// "HH:MM" minus N minutes, wrapping across midnight.
function offsetMinutes(time, mins) {
  const [hh, mm] = time.split(':').map(Number);
  const total = (((hh * 60 + mm - mins) % 1440) + 1440) % 1440;
  return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}

// Reverse of the above, for pre-filling the "Remind me" dropdown on Edit:
// recognizes a standard offset, otherwise falls back to 'custom'.
function reminderValueFromAlarm(time, alarmTime) {
  if (!alarmTime) return 'off';
  if (alarmTime === time) return '0';
  const [th, tm] = time.split(':').map(Number);
  const [ah, am] = alarmTime.split(':').map(Number);
  const diff = (((th * 60 + tm) - (ah * 60 + am)) % 1440 + 1440) % 1440;
  return [5, 10, 15, 30, 60].includes(diff) ? String(diff) : 'custom';
}

function computeAlarmTime(reminder, time, customAlarmTime) {
  if (reminder === 'off') return null;
  if (reminder === 'custom') return customAlarmTime || time;
  return offsetMinutes(time, Number(reminder));
}

// Expands a start date + repeat rule into the concrete list of ISO dates to
// materialize as real rows (always includes the start date itself, first).
function expandRecurrenceDates(startIso, repeat) {
  const start = new Date(startIso + 'T00:00:00');
  const dates = [startIso];
  if (repeat === 'daily') {
    for (let i = 1; i < RECUR_DAILY_HORIZON_DAYS; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      dates.push(isoLocal(d));
    }
  } else if (repeat === 'weekdays') {
    for (let i = 1; i < RECUR_DAILY_HORIZON_DAYS; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      if (d.getDay() !== 0 && d.getDay() !== 6) dates.push(isoLocal(d));
    }
  } else if (repeat === 'weekly') {
    for (let i = 1; i < RECUR_WEEKLY_OCCURRENCES; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i * 7);
      dates.push(isoLocal(d));
    }
  }
  return dates;
}

/* ---- LIFE: SCHEDULE ----
   Google-Calendar-style page (2026-10-14): Day / Week (default) / Month views.
   Day + Week are a 24h time grid where every event is a block sized from
   `time` to `end_time` (NULL end = 1 hour). Month is a grid with event chips.
   On mobile (<768px) the Week grid is swapped for an agenda list (CSS). */
const SCHED_HOUR_PX = 48;           // height of one hour row in the time grid
const SCHED_DEFAULT_MINUTES = 60;   // block length when end_time is NULL
const SCHED_MONTH_CHIPS = 3;        // chips per Month cell before "+N more"

function schedPad(n) { return String(n).padStart(2, '0'); }
function timeToMin(t) { const [h, m] = String(t || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
function minToTime(n) { n = Math.max(0, Math.min(1439, Math.round(n))); return schedPad(Math.floor(n / 60)) + ':' + schedPad(n % 60); }
function schedEndMin(s) {
  const st = timeToMin(s.time);
  if (s.end_time) { const e = timeToMin(s.end_time); if (e > st) return e; }
  return Math.min(st + SCHED_DEFAULT_MINUTES, 1440);
}
function addDaysIso(iso, n) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoLocal(d); }
function weekStartIso(iso) { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() - d.getDay()); return isoLocal(d); }
function findSchedEvent(id) {
  for (const day in state.schedule) {
    const ev = (state.schedule[day] || []).find(s => s.id === id);
    if (ev) return { ev, day };
  }
  return { ev: null, day: null };
}
// 'done' | 'missed' | '' — same rule as before: a block whose start time has
// passed (or any block on a past day) without completed_at is Missed.
function schedStatus(s, iso) {
  if (s.completed_at) return 'done';
  const todayIso = todayISO();
  if (iso < todayIso) return 'missed';
  if (iso === todayIso && s.time < fmtClock().slice(0, 5)) return 'missed';
  return '';
}
function schedDayList(iso) { return (state.schedule[iso] || []).slice().sort((a, b) => a.time.localeCompare(b.time)); }

// Side-by-side lanes for overlapping events inside one day column.
function layoutDayEvents(list) {
  const evs = list.map(s => ({ s, start: timeToMin(s.time), end: schedEndMin(s) }))
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cluster = [], clusterEnd = -1;
  const flush = () => {
    const lanes = [];
    cluster.forEach(e => {
      let i = lanes.findIndex(end => end <= e.start);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = e.end; e.lane = i;
    });
    cluster.forEach(e => { e.lanes = lanes.length; });
    out.push(...cluster); cluster = [];
  };
  evs.forEach(e => {
    if (cluster.length && e.start >= clusterEnd) { flush(); clusterEnd = -1; }
    cluster.push(e); clusterEnd = Math.max(clusterEnd, e.end);
  });
  if (cluster.length) flush();
  return out;
}

function buildMonthGrid(viewYear, viewMonth) {
  const first = new Date(viewYear, viewMonth, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  const prevDays = new Date(viewYear, viewMonth, 0).getDate();
  for (let i = startWeekday - 1; i >= 0; i--) cells.push({ d: new Date(viewYear, viewMonth - 1, prevDays - i), other: true });
  for (let i = 1; i <= daysInMonth; i++) cells.push({ d: new Date(viewYear, viewMonth, i), other: false });
  let next = 1;
  while (cells.length < 42) cells.push({ d: new Date(viewYear, viewMonth + 1, next++), other: true });
  return cells;
}

function schedBlockHtml(e, iso) {
  const s = e.s;
  const st = schedStatus(s, iso);
  const top = e.start / 60 * SCHED_HOUR_PX;
  const h = Math.max((e.end - e.start) / 60 * SCHED_HOUR_PX, 20);
  const left = `calc(${(e.lane / e.lanes) * 100}% + 2px)`;
  const width = `calc(${100 / e.lanes}% - 4px)`;
  const short = h < 38;
  const range = `${s.time}–${minToTime(e.end)}`;
  return `<button class="sched-block ${st}${short ? ' short' : ''}" data-sched-open="${s.id}" title="${escapeHtml(s.title)} · ${range}" style="top:${top}px;height:${h - 2}px;left:${left};width:${width}">
    <span class="sb-title">${escapeHtml(s.title)}${short ? `<span class="sb-time-inline"> ${s.time}</span>` : ''}</span>
    ${short ? '' : `<span class="sb-time">${range}${st === 'missed' ? ' · <span class="sb-missed">Missed</span>' : ''}${s.repeat && s.repeat !== 'none' ? ' · 🔁' : ''}</span>`}
  </button>`;
}

function schedTimeGridHtml(days, todayIso) {
  const cols = `52px repeat(${days.length}, minmax(0, 1fr))`;
  const nowMin = timeToMin(fmtClock().slice(0, 5));
  const head = `<div class="sg-head" style="grid-template-columns:${cols}"><div></div>${days.map(iso => {
    const d = new Date(iso + 'T00:00:00');
    return `<button class="sg-dayhead${iso === todayIso ? ' today' : ''}" data-sched-goto-day="${iso}" title="Open day">
      <span class="sg-dow">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="sg-dnum">${d.getDate()}</span></button>`;
  }).join('')}</div>`;
  const hours = Array.from({ length: 24 }, (_, h) => `<div class="sg-hour" style="top:${h * SCHED_HOUR_PX}px">${h ? schedPad(h) + ':00' : ''}</div>`).join('');
  // initial scroll: a bit before the earliest event in view / now, never later than 07:00
  let first = 7 * 60;
  days.forEach(iso => (state.schedule[iso] || []).forEach(s => { first = Math.min(first, timeToMin(s.time)); }));
  if (days.includes(todayIso)) first = Math.min(first, Math.max(nowMin - 120, 0));
  const body = days.map(iso => {
    const blocks = layoutDayEvents(state.schedule[iso] || []).map(e => schedBlockHtml(e, iso)).join('');
    const nowLine = iso === todayIso ? `<div class="sg-now" data-sched-now style="top:${nowMin / 60 * SCHED_HOUR_PX}px"></div>` : '';
    return `<div class="sg-col${iso === todayIso ? ' today' : ''}" data-sched-col="${iso}">${blocks}${nowLine}</div>`;
  }).join('');
  return `<div class="sg-wrap">${head}
    <div class="sg-scroll" data-sched-scroll="${Math.max(first - 30, 0) / 60 * SCHED_HOUR_PX}">
      <div class="sg-body" style="grid-template-columns:${cols};height:${24 * SCHED_HOUR_PX}px;--sg-px:${SCHED_HOUR_PX}px">
        <div class="sg-hours">${hours}</div>${body}
      </div>
    </div></div>`;
}

function schedAgendaHtml(days, todayIso) {
  return `<div class="sched-agenda">${days.map(iso => {
    const d = new Date(iso + 'T00:00:00');
    const list = schedDayList(iso);
    return `<div class="sa-day${iso === todayIso ? ' today' : ''}">
      <button class="sa-date" data-sched-goto-day="${iso}"><span class="sg-dow">${d.toLocaleDateString('en-US', { weekday: 'short' })}</span><span class="sg-dnum">${d.getDate()}</span></button>
      <div class="sa-list">${list.map(s => {
        const st = schedStatus(s, iso);
        return `<div class="sa-item ${st}">
          <span class="check ${s.completed_at ? 'checked' : ''}" data-toggle-sched-done="${s.id}" title="${s.completed_at ? 'Mark not done' : 'Mark done'}"></span>
          <button class="sa-main" data-sched-open="${s.id}"><span class="sa-time">${s.time}–${minToTime(schedEndMin(s))}</span><span class="sa-title">${escapeHtml(s.title)}</span>${st === 'missed' ? '<span class="missed-tag">Missed</span>' : ''}</button>
        </div>`;
      }).join('') || `<div class="sa-empty" data-sched-slot-day="${iso}">No events</div>`}</div>
    </div>`;
  }).join('')}</div>`;
}

function schedMonthHtml(anchorIso, todayIso) {
  const [y, m] = anchorIso.split('-').map(Number);
  let cells = buildMonthGrid(y, m - 1);
  if (cells.slice(35).every(c => c.other)) cells = cells.slice(0, 35);
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return `<div class="sm-grid">
    ${dows.map(d => `<div class="sm-dow">${d}</div>`).join('')}
    ${cells.map(c => {
      const iso = isoLocal(c.d);
      const list = schedDayList(iso);
      const chips = list.slice(0, SCHED_MONTH_CHIPS).map(s => {
        const st = schedStatus(s, iso);
        return `<button class="sm-chip ${st}" data-sched-open="${s.id}" title="${s.time} ${escapeHtml(s.title)}"><span class="sm-chip-time">${s.time}</span> ${escapeHtml(s.title)}</button>`;
      }).join('');
      const more = list.length - SCHED_MONTH_CHIPS;
      return `<div class="sm-cell${c.other ? ' other' : ''}${iso === todayIso ? ' today' : ''}" data-sched-slot-day="${iso}">
        <button class="sm-num" data-sched-goto-day="${iso}">${c.d.getDate()}</button>
        ${chips}${more > 0 ? `<button class="sm-more" data-sched-goto-day="${iso}">+${more} more</button>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

function schedRangeLabel(view, sel) {
  const d = new Date(sel + 'T00:00:00');
  if (view === 'day') return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (view === 'month') return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const a = new Date(weekStartIso(sel) + 'T00:00:00');
  const b = new Date(addDaysIso(weekStartIso(sel), 6) + 'T00:00:00');
  const sameMonth = a.getMonth() === b.getMonth();
  const aTxt = a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const bTxt = sameMonth ? b.getDate() : b.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${aTxt} – ${bTxt}, ${b.getFullYear()}`;
}

function renderSchedule() {
  if (!state.selectedDay) state.selectedDay = todayISO();
  if (!['day', 'week', 'month'].includes(state.scheduleView)) state.scheduleView = 'week';
  const sel = state.selectedDay;
  const view = state.scheduleView;
  const todayIso = todayISO();
  let bodyHtml;
  if (view === 'month') {
    bodyHtml = schedMonthHtml(sel, todayIso);
  } else if (view === 'day') {
    bodyHtml = schedTimeGridHtml([sel], todayIso);
  } else {
    const ws = weekStartIso(sel);
    const days = Array.from({ length: 7 }, (_, i) => addDaysIso(ws, i));
    bodyHtml = schedTimeGridHtml(days, todayIso) + schedAgendaHtml(days, todayIso);
  }
  return `
    ${topbar()}
    <div class="projects-header" style="margin-bottom:18px">
      <h1 class="page-title" style="margin:0">Schedule</h1>
      <button class="add-btn-inline" id="add-sched-btn">+ Add event</button>
    </div>
    <div class="card sched-card sched-view-${view}">
      <div class="sched-toolbar">
        <div class="sched-range">${schedRangeLabel(view, sel)}</div>
        <div class="cal-nav">
          <button data-sched-nav="-1" aria-label="Previous">‹</button>
          <button data-sched-today class="sched-today-btn">Today</button>
          <button data-sched-nav="1" aria-label="Next">›</button>
        </div>
        <div class="sched-views">
          ${['day', 'week', 'month'].map(v => `<button class="sched-view-btn${v === view ? ' active' : ''}" data-sched-view="${v}">${v.charAt(0).toUpperCase() + v.slice(1)}</button>`).join('')}
        </div>
      </div>
      ${bodyHtml}
    </div>
  `;
}


/* ---- SCHEDULE: mark a block done/not-done ----
   Shared by both the Schedule page's list and Home's Today's-schedule
   card (both render the same [data-toggle-sched-done] checkbox). Looks
   the event up by id across every date in state.schedule rather than
   requiring the caller to know which day it's on. Feeds Home's Activity
   heatmap/feed via completed_at, same as project_tasks/goal_logs. */
function toggleScheduleDone(id, el) {
  let ev = null;
  for (const day in state.schedule) {
    ev = (state.schedule[day] || []).find(s => s.id === id);
    if (ev) break;
  }
  if (!ev) return;
  ev.completed_at = ev.completed_at ? null : new Date().toISOString();
  if (el) pulse(el);
  render();
  dbCall(() => sb.from('schedule_events').update({ completed_at: ev.completed_at }).eq('id', id));
}


/* ---- SCHEDULE: modals (detail / add / edit / delete) ---- */

// Click on a block / chip → small detail card (Google Calendar style) with
// Mark done · Edit · Delete. Own overlay, reuses the shared .hq-modal-* CSS.
function showSchedEventModal(id) {
  const { ev: s, day } = findSchedEvent(id);
  if (!s) return;
  let overlay = document.getElementById('sched-event-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'sched-event-overlay';
    overlay.className = 'hq-modal-overlay';
    document.body.appendChild(overlay);
  }
  const st = schedStatus(s, day);
  const dateLabel = new Date(day + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  overlay.innerHTML = `
    <div class="hq-modal-card sched-detail-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(s.title)}">
      <div class="hq-modal-header">
        <div class="hq-modal-title${s.completed_at ? ' sched-detail-done' : ''}">${escapeHtml(s.title)}</div>
        <button class="hq-modal-close" data-sd-close aria-label="Close">&#x2715;</button>
      </div>
      <div class="hq-modal-body sched-detail-body">
        <div>${dateLabel} · ${s.time}–${minToTime(schedEndMin(s))}${s.end_time ? '' : ' <span class="item-sub">(no end time — shown as 1h)</span>'}</div>
        ${s.sub ? `<div class="item-sub">${escapeHtml(s.sub)}</div>` : ''}
        <div class="sched-detail-tags">
          ${s.alarm_time ? `<span class="alarm-tag">⏰ ${s.alarm_time}</span>` : ''}
          ${s.repeat && s.repeat !== 'none' ? `<span class="alarm-tag">🔁 ${REPEAT_LABEL[s.repeat] || s.repeat}</span>` : ''}
          ${st === 'missed' ? '<span class="missed-tag">Missed</span>' : ''}
          ${st === 'done' ? '<span class="alarm-tag">✓ Done</span>' : ''}
        </div>
      </div>
      <div class="hq-modal-footer">
        <button class="btn" data-sd-delete style="margin-right:auto">Delete</button>
        <button class="btn" data-sd-edit>Edit</button>
        <button class="btn primary" data-sd-done>${s.completed_at ? 'Mark not done' : 'Mark done'}</button>
      </div>
    </div>`;
  function close() { overlay.classList.remove('open'); document.removeEventListener('keydown', escHandler); }
  function escHandler(e) { if (e.key === 'Escape') close(); }
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('[data-sd-close]').onclick = close;
  overlay.querySelector('[data-sd-done]').onclick = () => { close(); toggleScheduleDone(id); };
  overlay.querySelector('[data-sd-edit]').onclick = () => { close(); openEditSchedModal(id); };
  overlay.querySelector('[data-sd-delete]').onclick = () => { close(); deleteSchedEvent(id); };
  document.addEventListener('keydown', escHandler);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

function deleteSchedEvent(id) {
  const { ev, day } = findSchedEvent(id);
  if (!ev) return;
  showConfirmModal({
    title: 'Delete Event?',
    message: `Remove "${ev.title}" from your schedule?`,
    onConfirm: () => {
      state.schedule[day] = (state.schedule[day] || []).filter(s => s.id !== id);
      render();
      dbCall(() => sb.from('schedule_events').delete().eq('id', id));
      // Recurring event: offer to also clear the rest of the series, as a
      // separate opt-in step (keeps the default delete single-occurrence).
      if (ev.series_id) {
        setTimeout(() => {
          showConfirmModal({
            title: 'Delete the rest of this series?',
            message: `"${ev.title}" repeats. Also remove every upcoming occurrence in this series?`,
            confirmLabel: 'Delete series',
            onConfirm: () => {
              const today = todayISO();
              Object.keys(state.schedule).forEach(d => {
                state.schedule[d] = (state.schedule[d] || []).filter(s => !(s.series_id === ev.series_id && d >= today));
              });
              render();
              dbCall(() => sb.from('schedule_events').delete().eq('series_id', ev.series_id).gte('date', today));
            }
          });
        }, 250);
      }
    }
  });
}

// end_time is only stored when it is after the start; otherwise NULL (= 1h block)
function cleanEndTime(time, endTime) { return endTime && timeToMin(endTime) > timeToMin(time) ? endTime : null; }

function openEditSchedModal(id) {
  const { ev: s, day } = findSchedEvent(id);
  if (!s) return;
  showModal({
    title: 'Edit Event',
    fields: [
      { id: 'date',       label: 'Date',       type: 'date',   value: day },
      { id: 'time',       label: 'Start',      type: 'time',   value: s.time },
      { id: 'end_time',   label: 'End',        type: 'time',   value: s.end_time || minToTime(schedEndMin(s)) },
      { id: 'title',      label: 'Title',      type: 'text',   value: s.title },
      { id: 'note',       label: 'Note',       type: 'text',   value: s.sub || '', placeholder: 'optional' },
      { id: 'reminder',   label: 'Remind me',  type: 'select', value: reminderValueFromAlarm(s.time, s.alarm_time), options: REMINDER_OPTIONS, controls: 'alarm_time', controlsWhen: 'custom' },
      { id: 'alarm_time', label: 'Custom alarm time', type: 'time', value: s.alarm_time || s.time }
    ],
    saveLabel: 'Save',
    onSave: ({ date, time, end_time, title, note, reminder, alarm_time }) => {
      if (!title.trim()) return;
      const newDate = date || day;
      const newAlarmTime = computeAlarmTime(reminder, time, alarm_time);
      const endVal = cleanEndTime(time, end_time);
      const updated = { ...s, time, end_time: endVal, title: title.trim(), sub: note.trim(), alarm_time: newAlarmTime };
      state.schedule[day] = (state.schedule[day] || []).filter(ev => ev.id !== id);
      if (!state.schedule[newDate]) state.schedule[newDate] = [];
      state.schedule[newDate].push(updated);
      state.schedule[newDate].sort((a, b) => a.time.localeCompare(b.time));
      render();
      dbCall(() => sb.from('schedule_events').update({ date: newDate, time, end_time: endVal, title: title.trim(), note: note.trim(), alarm_time: newAlarmTime }).eq('id', id));
    }
  });
}

function openAddSchedModal(day, startTime) {
  const start = startTime || '09:00';
  showModal({
    title: 'Add Event',
    fields: [
      { id: 'date',       label: 'Date',       type: 'date',   value: day || state.selectedDay || todayISO() },
      { id: 'time',       label: 'Start',      type: 'time',   value: start },
      { id: 'end_time',   label: 'End',        type: 'time',   value: minToTime(Math.min(timeToMin(start) + SCHED_DEFAULT_MINUTES, 1439)) },
      { id: 'title',      label: 'Title',      type: 'text',   value: '', placeholder: 'e.g. Deep work' },
      { id: 'note',       label: 'Note',       type: 'text',   value: '', placeholder: 'optional' },
      { id: 'reminder',   label: 'Remind me',  type: 'select', value: 'off', options: REMINDER_OPTIONS, controls: 'alarm_time', controlsWhen: 'custom' },
      { id: 'alarm_time', label: 'Custom alarm time', type: 'time', value: start },
      { id: 'repeat',     label: 'Repeat',     type: 'select', value: 'none', options: REPEAT_OPTIONS }
    ],
    saveLabel: 'Add',
    onSave: async ({ date, time, end_time, title, note, reminder, alarm_time, repeat }) => {
      if (!title.trim()) return;
      const startDay = date || day || todayISO();
      const alarmTimeVal = computeAlarmTime(reminder, time, alarm_time);
      const endVal = cleanEndTime(time, end_time);
      const dates = expandRecurrenceDates(startDay, repeat);
      const seriesId = dates.length > 1 ? (crypto.randomUUID ? crypto.randomUUID() : uid()) : null;
      const rows = dates.map(d => ({ user_id: currentUser.id, date: d, time, end_time: endVal, title: title.trim(), note: note.trim(), alarm_time: alarmTimeVal, repeat, series_id: seriesId }));
      const { data } = await dbCall(() => sb.from('schedule_events').insert(rows).select());
      if (data) {
        data.forEach(row => {
          if (!state.schedule[row.date]) state.schedule[row.date] = [];
          state.schedule[row.date].push({ id: row.id, time: row.time, end_time: row.end_time || null, title: row.title, sub: row.note || '', alarm_time: row.alarm_time || null, completed_at: null, repeat: row.repeat || 'none', series_id: row.series_id || null });
          state.schedule[row.date].sort((a, b) => a.time.localeCompare(b.time));
        });
        render();
      }
    }
  });
}


/* ---- SCHEDULE: event binding ---- */
let schedNowTimer = null;

function bindScheduleEvents() {
  // "Done" checkbox — toggles schedule_events.completed_at. Bound here regardless
  // of route: Home's Today's-schedule card renders the same control.
  main.querySelectorAll('[data-toggle-sched-done]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleScheduleDone(el.dataset.toggleSchedDone, el);
  }));

  if (schedNowTimer) { clearInterval(schedNowTimer); schedNowTimer = null; }
  const card = main.querySelector('.sched-card');
  if (!card) return;

  // view toggle / nav / today
  card.querySelectorAll('[data-sched-view]').forEach(el => el.addEventListener('click', () => {
    state.scheduleView = el.dataset.schedView;
    saveUIPrefs(); render();
  }));
  card.querySelectorAll('[data-sched-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.schedNav);
    const view = state.scheduleView || 'week';
    let next;
    if (view === 'day') next = addDaysIso(state.selectedDay, dir);
    else if (view === 'week') next = addDaysIso(state.selectedDay, dir * 7);
    else {
      const [y, m] = state.selectedDay.split('-').map(Number);
      next = isoLocal(new Date(y, m - 1 + dir, 1));
    }
    state.selectedDay = next;
    state.viewMonth = next.slice(0, 7);
    saveUIPrefs(); render();
  }));
  const todayBtn = card.querySelector('[data-sched-today]');
  if (todayBtn) todayBtn.addEventListener('click', () => {
    state.selectedDay = todayISO();
    state.viewMonth = state.selectedDay.slice(0, 7);
    saveUIPrefs(); render();
  });

  // day header / month date number / "+N more" → Day view of that date
  card.querySelectorAll('[data-sched-goto-day]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    state.selectedDay = el.dataset.schedGotoDay;
    state.viewMonth = state.selectedDay.slice(0, 7);
    state.scheduleView = 'day';
    saveUIPrefs(); render();
  }));

  // block / chip / agenda row → detail card
  card.querySelectorAll('[data-sched-open]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    showSchedEventModal(el.dataset.schedOpen);
  }));

  // empty time-grid slot → Add at that time (rounded down to :00 / :30)
  card.querySelectorAll('[data-sched-col]').forEach(col => col.addEventListener('click', (e) => {
    if (e.target !== col) return;
    const mins = Math.floor((e.offsetY / SCHED_HOUR_PX) * 60 / 30) * 30;
    openAddSchedModal(col.dataset.schedCol, minToTime(Math.min(mins, 1410)));
  }));
  // empty Month cell / empty agenda day → Add on that day
  card.querySelectorAll('[data-sched-slot-day]').forEach(cell => cell.addEventListener('click', (e) => {
    if (e.target !== cell) return;
    openAddSchedModal(cell.dataset.schedSlotDay);
  }));

  // initial scroll of the time grid + live "now" line
  const scroller = card.querySelector('[data-sched-scroll]');
  if (scroller) scroller.scrollTop = Number(scroller.dataset.schedScroll) || 0;
  if (card.querySelector('[data-sched-now]')) {
    schedNowTimer = setInterval(() => {
      const line = document.querySelector('[data-sched-now]');
      if (!line) { clearInterval(schedNowTimer); schedNowTimer = null; return; }
      line.style.top = (timeToMin(fmtClock().slice(0, 5)) / 60 * SCHED_HOUR_PX) + 'px';
    }, 60000);
  }

  const addSched = main.querySelector('#add-sched-btn');
  if (addSched) addSched.addEventListener('click', (e) => {
    e.stopPropagation();
    openAddSchedModal(state.selectedDay || todayISO());
  });
}



/* =========================================================
   ALARMS
========================================================= */
// The one alarm sound currently playing — kept so Dismiss/Snooze can cut it off
// mid-clip, and so a repeat beep restarts it instead of stacking a second copy.
let alarmAudio = null;

function playAlarmBeep() {
  try {
    stopAlarmSound();
    alarmAudio = new Audio('sounds/alarm.mp3');
    alarmAudio.play().catch(() => {});
  } catch (e) {}
}

function stopAlarmSound() {
  if (!alarmAudio) return;
  try { alarmAudio.pause(); alarmAudio.currentTime = 0; } catch (e) {}
  alarmAudio = null;
}

// Persistent in-app banner shown while an alarm is active — stays up (with a
// repeating beep) until the user Dismisses or Snoozes it, instead of firing
// once and going silent. Foreground-only, same as the rest of this alarm
// system; a lock-screen-capable version needs Web Push (separate project).
let alarmBannerEl = null;
let alarmBeepInterval = null;

function ensureAlarmBanner() {
  if (alarmBannerEl) return alarmBannerEl;
  const el = document.createElement('div');
  el.id = 'alarm-banner';
  el.className = 'alarm-banner';
  document.body.appendChild(el);
  alarmBannerEl = el;
  return el;
}

function dismissAlarmBanner() {
  if (alarmBeepInterval) { clearInterval(alarmBeepInterval); alarmBeepInterval = null; }
  stopAlarmSound();
  if (alarmBannerEl) alarmBannerEl.classList.remove('show');
}

function showAlarmBanner(ev, sub) {
  const el = ensureAlarmBanner();
  const subText = sub || `Scheduled for ${ev.time}`;
  el.innerHTML = `
    <span class="alarm-banner-icon">⏰</span>
    <div class="alarm-banner-body">
      <div class="alarm-banner-title">${escapeHtml(ev.title)}</div>
      <div class="alarm-banner-sub">${escapeHtml(subText)}</div>
    </div>
    <button class="alarm-banner-snooze" data-alarm-snooze>Snooze 5 min</button>
    <button class="alarm-banner-dismiss" data-alarm-dismiss aria-label="Dismiss">&#x2715;</button>
  `;
  el.classList.add('show');
  el.querySelector('[data-alarm-dismiss]').onclick = dismissAlarmBanner;
  el.querySelector('[data-alarm-snooze]').onclick = () => {
    dismissAlarmBanner();
    setTimeout(() => fireAlarm(ev, sub), 5 * 60000);
  };
  if (alarmBeepInterval) clearInterval(alarmBeepInterval);
  alarmBeepInterval = setInterval(playAlarmBeep, 20000);
}

// sub: optional subtitle override, used by checkGoalReminders() (commitments.js)
// to reuse this same banner/notification/beep system for daily commitment cues
// instead of one-off schedule alarms.
function fireAlarm(ev, sub) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('HQ — ' + ev.title, {
      body: sub || 'Scheduled for ' + ev.time,
      icon: '/icon-192.png'
    });
  }
  playAlarmBeep();
  showAlarmBanner(ev, sub);
}

function checkAlarms() {
  const events = state.schedule[todayISO()] || [];
  if (events.length) {
    const now = new Date();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    events.forEach(ev => {
      if (!ev.alarm_time) return;
      if (firedAlarms.has(ev.id)) return;
      const [hh, mm] = ev.alarm_time.split(':').map(Number);
      const alarmMinutes = hh * 60 + mm;
      if (Math.abs(nowMinutes - alarmMinutes) <= 1) {
        firedAlarms.add(ev.id);
        fireAlarm(ev);
      }
    });
  }
  checkGoalReminders(); // js/pages/commitments.js — shares this same 60s tick + firedAlarms Set
}
