/* =========================================================
   CORE — shared state, helpers, modal system, tweaks, event-binding orchestrator
   (split from js/app.js — see CLAUDE.md for the page map)
========================================================= */

/* =========================================================
   TOAST
========================================================= */
let toastTimer = null;
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.innerHTML = `<span class="toast-icon">${type === 'error' ? '&#x2715;' : '&#x2713;'}</span><span class="toast-msg"></span>`;
  t.querySelector('.toast-msg').textContent = msg;
  t.classList.remove('toast-success', 'toast-error');
  t.classList.add('show', type === 'error' ? 'toast-error' : 'toast-success');
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
let draggedGoalId = null; // id of the goal/commitment card currently being drag-reordered

let state = {
  profile: { name: 'Friend', noteDefaultStyle: null },
  schedule: {},   // { [iso-date]: [{id, time, title, sub}] }
  goals: { items: [] },  // items: {id, text, target_count, unit, category} — target_count=1 renders as a checkbox, >1 renders as a +/- counter. No Do/Don't split — every commitment is something you're building (see CLAUDE.md).
  goalLogs: [],   // [{id, goal_id, user_id, date, checked, count, completed_at}] — checked is always (count >= goal.target_count); completed_at is set/cleared alongside checked and feeds Home's activity list
  projects: [],       // [{id, name, status, deadline, tasks:[{id,text,description,checked,completed_at}]}]
  projectsFilter: 'all',
  expandedProjectIds: [],
  homeProjectIndex: 0,
  notes: [],      // [{id, title, content, created_at, updated_at}]
  todayFocus: [], // [{id, text, checked, created_at}]
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
  commitPreviewTab: 'month',  // 'month' | 'year' — the History card's two layers (Month heatmap default, Year sparkline). Layer 3 (day detail) is a modal (showCommitDayModal), not state-backed.
  commitViewMonth: todayISO().slice(0, 7),
  commitHeatmapYear: new Date().getFullYear(),
  incomePage: 1,
  spendingFilter: 'daily',
  spendingPickedDate: null,
  spendingPage: 1,
  spendingShowAll: false,     // false = Spending's "Recent" list capped at 5 rows + "Show all" button, mirroring Home's Activity feed
  debtsPage: 1,
  incomeFilter: 'month',
  incomePickedDate: null,
  heatmapYear: new Date().getFullYear(),  // year shown in Home's "Activity" heatmap
  homeActivityDayFilter: null,            // iso date; clicking a heatmap cell filters the activity feed to that day
  homeActivityShowAll: false              // false = feed capped at 10 rows + "Show all activities" button
};

/* =========================================================
   AMBIENT MUSIC
   Two playback engines behind one picker: the 3 built-in radios play via a
   plain <audio> stream; up to 3 user-supplied YouTube links (Tweaks panel,
   see setCustomStation()) play via the YouTube IFrame Player API, mounted
   into #yt-audio-player — a node that lives outside #main in index.html so
   it survives render()'s main.innerHTML replacement instead of being torn
   down and recreated on every page navigation.
   Clicking the note icon only ever pauses/resumes whatever is already
   selected; the ▾ caret opens the picker dropdown to choose/switch stations
   — deliberately not the old "click cycles through streams" behavior.
========================================================= */
const AMBIENT_STREAMS = [
  { kind: 'audio', url: 'https://streams.ilovemusic.de/iloveradio17.mp3', name: 'iLove Radio' },
  { kind: 'audio', url: 'https://usa9.fastcast4u.com/proxy/jamz?mp=/1',  name: 'Jamz Radio'  },
  { kind: 'audio', url: 'https://lofi.stream.laut.fm/lofi',               name: 'Lo-Fi Radio' }
];
const ambientPlayer = { kind: null, audio: null, stationIndex: null, isPlaying: false };

let ytPlayer = null;
let ytApiReady = false;
let pendingYtVideoId = null;

// Called automatically by the YouTube IFrame API script once it finishes loading
// (index.html loads that script last, after this function is already defined).
function onYouTubeIframeAPIReady() {
  ytApiReady = true;
  if (pendingYtVideoId) {
    const vid = pendingYtVideoId;
    pendingYtVideoId = null;
    createYtPlayer(vid);
  }
}

function createYtPlayer(videoId) {
  ytPlayer = new YT.Player('yt-audio-player', {
    height: '1', width: '1', videoId,
    playerVars: { autoplay: 1, controls: 0, disablekb: 1, playsinline: 1 },
    events: {
      onReady: (e) => { e.target.setVolume(40); e.target.playVideo(); },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING)  { ambientPlayer.isPlaying = true;  updateMusicBtn(true); }
        if (e.data === YT.PlayerState.PAUSED)   { ambientPlayer.isPlaying = false; updateMusicBtn(false); }
      },
      onError: () => {
        showToast('That YouTube link can\'t be played (embedding may be disabled)', 'error');
        ambientPlayer.isPlaying = false;
        updateMusicBtn(false);
      }
    }
  });
}

// Extracts the 11-char video id from watch/live/embed/shorts/youtu.be links.
function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function getCustomStations() {
  return (window.__HQ_TWEAKS.customStations || [])
    .filter(s => s && s.name && s.name.trim() && s.url && s.url.trim())
    .map(s => ({ kind: 'youtube', name: s.name.trim(), videoId: extractYouTubeId(s.url.trim()) }))
    .filter(s => s.videoId);
}

function getAllStations() {
  return [...AMBIENT_STREAMS, ...getCustomStations()];
}

function updateMusicBtn(playing) {
  const btn      = document.getElementById('music-toggle');
  const caret    = document.getElementById('music-caret-btn');
  const eq       = document.getElementById('eq-bars');
  const noteIcon = document.getElementById('music-note-icon');
  const label    = document.getElementById('music-label');
  const station  = ambientPlayer.stationIndex != null ? getAllStations()[ambientPlayer.stationIndex] : null;
  if (btn)    btn.classList.toggle('playing', playing);
  if (caret)  caret.classList.toggle('playing', playing);
  if (eq)     eq.style.display = playing ? 'inline-flex' : 'none';
  if (noteIcon) noteIcon.style.display = playing ? 'none' : '';
  if (label) {
    label.textContent = playing && station ? station.name : '';
    label.classList.toggle('playing', playing);
  }
  document.querySelectorAll('#music-dropdown [data-station-idx]').forEach(el => {
    el.classList.toggle('sel', playing && Number(el.dataset.stationIdx) === ambientPlayer.stationIndex);
  });
}

// Pauses in place — keeps the Audio object / yt video loaded so the icon can
// resume the SAME station. Used by toggleAmbientMusic()'s pause branch.
function pauseCurrentStation() {
  if (ambientPlayer.audio) ambientPlayer.audio.pause();
  if (ytPlayer) { try { ytPlayer.pauseVideo(); } catch (e) {} }
  ambientPlayer.isPlaying = false;
  updateMusicBtn(false);
}

// Full teardown before switching to a different station — discards the
// Audio object entirely (a new one gets created for the new pick).
function stopCurrentStation() {
  pauseCurrentStation();
  if (ambientPlayer.audio) { ambientPlayer.audio = null; }
}

function playAudioStation(idx, station) {
  stopCurrentStation();
  ambientPlayer.kind = 'audio';
  ambientPlayer.stationIndex = idx;
  const audio = new Audio(station.url);
  audio.crossOrigin = 'anonymous';
  audio.volume = 0.4;
  ambientPlayer.audio = audio;
  const fail = () => {
    showToast(`${station.name} isn't reachable right now`, 'error');
    ambientPlayer.isPlaying = false;
    updateMusicBtn(false);
  };
  audio.addEventListener('error', fail, { once: true });
  audio.play().then(() => { ambientPlayer.isPlaying = true; updateMusicBtn(true); }).catch(fail);
}

function playYoutubeStation(idx, station) {
  stopCurrentStation();
  ambientPlayer.kind = 'youtube';
  ambientPlayer.stationIndex = idx;
  if (!ytApiReady) {
    // API script (loaded at the bottom of index.html) hasn't finished yet — flag it
    // so onYouTubeIframeAPIReady() starts this station as soon as it's ready, and
    // show "not playing" in the meantime rather than a misleading playing state.
    pendingYtVideoId = station.videoId;
    ambientPlayer.isPlaying = false;
    updateMusicBtn(false);
    return;
  }
  if (!ytPlayer) { createYtPlayer(station.videoId); }
  else { ytPlayer.loadVideoById(station.videoId); }
}

function selectStation(idx) {
  const station = getAllStations()[idx];
  if (!station) return;
  document.getElementById('music-dropdown')?.classList.remove('open');
  if (station.kind === 'youtube') playYoutubeStation(idx, station);
  else playAudioStation(idx, station);
}

// Note icon click: pause/resume only — never picks a station on its own.
function toggleAmbientMusic() {
  if (ambientPlayer.stationIndex == null) {
    document.getElementById('music-dropdown')?.classList.toggle('open');
    return;
  }
  if (ambientPlayer.isPlaying) {
    pauseCurrentStation();
  } else if (ambientPlayer.kind === 'youtube' && ytPlayer) {
    ytPlayer.playVideo();
  } else if (ambientPlayer.kind === 'audio' && ambientPlayer.audio) {
    ambientPlayer.audio.play().then(() => { ambientPlayer.isPlaying = true; updateMusicBtn(true); });
  }
}

function musicDropdownHtml() {
  const built = AMBIENT_STREAMS;
  const custom = getCustomStations();
  const item = (s, i) => `<button data-station-idx="${i}" class="${ambientPlayer.isPlaying && ambientPlayer.stationIndex === i ? 'sel' : ''}"><span class="music-dd-dot"></span>${escapeHtml(s.name)}</button>`;
  return `
    ${built.map((s, i) => item(s, i)).join('')}
    ${custom.length ? `<div class="music-dd-sep"></div>${custom.map((s, i) => item(s, built.length + i)).join('')}`
      : `<div class="music-dd-sep"></div><div class="music-dd-hint">Add your own YouTube stations in ⚙ Tweaks.</div>`}
  `;
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
      items: [
        { text: 'Read 20 pages every day', category: 'Personal & Mental' },
        { text: 'Walk 8,000+ steps', category: 'Olahraga' },
        { text: 'Write a journal entry', category: 'Personal & Mental' },
        { text: 'Call mom twice a week', category: 'Personal & Mental' },
        { text: 'Sleep before 11:30pm', category: 'Personal & Mental' },
        { text: 'Phone-free first hour', category: 'Personal & Mental' },
        { text: 'Home-cooked meals on weekdays', category: 'Personal & Mental' }
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
        <span id="music-label" class="${ambientPlayer.isPlaying ? 'playing' : ''}">${ambientPlayer.isPlaying && ambientPlayer.stationIndex != null ? (getAllStations()[ambientPlayer.stationIndex]?.name || '') : ''}</span>
        <div class="music-wrap">
          <button class="icon-btn music-btn${ambientPlayer.isPlaying ? ' playing' : ''}" id="music-toggle" title="Play/pause ambient music" aria-label="Play/pause ambient music"><span id="music-note-icon" style="${ambientPlayer.isPlaying ? 'display:none' : ''}">${musicNoteSvg}</span><span class="eq-bars" id="eq-bars" style="${ambientPlayer.isPlaying ? 'display:inline-flex' : 'display:none'}"><span class="eq-bar b1"></span><span class="eq-bar b2"></span><span class="eq-bar b3"></span></span></button>
          <button class="music-caret-btn${ambientPlayer.isPlaying ? ' playing' : ''}" id="music-caret-btn" title="Choose a station" aria-label="Choose a station">&#9662;</button>
          <div class="notes-dropdown music-dropdown" id="music-dropdown">${musicDropdownHtml()}</div>
        </div>
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
const ICON_BULLET_LIST   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
const ICON_NUMBERED_LIST = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/></svg>`;


function paginationHtml(page, total, prevAttr, nextAttr) {
  if (total <= 1) return '';
  return `<div class="pagination">
      <button class="page-btn" ${page <= 1 ? 'disabled' : ''} data-${prevAttr}>${ICON_CHEV_L}</button>
      <span class="page-indicator">${page} / ${total}</span>
      <button class="page-btn" ${page >= total ? 'disabled' : ''} data-${nextAttr}>${ICON_CHEV_R}</button>
    </div>`;
}

/* =========================================================
   ANIMATIONS
========================================================= */
function animateNumbers() {
  document.querySelectorAll('.num[data-target]').forEach(el => {
    const target = Number(el.dataset.target || 0);
    const prefix = el.dataset.prefix || '';
    const fmt = n => prefix + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const start = performance.now();
    const dur = 600;
    (function step(now) {
      const t = Math.min(1, (now - start) / dur);
      el.textContent = fmt(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    })(performance.now());
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
    } else if (f.type === 'time') {
      const [hh, mm] = String(f.value || '00:00').split(':');
      input = `<div class="time-picker" id="modal-f-${f.id}" data-value="${escapeHtml(String(f.value || '00:00'))}">
        <div class="time-spin">
          <button type="button" class="time-spin-btn" data-spin-unit="hour" data-spin-dir="1" aria-label="Hour up">&#x25B2;</button>
          <input type="text" class="time-spin-input" data-unit="hour" inputmode="numeric" maxlength="2" value="${escapeHtml(hh || '00')}">
          <button type="button" class="time-spin-btn" data-spin-unit="hour" data-spin-dir="-1" aria-label="Hour down">&#x25BC;</button>
        </div>
        <span class="time-spin-sep">:</span>
        <div class="time-spin">
          <button type="button" class="time-spin-btn" data-spin-unit="minute" data-spin-dir="1" aria-label="Minute up">&#x25B2;</button>
          <input type="text" class="time-spin-input" data-unit="minute" inputmode="numeric" maxlength="2" value="${escapeHtml(mm || '00')}">
          <button type="button" class="time-spin-btn" data-spin-unit="minute" data-spin-dir="-1" aria-label="Minute down">&#x25BC;</button>
        </div>
      </div>`;
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

  // Wire up toggle/select → show/hide controlled fields
  // (toggle: shown while checked; select: shown only when its value === f.controlsWhen)
  fields.forEach(f => {
    if (!f.controls || (f.type !== 'toggle' && f.type !== 'select')) return;
    const triggerEl = document.getElementById('modal-f-' + f.id);
    const controlled = container.querySelector(`[data-field-id="${f.controls}"]`);
    if (!triggerEl || !controlled) return;
    const shouldShow = () => f.type === 'toggle' ? triggerEl.checked : triggerEl.value === f.controlsWhen;
    controlled.style.display = shouldShow() ? '' : 'none';
    triggerEl.addEventListener('change', () => {
      controlled.style.display = shouldShow() ? '' : 'none';
    });
  });

  // Wire up showWhen — a field that appears only while another field's value is in a set,
  // e.g. { id: 'unit', showWhen: { field: 'kind', values: ['count'] } }. Unlike `controls`
  // (one trigger → one field), this lets several fields key off the same select.
  fields.forEach(f => {
    if (!f.showWhen) return;
    const triggerEl = document.getElementById('modal-f-' + f.showWhen.field);
    const self = container.querySelector(`[data-field-id="${f.id}"]`);
    if (!triggerEl || !self) return;
    const sync = () => { self.style.display = f.showWhen.values.includes(triggerEl.value) ? '' : 'none'; };
    sync();
    triggerEl.addEventListener('change', sync);
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

  // Wire up time fields — 24h hour/minute spinners with wraparound
  fields.forEach(f => {
    if (f.type !== 'time') return;
    const wrap = document.getElementById('modal-f-' + f.id);
    if (!wrap) return;
    const hourInput = wrap.querySelector('[data-unit="hour"]');
    const minInput  = wrap.querySelector('[data-unit="minute"]');
    const wrapUnit = (n, max) => ((n % (max + 1)) + (max + 1)) % (max + 1);
    const sync = () => {
      const hh = String(wrapUnit(parseInt(hourInput.value, 10) || 0, 23)).padStart(2, '0');
      const mm = String(wrapUnit(parseInt(minInput.value, 10) || 0, 59)).padStart(2, '0');
      hourInput.value = hh; minInput.value = mm;
      wrap.dataset.value = `${hh}:${mm}`;
    };
    wrap.querySelectorAll('.time-spin-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = btn.dataset.spinUnit === 'hour' ? hourInput : minInput;
        const max = btn.dataset.spinUnit === 'hour' ? 23 : 59;
        input.value = wrapUnit((parseInt(input.value, 10) || 0) + Number(btn.dataset.spinDir), max);
        sync();
      });
    });
    [hourInput, minInput].forEach(inp => {
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(0, 2); });
      inp.addEventListener('blur', sync);
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
      else if (f.type === 'time') values[f.id] = el.dataset.value || '00:00';
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
   EVENT BINDING — shared (topbar tweaks/logout/music, nav pills)
========================================================= */

function bindSharedEvents() {
  // tweaks + logout (inside main, re-bound on each render)
  const ot = main.querySelector('#open-tweaks');
  if (ot) ot.addEventListener('click', toggleTweaks);
  const tlb = main.querySelector('#topbar-logout-btn');
  if (tlb) tlb.addEventListener('click', signOut);
  const mt = main.querySelector('#music-toggle');
  if (mt) mt.addEventListener('click', toggleAmbientMusic);
  const mc = main.querySelector('#music-caret-btn');
  if (mc) mc.addEventListener('click', (e) => {
    e.stopPropagation();
    main.querySelector('#music-dropdown')?.classList.toggle('open');
  });
  main.querySelectorAll('#music-dropdown [data-station-idx]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    selectStation(Number(el.dataset.stationIdx));
  }));

  // navigation pills
  main.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => setActiveTab(el.dataset.go)));

}


/* =========================================================
   EVENT BINDING — orchestrator (calls each page's bind*Events())
========================================================= */
function bindMainEvents() {
  // clear any running intervals from previous render
  clearInterval(clockIntervalId); clockIntervalId = null;
  clearInterval(notesTimestampIntervalId); notesTimestampIntervalId = null;

  bindSharedEvents();
  bindHomeEvents();
  bindScheduleEvents();
  bindCommitmentsEvents();
  bindProjectsEvents();
  bindNotesEvents();
  bindFinanceEvents();
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
    if (!dd.contains(e.target) && !e.target.closest('#notes-sort-btn, #notes-filter-btn, [data-dd-toggle], #music-caret-btn, #music-toggle')) {
      dd.classList.remove('open');
    }
  });
  document.querySelectorAll('.tb-weight-list.open').forEach(l => {
    if (!l.contains(e.target) && !e.target.closest('.tb-font-item')) {
      l.classList.remove('open');
    }
  });
});

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

/* ---- Custom YouTube stations: unbounded list, add/remove from the Tweaks panel ----
   Persisted to their own localStorage key ('hq.customStations') — unlike the rest of
   Tweaks (an in-memory-only reset on refresh, see index.html's hardcoded
   window.__HQ_TWEAKS default), these need to survive a reload since there's nowhere
   else (no Supabase column) that remembers them per device.
   #tw-custom-stations-list is rebuilt (renderCustomStationsList()) only when a row is
   added/removed — never on every keystroke, via delegated input/click listeners below
   — so typing in a row never fights a rebuild for focus. */
function persistCustomStations() {
  try { localStorage.setItem('hq.customStations', JSON.stringify(window.__HQ_TWEAKS.customStations || [])); } catch (e) {}
}

function renderCustomStationsList() {
  const el = document.getElementById('tw-custom-stations-list');
  if (!el) return;
  const stations = window.__HQ_TWEAKS.customStations || [];
  el.innerHTML = stations.map((s, i) => `
    <div class="row tw-custom-station">
      <input type="text" class="tw-custom-name" data-i="${i}" placeholder="Name (e.g. Study Beats)" value="${escapeHtml(s.name || '')}">
      <input type="text" class="tw-custom-url" data-i="${i}" placeholder="YouTube link" value="${escapeHtml(s.url || '')}">
      <button class="tw-custom-del" data-i="${i}" title="Remove station" aria-label="Remove station">${ICON_TRASH}</button>
    </div>`).join('') || `<div class="tw-hint" style="margin-bottom:8px">No custom stations yet — add one below.</div>`;
}

function addCustomStation() {
  if (!window.__HQ_TWEAKS.customStations) window.__HQ_TWEAKS.customStations = [];
  window.__HQ_TWEAKS.customStations.push({ name: '', url: '' });
  persistCustomStations();
  renderCustomStationsList();
  render();
  const names = document.querySelectorAll('#tw-custom-stations-list .tw-custom-name');
  names[names.length - 1]?.focus();
}

function removeCustomStation(i) {
  window.__HQ_TWEAKS.customStations.splice(i, 1);
  persistCustomStations();
  renderCustomStationsList();
  render();
}

function setCustomStationField(i, field, value) {
  const s = (window.__HQ_TWEAKS.customStations || [])[i];
  if (!s) return;
  s[field] = value;
  persistCustomStations();
  render(); // refreshes the topbar's music dropdown; #tweaks-panel itself is untouched by render(), so the input keeps focus
}

renderCustomStationsList();
document.getElementById('tw-custom-add-btn')?.addEventListener('click', addCustomStation);
document.getElementById('tw-custom-stations-list')?.addEventListener('input', (e) => {
  const t = e.target, i = Number(t.dataset.i);
  if (t.classList.contains('tw-custom-name')) setCustomStationField(i, 'name', t.value);
  else if (t.classList.contains('tw-custom-url')) setCustomStationField(i, 'url', t.value);
});
document.getElementById('tw-custom-stations-list')?.addEventListener('click', (e) => {
  const delBtn = e.target.closest('.tw-custom-del');
  if (delBtn) removeCustomStation(Number(delBtn.dataset.i));
});

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
