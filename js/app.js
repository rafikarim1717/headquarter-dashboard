/* =========================================================
   TOAST
========================================================= */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}

/* =========================================================
   UTILS
========================================================= */
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const ymLocal  = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const todayISO = () => isoLocal(new Date());
const fmtDate  = (d) => {
  const date = (typeof d === 'string') ? new Date(d + 'T00:00:00') : new Date(d);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const fmtMoney = (n) => {
  const prefix = window.__HQ_TWEAKS.currencyPrefix ?? '';
  return prefix + Math.round(Number(n) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};
const uid = () => Math.random().toString(36).slice(2, 9);
function fmtClock() {
  const n = new Date();
  return `${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}`;
}
function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* =========================================================
   IN-MEMORY STATE  (populated from Supabase on login)
========================================================= */
let currentUser = null;
const firedAlarms = new Set(); // event IDs that have already fired today
let alarmInterval = null;
let clockIntervalId = null;
let notesTimestampIntervalId = null;

let state = {
  profile: { name: 'Friend' },
  schedule: {},   // { [iso-date]: [{id, time, title, sub}] }
  goals: { dos: [], donts: [] },
  goalLogs: [],   // [{id, goal_id, user_id, date, checked}]
  projects: [],       // [{id, name, status, deadline, tasks:[{id,text,description,checked}]}]
  projectsFilter: 'all',
  expandedProjectIds: [],
  notes: [],      // [{id, title, content, created_at, updated_at}]
  income: [],
  spending: [],
  debts: [],
  selectedDay: todayISO(),
  activeTab: 'life:home',
  viewMonth: todayISO().slice(0, 7),
  activeNoteId: null,
  notesSort: 'newest',
  notesFilter: 'all',
  notesDisplay: 'grid',
  commitPreviewTab: 'weekly'
};

/* =========================================================
   SAMPLE DATA (inserted on first login)
========================================================= */
function defaultState() {
  const today = todayISO();
  const dayKey = (offset) => {
    const d = new Date(); d.setDate(d.getDate() + offset); return isoLocal(d);
  };
  return {
    schedule: {
      [today]: [
        { time: '07:30', title: 'Morning run', sub: 'Park loop, easy pace' },
        { time: '09:00', title: 'Deep work — HQ planning', sub: 'No meetings block' },
        { time: '12:30', title: 'Lunch w/ Maya', sub: 'Cafe Vora' },
        { time: '15:00', title: 'Design review', sub: 'Quarterly portfolio' },
        { time: '19:00', title: 'Reading — 30 pages', sub: 'Continue Annie Dillard' }
      ],
      [dayKey(1)]: [
        { time: '08:00', title: 'Strength session', sub: 'Push day' },
        { time: '10:00', title: '1:1 with Sam', sub: '' },
        { time: '14:00', title: 'Tax docs review', sub: 'Q1 prep' }
      ],
      [dayKey(-1)]: [
        { time: '09:30', title: 'Yoga', sub: '' },
        { time: '13:00', title: 'Client call', sub: 'Westwind' }
      ]
    },
    goals: {
      dos: [
        { text: 'Read 20 pages every day', done: true },
        { text: 'Walk 8,000+ steps', done: true },
        { text: 'Write a journal entry', done: false },
        { text: 'Call mom twice a week', done: false },
        { text: 'Sleep before 11:30pm', done: true }
      ],
      donts: [
        { text: 'No phone in the first hour', done: true },
        { text: 'No takeout on weekdays', done: true },
        { text: 'No alcohol Mon–Thu', done: false },
        { text: 'No infinite scroll after 9pm', done: false }
      ]
    },
    projects: [
      {
        name: 'Client Website',
        status: 'active',
        deadline: dayKey(14),
        tasks: [
          { text: 'Wireframes approved', description: '', checked: true },
          { text: 'Build homepage section', description: 'Hero + nav + footer', checked: false },
          { text: 'Mobile responsiveness pass', description: '', checked: false }
        ]
      },
      {
        name: 'Personal Development',
        status: 'active',
        deadline: null,
        tasks: [
          { text: 'Finish online course', description: 'Chapter 4–8 remaining', checked: false },
          { text: 'Weekly review habit', description: '', checked: false }
        ]
      },
      {
        name: 'Side Business',
        status: 'on_hold',
        deadline: null,
        tasks: [
          { text: 'Business model canvas', description: '', checked: false },
          { text: 'Market research', description: '', checked: false }
        ]
      }
    ],
    income: [
      { date: today,        source: 'Studio retainer — Westwind',  amount: 18500000 },
      { date: dayKey(-6),   source: 'Consulting — Marlow & Co',    amount: 7200000 },
      { date: dayKey(-12),  source: 'Print sale — gallery',        amount: 1450000 }
    ],
    spending: [
      { date: today,       time: '08:14', cat: 'Food',      note: 'Kopi + roti',             amount: 35000 },
      { date: today,       time: '12:42', cat: 'Food',      note: 'Makan siang — Cafe Vora',  amount: 95000 },
      { date: today,       time: '15:30', cat: 'Transport', note: 'Gojek',                   amount: 42000 },
      { date: dayKey(-1),  time: '19:10', cat: 'Shopping',  note: 'Buku + pulpen',           amount: 145000 },
      { date: dayKey(-2),  time: '13:00', cat: 'Food',      note: 'Belanja groceries',       amount: 380000 },
      { date: dayKey(-4),  time: '20:30', cat: 'Other',     note: 'Bioskop',                 amount: 75000 },
      { date: dayKey(-6),  time: '11:00', cat: 'Transport', note: 'Taksi bandara',           amount: 185000 }
    ],
    debts: [
      { creditor: 'Kartu Kredit BCA',  amount: 5400000, due: dayKey(5),   paid: false },
      { creditor: 'Pinjaman Ayah',     amount: 2500000, due: dayKey(20),  paid: false },
      { creditor: 'Tagihan Telkomsel', amount: 425000,  due: dayKey(-3),  paid: true }
    ]
  };
}

/* =========================================================
   UI PREFS (localStorage — navigation state only)
========================================================= */
const PREFS_KEY = 'hq.prefs';
function saveUIPrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({
    activeTab: state.activeTab,
    selectedDay: state.selectedDay,
    viewMonth: state.viewMonth
  }));
}
function restoreUIPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (p.activeTab) state.activeTab = p.activeTab;
    if (p.selectedDay) state.selectedDay = p.selectedDay;
    if (p.viewMonth) state.viewMonth = p.viewMonth;
  } catch (e) {}
}

/* =========================================================
   APPLY TWEAKS
========================================================= */
function applyTweaks() {
  const tw = window.__HQ_TWEAKS;
  document.documentElement.style.setProperty('--accent', tw.accent);
  document.body.dataset.density = tw.density;
  document.documentElement.style.setProperty('--num-weight', tw.numberWeight);
  if (tw.name && state.profile) state.profile.name = tw.name;
}
applyTweaks();

/* =========================================================
   ROUTER / RENDER
========================================================= */
const main = document.getElementById('main');

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
function todayLabel() {
  return new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function topbar() {
  const name = state.profile.name || 'Friend';
  const section = (state.activeTab || 'life:home').split(':')[0];
  const lifePills = [
    { tab: 'life:home', label: 'Today' },
    { tab: 'life:schedule', label: 'Schedule' },
    { tab: 'life:commitments', label: 'Commitments' },
    { tab: 'life:projects', label: 'Projects' },
    { tab: 'life:notes', label: 'Notes' }
  ];
  const financePills = [
    { tab: 'finance:overview', label: 'Overview' },
    { tab: 'finance:income', label: 'Income' },
    { tab: 'finance:spending', label: 'Spending' },
    { tab: 'finance:debts', label: 'Debts' }
  ];
  const pills = section === 'finance' ? financePills : lifePills;
  const pillsHtml = pills.map(p =>
    `<button class="mobile-pill${state.activeTab === p.tab ? ' active' : ''}" data-go="${p.tab}">${p.label}</button>`
  ).join('');
  const signOutSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9"/></svg>`;
  return `
    <header class="topbar">
      <div class="greet">
        <div class="hello">${greeting()}, <span style="color:var(--text)">${escapeHtml(name)}</span></div>
        <div class="date">${todayLabel()} &bull; <span id="live-clock">${fmtClock()}</span></div>
      </div>
      <div class="right">
        <button class="mobile-signout-btn" id="topbar-logout-btn" aria-label="Sign out">${signOutSvg}</button>
        <button class="icon-btn" id="open-tweaks" title="Tweaks" aria-label="Tweaks">&#x2699;&#xFE0E;</button>
      </div>
    </header>
    <div class="mobile-sub-nav">${pillsHtml}</div>`;
}

/* ---- LIFE: HOME ---- */
function renderLifeHome() {
  const today = todayISO();
  const sched = (state.schedule[today] || []).slice(0, 5);
  const layout = window.__HQ_TWEAKS.homeLayout;
  const showPills = String(window.__HQ_TWEAKS.showQuickPills) === 'true' || window.__HQ_TWEAKS.showQuickPills === true;

  const score = computeDailyScore();
  const scoreBlock = `
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">Daily score</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
        <div style="font-size:48px;font-weight:var(--num-weight,200);color:var(--accent);font-variant-numeric:tabular-nums;line-height:1">${score}</div>
        <div style="font-size:16px;color:var(--text-faint)">/100</div>
      </div>
    </div>`;

  const allGoals = [...(state.goals.dos || []), ...(state.goals.donts || [])];
  const totalGoals = allGoals.length;
  const checkedTodayCount = allGoals.filter(g => getTodayLog(g.id)?.checked).length;
  const commitmentsBlock = (delay) => `
    <div class="card" style="animation-delay:${delay}ms">
      <div class="section-title" style="margin-top:0">Commitments <span class="meta" data-go="life:commitments" style="cursor:pointer">View all →</span></div>
      <ul class="list" style="padding:0">
        ${allGoals.length === 0
          ? `<li class="list-item"><div class="item-sub">No commitments yet.</div></li>`
          : allGoals.map(g => {
              const isChecked = getTodayLog(g.id)?.checked || false;
              const isDo = (state.goals.dos || []).some(d => d.id === g.id);
              return `<li class="list-item" style="padding:8px 0;gap:10px">
                <span class="commit-type-pill ${isDo ? 'do' : 'dont'}">${isDo ? 'DO' : 'DONT'}</span>
                <span class="check-label ${isChecked ? 'done' : ''}" style="flex:1">${escapeHtml(g.text)}</span>
                <span style="color:${isChecked ? 'var(--good)' : 'var(--text-faint)'};font-size:14px">${isChecked ? '✓' : '○'}</span>
              </li>`;
            }).join('')}
      </ul>
      <div style="font-size:12px;color:var(--text-faint);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">${checkedTodayCount} of ${totalGoals} done today</div>
    </div>`;

  const firstActive = (state.projects || []).find(p => p.status === 'active');
  const projDone  = firstActive ? firstActive.tasks.filter(t => t.checked).length : 0;
  const projTotal = firstActive ? firstActive.tasks.length : 0;
  const projPct   = projTotal ? Math.round(projDone / projTotal * 100) : 0;
  const projectsBlock = (delay) => `
    <div class="card" style="animation-delay:${delay}ms">
      <div class="section-title" style="margin-top:0">Active project</div>
      ${firstActive ? `
        <div style="font-size:${layout === 'hero' ? '18px' : '15px'};font-weight:500;line-height:1.35">${escapeHtml(firstActive.name)}</div>
        ${projTotal > 0 ? `
          <div class="proj-progress">
            <div class="proj-progress-meta"><span>${projDone} / ${projTotal} tasks done</span><span>${projPct}%</span></div>
            <div class="progress"><div class="bar" style="width:${projPct}%"></div></div>
          </div>
          <ul class="list" style="margin-top:12px">
            ${firstActive.tasks.slice(0, 3).map(t => `
              <li class="list-item" style="padding:8px 0">
                <span class="check ${t.checked ? 'checked' : ''}" data-toggle-proj-task="${firstActive.id}|${t.id}"></span>
                <span class="check-label ${t.checked ? 'done' : ''}">${escapeHtml(t.text)}</span>
              </li>
            `).join('')}
          </ul>
        ` : '<div style="font-size:12px;color:var(--text-faint);margin-top:8px">No tasks yet.</div>'}
      ` : `<div style="font-size:12px;color:var(--text-faint)">No active projects.</div>`}
    </div>`;

  const scheduleBlock = (delay) => `
    <div class="card" style="animation-delay:${delay}ms">
      <div class="section-title" style="margin-top:0">Today's schedule <span class="meta">${sched.length} blocks</span></div>
      <ul class="list">
        ${sched.map(s => `
          <li class="list-item">
            <div class="time-col">${s.time}</div>
            <div class="item-main">
              <div class="item-title">${escapeHtml(s.title)}</div>
              ${s.sub ? `<div class="item-sub">${escapeHtml(s.sub)}</div>` : ''}
            </div>
          </li>`).join('') || `<li class="list-item"><div class="item-sub">Nothing scheduled. Take it easy.</div></li>`}
      </ul>
    </div>`;

  const pillsBlock = showPills ? `
    <div class="pills" style="margin:18px 4px 4px">
      <button class="pill" data-go="life:schedule">Schedule</button>
      <button class="pill" data-go="life:commitments">Commitments</button>
      <button class="pill" data-go="life:projects">Projects</button>
    </div>` : '';

  const stacked = scheduleBlock(60) + commitmentsBlock(120) + projectsBlock(180);
  const hero    = projectsBlock(60) + scheduleBlock(120) + commitmentsBlock(180);

  return `
    ${topbar()}
    ${scoreBlock}
    ${layout === 'hero' ? hero : stacked}
    ${pillsBlock}
  `;
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
  const list = state.schedule[sel] || [];
  const dows = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

  return `
    ${topbar()}
    <h1 class="page-title">Schedule</h1>
    <div class="card" style="animation-delay:0ms; padding: 18px;">
      <div class="cal-head">
        <div>
          <div class="month-label">${monthLabel}</div>
          <div class="month-sub">${selDate.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })} selected</div>
        </div>
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
    <div class="card" style="animation-delay:100ms">
      <div class="section-title" style="margin-top:0">${selDate.toLocaleDateString(undefined,{weekday:'long', month:'long', day:'numeric'})}<span class="meta">${list.length} ${list.length===1?'block':'blocks'}</span></div>
      <ul class="list" id="sched-list">
        ${list.map(s => `
          <li class="sched-item" data-id="${s.id}">
            <div class="list-item row-wrap">
              <div class="time-col">${s.time}</div>
              <div class="item-main">
                <div class="item-title">${escapeHtml(s.title)}${s.alarm_time ? `<span class="alarm-tag">⏰ ${s.alarm_time}</span>` : ''}</div>
                ${s.sub ? `<div class="item-sub">${escapeHtml(s.sub)}</div>` : ''}
              </div>
              <div class="sched-acts">
                <button class="sched-edit-btn" data-edit-sched="${s.id}">Edit</button>
                <button class="sched-del-btn" data-del-sched="${s.id}">Delete</button>
              </div>
            </div>
            <div class="inline-form" id="edit-sched-${s.id}">
              <div class="inner">
                <div class="form-row">
                  <div class="field"><label>Time</label><input type="time" id="f-edit-time-${s.id}" value="${s.time}"/></div>
                  <div class="field"><label>Title</label><input type="text" id="f-edit-title-${s.id}" value="${escapeHtml(s.title)}"/></div>
                </div>
                <div class="field"><label>Note</label><input type="text" id="f-edit-sub-${s.id}" value="${escapeHtml(s.sub||'')}"/></div>
                <div class="alarm-row">
                  <span class="alarm-label">Set alarm</span>
                  <label class="toggle-switch">
                    <input type="checkbox" id="f-edit-alarm-${s.id}" ${s.alarm_time ? 'checked' : ''}>
                    <span class="toggle-track"></span>
                  </label>
                </div>
                <div class="alarm-time-row ${s.alarm_time ? 'visible' : ''}" id="edit-alarm-time-row-${s.id}">
                  <div class="field"><label>Alarm time</label><input type="time" id="f-edit-alarm-time-${s.id}" value="${s.alarm_time || s.time}"/></div>
                </div>
                <div class="form-actions">
                  <button class="btn" data-edit-cancel="${s.id}">Cancel</button>
                  <button class="btn primary" data-edit-save="${s.id}">Save</button>
                </div>
              </div>
            </div>
          </li>`).join('') || `<li class="list-item"><div class="item-sub">No events. Add one below.</div></li>`}
      </ul>
      <button class="add-btn" id="add-sched-btn" style="margin-top:14px"><span class="plus">+</span> Add event</button>
      <div class="inline-form" id="add-sched-form">
        <div class="inner">
          <div class="form-row">
            <div class="field"><label>Time</label><input type="time" id="f-sched-time" value="09:00"/></div>
            <div class="field"><label>Title</label><input type="text" id="f-sched-title" placeholder="e.g. Deep work"/></div>
          </div>
          <div class="field"><label>Note</label><input type="text" id="f-sched-sub" placeholder="optional"/></div>
          <div class="alarm-row">
            <span class="alarm-label">Set alarm</span>
            <label class="toggle-switch">
              <input type="checkbox" id="f-sched-alarm">
              <span class="toggle-track"></span>
            </label>
          </div>
          <div class="alarm-time-row" id="alarm-time-row">
            <div class="field"><label>Alarm time</label><input type="time" id="f-sched-alarm-time" value="09:00"/></div>
          </div>
          <div class="form-actions">
            <button class="btn" data-cancel="add-sched-form">Cancel</button>
            <button class="btn primary" id="f-sched-save">Add</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---- LIFE: COMMITMENTS — helpers ---- */
function getTodayLog(goalId) {
  const t = todayISO();
  return state.goalLogs.find(l => l.goal_id === goalId && l.date === t) || null;
}
function getLogByDate(goalId, date) {
  return state.goalLogs.find(l => l.goal_id === goalId && l.date === date) || null;
}
function getDayCompliancePct(dateIso) {
  const allGoals = [...(state.goals.dos || []), ...(state.goals.donts || [])];
  if (!allGoals.length) return 0;
  const checked = allGoals.filter(g => {
    const log = state.goalLogs.find(l => l.goal_id === g.id && l.date === dateIso);
    return log && log.checked;
  }).length;
  return (checked / allGoals.length) * 100;
}
function getCurrentWeekDays() {
  const today = new Date();
  const dow = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}
function computeDailyScore() {
  const today = todayISO();
  const allGoals = [...(state.goals.dos || []), ...(state.goals.donts || [])];
  const totalGoals = allGoals.length;
  const checkedToday = totalGoals ? allGoals.filter(g => getTodayLog(g.id)?.checked).length : 0;
  const commitScore = totalGoals ? Math.round((checkedToday / totalGoals) * 55) : 55;
  const schedScore  = (state.schedule[today] || []).length > 0 ? 15 : 0;
  const finScore    = state.spending.filter(s => s.date === today).length === 0 ? 30 : 15;
  return commitScore + schedScore + finScore;
}

function renderCommitments() {
  const today = todayISO();
  const dos   = state.goals.dos   || [];
  const donts = state.goals.donts || [];
  const allGoals  = [...dos, ...donts];
  const totalGoals = allGoals.length;

  const dosChecked   = dos.filter(g => getTodayLog(g.id)?.checked).length;
  const dontsChecked = donts.filter(g => getTodayLog(g.id)?.checked).length;
  const overallPct   = totalGoals ? Math.round((dosChecked + dontsChecked) / totalGoals * 100) : 0;
  const dosPct   = dos.length   ? Math.round(dosChecked   / dos.length   * 100) : 0;
  const dontsPct = donts.length ? Math.round(dontsChecked / donts.length * 100) : 0;

  function col(title, items, key) {
    return `
      <div class="card" style="animation-delay:40ms">
        <div class="section-title" style="margin-top:0">${title} <span class="meta">${items.filter(i => getTodayLog(i.id)?.checked).length} / ${items.length}</span></div>
        <ul class="list" style="padding:0">
          ${items.map(i => {
            const isChecked = getTodayLog(i.id)?.checked || false;
            return `
            <li class="goal-item">
              <div class="list-item" style="padding:10px 0;align-items:center">
                <span class="check ${isChecked ? 'checked' : ''}" data-toggle-goal="${key}|${i.id}"></span>
                <span class="check-label ${isChecked ? 'done' : ''}" style="flex:1" data-goal-text="${i.id}">${escapeHtml(i.text)}</span>
                <div class="fin-acts">
                  <button class="fin-edit-btn" data-edit-goal="${key}|${i.id}">&#x270E;</button>
                  <button class="fin-del-btn" data-del-goal="${key}|${i.id}">Delete</button>
                </div>
              </div>
              <div class="inline-form" id="edit-goal-${i.id}">
                <div class="inner">
                  <div class="field"><label>Edit</label><input type="text" id="f-goal-${i.id}" value="${escapeHtml(i.text)}" placeholder="..."/></div>
                  <div class="form-actions">
                    <button class="btn" data-cancel="edit-goal-${i.id}">Cancel</button>
                    <button class="btn primary" data-save-goal="${key}|${i.id}">Save</button>
                  </div>
                </div>
              </div>
            </li>`;
          }).join('')}
        </ul>
        <button class="add-btn" data-open-form="add-goal-${key}" style="margin-top:14px"><span class="plus">+</span> Add</button>
        <div class="inline-form" id="add-goal-${key}">
          <div class="inner">
            <div class="field"><label>${title.slice(0, -1)}</label><input type="text" data-goal-input="${key}" placeholder="${key === 'dos' ? 'e.g. Drink 2L water' : 'e.g. No phone in bed'}"/></div>
            <div class="form-actions">
              <button class="btn" data-cancel="add-goal-${key}">Cancel</button>
              <button class="btn primary" data-goal-save="${key}">Add</button>
            </div>
          </div>
        </div>
      </div>`;
  }

  // Weekly recap
  const weekDayNames = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const weekDays = getCurrentWeekDays();
  const weeklyHtml = weekDays.map((d, i) => {
    const iso = isoLocal(d);
    const isFuture = iso > today;
    const isToday  = iso === today;
    if (isFuture) return `<div class="week-day"><div class="week-day-label">${weekDayNames[i]}</div><div class="week-circle future">–</div><div class="week-pct">–</div></div>`;
    const pct = getDayCompliancePct(iso);
    const cls  = pct >= 80 ? 'full' : pct >= 40 ? 'half' : 'low';
    const char = pct >= 80 ? '●' : pct >= 40 ? '◐' : '○';
    return `<div class="week-day${isToday ? ' today' : ''}"><div class="week-day-label">${weekDayNames[i]}</div><div class="week-circle ${cls}">${char}</div><div class="week-pct">${Math.round(pct)}%</div></div>`;
  }).join('');

  // Monthly compliance calendar
  const [vy, vm] = today.slice(0, 7).split('-').map(Number);
  const monthLabel  = new Date(vy, vm - 1, 1).toLocaleDateString(undefined, { month: 'long' });
  const firstDow    = new Date(vy, vm - 1, 1).getDay();
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const calDows = ['S','M','T','W','T','F','S'];
  let monthCalHtml = calDows.map(d => `<div class="commit-cal-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) monthCalHtml += `<div class="commit-cal-cell other"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${String(vy).padStart(4,'0')}-${String(vm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isToday  = iso === today;
    const isFuture = iso > today;
    let bg = '';
    let tt = '';
    if (!isFuture && totalGoals > 0) {
      const pct = getDayCompliancePct(iso);
      if (pct >= 80)      bg = `background:color-mix(in oklab, var(--accent) 80%, transparent);`;
      else if (pct >= 40) bg = `background:color-mix(in oklab, var(--accent) 30%, transparent);`;
      else if (pct > 0)   bg = `background:color-mix(in oklab, var(--danger) 30%, transparent);`;
      if (pct > 0) tt = `title="${Math.round(pct)}%"`;
    }
    monthCalHtml += `<div class="commit-cal-cell${isToday ? ' today' : ''}${isFuture ? ' future' : ''}" style="${bg}" ${tt}>${day}</div>`;
  }

  return `
    ${topbar()}
    <h1 class="page-title">Commitments</h1>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">Today's progress</div>
      <div class="commit-progress-row">
        <span class="commit-prog-label">Do's</span>
        <div class="progress" style="flex:1;margin-top:0"><div class="bar" style="width:${dosPct}%"></div></div>
        <span class="commit-prog-meta">${dosChecked} / ${dos.length}</span>
      </div>
      <div class="commit-progress-row" style="margin-top:10px">
        <span class="commit-prog-label">Don'ts</span>
        <div class="progress" style="flex:1;margin-top:0"><div class="bar" style="width:${dontsPct}%"></div></div>
        <span class="commit-prog-meta">${dontsChecked} / ${donts.length}</span>
      </div>
      <div class="commit-big-pct">
        <div style="font-size:48px;font-weight:200;color:var(--accent);font-variant-numeric:tabular-nums;line-height:1">${overallPct}<span style="font-size:24px">%</span></div>
        <div style="font-size:12px;color:var(--text-faint);margin-top:6px">today's compliance</div>
      </div>
    </div>
    <div style="margin-top:16px">${col("Do's", dos, 'dos')}</div>
    <div style="margin-top:16px">${col("Don'ts", donts, 'donts')}</div>
    <div class="card" style="margin-top:16px;animation-delay:80ms">
      <div class="commit-preview-tabs">
        <button class="commit-tab-btn${state.commitPreviewTab === 'weekly' ? ' active' : ''}" data-commit-tab="weekly">Weekly</button>
        <button class="commit-tab-btn${state.commitPreviewTab === 'monthly' ? ' active' : ''}" data-commit-tab="monthly">Monthly</button>
      </div>
      ${state.commitPreviewTab === 'weekly'
        ? `<div class="week-strip" style="margin-top:12px">${weeklyHtml}</div>`
        : `<div style="font-size:11px;color:var(--text-faint);margin-bottom:8px;text-align:right">${monthLabel}</div><div class="commit-cal-grid">${monthCalHtml}</div>`
      }
    </div>
  `;
}

/* ---- LIFE: PROJECTS ---- */
function renderProjectCard(p, i) {
  const isExpanded = (state.expandedProjectIds || []).includes(p.id);
  const doneTasks  = p.tasks.filter(t => t.checked).length;
  const totalTasks = p.tasks.length;
  const pct        = totalTasks ? Math.round(doneTasks / totalTasks * 100) : 0;
  const isDone     = p.status === 'done';

  let deadlineHtml = '';
  if (p.deadline) {
    const days = daysUntil(p.deadline);
    const isUrgent  = !isDone && days <= 7 && days >= 0;
    const isOverdue = !isDone && days < 0;
    const label = isDone ? fmtDate(p.deadline)
                : days === 0 ? 'Due today'
                : days < 0  ? `Overdue · ${fmtDate(p.deadline)}`
                : `Due ${fmtDate(p.deadline)}`;
    deadlineHtml = `<span class="proj-deadline${isUrgent||isOverdue?' urgent':''}">${label}</span>`;
  }

  const statusLabels = { active: 'Active', on_hold: 'On Hold', done: 'Done' };
  const statusBadge  = `<span class="proj-badge proj-badge-${p.status}">${statusLabels[p.status]}</span>`;

  return `
    <div class="card proj-card" style="animation-delay:${i*60}ms" data-proj-id="${p.id}">
      <div class="proj-card-header">
        <div class="proj-card-title-row">
          <div class="proj-name${isDone?' done':''}">${escapeHtml(p.name)}</div>
          <div class="proj-meta-row">
            ${statusBadge}
            ${deadlineHtml}
          </div>
        </div>
        <div class="proj-card-acts">
          <button class="fin-edit-btn" data-edit-proj="${p.id}" title="Edit">&#x270E;</button>
          <button class="fin-edit-btn" data-toggle-proj-done="${p.id}" title="${isDone?'Reopen':'Mark done'}" style="color:${isDone?'var(--text-faint)':'var(--good)'}">${isDone?'↩':'✓'}</button>
          <button class="fin-del-btn" data-del-proj="${p.id}" title="Delete">&#x00D7;</button>
        </div>
      </div>
      ${totalTasks > 0 ? `
        <div class="proj-progress">
          <div class="proj-progress-meta">
            <span>${doneTasks} / ${totalTasks} tasks done</span>
            <span>${pct}%</span>
          </div>
          <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
        </div>
      ` : ''}
      <div class="inline-form" id="edit-proj-${p.id}">
        <div class="inner">
          <div class="field"><label>Project name</label><input type="text" id="f-ep-name-${p.id}" value="${escapeHtml(p.name)}"/></div>
          <div class="form-row">
            <div class="field"><label>Status</label><select id="f-ep-status-${p.id}">
              <option value="active"  ${p.status==='active'  ?'selected':''}>Active</option>
              <option value="on_hold" ${p.status==='on_hold' ?'selected':''}>On Hold</option>
              <option value="done"    ${p.status==='done'    ?'selected':''}>Done</option>
            </select></div>
            <div class="field"><label>Deadline</label><input type="date" id="f-ep-deadline-${p.id}" value="${p.deadline||''}"/></div>
          </div>
          <div class="form-actions">
            <button class="btn" data-cancel="edit-proj-${p.id}">Cancel</button>
            <button class="btn primary" data-save-proj="${p.id}">Save</button>
          </div>
        </div>
      </div>
      <button class="proj-expand-btn" data-toggle-proj-expand="${p.id}">
        <span>${isExpanded?'▼':'▶'}</span>
        <span>${isExpanded?'Hide tasks':'Show tasks'}</span>
      </button>
      ${isExpanded ? `
        <div class="proj-tasks" id="proj-tasks-${p.id}">
          <ul class="list" style="margin-top:4px">
            ${p.tasks.map(t => `
              <li class="focus-task-item" data-id="${t.id}">
                <div class="list-item row-wrap" style="padding:10px 0; align-items:flex-start">
                  <span class="check ${t.checked?'checked':''}" data-toggle-proj-task="${p.id}|${t.id}" style="margin-top:2px;flex-shrink:0"></span>
                  <div class="check-label ${t.checked?'done':''}" style="flex:1;min-width:0">
                    <div>${escapeHtml(t.text)}</div>
                    ${t.description ? `<div class="task-desc-text">${escapeHtml(t.description.length>80?t.description.slice(0,80)+'...':t.description)}</div>` : ''}
                  </div>
                  <div class="focus-task-acts">
                    <button class="fin-edit-btn" data-edit-proj-task="${p.id}|${t.id}">&#x270E;</button>
                    <button class="fin-del-btn" data-del-proj-task="${p.id}|${t.id}">&#x00D7;</button>
                  </div>
                </div>
                <div class="inline-form" id="edit-proj-task-${t.id}">
                  <div class="inner">
                    <div class="field"><label>Task</label><input type="text" id="f-ept-text-${t.id}" value="${escapeHtml(t.text)}"/></div>
                    <div class="field"><label>Description</label><textarea id="f-ept-desc-${t.id}" rows="2" placeholder="Description (optional)">${escapeHtml(t.description||'')}</textarea></div>
                    <div class="form-actions">
                      <button class="btn" data-cancel="edit-proj-task-${t.id}">Cancel</button>
                      <button class="btn primary" data-save-proj-task="${p.id}|${t.id}">Save</button>
                    </div>
                  </div>
                </div>
              </li>
            `).join('')}
          </ul>
          <button class="add-btn" data-open-form="add-proj-task-${p.id}" style="margin-top:10px"><span class="plus">+</span> Add task</button>
          <div class="inline-form" id="add-proj-task-${p.id}">
            <div class="inner">
              <div class="field"><label>Task</label><input type="text" id="f-pt-text-${p.id}" placeholder="What needs to be done?"/></div>
              <div class="field"><label>Description</label><textarea id="f-pt-desc-${p.id}" rows="2" placeholder="Description (optional)"></textarea></div>
              <div class="form-actions">
                <button class="btn" data-cancel="add-proj-task-${p.id}">Cancel</button>
                <button class="btn primary" data-save-proj-task-new="${p.id}">Add</button>
              </div>
            </div>
          </div>
        </div>
      ` : ''}
    </div>`;
}

function renderProjects() {
  const filter = state.projectsFilter || 'all';
  const allProjects = state.projects || [];
  const filtered = filter === 'all' ? allProjects : allProjects.filter(p => p.status === filter);
  const filterLabels = { all: 'All', active: 'Active', on_hold: 'On Hold', done: 'Done' };

  return `
    ${topbar()}
    <div class="projects-header">
      <h1 class="page-title" style="margin:0">Projects</h1>
      <button class="add-btn-inline" data-open-form="add-project-form">+ New Project</button>
    </div>
    <div class="pills" style="margin: 14px 0 18px">
      ${['all','active','on_hold','done'].map(f =>
        `<button class="pill${filter===f?' active':''}" data-proj-filter="${f}">${filterLabels[f]}</button>`
      ).join('')}
    </div>
    <div class="inline-form" id="add-project-form">
      <div class="inner">
        <div class="field"><label>Project name</label><input type="text" id="f-proj-name" placeholder="e.g. Client Website"/></div>
        <div class="form-row">
          <div class="field"><label>Status</label><select id="f-proj-status">
            <option value="active">Active</option>
            <option value="on_hold">On Hold</option>
            <option value="done">Done</option>
          </select></div>
          <div class="field"><label>Deadline (optional)</label><input type="date" id="f-proj-deadline"/></div>
        </div>
        <div class="form-actions">
          <button class="btn" data-cancel="add-project-form">Cancel</button>
          <button class="btn primary" id="f-proj-save">Add</button>
        </div>
      </div>
    </div>
    ${filtered.length === 0
      ? `<div style="color:var(--text-faint);font-size:13px;padding:20px 0">No projects${filter!=='all'?' with this status':''}.</div>`
      : filtered.map((p, i) => renderProjectCard(p, i)).join('')
    }
  `;
}

/* ---- LIFE: NOTES ---- */
function stripHtml(html) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}
function noteDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const noteStart  = new Date(d); noteStart.setHours(0,0,0,0);
  if (noteStart.getTime() === todayStart.getTime()) return 'Today';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function getFilteredNotes() {
  let notes = [...state.notes];
  if (state.notesFilter === 'today') {
    const t = todayISO();
    notes = notes.filter(n => (n.updated_at || n.created_at || '').slice(0, 10) === t);
  } else if (state.notesFilter === 'week') {
    const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
    notes = notes.filter(n => new Date(n.updated_at || n.created_at) >= weekAgo);
  }
  if (state.notesSort === 'oldest') {
    notes.sort((a, b) => new Date(a.updated_at||a.created_at) - new Date(b.updated_at||b.created_at));
  } else if (state.notesSort === 'az') {
    notes.sort((a, b) => (a.title||'').localeCompare(b.title||''));
  } else {
    notes.sort((a, b) => new Date(b.updated_at||b.created_at) - new Date(a.updated_at||a.created_at));
  }
  return notes;
}

function renderNotesList() {
  const notes  = getFilteredNotes();
  const isGrid = state.notesDisplay === 'grid';
  const sortLabels   = { newest: 'Newest', oldest: 'Oldest', az: 'A–Z' };
  const filterLabels = { all: 'All', today: 'Today', week: 'This week' };
  return `
    ${topbar()}
    <div class="notes-header">
      <h1 class="page-title" style="margin:0">Notes</h1>
      <div class="notes-controls">
        <div class="notes-ctrl-wrap">
          <button class="notes-ctrl-btn" id="notes-sort-btn">
            ${sortLabels[state.notesSort]}<span class="caret">▾</span>
          </button>
          <div class="notes-dropdown" id="notes-sort-dd">
            <button data-sort="newest" class="${state.notesSort==='newest'?'sel':''}">Newest</button>
            <button data-sort="oldest" class="${state.notesSort==='oldest'?'sel':''}">Oldest</button>
            <button data-sort="az"     class="${state.notesSort==='az'    ?'sel':''}">A–Z</button>
          </div>
        </div>
        <div class="notes-ctrl-wrap">
          <button class="notes-ctrl-btn" id="notes-filter-btn">
            ${filterLabels[state.notesFilter]}<span class="caret">▾</span>
          </button>
          <div class="notes-dropdown" id="notes-filter-dd">
            <button data-filter="all"   class="${state.notesFilter==='all'   ?'sel':''}">All</button>
            <button data-filter="today" class="${state.notesFilter==='today' ?'sel':''}">Today</button>
            <button data-filter="week"  class="${state.notesFilter==='week'  ?'sel':''}">This week</button>
          </div>
        </div>
        <button class="notes-ctrl-btn ${isGrid?'active':''}" id="notes-view-btn" title="Toggle layout">
          ${isGrid ? '▦' : '☰'}
        </button>
      </div>
    </div>
    <div class="${isGrid ? 'notes-grid' : 'notes-list-view'}">
      ${notes.map(n => {
        const preview = stripHtml(n.content);
        const previewText = preview.length > 120 ? preview.slice(0, 120) + '...' : preview;
        return `
        <div class="note-card" data-open-note="${n.id}">
          <button class="note-card-del" data-del-note-card="${n.id}" aria-label="Delete note">&#x00D7;</button>
          <div class="note-card-title ${n.title?'':'empty'}">${n.title ? escapeHtml(n.title) : 'Untitled'}</div>
          <div class="note-card-preview">${escapeHtml(previewText)}</div>
          <div class="note-card-date" data-note-ts="${n.id}">${relativeTime(n.updated_at || n.created_at)}</div>
        </div>`;
      }).join('') || `<div style="color:var(--text-faint);font-size:13px;padding:20px 0">No notes yet.</div>`}
    </div>
    <button class="add-btn" id="add-note-btn" style="margin-top:18px"><span class="plus">+</span> New note</button>
  `;
}

function renderNoteEditor() {
  const n = state.notes.find(x => x.id === state.activeNoteId);
  if (!n) { state.activeNoteId = null; return renderNotesList(); }
  return `
    ${topbar()}
    <div class="note-editor-header">
      <button class="note-back-btn" id="note-back-btn">←</button>
      <div class="note-editor-meta">
        <span class="note-saved-lbl" id="note-saved-lbl">Saved</span>
        <button class="note-del-btn" id="note-del-btn">Delete</button>
      </div>
    </div>
    <input class="note-title-input" id="note-title" type="text"
      value="${escapeHtml(n.title || '')}" placeholder="Title" autocomplete="off"/>
    <div class="note-toolbar" id="note-toolbar">
      <div style="display:flex;align-items:center;gap:2px">
        <button class="tb-btn" data-cmd="formatBlock" data-val="p"  title="Normal">Normal</button>
        <button class="tb-btn" data-cmd="formatBlock" data-val="h1" title="H1">H1</button>
        <button class="tb-btn" data-cmd="formatBlock" data-val="h2" title="H2">H2</button>
        <button class="tb-btn" data-cmd="formatBlock" data-val="h3" title="H3">H3</button>
      </div>
      <div class="tb-sep"></div>
      <div style="display:flex;align-items:center;gap:2px">
        <button class="tb-btn tb-btn-b" data-cmd="bold"                title="Bold">B</button>
        <button class="tb-btn tb-btn-i" data-cmd="italic"              title="Italic">I</button>
        <button class="tb-btn"          data-cmd="insertUnorderedList" title="Bullet list">•</button>
      </div>
    </div>
    <div class="note-content" id="note-content" contenteditable="true"
      data-placeholder="Start writing...">${n.content || ''}</div>
  `;
}

function initHeadingCollapse(editorEl) {
  const collapsed = new Map(); // heading element → Set of hidden siblings

  function rebuildToggles() {
    editorEl.querySelectorAll('.hd-toggle').forEach(t => t.remove());
    Array.from(editorEl.children).forEach(block => {
      const tag = block.tagName?.toLowerCase();
      if (!['h1','h2','h3'].includes(tag)) return;
      const toggle = document.createElement('span');
      toggle.className = 'hd-toggle' + (collapsed.has(block) ? ' collapsed' : '');
      toggle.textContent = '▼';
      toggle.contentEditable = 'false';
      toggle.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation();
        if (collapsed.has(block)) {
          collapsed.get(block).forEach(el => el.style.removeProperty('display'));
          collapsed.delete(block);
          toggle.classList.remove('collapsed');
        } else {
          const level = parseInt(tag[1]);
          const hidden = new Set();
          let next = block.nextElementSibling;
          while (next) {
            const nt = next.tagName?.toLowerCase();
            if (['h1','h2','h3'].includes(nt) && parseInt(nt[1]) <= level) break;
            next.style.display = 'none';
            hidden.add(next);
            next = next.nextElementSibling;
          }
          if (hidden.size) { collapsed.set(block, hidden); toggle.classList.add('collapsed'); }
        }
      });
      block.prepend(toggle);
    });
  }

  rebuildToggles();
  const obs = new MutationObserver(() => rebuildToggles());
  obs.observe(editorEl, { childList: true });
  return obs;
}

function renderNotes() {
  return state.activeNoteId !== null ? renderNoteEditor() : renderNotesList();
}

/* ---- FINANCE: OVERVIEW ---- */
function thisMonthIncome() {
  const ym = ymLocal(new Date());
  return state.income.filter(i => (i.date||'').startsWith(ym)).reduce((s,i) => s + Number(i.amount||0), 0);
}
function todaySpend() {
  return state.spending.filter(s => s.date === todayISO()).reduce((s,i) => s + Number(i.amount||0), 0);
}
function totalDebt() {
  return state.debts.filter(d => !d.paid).reduce((s,d) => s + Number(d.amount||0), 0);
}
function daysUntil(iso) {
  const d = new Date(iso); d.setHours(0,0,0,0);
  const t = new Date(); t.setHours(0,0,0,0);
  return Math.round((d-t)/86400000);
}
function last7DaysSpend() {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate()-i);
    const iso = isoLocal(d);
    const total = state.spending.filter(s => s.date === iso).reduce((s,x) => s + Number(x.amount||0), 0);
    out.push({ iso, total, label: d.toLocaleDateString(undefined,{weekday:'short'}).slice(0,1) });
  }
  return out;
}

function renderFinanceOverview() {
  const inc = thisMonthIncome(), spent = todaySpend(), debt = totalDebt();
  const soonest = state.debts.filter(d=>!d.paid).map(d=>daysUntil(d.due)).sort((a,b)=>a-b)[0];
  const showAlert = soonest !== undefined && soonest <= 7 && soonest >= 0;
  const days = last7DaysSpend();
  const max = Math.max(1, ...days.map(d=>d.total));
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';

  return `
    ${topbar()}
    <h1 class="page-title">Finance</h1>
    <div class="metric-grid">
      <div class="card metric" style="animation-delay:0ms"><div class="label">Income · this month</div><div class="num" data-target="${inc}" data-prefix="${pfx}">${fmtMoney(0)}</div><div class="sub">${state.income.length} entries</div></div>
      <div class="card metric" style="animation-delay:80ms"><div class="label">Spent · today</div><div class="num" data-target="${spent}" data-prefix="${pfx}">${fmtMoney(0)}</div><div class="sub">${state.spending.filter(s=>s.date===todayISO()).length} transactions</div></div>
      <div class="card metric" style="animation-delay:160ms"><div class="label">Total debt</div><div class="num" data-target="${debt}" data-prefix="${pfx}">${fmtMoney(0)}</div><div class="sub">${state.debts.filter(d=>!d.paid).length} open</div></div>
    </div>
    ${showAlert ? `<div class="alert" style="margin-top:18px"><span class="glyph">⚠</span> Debt due in ${soonest} day${soonest===1?'':'s'}</div>` : ''}
    <div class="card" style="margin-top:18px; animation-delay:220ms">
      <div class="section-title" style="margin-top:0">Last 7 days spending <span class="meta">${fmtMoney(days.reduce((a,b)=>a+b.total,0))}</span></div>
      <div class="bar-chart">
        ${days.map((d,i) => `
          <div class="col ${d.total===0?'dim':''}">
            <div class="bar-track">
              <div class="bar" style="height:${d.total===0?6:Math.max(8,(d.total/max)*100)}%; transition-delay:${i*40}ms"></div>
            </div>
            <div class="lbl">${d.label}</div>
          </div>`).join('')}
      </div>
    </div>
  `;
}

/* ---- FINANCE: INCOME ---- */
function renderIncome() {
  const total = thisMonthIncome();
  const items = state.income.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';
  return `
    ${topbar()}
    <h1 class="page-title">Income</h1>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">This month</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${total}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="sub" style="color:var(--text-faint); margin-top:6px;">${state.income.length} entries · avg ${fmtMoney(state.income.length?Math.round(total/state.income.length):0)}</div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:60ms">
      <div class="section-title" style="margin-top:0">Log</div>
      <ul class="list">
        ${items.map(i => `
          <li class="fin-item" data-id="${i.id}">
            <div class="list-item row-wrap">
              <div class="time-col">${fmtDate(i.date)}</div>
              <div class="item-main"><div class="item-title">${escapeHtml(i.source)}</div></div>
              <div class="item-amt">+${fmtMoney(i.amount)}</div>
              <div class="fin-acts">
                <button class="fin-edit-btn" data-edit-income="${i.id}">Edit</button>
                <button class="fin-del-btn" data-del-income="${i.id}">Delete</button>
              </div>
            </div>
            <div class="inline-form" id="edit-inc-${i.id}">
              <div class="inner">
                <div class="form-row">
                  <div class="field"><label>Date</label><input type="date" id="f-ei-date-${i.id}" value="${i.date}"/></div>
                  <div class="field"><label>Source</label><input type="text" id="f-ei-source-${i.id}" value="${escapeHtml(i.source)}"/></div>
                </div>
                <div class="field"><label>Amount</label><input type="number" id="f-ei-amount-${i.id}" value="${i.amount}"/></div>
                <div class="form-actions">
                  <button class="btn" data-cancel="edit-inc-${i.id}">Cancel</button>
                  <button class="btn primary" data-save-inc="${i.id}">Save</button>
                </div>
              </div>
            </div>
          </li>`).join('') || `<li class="list-item"><div class="item-sub">No income yet.</div></li>`}
      </ul>
      <button class="add-btn" data-open-form="add-income" style="margin-top:14px"><span class="plus">+</span> Log income</button>
      <div class="inline-form" id="add-income">
        <div class="inner">
          <div class="field"><label>Source</label><input type="text" id="f-inc-source" placeholder="e.g. Client A"/></div>
          <div class="form-row">
            <div class="field"><label>Amount</label><input type="number" id="f-inc-amount" placeholder="0"/></div>
            <div class="field"><label>Date</label><input type="date" id="f-inc-date" value="${todayISO()}"/></div>
          </div>
          <div class="form-actions">
            <button class="btn" data-cancel="add-income">Cancel</button>
            <button class="btn primary" id="f-inc-save">Add</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---- FINANCE: SPENDING ---- */
function renderSpending() {
  const today = todayISO();
  const todays = state.spending.filter(s => s.date === today);
  const total = todays.reduce((s,x) => s+Number(x.amount||0), 0);
  const cats = ['Food','Transport','Shopping','Other'];
  const byCat = Object.fromEntries(cats.map(c => [c, todays.filter(s=>s.cat===c).reduce((s,x)=>s+Number(x.amount||0),0)]));
  const recent = state.spending.slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';

  return `
    ${topbar()}
    <h1 class="page-title">Spending</h1>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">Today</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${total}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="pills" style="margin-top:16px">
        ${cats.map(c => `<span class="pill cat">${c}<span class="amt">${fmtMoney(byCat[c])}</span></span>`).join('')}
      </div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:80ms">
      <div class="section-title" style="margin-top:0">Recent</div>
      <ul class="list">
        ${recent.map(s => `
          <li class="fin-item" data-id="${s.id}">
            <div class="list-item row-wrap">
              <div class="time-col">${s.date===today?s.time:fmtDate(s.date)}</div>
              <div class="item-main">
                <div class="item-title">${escapeHtml(s.note || s.cat)}</div>
                <div class="item-sub">${s.cat}</div>
              </div>
              <div class="item-amt">−${fmtMoney(s.amount)}</div>
              <div class="fin-acts">
                <button class="fin-edit-btn" data-edit-spend="${s.id}">Edit</button>
                <button class="fin-del-btn" data-del-spend="${s.id}">Delete</button>
              </div>
            </div>
            <div class="inline-form" id="edit-spend-${s.id}">
              <div class="inner">
                <div class="form-row">
                  <div class="field"><label>Category</label><select id="f-es-cat-${s.id}">${cats.map(c=>`<option ${c===s.cat?'selected':''}>${c}</option>`).join('')}</select></div>
                  <div class="field"><label>Amount</label><input type="number" id="f-es-amount-${s.id}" value="${s.amount}"/></div>
                </div>
                <div class="form-row">
                  <div class="field"><label>Note</label><input type="text" id="f-es-note-${s.id}" value="${escapeHtml(s.note||'')}"/></div>
                  <div class="field"><label>Time</label><input type="time" id="f-es-time-${s.id}" value="${s.time||''}"/></div>
                </div>
                <div class="form-actions">
                  <button class="btn" data-cancel="edit-spend-${s.id}">Cancel</button>
                  <button class="btn primary" data-save-spend="${s.id}">Save</button>
                </div>
              </div>
            </div>
          </li>`).join('')}
      </ul>
      <button class="add-btn" data-open-form="add-spend" style="margin-top:14px"><span class="plus">+</span> Log spend</button>
      <div class="inline-form" id="add-spend">
        <div class="inner">
          <div class="form-row">
            <div class="field"><label>Category</label><select id="f-sp-cat">${cats.map(c=>`<option>${c}</option>`).join('')}</select></div>
            <div class="field"><label>Amount</label><input type="number" id="f-sp-amount" placeholder="0"/></div>
          </div>
          <div class="field"><label>Note</label><input type="text" id="f-sp-note" placeholder="What was it?"/></div>
          <div class="form-actions">
            <button class="btn" data-cancel="add-spend">Cancel</button>
            <button class="btn primary" id="f-sp-save">Add</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* ---- FINANCE: DEBTS ---- */
function renderDebts() {
  const sorted = state.debts.slice().sort((a,b)=>(a.paid?1:0)-(b.paid?1:0)||(a.due||'').localeCompare(b.due||''));
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';
  return `
    ${topbar()}
    <h1 class="page-title">Debts</h1>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">Open total</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${totalDebt()}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="sub" style="color:var(--text-faint); margin-top:6px;">${state.debts.filter(d=>!d.paid).length} open · ${state.debts.filter(d=>d.paid).length} paid</div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:60ms">
      <div class="section-title" style="margin-top:0">All debts</div>
      <ul class="list">
        ${sorted.map(d => {
          const days = daysUntil(d.due);
          const soon = !d.paid && days <= 7 && days >= 0;
          const overdue = !d.paid && days < 0;
          const dueLabel = d.paid ? `Paid` : (overdue ? `Overdue · ${fmtDate(d.due)}` : (days===0?`Due today`:`Due in ${days}d · ${fmtDate(d.due)}`));
          return `
          <li class="fin-item" data-id="${d.id}">
            <div class="debt-row-info">
              <div class="item-main">
                <div class="item-title">${escapeHtml(d.creditor)}</div>
                <div class="debt-due ${soon||overdue?'soon':''}">${dueLabel}</div>
              </div>
              <div class="item-amt">${fmtMoney(d.amount)}</div>
            </div>
            <div class="debt-row-acts">
              ${d.paid
                ? `<span class="debt-status paid">Paid</span>`
                : `<button class="btn" data-pay-debt="${d.id}" style="padding:6px 10px;font-size:11px;">Mark paid</button>`}
              <div class="spacer"></div>
              <button class="fin-edit-btn" data-edit-debt="${d.id}">Edit</button>
              <button class="fin-del-btn" data-del-debt="${d.id}">Delete</button>
            </div>
            <div class="inline-form" id="edit-debt-${d.id}">
              <div class="inner">
                <div class="field"><label>Creditor</label><input type="text" id="f-ed-creditor-${d.id}" value="${escapeHtml(d.creditor)}"/></div>
                <div class="form-row">
                  <div class="field"><label>Amount</label><input type="number" id="f-ed-amount-${d.id}" value="${d.amount}"/></div>
                  <div class="field"><label>Due date</label><input type="date" id="f-ed-due-${d.id}" value="${d.due}"/></div>
                </div>
                <div class="form-actions">
                  <button class="btn" data-cancel="edit-debt-${d.id}">Cancel</button>
                  <button class="btn primary" data-save-debt="${d.id}">Save</button>
                </div>
              </div>
            </div>
          </li>`;
        }).join('')}
      </ul>
      <button class="add-btn" data-open-form="add-debt" style="margin-top:14px"><span class="plus">+</span> Add debt</button>
      <div class="inline-form" id="add-debt">
        <div class="inner">
          <div class="field"><label>Creditor</label><input type="text" id="f-debt-creditor" placeholder="Who do you owe?"/></div>
          <div class="form-row">
            <div class="field"><label>Amount</label><input type="number" id="f-debt-amount" placeholder="0"/></div>
            <div class="field"><label>Due date</label><input type="date" id="f-debt-due" value="${todayISO()}"/></div>
          </div>
          <div class="form-actions">
            <button class="btn" data-cancel="add-debt">Cancel</button>
            <button class="btn primary" id="f-debt-save">Add</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/* =========================================================
   ANIMATIONS
========================================================= */
function animateNumbers() {
  document.querySelectorAll('.num[data-target]').forEach(el => {
    const target = Number(el.dataset.target || 0);
    const prefix = el.dataset.prefix || '';
    const start = performance.now();
    const dur = 600;
    const fmt = (n) => prefix + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(target * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });
}
function animateBars() {
  document.querySelectorAll('.bar-chart .bar').forEach(b => {
    const h = b.style.height;
    b.style.height = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => { b.style.height = h; }));
  });
}

/* =========================================================
   EVENT BINDING
========================================================= */
function bindMainEvents() {
  // clear any running intervals from previous render
  clearInterval(clockIntervalId); clockIntervalId = null;
  clearInterval(notesTimestampIntervalId); notesTimestampIntervalId = null;

  // live clock
  const clockEl = main.querySelector('#live-clock');
  if (clockEl) {
    clockIntervalId = setInterval(() => { clockEl.textContent = fmtClock(); }, 1000);
  }

  // tweaks + logout (inside main, re-bound on each render)
  const ot = main.querySelector('#open-tweaks');
  if (ot) ot.addEventListener('click', toggleTweaks);
  const tlb = main.querySelector('#topbar-logout-btn');
  if (tlb) tlb.addEventListener('click', signOut);

  // navigation pills
  main.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => setActiveTab(el.dataset.go)));

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

  // project filter pills
  main.querySelectorAll('[data-proj-filter]').forEach(el => el.addEventListener('click', () => {
    state.projectsFilter = el.dataset.projFilter;
    render();
  }));

  // project expand/collapse
  main.querySelectorAll('[data-toggle-proj-expand]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.toggleProjExpand;
    const idx = state.expandedProjectIds.indexOf(id);
    if (idx === -1) state.expandedProjectIds.push(id);
    else state.expandedProjectIds.splice(idx, 1);
    render();
  }));

  // project task toggle (Today + Projects pages)
  main.querySelectorAll('[data-toggle-proj-task]').forEach(el => el.addEventListener('click', () => {
    const [projId, taskId] = el.dataset.toggleProjTask.split('|');
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    const task = proj.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.checked = !task.checked;
    pulse(el); render();
    dbCall(() => sb.from('project_tasks').update({ checked: task.checked }).eq('id', taskId));
  }));

  // project delete
  main.querySelectorAll('[data-del-proj]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delProj;
    state.projects = state.projects.filter(p => p.id !== id);
    state.expandedProjectIds = state.expandedProjectIds.filter(eid => eid !== id);
    render();
    dbCall(() => sb.from('projects').delete().eq('id', id));
  }));

  // project edit open
  main.querySelectorAll('[data-edit-proj]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editProj;
    const form = document.getElementById('edit-proj-' + id);
    if (!form) return;
    const isOpen = form.classList.contains('open');
    closeAllForms();
    if (!isOpen) form.classList.add('open');
  }));

  // project edit save
  main.querySelectorAll('[data-save-proj]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.saveProj;
    const nameEl     = document.getElementById('f-ep-name-'     + id);
    const statusEl   = document.getElementById('f-ep-status-'   + id);
    const deadlineEl = document.getElementById('f-ep-deadline-' + id);
    if (!nameEl) return;
    const newName     = nameEl.value.trim();
    if (!newName) { nameEl.focus(); return; }
    const newStatus   = statusEl   ? statusEl.value             : 'active';
    const newDeadline = deadlineEl ? (deadlineEl.value || null) : null;
    const proj = state.projects.find(p => p.id === id);
    if (proj) { proj.name = newName; proj.status = newStatus; proj.deadline = newDeadline; }
    render();
    dbCall(() => sb.from('projects').update({ name: newName, status: newStatus, deadline: newDeadline, updated_at: new Date().toISOString() }).eq('id', id));
  }));

  // project toggle done/reopen
  main.querySelectorAll('[data-toggle-proj-done]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.toggleProjDone;
    const proj = state.projects.find(p => p.id === id);
    if (!proj) return;
    proj.status = proj.status === 'done' ? 'active' : 'done';
    render();
    dbCall(() => sb.from('projects').update({ status: proj.status, updated_at: new Date().toISOString() }).eq('id', id));
  }));

  // project task delete
  main.querySelectorAll('[data-del-proj-task]').forEach(el => el.addEventListener('click', () => {
    const [projId, taskId] = el.dataset.delProjTask.split('|');
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    proj.tasks = proj.tasks.filter(t => t.id !== taskId);
    render();
    dbCall(() => sb.from('project_tasks').delete().eq('id', taskId));
  }));

  // project task edit open
  main.querySelectorAll('[data-edit-proj-task]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [, taskId] = el.dataset.editProjTask.split('|');
    const form = document.getElementById('edit-proj-task-' + taskId);
    if (!form) return;
    const isOpen = form.classList.contains('open');
    closeAllForms();
    if (!isOpen) form.classList.add('open');
  }));

  // project task edit save
  main.querySelectorAll('[data-save-proj-task]').forEach(el => el.addEventListener('click', async () => {
    const [projId, taskId] = el.dataset.saveProjTask.split('|');
    const textEl = document.getElementById('f-ept-text-' + taskId);
    const descEl = document.getElementById('f-ept-desc-' + taskId);
    if (!textEl) return;
    const newText = textEl.value.trim();
    if (!newText) { textEl.focus(); return; }
    const newDesc = descEl ? descEl.value.trim() : '';
    const proj = state.projects.find(p => p.id === projId);
    if (proj) {
      const task = proj.tasks.find(t => t.id === taskId);
      if (task) { task.text = newText; task.description = newDesc; }
    }
    render();
    dbCall(() => sb.from('project_tasks').update({ text: newText, description: newDesc || null }).eq('id', taskId));
  }));

  // project add task (per-project inline form)
  main.querySelectorAll('[data-save-proj-task-new]').forEach(btn => btn.addEventListener('click', async () => {
    const projId = btn.dataset.saveProjTaskNew;
    const textEl = main.querySelector(`#f-pt-text-${projId}`);
    const descEl = main.querySelector(`#f-pt-desc-${projId}`);
    const text = textEl ? textEl.value.trim() : '';
    const desc = descEl ? descEl.value.trim() : '';
    if (!text) { textEl?.focus(); return; }
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    const { data } = await dbCall(() => sb.from('project_tasks').insert({ user_id: currentUser.id, project_id: projId, text, description: desc || null, checked: false }).select().single());
    if (data) {
      proj.tasks.push({ id: data.id, text, description: desc, checked: false });
      render();
    }
  }));

  // commitments preview tab switch
  main.querySelectorAll('[data-commit-tab]').forEach(el => el.addEventListener('click', () => {
    state.commitPreviewTab = el.dataset.commitTab;
    render();
  }));

  // goal toggle → upsert goal_logs
  main.querySelectorAll('[data-toggle-goal]').forEach(el => el.addEventListener('click', async () => {
    const [k, id] = el.dataset.toggleGoal.split('|');
    const g = (state.goals[k] || []).find(x => x.id === id);
    if (!g || !currentUser) return;
    const today = todayISO();
    const existingLog = getTodayLog(id);
    const newChecked = existingLog ? !existingLog.checked : true;
    if (existingLog) {
      existingLog.checked = newChecked;
    } else {
      state.goalLogs.push({ id: null, goal_id: id, user_id: currentUser.id, date: today, checked: newChecked });
    }
    pulse(el); render();
    const { data } = await dbCall(() => sb.from('goal_logs').upsert(
      { user_id: currentUser.id, goal_id: id, date: today, checked: newChecked },
      { onConflict: 'goal_id,date' }
    ).select().single());
    if (data) {
      const localLog = state.goalLogs.find(l => l.goal_id === id && l.date === today);
      if (localLog && !localLog.id) localLog.id = data.id;
    }
  }));

  // delete handlers
  main.querySelectorAll('[data-del-sched]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delSched;
    const day = state.selectedDay;
    state.schedule[day] = (state.schedule[day]||[]).filter(s => s.id !== id);
    render();
    dbCall(() => sb.from('schedule_events').delete().eq('id', id));
  }));

  // schedule edit handlers
  main.querySelectorAll('[data-edit-sched]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editSched;
    const form = document.getElementById('edit-sched-' + id);
    if (!form) return;
    const isOpen = form.classList.contains('open');
    closeAllForms();
    if (!isOpen) form.classList.add('open');
  }));

  main.querySelectorAll('[data-edit-cancel]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.editCancel;
    const form = document.getElementById('edit-sched-' + id);
    if (form) form.classList.remove('open');
  }));

  main.querySelectorAll('[data-edit-save]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.editSave;
    const timeEl  = document.getElementById('f-edit-time-'  + id);
    const titleEl = document.getElementById('f-edit-title-' + id);
    const subEl   = document.getElementById('f-edit-sub-'   + id);
    const alarmEl = document.getElementById('f-edit-alarm-' + id);
    const alarmTimeEl = document.getElementById('f-edit-alarm-time-' + id);
    if (!timeEl || !titleEl) return;
    const newTime  = timeEl.value.trim();
    const newTitle = titleEl.value.trim();
    if (!newTitle) { titleEl.focus(); return; }
    const newSub       = subEl ? subEl.value.trim() : '';
    const alarmEnabled = alarmEl ? alarmEl.checked : false;
    const newAlarmTime = (alarmEnabled && alarmTimeEl) ? alarmTimeEl.value : null;

    const day = state.selectedDay;
    const arr = state.schedule[day] || [];
    const idx = arr.findIndex(s => s.id === id);
    if (idx === -1) return;
    arr[idx] = { ...arr[idx], time: newTime, title: newTitle, sub: newSub, alarm_time: newAlarmTime };

    // update DOM in-place
    const li = document.querySelector(`.sched-item[data-id="${id}"]`);
    if (li) {
      const titleDiv = li.querySelector('.item-title');
      if (titleDiv) titleDiv.innerHTML = escapeHtml(newTitle) + (newAlarmTime ? `<span class="alarm-tag">⏰ ${newAlarmTime}</span>` : '');
      const subDiv = li.querySelector('.item-sub');
      if (newSub) {
        if (subDiv) subDiv.textContent = newSub;
        else {
          const mainDiv = li.querySelector('.item-main');
          if (mainDiv) { const d = document.createElement('div'); d.className = 'item-sub'; d.textContent = newSub; mainDiv.appendChild(d); }
        }
      } else if (subDiv) subDiv.remove();
      const timeDiv = li.querySelector('.time-col');
      if (timeDiv) timeDiv.textContent = newTime;
    }

    const form = document.getElementById('edit-sched-' + id);
    if (form) form.classList.remove('open');

    dbCall(() => sb.from('schedule_events').update({
      time: newTime, title: newTitle, note: newSub, alarm_time: newAlarmTime
    }).eq('id', id));
  }));

  // alarm toggle in edit forms
  main.querySelectorAll('.sched-item [id^="f-edit-alarm-"]').forEach(toggle => {
    const id = toggle.id.replace('f-edit-alarm-', '');
    const timeRow = document.getElementById('edit-alarm-time-row-' + id);
    const alarmTimeInput = document.getElementById('f-edit-alarm-time-' + id);
    const timeInput = document.getElementById('f-edit-time-' + id);
    if (!timeRow) return;
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        timeRow.classList.add('visible');
        if (alarmTimeInput && timeInput && !alarmTimeInput.value) alarmTimeInput.value = timeInput.value;
      } else {
        timeRow.classList.remove('visible');
      }
    });
  });

  main.querySelectorAll('[data-del-goal]').forEach(el => el.addEventListener('click', () => {
    const [k, id] = el.dataset.delGoal.split('|');
    state.goals[k] = state.goals[k].filter(x => x.id !== id);
    render();
    dbCall(() => sb.from('goals').delete().eq('id', id));
  }));

  main.querySelectorAll('[data-edit-goal]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [, id] = el.dataset.editGoal.split('|');
    const form = document.getElementById('edit-goal-' + id);
    if (!form) return;
    const isOpen = form.classList.contains('open');
    closeAllForms();
    if (!isOpen) {
      form.classList.add('open');
      setTimeout(() => form.querySelector('input')?.focus(), 60);
    }
  }));

  main.querySelectorAll('[data-save-goal]').forEach(el => el.addEventListener('click', async () => {
    const [k, id] = el.dataset.saveGoal.split('|');
    const input = document.getElementById('f-goal-' + id);
    if (!input) return;
    const newText = input.value.trim();
    if (!newText) { input.focus(); return; }
    const g = state.goals[k].find(x => x.id === id);
    if (g) g.text = newText;
    const textEl = document.querySelector(`[data-goal-text="${id}"]`);
    if (textEl) textEl.textContent = newText;
    document.getElementById('edit-goal-' + id)?.classList.remove('open');
    dbCall(() => sb.from('goals').update({ text: newText }).eq('id', id));
  }));


  main.querySelectorAll('[data-del-income]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delIncome;
    state.income = state.income.filter(x => x.id !== id);
    render();
    dbCall(() => sb.from('income_entries').delete().eq('id', id));
  }));

  // income edit — open/save
  main.querySelectorAll('[data-edit-income]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editIncome;
    const form = document.getElementById('edit-inc-' + id);
    if (!form) return;
    const isOpen = form.classList.contains('open');
    closeAllForms();
    if (!isOpen) form.classList.add('open');
  }));

  main.querySelectorAll('[data-save-inc]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.saveInc;
    const dateEl   = document.getElementById('f-ei-date-'   + id);
    const sourceEl = document.getElementById('f-ei-source-' + id);
    const amtEl    = document.getElementById('f-ei-amount-' + id);
    if (!sourceEl || !amtEl) return;
    const newDate   = dateEl ? dateEl.value : todayISO();
    const newSource = sourceEl.value.trim();
    const newAmt    = Number(amtEl.value || 0);
    if (!newSource || !newAmt) return;
    const item = state.income.find(x => x.id === id);
    if (item) { item.date = newDate; item.source = newSource; item.amount = newAmt; }
    const li = document.querySelector(`.fin-item[data-id="${id}"]`);
    if (li) {
      const timeDiv  = li.querySelector('.time-col');  if (timeDiv)  timeDiv.textContent  = fmtDate(newDate);
      const titleDiv = li.querySelector('.item-title'); if (titleDiv) titleDiv.textContent = newSource;
      const amtDiv   = li.querySelector('.item-amt');  if (amtDiv)   amtDiv.textContent   = '+' + fmtMoney(newAmt);
    }
    document.getElementById('edit-inc-' + id)?.classList.remove('open');
    dbCall(() => sb.from('income_entries').update({ date: newDate, source: newSource, amount: newAmt }).eq('id', id));
  }));

  main.querySelectorAll('[data-del-spend]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delSpend;
    state.spending = state.spending.filter(x => x.id !== id);
    render();
    dbCall(() => sb.from('spending_entries').delete().eq('id', id));
  }));

  // spending edit — open/save
  main.querySelectorAll('[data-edit-spend]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editSpend;
    const form = document.getElementById('edit-spend-' + id);
    if (!form) return;
    const isOpen = form.classList.contains('open');
    closeAllForms();
    if (!isOpen) form.classList.add('open');
  }));

  main.querySelectorAll('[data-save-spend]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.saveSpend;
    const catEl  = document.getElementById('f-es-cat-'    + id);
    const amtEl  = document.getElementById('f-es-amount-' + id);
    const noteEl = document.getElementById('f-es-note-'   + id);
    const timeEl = document.getElementById('f-es-time-'   + id);
    if (!amtEl) return;
    const newCat  = catEl  ? catEl.value             : 'Other';
    const newAmt  = Number(amtEl.value || 0);
    const newNote = noteEl ? noteEl.value.trim()      : '';
    const newTime = timeEl ? timeEl.value             : '';
    if (!newAmt) return;
    const item = state.spending.find(x => x.id === id);
    if (item) { item.cat = newCat; item.amount = newAmt; item.note = newNote; item.time = newTime; }
    const li = document.querySelector(`.fin-item[data-id="${id}"]`);
    if (li) {
      const titleDiv = li.querySelector('.item-title'); if (titleDiv) titleDiv.textContent = newNote || newCat;
      const subDiv   = li.querySelector('.item-sub');   if (subDiv)   subDiv.textContent   = newCat;
      const amtDiv   = li.querySelector('.item-amt');   if (amtDiv)   amtDiv.textContent   = '−' + fmtMoney(newAmt);
      const timeDiv  = li.querySelector('.time-col');   if (timeDiv && newTime) timeDiv.textContent = newTime;
    }
    document.getElementById('edit-spend-' + id)?.classList.remove('open');
    dbCall(() => sb.from('spending_entries').update({ category: newCat, amount: newAmt, note: newNote, time: newTime }).eq('id', id));
  }));

  // debt delete + edit
  main.querySelectorAll('[data-del-debt]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delDebt;
    state.debts = state.debts.filter(d => d.id !== id);
    render();
    dbCall(() => sb.from('debts').delete().eq('id', id));
  }));

  main.querySelectorAll('[data-edit-debt]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editDebt;
    const form = document.getElementById('edit-debt-' + id);
    if (!form) return;
    const isOpen = form.classList.contains('open');
    closeAllForms();
    if (!isOpen) form.classList.add('open');
  }));

  main.querySelectorAll('[data-save-debt]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.saveDebt;
    const creditorEl = document.getElementById('f-ed-creditor-' + id);
    const amtEl      = document.getElementById('f-ed-amount-'   + id);
    const dueEl      = document.getElementById('f-ed-due-'      + id);
    if (!creditorEl || !amtEl) return;
    const newCreditor = creditorEl.value.trim();
    const newAmt      = Number(amtEl.value || 0);
    const newDue      = dueEl ? dueEl.value : '';
    if (!newCreditor || !newAmt) return;
    const item = state.debts.find(d => d.id === id);
    if (item) { item.creditor = newCreditor; item.amount = newAmt; item.due = newDue; }
    const li = document.querySelector(`.fin-item[data-id="${id}"]`);
    if (li) {
      const titleDiv = li.querySelector('.item-title'); if (titleDiv) titleDiv.textContent = newCreditor;
      const amtDiv   = li.querySelector('.item-amt');   if (amtDiv)   amtDiv.textContent   = fmtMoney(newAmt);
    }
    document.getElementById('edit-debt-' + id)?.classList.remove('open');
    dbCall(() => sb.from('debts').update({ creditor: newCreditor, amount: newAmt, due_date: newDue }).eq('id', id));
  }));

  main.querySelectorAll('[data-pay-debt]').forEach(el => el.addEventListener('click', () => {
    const d = state.debts.find(x => x.id === el.dataset.payDebt);
    if (!d) return;
    d.paid = true;
    render();
    dbCall(() => sb.from('debts').update({ paid: true }).eq('id', d.id));
  }));

  // forms — open / cancel
  main.querySelectorAll('[data-open-form]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllForms();
    document.getElementById(el.dataset.openForm)?.classList.add('open');
    setTimeout(() => document.getElementById(el.dataset.openForm)?.querySelector('input,select,textarea')?.focus(), 60);
  }));
  const addSched = main.querySelector('#add-sched-btn');
  if (addSched) addSched.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllForms();
    document.getElementById('add-sched-form').classList.add('open');
    setTimeout(() => document.getElementById('f-sched-title')?.focus(), 60);
  });

  // alarm toggle show/hide + sync time
  const alarmToggle = main.querySelector('#f-sched-alarm');
  const alarmTimeRow = main.querySelector('#alarm-time-row');
  if (alarmToggle && alarmTimeRow) {
    alarmToggle.addEventListener('change', () => {
      alarmTimeRow.classList.toggle('visible', alarmToggle.checked);
      if (alarmToggle.checked) {
        const t = main.querySelector('#f-sched-time').value;
        if (t) main.querySelector('#f-sched-alarm-time').value = t;
      }
    });
    main.querySelector('#f-sched-time')?.addEventListener('change', () => {
      if (alarmToggle.checked) {
        main.querySelector('#f-sched-alarm-time').value = main.querySelector('#f-sched-time').value;
      }
    });
  }
  main.querySelectorAll('[data-cancel]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById(el.dataset.cancel)?.classList.remove('open');
  }));

  // form saves
  bindFormSaves();


  // ---- NOTES ----
  // list view: delete note card
  main.querySelectorAll('[data-del-note-card]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.delNoteCard;
    const card = el.closest('.note-card');
    if (!card) return;
    state.notes = state.notes.filter(n => n.id !== id);
    if (state.activeNoteId === id) state.activeNoteId = null;
    card.style.transition = 'opacity 200ms ease';
    card.style.opacity = '0';
    setTimeout(() => card.remove(), 200);
    dbCall(() => sb.from('notes').delete().eq('id', id));
  }));

  // list view: relative timestamp refresh
  if (main.querySelector('[data-note-ts]')) {
    notesTimestampIntervalId = setInterval(() => {
      main.querySelectorAll('[data-note-ts]').forEach(el => {
        const note = state.notes.find(n => n.id === el.dataset.noteTs);
        if (note) el.textContent = relativeTime(note.updated_at || note.created_at);
      });
    }, 60000);
  }

  // list view: open note
  main.querySelectorAll('[data-open-note]').forEach(el => el.addEventListener('click', () => {
    state.activeNoteId = el.dataset.openNote;
    render();
  }));

  // list view: new note
  const addNoteBtn = main.querySelector('#add-note-btn');
  if (addNoteBtn) addNoteBtn.addEventListener('click', async () => {
    const now = new Date().toISOString();
    const { data } = await dbCall(() =>
      sb.from('notes').insert({ user_id: currentUser.id, title: '', content: '', updated_at: now }).select().single()
    );
    if (data) {
      state.notes.unshift({ id: data.id, title: '', content: '', created_at: data.created_at, updated_at: data.updated_at || now });
      state.activeNoteId = data.id;
      render();
    }
  });

  // list view: sort dropdown
  const sortBtn = main.querySelector('#notes-sort-btn');
  const sortDd  = main.querySelector('#notes-sort-dd');
  if (sortBtn && sortDd) {
    sortBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sortDd.classList.toggle('open');
      main.querySelector('#notes-filter-dd')?.classList.remove('open');
    });
    sortDd.querySelectorAll('[data-sort]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.notesSort = btn.dataset.sort;
      sortDd.classList.remove('open');
      render();
    }));
  }

  // list view: filter dropdown
  const filterBtn = main.querySelector('#notes-filter-btn');
  const filterDd  = main.querySelector('#notes-filter-dd');
  if (filterBtn && filterDd) {
    filterBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      filterDd.classList.toggle('open');
      main.querySelector('#notes-sort-dd')?.classList.remove('open');
    });
    filterDd.querySelectorAll('[data-filter]').forEach(btn => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.notesFilter = btn.dataset.filter;
      filterDd.classList.remove('open');
      render();
    }));
  }

  // list view: grid/list toggle
  const viewBtn = main.querySelector('#notes-view-btn');
  if (viewBtn) viewBtn.addEventListener('click', () => {
    state.notesDisplay = state.notesDisplay === 'grid' ? 'list' : 'grid';
    render();
  });

  // editor: back
  const noteBackBtn = main.querySelector('#note-back-btn');
  if (noteBackBtn) noteBackBtn.addEventListener('click', () => {
    state.activeNoteId = null;
    render();
  });

  // editor: delete
  const noteDelBtn = main.querySelector('#note-del-btn');
  if (noteDelBtn) noteDelBtn.addEventListener('click', () => {
    const id = state.activeNoteId;
    state.notes = state.notes.filter(n => n.id !== id);
    state.activeNoteId = null;
    render();
    dbCall(() => sb.from('notes').delete().eq('id', id));
  });

  // editor: autosave (title + content, debounced 1000ms)
  const noteTitleEl   = main.querySelector('#note-title');
  const noteContentEl = main.querySelector('#note-content');
  const noteSavedLbl  = main.querySelector('#note-saved-lbl');
  let noteSaveTimer = null;
  const triggerNoteSave = () => {
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(async () => {
      const id = state.activeNoteId;
      if (!id) return;
      const n = state.notes.find(x => x.id === id);
      if (!n || !noteTitleEl || !noteContentEl) return;
      n.title = noteTitleEl.value;
      const contentClone = noteContentEl.cloneNode(true);
      contentClone.querySelectorAll('.hd-toggle').forEach(t => t.remove());
      n.content = contentClone.innerHTML;
      n.updated_at = new Date().toISOString();
      if (noteSavedLbl) {
        noteSavedLbl.classList.add('show');
        setTimeout(() => noteSavedLbl.classList.remove('show'), 2000);
      }
      await dbCall(() => sb.from('notes').update({
        title: n.title, content: n.content, updated_at: n.updated_at
      }).eq('id', id));
    }, 1000);
  };
  if (noteTitleEl)   noteTitleEl.addEventListener('input', triggerNoteSave);
  if (noteContentEl) noteContentEl.addEventListener('input', triggerNoteSave);

  // editor: toolbar
  const updateTbState = () => {
    if (!noteContentEl) return;
    const isBold   = document.queryCommandState('bold');
    const isItalic = document.queryCommandState('italic');
    const isList   = document.queryCommandState('insertUnorderedList');
    const block    = (document.queryCommandValue('formatBlock') || '').toLowerCase().trim();
    main.querySelectorAll('.tb-btn').forEach(btn => {
      const cmd = btn.dataset.cmd, val = btn.dataset.val;
      if (!cmd) return;
      let on = false;
      if (cmd === 'bold')                on = isBold;
      else if (cmd === 'italic')         on = isItalic;
      else if (cmd === 'insertUnorderedList') on = isList;
      else if (cmd === 'formatBlock') {
        if (val === 'p') on = !block || block === 'p' || block === 'div' || block === 'normal';
        else on = block === val;
      }
      btn.classList.toggle('tb-active', on);
    });
  };
  main.querySelectorAll('.tb-btn').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep contenteditable focus
      if (!noteContentEl) return;
      const cmd = btn.dataset.cmd;
      const val = btn.dataset.val || null;
      if (!cmd) return;
      document.execCommand(cmd, false, val);
      setTimeout(updateTbState, 10);
      triggerNoteSave();
    });
  });
  if (noteContentEl) {
    noteContentEl.addEventListener('keyup',   updateTbState);
    noteContentEl.addEventListener('mouseup', updateTbState);
    noteContentEl.addEventListener('focus',   updateTbState);
    // focus the editor on load if content is empty
    if (!noteContentEl.innerHTML.trim()) setTimeout(() => noteContentEl.focus(), 80);
    // collapsible headings
    setTimeout(() => initHeadingCollapse(noteContentEl), 50);
  }
}

function bindFormSaves() {
  // schedule
  const schedSave = main.querySelector('#f-sched-save');
  if (schedSave) schedSave.addEventListener('click', async () => {
    const time = main.querySelector('#f-sched-time').value || '09:00';
    const title = main.querySelector('#f-sched-title').value.trim();
    const sub = main.querySelector('#f-sched-sub').value.trim();
    if (!title) return;
    const day = state.selectedDay || todayISO();
    const alarmOn = main.querySelector('#f-sched-alarm')?.checked;
    const alarm_time = alarmOn ? (main.querySelector('#f-sched-alarm-time')?.value || time) : null;
    const { data } = await dbCall(() => sb.from('schedule_events').insert({ user_id: currentUser.id, date: day, time, title, note: sub, alarm_time }).select().single());
    if (data) {
      if (!state.schedule[day]) state.schedule[day] = [];
      state.schedule[day].push({ id: data.id, time, title, sub, alarm_time });
      state.schedule[day].sort((a,b) => a.time.localeCompare(b.time));
      render();
    }
  });

  // goals
  main.querySelectorAll('[data-goal-save]').forEach(btn => btn.addEventListener('click', async () => {
    const k = btn.dataset.goalSave;
    const input = main.querySelector(`[data-goal-input="${k}"]`);
    const text = input?.value.trim();
    if (!text) return;
    const type = k === 'dos' ? 'do' : 'dont';
    const { data } = await dbCall(() => sb.from('goals').insert({ user_id: currentUser.id, type, text }).select().single());
    if (data) { state.goals[k].push({ id: data.id, text }); render(); }
  }));

  // add new project
  const newProj = main.querySelector('#f-proj-save');
  if (newProj) newProj.addEventListener('click', async () => {
    const name     = main.querySelector('#f-proj-name')?.value.trim();
    const status   = main.querySelector('#f-proj-status')?.value || 'active';
    const deadline = main.querySelector('#f-proj-deadline')?.value || null;
    if (!name) { main.querySelector('#f-proj-name')?.focus(); return; }
    const now = new Date().toISOString();
    const { data } = await dbCall(() => sb.from('projects').insert({ user_id: currentUser.id, name, status, deadline: deadline || null, updated_at: now }).select().single());
    if (data) {
      state.projects.push({ id: data.id, name, status, deadline: data.deadline, tasks: [] });
      render();
    }
  });

  // income
  const inc = main.querySelector('#f-inc-save');
  if (inc) inc.addEventListener('click', async () => {
    const source = main.querySelector('#f-inc-source').value.trim();
    const amount = Number(main.querySelector('#f-inc-amount').value || 0);
    const date = main.querySelector('#f-inc-date').value || todayISO();
    if (!source || !amount) return;
    const { data } = await dbCall(() => sb.from('income_entries').insert({ user_id: currentUser.id, date, source, amount }).select().single());
    if (data) { state.income.unshift({ id: data.id, date, source, amount }); render(); }
  });

  // spending
  const sp = main.querySelector('#f-sp-save');
  if (sp) sp.addEventListener('click', async () => {
    const cat = main.querySelector('#f-sp-cat').value;
    const amount = Number(main.querySelector('#f-sp-amount').value || 0);
    const note = main.querySelector('#f-sp-note').value.trim();
    if (!amount) return;
    const t = new Date();
    const time = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
    const date = todayISO();
    const { data } = await dbCall(() => sb.from('spending_entries').insert({ user_id: currentUser.id, date, time, category: cat, note, amount }).select().single());
    if (data) { state.spending.unshift({ id: data.id, date, time, cat, note, amount }); render(); }
  });

  // debt
  const db = main.querySelector('#f-debt-save');
  if (db) db.addEventListener('click', async () => {
    const creditor = main.querySelector('#f-debt-creditor').value.trim();
    const amount = Number(main.querySelector('#f-debt-amount').value || 0);
    const due = main.querySelector('#f-debt-due').value || todayISO();
    if (!creditor || !amount) return;
    const { data } = await dbCall(() => sb.from('debts').insert({ user_id: currentUser.id, creditor, amount, due_date: due, paid: false }).select().single());
    if (data) { state.debts.push({ id: data.id, creditor, amount, due, paid: false }); render(); }
  });
}

function pulse(el) {
  el.classList.remove('pulse');
  void el.offsetWidth;
  el.classList.add('pulse');
}
function closeAllForms() {
  document.querySelectorAll('.inline-form.open').forEach(f => f.classList.remove('open'));
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.inline-form.open').forEach(f => {
    if (!f.contains(e.target) && !e.target.closest('[data-open-form], #add-sched-btn')) {
      f.classList.remove('open');
    }
  });
  document.querySelectorAll('.notes-dropdown.open').forEach(dd => {
    if (!dd.contains(e.target) && !e.target.closest('#notes-sort-btn, #notes-filter-btn')) {
      dd.classList.remove('open');
    }
  });
});

/* =========================================================
   ALARMS
========================================================= */
function playAlarmBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.value = 440;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => ctx.close();
  } catch (e) {}
}

function fireAlarm(ev) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('HQ — ' + ev.title, {
      body: 'Scheduled for ' + ev.time,
      icon: '/icon-192.png'
    });
  }
  playAlarmBeep();
}

function checkAlarms() {
  const today = todayISO();
  const events = state.schedule[today] || [];
  if (!events.length) return;
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

/* =========================================================
   TWEAKS PANEL
========================================================= */
const tweaksEl = document.getElementById('tweaks-panel');
function toggleTweaks() { tweaksEl.classList.toggle('open'); }

document.getElementById('tweaks-close').addEventListener('click', () => tweaksEl.classList.remove('open'));

function setTweak(key, value) {
  window.__HQ_TWEAKS[key] = value;
  applyTweaks();
  if (key === 'name') {
    state.profile.name = value;
    if (currentUser) dbCall(() => sb.from('profiles').update({ name: value }).eq('id', currentUser.id));
  }
  render();
  syncTweaksUI();
}

function syncTweaksUI() {
  const tw = window.__HQ_TWEAKS;
  const twName = document.getElementById('tw-name');
  const twCurr = document.getElementById('tw-currency');
  if (twName) twName.value = tw.name || '';
  if (twCurr) twCurr.value = tw.currencyPrefix || '$';
  document.querySelectorAll('#tw-swatches .sw').forEach(s => s.classList.toggle('active', s.dataset.c === tw.accent));
  document.querySelectorAll('#tw-density button').forEach(b => b.classList.toggle('active', b.dataset.v === tw.density));
  document.querySelectorAll('#tw-weight button').forEach(b => b.classList.toggle('active', String(b.dataset.v) === String(tw.numberWeight)));
  document.querySelectorAll('#tw-home button').forEach(b => b.classList.toggle('active', b.dataset.v === tw.homeLayout));
  document.querySelectorAll('#tw-pills button').forEach(b => b.classList.toggle('active', String(b.dataset.v) === String(tw.showQuickPills)));
}

document.getElementById('tw-name').addEventListener('input', (e) => setTweak('name', e.target.value));
document.getElementById('tw-currency').addEventListener('input', (e) => setTweak('currencyPrefix', e.target.value));
document.querySelectorAll('#tw-swatches .sw').forEach(s => s.addEventListener('click', () => setTweak('accent', s.dataset.c)));
document.querySelectorAll('#tw-density button').forEach(b => b.addEventListener('click', () => setTweak('density', b.dataset.v)));
document.querySelectorAll('#tw-weight button').forEach(b => b.addEventListener('click', () => setTweak('numberWeight', Number(b.dataset.v))));
document.querySelectorAll('#tw-home button').forEach(b => b.addEventListener('click', () => setTweak('homeLayout', b.dataset.v)));
document.querySelectorAll('#tw-pills button').forEach(b => b.addEventListener('click', () => setTweak('showQuickPills', b.dataset.v === 'true')));

window.addEventListener('message', (e) => {
  const d = e.data || {};
  if (d.type === '__activate_edit_mode') tweaksEl.classList.add('open');
  if (d.type === '__deactivate_edit_mode') tweaksEl.classList.remove('open');
});
window.parent.postMessage({ type: '__edit_mode_available' }, '*');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
