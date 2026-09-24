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

/* ---- LIFE: SCHEDULE ---- */
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

function renderSchedule() {
  if (!state.selectedDay) state.selectedDay = todayISO();
  const sel = state.selectedDay;
  const selDate = new Date(sel + 'T00:00:00');
  if (!state.viewMonth) state.viewMonth = sel.slice(0, 7);
  const [vy, vm] = state.viewMonth.split('-').map(Number);
  const viewYear = vy, viewMonth = vm - 1;
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const cells = buildMonthGrid(viewYear, viewMonth);
  const todayIso = todayISO();
  const eventCount = {};
  Object.keys(state.schedule || {}).forEach(k => { eventCount[k] = (state.schedule[k] || []).length; });
  const list = (state.schedule[sel] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const nowHHMM = fmtClock().slice(0, 5); // "HH:MM", same as event.time — used to flag missed blocks
  const isPastDay = sel < todayIso;

  return `
    ${topbar()}
    <div class="projects-header" style="margin-bottom:18px">
      <h1 class="page-title" style="margin:0">Schedule</h1>
      <button class="add-btn-inline" id="add-sched-btn">+ Add event</button>
    </div>
    <details class="card cat-card" style="animation-delay:0ms" open>
      <summary>
        <div class="section-title" style="margin:0">${monthLabel}<span class="meta">${selDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} selected</span></div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        <div class="cal-head">
          <div></div>
          <div class="cal-nav">
            <button data-cal-nav="-1" aria-label="Previous month">‹</button>
            <button data-cal-today aria-label="Today" style="width:auto; padding:0 12px; font-size:11px; letter-spacing:0.1em; text-transform:uppercase;">Today</button>
            <button data-cal-nav="1" aria-label="Next month">›</button>
          </div>
        </div>
        <div class="cal-dow">${dows.map(d => `<div class="d">${d.charAt(0)}</div>`).join('')}</div>
        <div class="cal-grid">
          ${cells.map(c => {
            const iso = isoLocal(c.d);
            const has = (eventCount[iso] || 0) > 0;
            const isToday = iso === todayIso;
            const isSel = iso === sel;
            return `<button class="cal-cell ${c.other?'other':''} ${isToday?'today':''} ${isSel?'selected':''}" data-pick-day="${iso}">
              <span class="n">${c.d.getDate()}</span>
              <span class="dot" style="${has?'':'visibility:hidden'}"></span>
            </button>`;
          }).join('')}
        </div>
      </div>
    </details>
    <details class="card cat-card" style="animation-delay:100ms" open>
      <summary>
        <div class="section-title" style="margin:0">${selDate.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'})}<span class="meta">${list.length} ${list.length===1?'block':'blocks'}</span></div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        <ul class="list" id="sched-list">
          ${list.map(s => {
            const isDone = !!s.completed_at;
            const isMissed = !isDone && (isPastDay || (sel === todayIso && s.time < nowHHMM));
            return `
            <li class="sched-item" data-id="${s.id}">
              <div class="list-item row-wrap">
                <span class="check ${isDone ? 'checked' : ''}" data-toggle-sched-done="${s.id}" title="${isDone ? 'Mark not done' : 'Mark done'}"></span>
                <div class="time-col">${s.time}</div>
                <div class="item-main">
                  <div class="item-title${isDone ? ' done' : ''}">${escapeHtml(s.title)}${s.alarm_time ? `<span class="alarm-tag">⏰ ${s.alarm_time}</span>` : ''}${s.repeat && s.repeat !== 'none' ? `<span class="alarm-tag" title="${REPEAT_LABEL[s.repeat] || s.repeat}">🔁</span>` : ''}${isMissed ? `<span class="missed-tag">Missed</span>` : ''}</div>
                  ${s.sub ? `<div class="item-sub">${escapeHtml(s.sub)}</div>` : ''}
                </div>
                <div class="sched-acts">
                  <button class="fin-edit-btn" data-edit-sched="${s.id}" title="Edit">${ICON_PENCIL}</button>
                  <button class="fin-del-btn" data-del-sched="${s.id}" title="Delete">${ICON_TRASH}</button>
                </div>
              </div>
            </li>`;
          }).join('') || `<li class="list-item"><div class="item-sub">No events. Tap "+ Add event" above.</div></li>`}
        </ul>
      </div>
    </details>
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


/* ---- SCHEDULE: event binding ---- */

function bindScheduleEvents() {
  // schedule day pick
  main.querySelectorAll('[data-pick-day]').forEach(el => el.addEventListener('click', () => {
    state.selectedDay = el.dataset.pickDay;
    state.viewMonth = el.dataset.pickDay.slice(0,7);
    saveUIPrefs(); render();
  }));


  // calendar month nav
  main.querySelectorAll('[data-cal-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.calNav);
    const [y, m] = (state.viewMonth || todayISO().slice(0,7)).split('-').map(Number);
    state.viewMonth = ymLocal(new Date(y, m - 1 + dir, 1));
    saveUIPrefs(); render();
  }));
  const calToday = main.querySelector('[data-cal-today]');
  if (calToday) calToday.addEventListener('click', () => {
    const t = todayISO();
    state.selectedDay = t;
    state.viewMonth = t.slice(0,7);
    saveUIPrefs(); render();
  });


  // ---- SCHEDULE ----
  // "Done" checkbox — toggles schedule_events.completed_at. Bound once here
  // but picks up the same checkboxes rendered by Home's Today's-schedule
  // card too (bindMainEvents runs every page's bind*Events() on every
  // render regardless of which route is active — see toggleScheduleDone()).
  main.querySelectorAll('[data-toggle-sched-done]').forEach(el => el.addEventListener('click', () => {
    toggleScheduleDone(el.dataset.toggleSchedDone, el);
  }));

  main.querySelectorAll('[data-del-sched]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delSched;
    const day = state.selectedDay;
    const ev = (state.schedule[day] || []).find(s => s.id === id);
    showConfirmModal({
      title: 'Delete Event?',
      message: `Remove "${ev?.title || 'this event'}" from your schedule?`,
      onConfirm: () => {
        state.schedule[day] = (state.schedule[day] || []).filter(s => s.id !== id);
        render();
        dbCall(() => sb.from('schedule_events').delete().eq('id', id));
        // Recurring event: offer to also clear the rest of the series, as a
        // separate opt-in step (keeps the default delete single-occurrence).
        if (ev && ev.series_id) {
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
  }));

  main.querySelectorAll('[data-edit-sched]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editSched;
    const day = state.selectedDay;
    const s = (state.schedule[day] || []).find(ev => ev.id === id);
    if (!s) return;
    showModal({
      title: 'Edit Event',
      fields: [
        { id: 'time',       label: 'Time',       type: 'time',   value: s.time },
        { id: 'title',      label: 'Title',      type: 'text',   value: s.title },
        { id: 'note',       label: 'Note',       type: 'text',   value: s.sub || '', placeholder: 'optional' },
        { id: 'reminder',   label: 'Remind me',  type: 'select', value: reminderValueFromAlarm(s.time, s.alarm_time), options: REMINDER_OPTIONS, controls: 'alarm_time', controlsWhen: 'custom' },
        { id: 'alarm_time', label: 'Custom alarm time', type: 'time', value: s.alarm_time || s.time }
      ],
      saveLabel: 'Save',
      onSave: ({ time, title, note, reminder, alarm_time }) => {
        if (!title.trim()) return;
        const newAlarmTime = computeAlarmTime(reminder, time, alarm_time);
        const arr = state.schedule[day] || [];
        const idx = arr.findIndex(ev => ev.id === id);
        if (idx !== -1) arr[idx] = { ...arr[idx], time, title: title.trim(), sub: note.trim(), alarm_time: newAlarmTime };
        render();
        dbCall(() => sb.from('schedule_events').update({ time, title: title.trim(), note: note.trim(), alarm_time: newAlarmTime }).eq('id', id));
      }
    });
  }));

  const addSched = main.querySelector('#add-sched-btn');
  if (addSched) addSched.addEventListener('click', (e) => {
    e.stopPropagation();
    const day = state.selectedDay || todayISO();
    showModal({
      title: 'Add Event',
      fields: [
        { id: 'time',       label: 'Time',       type: 'time',   value: '09:00' },
        { id: 'title',      label: 'Title',      type: 'text',   value: '', placeholder: 'e.g. Deep work' },
        { id: 'note',       label: 'Note',       type: 'text',   value: '', placeholder: 'optional' },
        { id: 'reminder',   label: 'Remind me',  type: 'select', value: 'off', options: REMINDER_OPTIONS, controls: 'alarm_time', controlsWhen: 'custom' },
        { id: 'alarm_time', label: 'Custom alarm time', type: 'time', value: '09:00' },
        { id: 'repeat',     label: 'Repeat',     type: 'select', value: 'none', options: REPEAT_OPTIONS }
      ],
      saveLabel: 'Add',
      onSave: async ({ time, title, note, reminder, alarm_time, repeat }) => {
        if (!title.trim()) return;
        const alarmTimeVal = computeAlarmTime(reminder, time, alarm_time);
        const dates = expandRecurrenceDates(day, repeat);
        const seriesId = dates.length > 1 ? (crypto.randomUUID ? crypto.randomUUID() : uid()) : null;
        const rows = dates.map(d => ({ user_id: currentUser.id, date: d, time, title: title.trim(), note: note.trim(), alarm_time: alarmTimeVal, repeat, series_id: seriesId }));
        const { data } = await dbCall(() => sb.from('schedule_events').insert(rows).select());
        if (data) {
          data.forEach(row => {
            if (!state.schedule[row.date]) state.schedule[row.date] = [];
            state.schedule[row.date].push({ id: row.id, time: row.time, title: row.title, sub: row.note || '', alarm_time: row.alarm_time || null, completed_at: null, repeat: row.repeat || 'none', series_id: row.series_id || null });
            state.schedule[row.date].sort((a, b) => a.time.localeCompare(b.time));
          });
          render();
        }
      }
    });
  });

}



/* =========================================================
   ALARMS
========================================================= */
function playAlarmBeep() {
  try {
    new Audio('sounds/alarm.mp3').play().catch(() => {});
  } catch (e) {}
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
