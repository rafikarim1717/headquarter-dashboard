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
  commitPreviewTab: 'weekly',
  incomePage: 1,
  spendingFilter: 'daily',
  spendingPickedDate: null,
  spendingPage: 1,
  debtsPage: 1,
  incomeFilter: 'month',
  incomePickedDate: null
};

/* =========================================================
   AMBIENT MUSIC
========================================================= */
const AMBIENT_STREAMS = [
  { url: 'https://streams.ilovemusic.de/iloveradio17.mp3', name: 'iLove Radio' },
  { url: 'https://usa9.fastcast4u.com/proxy/jamz?mp=/1',  name: 'Jamz Radio'  },
  { url: 'https://lofi.stream.laut.fm/lofi',               name: 'Lo-Fi Radio' }
];
const ambientPlayer = { audio: null, isPlaying: false, currentIdx: 0 };

function updateMusicBtn(playing) {
  const btn      = document.getElementById('music-toggle');
  const eq       = document.getElementById('eq-bars');
  const noteIcon = document.getElementById('music-note-icon');
  const label    = document.getElementById('music-label');
  if (btn)      btn.classList.toggle('playing', playing);
  if (eq)       eq.style.display = playing ? 'inline-flex' : 'none';
  if (noteIcon) noteIcon.style.display = playing ? 'none' : '';
  if (label) {
    label.textContent = playing ? AMBIENT_STREAMS[ambientPlayer.currentIdx].name : '';
    label.classList.toggle('playing', playing);
  }
}

function tryAmbientStream(idx) {
  if (idx >= AMBIENT_STREAMS.length) {
    showToast('No stream available right now');
    ambientPlayer.isPlaying = false;
    updateMusicBtn(false);
    return;
  }
  if (ambientPlayer.audio) { ambientPlayer.audio.pause(); ambientPlayer.audio = null; }
  const audio = new Audio(AMBIENT_STREAMS[idx].url);
  audio.crossOrigin = 'anonymous';
  audio.volume = 0.4;
  ambientPlayer.audio = audio;
  ambientPlayer.currentIdx = idx;
  audio.addEventListener('error', () => tryAmbientStream(idx + 1), { once: true });
  audio.play()
    .then(() => { ambientPlayer.isPlaying = true; updateMusicBtn(true); })
    .catch(() => tryAmbientStream(idx + 1));
}

function toggleAmbientMusic() {
  if (ambientPlayer.isPlaying) {
    ambientPlayer.audio?.pause();
    ambientPlayer.isPlaying = false;
    updateMusicBtn(false);
  } else if (ambientPlayer.audio) {
    ambientPlayer.audio.play()
      .then(() => { ambientPlayer.isPlaying = true; updateMusicBtn(true); })
      .catch(() => { ambientPlayer.audio = null; tryAmbientStream(0); });
  } else {
    tryAmbientStream(0);
  }
}

/* =========================================================
   MODAL SYSTEM
========================================================= */
function showModal({ title, fieldsHtml, saveLabel = 'Save', onSave, onShown }) {
  const overlay = document.getElementById('hq-modal-overlay');
  if (!overlay) return;
  overlay.querySelector('.hq-modal-title').textContent = title;
  const body = overlay.querySelector('.hq-modal-body');
  body.innerHTML = fieldsHtml;
  const saveBtn = overlay.querySelector('.hq-modal-save');
  saveBtn.textContent = saveLabel;
  saveBtn.onclick = () => onSave(body);
  overlay.classList.add('open');
  setTimeout(() => {
    const first = body.querySelector('input:not([type=checkbox]):not([type=date]):not([type=time]), select');
    if (first) first.focus();
    if (onShown) onShown(body);
  }, 60);
}
function hideModal() {
  document.getElementById('hq-modal-overlay')?.classList.remove('open');
}
function showConfirmModal({ title, message, confirmLabel = 'Delete', onConfirm, danger = true }) {
  const overlay = document.getElementById('hq-confirm-overlay');
  if (!overlay) return;
  overlay.querySelector('.hq-confirm-title').textContent = title;
  overlay.querySelector('.hq-confirm-msg').textContent = message;
  const btn       = overlay.querySelector('.hq-confirm-btn');
  const cancelBtn = overlay.querySelector('.hq-confirm-cancel');
  btn.textContent = confirmLabel;
  btn.style.background = danger ? '#c0392b' : 'var(--accent)';
  btn.style.color = danger ? '#fff' : '#111';

  function close() { hideConfirmModal(); document.removeEventListener('keydown', escHandler); }
  function escHandler(e) {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      close(); onConfirm();
    }
  }

  btn.onclick       = () => { close(); onConfirm(); };
  cancelBtn.onclick = (e) => { e.stopPropagation(); close(); };
  overlay.onclick   = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', escHandler);

  overlay.classList.add('open');
}
function hideConfirmModal() {
  document.getElementById('hq-confirm-overlay')?.classList.remove('open');
}

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
        description: '',
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
        description: '',
        status: 'active',
        deadline: null,
        tasks: [
          { text: 'Finish online course', description: 'Chapter 4–8 remaining', checked: false },
          { text: 'Weekly review habit', description: '', checked: false }
        ]
      },
      {
        name: 'Side Business',
        description: '',
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
  const musicNoteSvg = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" width="16" height="16"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9l10.5-3m0 6c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3zM9 15c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z"/></svg>`;
  return `
    <header class="topbar">
      <div class="greet">
        <div class="hello">${greeting()}, <span style="color:var(--text)">${escapeHtml(name)}</span></div>
        <div class="date">${todayLabel()} &bull; <span id="live-clock">${fmtClock()}</span></div>
      </div>
      <div class="right">
        <button class="mobile-signout-btn" id="topbar-logout-btn" aria-label="Sign out">${signOutSvg}</button>
        <span id="music-label" class="${ambientPlayer.isPlaying ? 'playing' : ''}">${ambientPlayer.isPlaying ? AMBIENT_STREAMS[ambientPlayer.currentIdx].name : ''}</span><button class="icon-btn music-btn${ambientPlayer.isPlaying ? ' playing' : ''}" id="music-toggle" title="Ambient music" aria-label="Ambient music"><span id="music-note-icon" style="${ambientPlayer.isPlaying ? 'display:none' : ''}">${musicNoteSvg}</span><span class="eq-bars" id="eq-bars" style="${ambientPlayer.isPlaying ? 'display:inline-flex' : 'display:none'}"><span class="eq-bar b1"></span><span class="eq-bar b2"></span><span class="eq-bar b3"></span></span></button>
        <button class="icon-btn" id="open-tweaks" title="Tweaks" aria-label="Tweaks">&#x2699;&#xFE0E;</button>
      </div>
    </header>
    <div class="mobile-sub-nav">${pillsHtml}</div>`;
}

/* ---- shared SVG icons ---- */
const ICON_PENCIL  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125"/></svg>`;
const ICON_TRASH   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>`;
const ICON_CHECK   = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.75l6 6 9-13.5"/></svg>`;
const ICON_XCIRCLE = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
const ICON_CHEV_L  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>`;
const ICON_CHEV_R  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>`;
const ICON_UNDO    = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"/></svg>`;

function paginationHtml(page, total, prevAttr, nextAttr) {
  if (total <= 1) return '';
  return `<div class="pagination">
      <button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-${prevAttr}>${ICON_CHEV_L}</button>
      <span class="page-indicator">${page} / ${total}</span>
      <button class="page-btn" ${page >= total ? 'disabled' : ''} data-${nextAttr}>${ICON_CHEV_R}</button>
    </div>`;
}

/* ---- LIFE: HOME ---- */
function renderLifeHome() {
  const today = todayISO();
  const sched = (state.schedule[today] || []).slice(0, 5);
  const layout = window.__HQ_TWEAKS.homeLayout;
  const showPills = String(window.__HQ_TWEAKS.showQuickPills) === 'true' || window.__HQ_TWEAKS.showQuickPills === true;

  const score = computeDailyScore();
  const _allGoalsHome = [...(state.goals.dos || []), ...(state.goals.donts || [])];
  const _totalGoalsHome = _allGoalsHome.length;
  const scoreColor = score >= 70 ? 'var(--accent)' : score >= 40 ? '#c8a850' : 'var(--danger)';
  const scoreBlock = `
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">Daily score</div>
      ${_totalGoalsHome === 0
        ? `<div style="font-size:13px;color:var(--text-faint);margin-top:12px">Add commitments to start tracking</div>`
        : `<div style="display:flex;align-items:baseline;gap:8px;margin-top:4px">
            <div class="num" data-target="${score}" style="font-size:48px;font-weight:var(--num-weight,200);color:${scoreColor};font-variant-numeric:tabular-nums;line-height:1">0</div>
            <div style="font-size:16px;color:var(--text-faint)">/100</div>
          </div>`
      }
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
              return `<li class="list-item" style="padding:8px 0;gap:10px;min-height:44px">
                <span class="check ${isChecked ? 'checked' : ''}" data-toggle-today-goal="${g.id}" style="flex-shrink:0"></span>
                <span class="commit-type-pill ${isDo ? 'do' : 'dont'}">${isDo ? 'DO' : 'DONT'}</span>
                <span class="check-label ${isChecked ? 'done' : ''}" style="flex:1" id="today-commit-text-${g.id}">${escapeHtml(g.text)}</span>
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
    <div class="card" style="animation-delay:${delay}ms;cursor:pointer" data-go="life:projects">
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
          </li>`).join('') || `<li class="list-item"><div class="item-sub">No events. Add one below.</div></li>`}
      </ul>
      <button class="add-btn" id="add-sched-btn" style="margin-top:14px"><span class="plus">+</span> Add event</button>
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
  const allGoals = [...(state.goals.dos || []), ...(state.goals.donts || [])];
  const totalGoals = allGoals.length;
  if (!totalGoals) return 0;
  const checkedToday = allGoals.filter(g => getTodayLog(g.id)?.checked).length;
  return Math.round((checkedToday / totalGoals) * 100);
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
            </li>`;
          }).join('')}
        </ul>
        <button class="add-btn" data-modal-add="goal-${key}" style="margin-top:14px"><span class="plus">+</span> Add</button>
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
      ${p.description ? `<div class="proj-desc">${escapeHtml(p.description.length > 120 ? p.description.slice(0, 120) + '...' : p.description)}</div>` : ''}
      ${totalTasks > 0 ? `
        <div class="proj-progress">
          <div class="proj-progress-meta">
            <span>${doneTasks} / ${totalTasks} tasks done</span>
            <span>${pct}%</span>
          </div>
          <div class="progress"><div class="bar" style="width:${pct}%"></div></div>
        </div>
      ` : ''}
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
              </li>
            `).join('')}
          </ul>
          <button class="add-btn" data-modal-add="proj-task" data-proj-id="${p.id}" style="margin-top:10px"><span class="plus">+</span> Add task</button>
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
      <button class="add-btn-inline" data-modal-add="project">+ New Project</button>
    </div>
    <div class="pills" style="margin: 14px 0 18px">
      ${['all','active','on_hold','done'].map(f =>
        `<button class="pill${filter===f?' active':''}" data-proj-filter="${f}">${filterLabels[f]}</button>`
      ).join('')}
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
        const previewText = preview.length > 100 ? preview.slice(0, 100) + '...' : preview;
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
      <div class="tb-sep"></div>
      <button class="tb-btn" id="tb-table-btn" title="Insert table">⊞</button>
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

/* ---- NOTE TABLE HELPERS ---- */
function buildNoteTableHTML(headers, rows) {
  const ths = headers.map(h => `<th contenteditable="true">${escapeHtml(h)}</th>`).join('');
  const trs = rows.map(row =>
    `<tr>${row.map(c => `<td contenteditable="true">${escapeHtml(c)}</td>`).join('')}</tr>`
  ).join('');
  return `<div class="note-table-wrapper"><table class="note-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table></div><p><br></p>`;
}

function addDeleteRowBtn(tr, saveCallback) {
  if (tr.querySelector('.delete-row-btn')) return;
  const lastTd = tr.cells[tr.cells.length - 1];
  if (!lastTd) return;
  const btn = document.createElement('button');
  btn.className = 'delete-row-btn';
  btn.contentEditable = 'false';
  btn.textContent = '×';
  btn.title = 'Delete row';
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const tbody = tr.closest('tbody');
    if (!tbody) return;
    if (tbody.querySelectorAll('tr').length <= 1) { showToast('Cannot delete the only row'); return; }
    tr.remove();
    if (saveCallback) saveCallback();
  });
  lastTd.appendChild(btn);
}

function initTableInteractions(editorEl, saveCallback) {
  editorEl.querySelectorAll('.note-table-wrapper').forEach(wrapper => {
    // Wrap in .table-wrapper if not already done
    if (!wrapper.parentElement || !wrapper.parentElement.classList.contains('table-wrapper')) {
      const outer = document.createElement('div');
      outer.className = 'table-wrapper';
      wrapper.parentNode.insertBefore(outer, wrapper);
      outer.appendChild(wrapper);
    }
    const tableWrapper = wrapper.parentElement;

    // Add delete-table-btn
    if (!tableWrapper.querySelector('.delete-table-btn')) {
      const delTableBtn = document.createElement('button');
      delTableBtn.className = 'delete-table-btn';
      delTableBtn.contentEditable = 'false';
      delTableBtn.textContent = '🗑 Delete table';
      delTableBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        showConfirmModal({
          title: 'Delete Table?',
          message: 'This will permanently remove the entire table from your note.',
          confirmLabel: 'Delete',
          danger: true,
          onConfirm: () => { tableWrapper.remove(); if (saveCallback) saveCallback(); }
        });
      });
      tableWrapper.appendChild(delTableBtn);
    }

    // Add table toolbar (add-row + add-col)
    if (!tableWrapper.querySelector('.table-toolbar')) {
      const toolbar = document.createElement('div');
      toolbar.className = 'table-toolbar';
      toolbar.contentEditable = 'false';

      const addRowBtn = document.createElement('button');
      addRowBtn.className = 'tbl-btn';
      addRowBtn.contentEditable = 'false';
      addRowBtn.textContent = '+ Add row';
      addRowBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const table = wrapper.querySelector('table');
        if (!table) return;
        const tbody = table.querySelector('tbody');
        const colCount = table.rows[0]?.cells.length || 3;
        const newRow = document.createElement('tr');
        for (let i = 0; i < colCount; i++) {
          const td = document.createElement('td');
          td.contentEditable = 'true';
          newRow.appendChild(td);
        }
        tbody.appendChild(newRow);
        addDeleteRowBtn(newRow, saveCallback);
        newRow.cells[0].focus();
        if (saveCallback) saveCallback();
      });

      const addColBtn = document.createElement('button');
      addColBtn.className = 'tbl-btn';
      addColBtn.contentEditable = 'false';
      addColBtn.textContent = '+ Add col';
      addColBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const table = wrapper.querySelector('table');
        if (!table) return;
        const thead = table.querySelector('thead');
        if (thead) {
          thead.querySelectorAll('tr').forEach(tr => {
            const th = document.createElement('th');
            th.contentEditable = 'true';
            tr.appendChild(th);
          });
        }
        const tbody = table.querySelector('tbody');
        if (tbody) {
          tbody.querySelectorAll('tr').forEach(tr => {
            const existingBtn = tr.querySelector('.delete-row-btn');
            if (existingBtn) existingBtn.remove();
            const td = document.createElement('td');
            td.contentEditable = 'true';
            tr.appendChild(td);
            addDeleteRowBtn(tr, saveCallback);
          });
        }
        if (saveCallback) saveCallback();
      });

      toolbar.appendChild(addRowBtn);
      toolbar.appendChild(addColBtn);
      tableWrapper.appendChild(toolbar);
    }

    // Add delete-row-btn to existing tbody rows
    const tbody = wrapper.querySelector('tbody');
    if (tbody) tbody.querySelectorAll('tr').forEach(tr => addDeleteRowBtn(tr, saveCallback));
  });
}

function convertPastedTable(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const tables = tmp.querySelectorAll('table');
  if (!tables.length) return '';
  let result = '';
  tables.forEach(table => {
    const headers = [];
    const rows = [];
    const thead = table.querySelector('thead');
    if (thead) {
      const headerRow = thead.querySelector('tr');
      if (headerRow) {
        Array.from(headerRow.querySelectorAll('th, td')).forEach(cell => {
          headers.push(cell.textContent.trim());
        });
      }
    }
    const allBodyRows = Array.from(table.querySelectorAll('tr'))
      .filter(row => !row.closest('thead'));
    allBodyRows.forEach((row, i) => {
      if (!thead && i === 0) {
        Array.from(row.querySelectorAll('th, td')).forEach(cell => {
          headers.push(cell.textContent.trim());
        });
        return;
      }
      const cells = Array.from(row.querySelectorAll('th, td')).map(c => c.textContent.trim());
      if (cells.length) rows.push(cells);
    });
    if (!headers.length) return;
    result += buildNoteTableHTML(headers, rows);
  });
  return result;
}

function convertMarkdownTable(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.includes('|'));
  if (!lines.length) return '';
  const parseRow = line => line.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
  const isSep    = line => /^[\|\s\-:]+$/.test(line);
  const headers  = parseRow(lines[0]);
  const dataStart = lines.length > 1 && isSep(lines[1]) ? 2 : 1;
  const rows = lines.slice(dataStart).filter(l => !isSep(l)).map(parseRow);
  if (!headers.length) return '';
  return buildNoteTableHTML(headers, rows);
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
  const unpaidDebts = state.debts.filter(d => !d.paid);
  const overdueDebts = unpaidDebts.filter(d => daysUntil(d.due) < 0);
  const urgentDebts  = unpaidDebts.filter(d => { const n = daysUntil(d.due); return n >= 0 && n <= 7; });
  const alertParts = [];
  if (overdueDebts.length > 0) {
    alertParts.push(`<div class="alert"><span class="glyph">⚠</span> ${overdueDebts.length} debt${overdueDebts.length === 1 ? '' : 's'} overdue</div>`);
  }
  if (urgentDebts.length > 0) {
    const todayDebts  = urgentDebts.filter(d => daysUntil(d.due) === 0);
    const futureDebts = urgentDebts.filter(d => daysUntil(d.due) > 0);
    let urgentMsg;
    if (todayDebts.length === 1) {
      urgentMsg = `Debt due today: ${escapeHtml(todayDebts[0].creditor)}`;
    } else if (todayDebts.length > 1) {
      urgentMsg = `${todayDebts.length} debts due today`;
    } else if (futureDebts.length === 1) {
      const n = daysUntil(futureDebts[0].due);
      urgentMsg = `Debt due in ${n} day${n === 1 ? '' : 's'}: ${escapeHtml(futureDebts[0].creditor)}`;
    } else {
      urgentMsg = `${urgentDebts.length} debts due within 7 days`;
    }
    alertParts.push(`<div class="alert"><span class="glyph">⚠</span> ${urgentMsg}</div>`);
  }
  const alertsHtml = alertParts.length
    ? `<div style="margin-top:18px; display:flex; flex-direction:column; gap:8px;">${alertParts.join('')}</div>`
    : '';
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
    ${alertsHtml}
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
  const today      = todayISO();
  const ym         = ymLocal(new Date());
  const yy         = today.slice(0, 4);
  const filter     = state.incomeFilter || 'month';
  const pickedDate = state.incomePickedDate || null;
  const pfx        = window.__HQ_TWEAKS.currencyPrefix || '$';

  let filteredIncome;
  if (pickedDate) {
    filteredIncome = state.income.filter(i => i.date === pickedDate);
  } else if (filter === 'month') {
    filteredIncome = state.income.filter(i => (i.date || '').startsWith(ym));
  } else if (filter === 'year') {
    filteredIncome = state.income.filter(i => (i.date || '').startsWith(yy));
  } else {
    filteredIncome = state.income.slice();
  }

  const total = filteredIncome.reduce((s, i) => s + Number(i.amount || 0), 0);
  const count = filteredIncome.length;
  const avg   = count ? Math.round(total / count) : 0;
  const cardLabel = pickedDate
    ? `On ${fmtDate(pickedDate)}`
    : ({ month: 'This Month', year: 'This Year', all: 'All Time' }[filter]);

  const items      = filteredIncome.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const PAGE_SIZE  = 7;
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  state.incomePage = Math.min(state.incomePage || 1, totalPages);
  const page       = state.incomePage;
  const pageItems  = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return `
    ${topbar()}
    <h1 class="page-title">Income</h1>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">${cardLabel}</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${total}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="sub" style="color:var(--text-faint); margin-top:6px;">${count} entr${count === 1 ? 'y' : 'ies'} · avg ${fmtMoney(avg)}</div>
      <div class="spend-filters">
        <div class="spend-filter-tabs">
          ${['month','year','all'].map(f =>
            `<button class="pill${!pickedDate && filter === f ? ' active' : ''}" data-income-filter="${f}">${{month:'This Month',year:'This Year',all:'All Time'}[f]}</button>`
          ).join('')}
        </div>
        <div class="spend-date-wrap">
          <span class="spend-date-label">Jump to date</span>
          <input type="date" id="income-date-input" class="spend-date-input" value="${pickedDate || ''}"/>
          ${pickedDate ? `<button id="income-date-clear" class="spend-date-clear" title="Clear">×</button>` : ''}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:60ms">
      <div class="section-title" style="margin-top:0">Log</div>
      <ul class="list">
        ${pageItems.map(i => `
          <li class="fin-item" data-id="${i.id}">
            <div class="fin-row">
              <div class="fin-row-left">
                <div class="fin-row-line1">
                  <span class="fin-row-title">${escapeHtml(i.source)}</span>
                </div>
                <div class="fin-row-time">${fmtDate(i.date)}</div>
              </div>
              <div class="fin-row-right">
                <div class="fin-acts">
                  <button class="fin-edit-btn" data-edit-income="${i.id}" title="Edit">${ICON_PENCIL}</button>
                  <button class="fin-del-btn" data-del-income="${i.id}" title="Delete">${ICON_TRASH}</button>
                </div>
                <div class="fin-row-amt income">+${fmtMoney(i.amount)}</div>
              </div>
            </div>
          </li>`).join('') || `<li class="list-item"><div class="item-sub">No income yet.</div></li>`}
      </ul>
      <button class="add-btn" data-modal-add="income" style="margin-top:14px"><span class="plus">+</span> Log income</button>
    </div>
  `;
}

/* ---- FINANCE: SPENDING ---- */
function renderSpending() {
  const today = todayISO();
  const filter = state.spendingFilter || 'daily';
  const pickedDate = state.spendingPickedDate || null;
  const cats = ['Food','Transport','Shopping','Other'];
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';

  // filtered set for stats + recent log
  let filteredSpending;
  if (pickedDate) {
    filteredSpending = state.spending.filter(s => s.date === pickedDate);
  } else if (filter === 'daily') {
    filteredSpending = state.spending.filter(s => s.date === today);
  } else if (filter === 'weekly') {
    const now = new Date(); const dow = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1)); mon.setHours(0,0,0,0);
    const monISO = isoLocal(mon);
    filteredSpending = state.spending.filter(s => s.date >= monISO && s.date <= today);
  } else {
    const firstISO = today.slice(0,7) + '-01';
    filteredSpending = state.spending.filter(s => s.date >= firstISO && s.date <= today);
  }

  const total = filteredSpending.reduce((s,x) => s+Number(x.amount||0), 0);
  const byCat = Object.fromEntries(cats.map(c => [c, filteredSpending.filter(s=>s.cat===c).reduce((s,x)=>s+Number(x.amount||0),0)]));
  const totalLabel = pickedDate
    ? `Total on ${fmtDate(pickedDate)}`
    : ({daily:"Today's total", weekly:"This week's total", monthly:"This month's total"}[filter]);

  const recent = filteredSpending.slice().sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const PAGE_SIZE = 7;
  const totalPages = Math.max(1, Math.ceil(recent.length / PAGE_SIZE));
  state.spendingPage = Math.min(state.spendingPage || 1, totalPages);
  const page = state.spendingPage;
  const pageItems = recent.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);

  return `
    ${topbar()}
    <h1 class="page-title">Spending</h1>
    <div class="card" style="animation-delay:0ms">
      <div class="section-title" style="margin-top:0">${totalLabel}</div>
      <div class="num" style="font-size:42px; font-weight:300; letter-spacing:-0.02em;" data-target="${total}" data-prefix="${pfx}">${fmtMoney(0)}</div>
      <div class="pills" style="margin-top:16px">
        ${cats.map(c => `<span class="pill cat">${c}<span class="amt">${fmtMoney(byCat[c])}</span></span>`).join('')}
      </div>
      <div class="spend-filters">
        <div class="spend-filter-tabs">
          ${['daily','weekly','monthly'].map(f => `<button class="pill${!pickedDate && filter===f?' active':''}" data-spend-filter="${f}">${{daily:'Daily',weekly:'Weekly',monthly:'Monthly'}[f]}</button>`).join('')}
        </div>
        <div class="spend-date-wrap">
          <span class="spend-date-label">Jump to date</span>
          <input type="date" id="spend-date-input" class="spend-date-input" value="${pickedDate||''}"/>
          ${pickedDate ? `<button id="spend-date-clear" class="spend-date-clear" title="Clear">×</button>` : ''}
        </div>
      </div>
    </div>
    <div class="card" style="margin-top:16px; animation-delay:80ms">
      <div class="section-title" style="margin-top:0">Recent</div>
      <ul class="list">
        ${pageItems.map(s => `
          <li class="fin-item" data-id="${s.id}">
            <div class="fin-row">
              <div class="fin-row-left">
                <div class="fin-row-line1">
                  <span class="fin-cat-pill">${escapeHtml(s.cat)}</span>
                  <span class="fin-row-title">${escapeHtml((s.note||s.cat).slice(0,40))}</span>
                </div>
                <div class="fin-row-time">${s.date===today?s.time:fmtDate(s.date)}</div>
              </div>
              <div class="fin-row-right">
                <div class="fin-acts">
                  <button class="fin-edit-btn" data-edit-spend="${s.id}" title="Edit">${ICON_PENCIL}</button>
                  <button class="fin-del-btn" data-del-spend="${s.id}" title="Delete">${ICON_TRASH}</button>
                </div>
                <div class="fin-row-amt">−${fmtMoney(s.amount)}</div>
              </div>
            </div>
          </li>`).join('')}
      </ul>
      <button class="add-btn" data-modal-add="spend" style="margin-top:14px"><span class="plus">+</span> Log spend</button>
    </div>
  `;
}

/* ---- FINANCE: DEBTS ---- */
function renderDebts() {
  const sorted = state.debts.slice().sort((a,b)=>(a.paid?1:0)-(b.paid?1:0)||(a.due||'').localeCompare(b.due||''));
  const pfx = window.__HQ_TWEAKS.currencyPrefix||'$';
  const PAGE_SIZE = 7;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  state.debtsPage = Math.min(state.debtsPage || 1, totalPages);
  const page = state.debtsPage;
  const pageItems = sorted.slice((page-1)*PAGE_SIZE, page*PAGE_SIZE);
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
        ${pageItems.map(d => {
          const days = daysUntil(d.due);
          const soon = !d.paid && days <= 7 && days >= 0;
          const overdue = !d.paid && days < 0;
          const dueLabel = d.paid ? `Paid` : (overdue ? `Overdue · ${fmtDate(d.due)}` : (days===0?`Due today`:`Due in ${days}d · ${fmtDate(d.due)}`));
          return `
          <li class="fin-item" data-id="${d.id}">
            <div class="fin-row">
              <div class="fin-row-left">
                <div class="fin-row-line1">
                  <span class="fin-row-title">${escapeHtml(d.creditor)}</span>
                </div>
                <div class="debt-due ${soon||overdue?'soon':''}" style="font-size:12px;margin-top:3px">${dueLabel}</div>
              </div>
              <div class="fin-row-right">
                <div class="fin-acts">
                  ${d.paid
                    ? `<button class="fin-edit-btn debt-pay-btn debt-pay-btn--paid" data-pay-debt="${d.id}" title="Mark as unpaid">${ICON_UNDO}</button>`
                    : `<button class="fin-edit-btn debt-pay-btn debt-pay-btn--unpaid" data-pay-debt="${d.id}" title="Mark as paid">${ICON_CHECK}</button>`}
                  <button class="fin-edit-btn" data-edit-debt="${d.id}" title="Edit">${ICON_PENCIL}</button>
                  <button class="fin-del-btn" data-del-debt="${d.id}" title="Delete">${ICON_TRASH}</button>
                </div>
                <div class="fin-row-amt">${fmtMoney(d.amount)}</div>
              </div>
            </div>
          </li>`;
        }).join('') || `<li class="list-item"><div class="item-sub">No debts recorded.</div></li>`}
      </ul>
      <button class="add-btn" data-modal-add="debt" style="margin-top:14px"><span class="plus">+</span> Add debt</button>
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
   MODAL SYSTEM
========================================================= */
function showModal({ title, fields, saveLabel = 'Save', onSave, onClose }) {
  let container = document.getElementById('modal-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'modal-container';
    document.body.appendChild(container);
  }

  function renderField(f) {
    const lbl = `<div class="modal-label">${escapeHtml(f.label)}</div>`;
    let input;
    if (f.type === 'select') {
      const opts = (f.options || []).map(o => {
        const val = typeof o === 'object' ? o.value : o;
        const lab = typeof o === 'object' ? o.label : o;
        return `<option value="${escapeHtml(String(val))}"${String(val) === String(f.value) ? ' selected' : ''}>${escapeHtml(lab)}</option>`;
      }).join('');
      input = `<select id="modal-f-${f.id}">${opts}</select>`;
    } else if (f.type === 'textarea') {
      input = `<textarea id="modal-f-${f.id}" rows="3" placeholder="${escapeHtml(f.placeholder||'')}">${escapeHtml(f.value||'')}</textarea>`;
    } else if (f.type === 'toggle') {
      input = `<label class="toggle-switch"><input type="checkbox" id="modal-f-${f.id}"${f.value ? ' checked' : ''}><span class="toggle-track"></span></label>`;
    } else if (f.type === 'amount') {
      const fmtInitial = f.value ? Number(f.value).toLocaleString('id-ID') : '';
      const pfxInitial = fmtInitial ? (window.__HQ_TWEAKS?.currencyPrefix || 'Rp ') + fmtInitial : '';
      input = `<input type="text" inputmode="numeric" id="modal-f-${f.id}" value="${fmtInitial}" placeholder="${escapeHtml(f.placeholder||'0')}"/><div class="amount-preview" id="preview-${f.id}">${pfxInitial}</div>`;
    } else {
      input = `<input type="${f.type||'text'}" id="modal-f-${f.id}" value="${escapeHtml(String(f.value??''))}" placeholder="${escapeHtml(f.placeholder||'')}"/>`;
    }
    return `<div class="modal-field" data-field-id="${f.id}">${lbl}${input}</div>`;
  }

  container.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal-card" id="modal-card">
        <div class="modal-header">
          <span class="modal-title">${escapeHtml(title)}</span>
          <button class="modal-x" id="modal-x">&#xD7;</button>
        </div>
        <div class="modal-fields" id="modal-fields">
          ${fields.map(renderField).join('')}
        </div>
        <div class="modal-footer">
          <button class="btn" id="modal-cancel">Cancel</button>
          <button class="btn primary" id="modal-save">${escapeHtml(saveLabel)}</button>
        </div>
      </div>
    </div>`;

  // Wire up toggle → show/hide controlled fields
  fields.forEach(f => {
    if (f.type !== 'toggle' || !f.controls) return;
    const toggleEl = document.getElementById('modal-f-' + f.id);
    const controlled = container.querySelector(`[data-field-id="${f.controls}"]`);
    if (!toggleEl || !controlled) return;
    controlled.style.display = toggleEl.checked ? '' : 'none';
    toggleEl.addEventListener('change', () => {
      controlled.style.display = toggleEl.checked ? '' : 'none';
    });
  });

  // Wire up amount fields — live Indonesian dot formatting + preview
  fields.forEach(f => {
    if (f.type !== 'amount') return;
    const inp = document.getElementById('modal-f-' + f.id);
    const preview = document.getElementById('preview-' + f.id);
    if (!inp) return;
    inp.addEventListener('input', () => {
      const raw = inp.value.replace(/\D/g, '');
      inp.value = raw ? parseInt(raw).toLocaleString('id-ID') : '';
      if (preview) {
        const pfx = window.__HQ_TWEAKS?.currencyPrefix || 'Rp ';
        preview.textContent = raw ? pfx + inp.value : '';
      }
    });
  });

  function closeModal() {
    container.innerHTML = '';
    document.removeEventListener('keydown', modalKeyHandler);
    if (onClose) onClose();
  }
  function modalKeyHandler(e) {
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      const primaryBtn = container.querySelector('.btn.primary, [data-action="save"], [data-action="confirm"]');
      if (primaryBtn) primaryBtn.click();
    }
  }
  document.addEventListener('keydown', modalKeyHandler);

  document.getElementById('modal-overlay').addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
  document.getElementById('modal-x').addEventListener('click', closeModal);
  document.getElementById('modal-cancel').addEventListener('click', closeModal);

  document.getElementById('modal-save').addEventListener('click', () => {
    const values = {};
    fields.forEach(f => {
      const el = document.getElementById('modal-f-' + f.id);
      if (!el) return;
      if (f.type === 'toggle') values[f.id] = el.checked;
      else if (f.type === 'number') values[f.id] = Number(el.value || 0);
      else if (f.type === 'amount') values[f.id] = parseInt((el.value || '').replace(/\./g, '')) || 0;
      else values[f.id] = el.value;
    });
    closeModal();
    if (onSave) onSave(values);
  });

  // Focus first text input
  setTimeout(() => {
    const first = container.querySelector('input:not([type="checkbox"]), select, textarea');
    if (first) first.focus();
  }, 50);
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
  const mt = main.querySelector('#music-toggle');
  if (mt) mt.addEventListener('click', toggleAmbientMusic);

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
  main.querySelectorAll('[data-toggle-proj-task]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
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
    const proj = state.projects.find(p => p.id === id);
    showConfirmModal({
      title: 'Delete Project?',
      message: `This will permanently delete "${proj?.name || 'this project'}" and all its tasks. This cannot be undone.`,
      onConfirm: () => {
        state.projects = state.projects.filter(p => p.id !== id);
        state.expandedProjectIds = state.expandedProjectIds.filter(eid => eid !== id);
        render();
        dbCall(() => sb.from('projects').delete().eq('id', id));
      }
    });
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
    showConfirmModal({
      title: 'Delete Task?',
      message: 'Remove this task from the project?',
      onConfirm: () => {
        const proj = state.projects.find(p => p.id === projId);
        if (!proj) return;
        proj.tasks = proj.tasks.filter(t => t.id !== taskId);
        render();
        dbCall(() => sb.from('project_tasks').delete().eq('id', taskId));
      }
    });
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

  // ---- SCHEDULE ----
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
        { id: 'alarm',      label: 'Set alarm',  type: 'toggle', value: !!s.alarm_time, controls: 'alarm_time' },
        { id: 'alarm_time', label: 'Alarm time', type: 'time',   value: s.alarm_time || s.time }
      ],
      saveLabel: 'Save',
      onSave: ({ time, title, note, alarm, alarm_time }) => {
        if (!title.trim()) return;
        const newAlarmTime = alarm ? (alarm_time || time) : null;
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
        { id: 'alarm',      label: 'Set alarm',  type: 'toggle', value: false, controls: 'alarm_time' },
        { id: 'alarm_time', label: 'Alarm time', type: 'time',   value: '09:00' }
      ],
      saveLabel: 'Add',
      onSave: async ({ time, title, note, alarm, alarm_time }) => {
        if (!title.trim()) return;
        const alarm_time_val = alarm ? (alarm_time || time) : null;
        const { data } = await dbCall(() => sb.from('schedule_events').insert({ user_id: currentUser.id, date: day, time, title: title.trim(), note: note.trim(), alarm_time: alarm_time_val }).select().single());
        if (data) {
          if (!state.schedule[day]) state.schedule[day] = [];
          state.schedule[day].push({ id: data.id, time, title: title.trim(), sub: note.trim(), alarm_time: alarm_time_val });
          state.schedule[day].sort((a, b) => a.time.localeCompare(b.time));
          render();
        }
      }
    });
  });

  // ---- COMMITMENTS ----
  main.querySelectorAll('[data-del-goal]').forEach(el => el.addEventListener('click', () => {
    const [k, id] = el.dataset.delGoal.split('|');
    showConfirmModal({
      title: 'Delete Commitment?',
      message: 'Remove this from your commitments?',
      onConfirm: () => {
        state.goals[k] = state.goals[k].filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('goals').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-goal]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [k, id] = el.dataset.editGoal.split('|');
    const g = (state.goals[k] || []).find(x => x.id === id);
    if (!g) return;
    showModal({
      title: 'Edit Commitment',
      fields: [{ id: 'text', label: k === 'dos' ? "Do" : "Don't", type: 'text', value: g.text, placeholder: '...' }],
      saveLabel: 'Save',
      onSave: ({ text }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        g.text = trimmed;
        const textEl = document.querySelector(`[data-goal-text="${id}"]`);
        if (textEl) textEl.textContent = trimmed;
        dbCall(() => sb.from('goals').update({ text: trimmed }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add^="goal-"]').forEach(btn => btn.addEventListener('click', () => {
    const key = btn.dataset.modalAdd.replace('goal-', '');
    const isDo = key === 'dos';
    showModal({
      title: isDo ? 'Add Do' : "Add Don't",
      fields: [{ id: 'text', label: isDo ? 'Do' : "Don't", type: 'text', value: '', placeholder: isDo ? 'e.g. Drink 2L water' : 'e.g. No phone in bed' }],
      saveLabel: 'Add',
      onSave: async ({ text }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const type = isDo ? 'do' : 'dont';
        const { data } = await dbCall(() => sb.from('goals').insert({ user_id: currentUser.id, type, text: trimmed }).select().single());
        if (data) { state.goals[key].push({ id: data.id, text: trimmed }); render(); }
      }
    });
  }));

  // ---- PROJECTS ----
  main.querySelectorAll('[data-modal-add="project"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'New Project',
      fields: [
        { id: 'name',        label: 'Project name',        type: 'text',     value: '', placeholder: 'e.g. Client Website' },
        { id: 'description', label: 'Description',         type: 'textarea', value: '', placeholder: 'Optional project description' },
        { id: 'status',      label: 'Status',              type: 'select',   value: 'active', options: [{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On Hold' }, { value: 'done', label: 'Done' }] },
        { id: 'deadline',    label: 'Deadline (optional)', type: 'date',     value: '' }
      ],
      saveLabel: 'Add',
      onSave: async ({ name, description, status, deadline }) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        const now = new Date().toISOString();
        const { data } = await dbCall(() => sb.from('projects').insert({ user_id: currentUser.id, name: trimmed, description: description.trim() || null, status, deadline: deadline || null, updated_at: now }).select().single());
        if (data) { state.projects.push({ id: data.id, name: trimmed, description: description.trim(), status, deadline: data.deadline, tasks: [] }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-edit-proj]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editProj;
    const proj = state.projects.find(p => p.id === id);
    if (!proj) return;
    showModal({
      title: 'Edit Project',
      fields: [
        { id: 'name',        label: 'Project name', type: 'text',     value: proj.name },
        { id: 'description', label: 'Description',  type: 'textarea', value: proj.description || '', placeholder: 'Optional project description' },
        { id: 'status',      label: 'Status',       type: 'select',   value: proj.status, options: [{ value: 'active', label: 'Active' }, { value: 'on_hold', label: 'On Hold' }, { value: 'done', label: 'Done' }] },
        { id: 'deadline',    label: 'Deadline',     type: 'date',     value: proj.deadline || '' }
      ],
      saveLabel: 'Save',
      onSave: ({ name, description, status, deadline }) => {
        const trimmed = name.trim();
        if (!trimmed) return;
        proj.name = trimmed; proj.description = description.trim(); proj.status = status; proj.deadline = deadline || null;
        render();
        dbCall(() => sb.from('projects').update({ name: trimmed, description: description.trim() || null, status, deadline: deadline || null, updated_at: new Date().toISOString() }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="proj-task"]').forEach(btn => btn.addEventListener('click', () => {
    const projId = btn.dataset.projId;
    showModal({
      title: 'Add Task',
      fields: [
        { id: 'text',        label: 'Task',        type: 'text',     value: '', placeholder: 'What needs to be done?' },
        { id: 'description', label: 'Description', type: 'textarea', value: '', placeholder: 'Description (optional)' }
      ],
      saveLabel: 'Add',
      onSave: async ({ text, description }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const proj = state.projects.find(p => p.id === projId);
        if (!proj) return;
        const { data } = await dbCall(() => sb.from('project_tasks').insert({ user_id: currentUser.id, project_id: projId, text: trimmed, description: description.trim() || null, checked: false }).select().single());
        if (data) { proj.tasks.push({ id: data.id, text: trimmed, description: description.trim(), checked: false }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-edit-proj-task]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [projId, taskId] = el.dataset.editProjTask.split('|');
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    const task = proj.tasks.find(t => t.id === taskId);
    if (!task) return;
    showModal({
      title: 'Edit Task',
      fields: [
        { id: 'text',        label: 'Task',        type: 'text',     value: task.text },
        { id: 'description', label: 'Description', type: 'textarea', value: task.description || '', placeholder: 'Description (optional)' }
      ],
      saveLabel: 'Save',
      onSave: ({ text, description }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        task.text = trimmed; task.description = description.trim();
        render();
        dbCall(() => sb.from('project_tasks').update({ text: trimmed, description: description.trim() || null }).eq('id', taskId));
      }
    });
  }));

  // ---- INCOME ----
  main.querySelectorAll('[data-del-income]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delIncome;
    showConfirmModal({
      title: 'Delete Income Entry?',
      message: 'Remove this income record?',
      onConfirm: () => {
        state.income = state.income.filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('income_entries').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-income]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editIncome;
    const item = state.income.find(x => x.id === id);
    if (!item) return;
    showModal({
      title: 'Edit Income',
      fields: [
        { id: 'source', label: 'Source', type: 'text',   value: item.source },
        { id: 'amount', label: 'Amount', type: 'amount', value: item.amount },
        { id: 'date',   label: 'Date',   type: 'date',   value: item.date }
      ],
      saveLabel: 'Save',
      onSave: ({ source, amount, date }) => {
        const src = source.trim();
        const amt = Number(amount);
        if (!src || !amt) return;
        item.source = src; item.amount = amt; item.date = date;
        render();
        dbCall(() => sb.from('income_entries').update({ source: src, amount: amt, date }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="income"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'Log Income',
      fields: [
        { id: 'source', label: 'Source', type: 'text',   value: '', placeholder: 'e.g. Client A' },
        { id: 'amount', label: 'Amount', type: 'amount', value: '', placeholder: '0' },
        { id: 'date',   label: 'Date',   type: 'date',   value: todayISO() }
      ],
      saveLabel: 'Add',
      onSave: async ({ source, amount, date }) => {
        const src = source.trim();
        const amt = Number(amount);
        if (!src || !amt) return;
        const { data } = await dbCall(() => sb.from('income_entries').insert({ user_id: currentUser.id, date: date || todayISO(), source: src, amount: amt }).select().single());
        if (data) { state.income.unshift({ id: data.id, date: data.date, source: src, amount: amt }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-income-filter]').forEach(el => el.addEventListener('click', () => {
    state.incomeFilter = el.dataset.incomeFilter;
    state.incomePickedDate = null;
    state.incomePage = 1;
    render();
  }));

  const incomeDateInput = main.querySelector('#income-date-input');
  if (incomeDateInput) incomeDateInput.addEventListener('change', () => {
    state.incomePickedDate = incomeDateInput.value || null;
    state.incomePage = 1;
    render();
  });

  const incomeDateClear = main.querySelector('#income-date-clear');
  if (incomeDateClear) incomeDateClear.addEventListener('click', () => {
    state.incomePickedDate = null;
    state.incomePage = 1;
    render();
  });

  // ---- SPENDING ----
  const _spendCats = ['Food', 'Transport', 'Shopping', 'Other'];

  main.querySelectorAll('[data-del-spend]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delSpend;
    showConfirmModal({
      title: 'Delete Spending Entry?',
      message: 'Remove this spending record?',
      onConfirm: () => {
        state.spending = state.spending.filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('spending_entries').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-spend]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editSpend;
    const item = state.spending.find(x => x.id === id);
    if (!item) return;
    showModal({
      title: 'Edit Spending',
      fields: [
        { id: 'cat',    label: 'Category', type: 'select', value: item.cat,     options: _spendCats.map(c => ({ value: c, label: c })) },
        { id: 'amount', label: 'Amount',   type: 'amount', value: item.amount },
        { id: 'note',   label: 'Note',     type: 'text',   value: item.note || '', placeholder: 'What was it?' }
      ],
      saveLabel: 'Save',
      onSave: ({ cat, amount, note }) => {
        const amt = Number(amount);
        if (!amt) return;
        item.cat = cat; item.amount = amt; item.note = note.trim();
        render();
        dbCall(() => sb.from('spending_entries').update({ category: cat, amount: amt, note: note.trim(), time: item.time }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="spend"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'Log Spending',
      fields: [
        { id: 'cat',    label: 'Category', type: 'select', value: 'Food',  options: _spendCats.map(c => ({ value: c, label: c })) },
        { id: 'amount', label: 'Amount',   type: 'amount', value: '',      placeholder: '0' },
        { id: 'note',   label: 'Note',     type: 'text',   value: '',      placeholder: 'What was it?' }
      ],
      saveLabel: 'Add',
      onSave: async ({ cat, amount, note }) => {
        const amt = Number(amount);
        if (!amt) return;
        const t = new Date();
        const time = `${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
        const date = todayISO();
        const { data } = await dbCall(() => sb.from('spending_entries').insert({ user_id: currentUser.id, date, time, category: cat, note: note.trim(), amount: amt }).select().single());
        if (data) { state.spending.unshift({ id: data.id, date, time, cat, note: note.trim(), amount: amt }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-spend-filter]').forEach(el => el.addEventListener('click', () => {
    state.spendingFilter = el.dataset.spendFilter;
    state.spendingPickedDate = null;
    state.spendingPage = 1;
    render();
  }));

  const spendDateInput = main.querySelector('#spend-date-input');
  if (spendDateInput) spendDateInput.addEventListener('change', () => {
    state.spendingPickedDate = spendDateInput.value || null;
    state.spendingPage = 1;
    render();
  });

  const spendDateClear = main.querySelector('#spend-date-clear');
  if (spendDateClear) spendDateClear.addEventListener('click', () => {
    state.spendingPickedDate = null;
    state.spendingPage = 1;
    render();
  });

  // ---- DEBTS ----
  main.querySelectorAll('[data-del-debt]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delDebt;
    const d = state.debts.find(x => x.id === id);
    showConfirmModal({
      title: 'Delete Debt?',
      message: `Remove "${d?.creditor || 'this debt'}" from your debts?`,
      onConfirm: () => {
        state.debts = state.debts.filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('debts').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-debt]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editDebt;
    const item = state.debts.find(d => d.id === id);
    if (!item) return;
    showModal({
      title: 'Edit Debt',
      fields: [
        { id: 'creditor', label: 'Creditor', type: 'text',   value: item.creditor },
        { id: 'amount',   label: 'Amount',   type: 'amount', value: item.amount },
        { id: 'due',      label: 'Due date', type: 'date',   value: item.due || '' }
      ],
      saveLabel: 'Save',
      onSave: ({ creditor, amount, due }) => {
        const cred = creditor.trim();
        const amt = Number(amount);
        if (!cred || !amt) return;
        item.creditor = cred; item.amount = amt; item.due = due;
        render();
        dbCall(() => sb.from('debts').update({ creditor: cred, amount: amt, due_date: due }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-modal-add="debt"]').forEach(btn => btn.addEventListener('click', () => {
    showModal({
      title: 'Add Debt',
      fields: [
        { id: 'creditor', label: 'Creditor', type: 'text',   value: '', placeholder: 'Who do you owe?' },
        { id: 'amount',   label: 'Amount',   type: 'amount', value: '', placeholder: '0' },
        { id: 'due',      label: 'Due date', type: 'date',   value: todayISO() }
      ],
      saveLabel: 'Add',
      onSave: async ({ creditor, amount, due }) => {
        const cred = creditor.trim();
        const amt = Number(amount);
        if (!cred || !amt) return;
        const { data } = await dbCall(() => sb.from('debts').insert({ user_id: currentUser.id, creditor: cred, amount: amt, due_date: due, paid: false }).select().single());
        if (data) { state.debts.push({ id: data.id, creditor: cred, amount: amt, due, paid: false }); render(); }
      }
    });
  }));

  main.querySelectorAll('[data-pay-debt]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.payDebt;
    const d = state.debts.find(x => x.id === id);
    if (!d) return;
    try {
      if (d.paid) {
        await dbCall(() => sb.from('debts').update({ paid: false }).eq('id', id));
        d.paid = false;
        render();
        showToast('Marked as unpaid');
      } else {
        await dbCall(() => sb.from('debts').update({ paid: true }).eq('id', id));
        d.paid = true;
        render();
        showToast('Marked as paid');
      }
    } catch (e) {
      // dbCall already shows the failure toast
    }
  }));


  // ---- NOTES ----
  // list view: delete note card
  main.querySelectorAll('[data-del-note-card]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.delNoteCard;
    const note = state.notes.find(n => n.id === id);
    const noteTitle = note?.title || 'Untitled';
    showConfirmModal({
      title: 'Delete Note?',
      message: `This will permanently delete "${noteTitle}". This cannot be undone.`,
      onConfirm: () => {
        const card = main.querySelector(`.note-card[data-open-note="${id}"]`);
        state.notes = state.notes.filter(n => n.id !== id);
        if (state.activeNoteId === id) state.activeNoteId = null;
        if (card) {
          card.style.transition = 'opacity 200ms ease';
          card.style.opacity = '0';
          setTimeout(() => card.remove(), 200);
        }
        dbCall(() => sb.from('notes').delete().eq('id', id));
      }
    });
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
    const note = state.notes.find(n => n.id === id);
    const noteTitle = note?.title || 'Untitled';
    showConfirmModal({
      title: 'Delete Note?',
      message: `This will permanently delete "${noteTitle}". This cannot be undone.`,
      onConfirm: () => {
        state.notes = state.notes.filter(n => n.id !== id);
        state.activeNoteId = null;
        render();
        dbCall(() => sb.from('notes').delete().eq('id', id));
      }
    });
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
      contentClone.querySelectorAll('.note-table-add-row').forEach(t => t.remove());
      contentClone.querySelectorAll('.table-toolbar').forEach(t => t.remove());
      contentClone.querySelectorAll('.delete-row-btn').forEach(t => t.remove());
      contentClone.querySelectorAll('.delete-table-btn').forEach(t => t.remove());
      contentClone.querySelectorAll('.table-wrapper').forEach(outer => {
        const inner = outer.querySelector('.note-table-wrapper');
        if (inner && outer.parentNode) outer.parentNode.replaceChild(inner, outer);
      });
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
    // table interactions on load
    setTimeout(() => initTableInteractions(noteContentEl, triggerNoteSave), 60);
  }

  // editor: table insert button
  const tbTableBtn = main.querySelector('#tb-table-btn');
  if (tbTableBtn && noteContentEl) {
    tbTableBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      noteContentEl.focus();
      const html = buildNoteTableHTML(
        ['Header 1', 'Header 2', 'Header 3'],
        [['Cell', 'Cell', 'Cell'], ['Cell', 'Cell', 'Cell']]
      );
      document.execCommand('insertHTML', false, html);
      initTableInteractions(noteContentEl, triggerNoteSave);
      triggerNoteSave();
    });
  }

  // editor: Tab key navigation inside table cells + cell deletion protection
  if (noteContentEl) {
    noteContentEl.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const cell = e.target.closest ? e.target.closest('td, th') : null;
        if (cell && cell.innerText.trim() === '') {
          e.preventDefault();
        }
        return;
      }
      if (e.key !== 'Tab') return;
      const cell = e.target.closest ? e.target.closest('td[contenteditable], th[contenteditable]') : null;
      if (!cell) return;
      e.preventDefault();
      const table = cell.closest('table');
      const cells = Array.from(table.querySelectorAll('th[contenteditable], td[contenteditable]'));
      const idx = cells.indexOf(cell);
      if (idx < cells.length - 1) {
        cells[idx + 1].focus();
      } else {
        const tbody = table.querySelector('tbody');
        const colCount = table.rows[0]?.cells.length || 3;
        const newRow = document.createElement('tr');
        for (let i = 0; i < colCount; i++) {
          const td = document.createElement('td');
          td.contentEditable = 'true';
          newRow.appendChild(td);
        }
        tbody.appendChild(newRow);
        addDeleteRowBtn(newRow, triggerNoteSave);
        newRow.cells[0].focus();
        triggerNoteSave();
      }
    });
  }

  // editor: paste handler — convert HTML/markdown tables
  if (noteContentEl) {
    noteContentEl.addEventListener('paste', (e) => {
      if (e.target.closest && e.target.closest('td, th')) return;
      const html = e.clipboardData.getData('text/html');
      const text = e.clipboardData.getData('text/plain');
      if (html && /<table/i.test(html)) {
        e.preventDefault();
        const converted = convertPastedTable(html);
        if (converted) {
          const tablesBefore = new Set(noteContentEl.querySelectorAll('.note-table'));
          document.execCommand('insertHTML', false, converted);
          initTableInteractions(noteContentEl, triggerNoteSave);
          const newTable = Array.from(noteContentEl.querySelectorAll('.note-table')).find(t => !tablesBefore.has(t));
          if (newTable) {
            const firstCell = newTable.querySelector('th[contenteditable], td[contenteditable]');
            if (firstCell) setTimeout(() => firstCell.focus(), 0);
          }
          triggerNoteSave();
        }
      } else if (text && text.trimStart().startsWith('|')) {
        e.preventDefault();
        const converted = convertMarkdownTable(text);
        if (converted) {
          const tablesBefore = new Set(noteContentEl.querySelectorAll('.note-table'));
          document.execCommand('insertHTML', false, converted);
          initTableInteractions(noteContentEl, triggerNoteSave);
          const newTable = Array.from(noteContentEl.querySelectorAll('.note-table')).find(t => !tablesBefore.has(t));
          if (newTable) {
            const firstCell = newTable.querySelector('th[contenteditable], td[contenteditable]');
            if (firstCell) setTimeout(() => firstCell.focus(), 0);
          }
          triggerNoteSave();
        }
      }
    });
  }
}

function bindFormSaves() {
  // All form saves are now handled by showModal() onSave callbacks
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

// Notes mobile: adjust editor height when keyboard appears
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const editor = document.querySelector('.note-content');
    if (editor) {
      editor.style.minHeight = (window.visualViewport.height - 200) + 'px';
    }
  });
}
