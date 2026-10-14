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
  goals: { items: [] },  // items: {id, text, target_count, unit, category, reminder_time} — kind is derived (getGoalKind in commitments.js): unit menit/detik = Duration (timer-only), other unit or target_count>1 = Count (progress bar + buttons), else Yes/No checkbox. No Do/Don't split — every commitment is something you're building (see CLAUDE.md).
  goalLogs: [],   // [{id, goal_id, user_id, date, checked, count, completed_at}] — checked is always (count >= goal.target_count) and means "target fully hit"; compliance % uses count/target (partial credit); completed_at is set/cleared alongside checked and feeds Home's activity list
  projects: [],       // [{id, name, status, deadline, tasks:[{id,text,description,checked,completed_at}]}]
  projectsFilter: 'all',
  expandedProjectIds: [],
  openProjectCards: [],   // project cards the user opened (cards start collapsed)
  homeProjectIndex: 0,
  notes: [],      // [{id, title, content, created_at, updated_at}]
  todayFocus: [], // [{id, text, checked, created_at}]
  income: [],
  spending: [],
  debts: [],
  selectedDay: todayISO(),
  activeTab: 'life:home',
  viewMonth: todayISO().slice(0, 7),
  scheduleView: 'week',   // Schedule page view: 'day' | 'week' | 'month'
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
   plain <audio> stream; any number of user-supplied YouTube links ("Manage
   stations" modal, see showStationsModal()) play via the YouTube IFrame Player API, mounted
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
// paused = the user paused a loaded station via the note icon (resumable) — the
// button then shows frozen eq bars + the station name instead of the idle note.
const ambientPlayer = { kind: null, audio: null, stationIndex: null, isPlaying: false, paused: false };

// 'playing' | 'paused' | 'idle' — what the topbar button should look like.
function musicUiState() {
  if (ambientPlayer.isPlaying) return 'playing';
  if (ambientPlayer.paused && ambientPlayer.stationIndex != null) return 'paused';
  return 'idle';
}

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
      onReady: (e) => { e.target.setVolume(effectiveMusicVolume()); e.target.playVideo(); },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.PLAYING)  { ambientPlayer.isPlaying = true; ambientPlayer.paused = false; updateMusicBtn(true); }
        if (e.data === YT.PlayerState.PAUSED)   { ambientPlayer.isPlaying = false; updateMusicBtn(false); }
      },
      onError: () => {
        showToast('That YouTube link can\'t be played (embedding may be disabled)', 'error');
        ambientPlayer.isPlaying = false;
        ambientPlayer.paused = false;
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
  const ui       = musicUiState();
  const paused   = ui === 'paused';
  const active   = ui !== 'idle';
  if (btn) {
    btn.classList.toggle('playing', playing);
    btn.classList.toggle('paused', paused);
    const t = paused && station ? `Resume ${station.name}` : playing ? 'Pause ambient music' : 'Play/pause ambient music';
    btn.title = t;
    btn.setAttribute('aria-label', t);
  }
  if (caret)  caret.classList.toggle('playing', playing);
  if (eq)     eq.style.display = playing ? 'inline-flex' : 'none';
  if (noteIcon) noteIcon.style.display = playing ? 'none' : 'inline-flex';
  if (label) {
    label.textContent = active && station ? station.name : '';
    label.classList.toggle('playing', playing);
    label.classList.toggle('paused', paused);
  }
  const pill = document.getElementById('music-pill');
  if (pill) { pill.classList.toggle('active', active); pill.classList.toggle('paused', paused); pill.classList.toggle('playing', playing); }
  const time = document.getElementById('music-time');
  if (time) time.textContent = active ? musicTimeText() : '';
  if (typeof refreshMusicPanel === 'function') refreshMusicPanel();
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
  ambientPlayer.paused = false;
  pauseCurrentStation();
  if (ambientPlayer.audio) { ambientPlayer.audio = null; }
}

function playAudioStation(idx, station) {
  stopCurrentStation();
  ambientPlayer.kind = 'audio';
  ambientPlayer.stationIndex = idx;
  const audio = new Audio(station.url);
  audio.crossOrigin = 'anonymous';
  audio.volume = effectiveMusicVolume() / 100;
  ambientPlayer.audio = audio;
  const fail = () => {
    showToast(`${station.name} isn't reachable right now`, 'error');
    ambientPlayer.isPlaying = false;
    ambientPlayer.paused = false;
    updateMusicBtn(false);
  };
  audio.addEventListener('error', fail, { once: true });
  audio.play().then(() => { ambientPlayer.isPlaying = true; ambientPlayer.paused = false; updateMusicBtn(true); }).catch(fail);
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
  // (panel stays open on pick since 2026-10-14 — it shows the new now-playing card)
  // Picking the station that's currently paused resumes it from where it
  // stopped instead of reloading it from the start.
  if (idx === ambientPlayer.stationIndex && ambientPlayer.paused) { resumeCurrentStation(); return; }
  if (station.kind === 'youtube') playYoutubeStation(idx, station);
  else playAudioStation(idx, station);
}

// Note icon click: pause/resume only — never picks a station on its own.
function toggleAmbientMusic() {
  if (ambientPlayer.stationIndex == null) {
    const dd = document.getElementById('music-dropdown');
    dd?.classList.toggle('open');
    return;
  }
  if (ambientPlayer.isPlaying) {
    ambientPlayer.paused = true;
    pauseCurrentStation();
  } else {
    resumeCurrentStation();
  }
}

function resumeCurrentStation() {
  if (ambientPlayer.kind === 'youtube' && ytPlayer) {
    ytPlayer.playVideo();
  } else if (ambientPlayer.kind === 'audio' && ambientPlayer.audio) {
    ambientPlayer.audio.play()
      .then(() => { ambientPlayer.isPlaying = true; ambientPlayer.paused = false; updateMusicBtn(true); })
      .catch(() => {
        // Stream went stale while paused — drop the paused state so picking
        // the station again reloads it fresh instead of retrying the resume.
        ambientPlayer.paused = false;
        updateMusicBtn(false);
        showToast('Couldn\'t resume — pick the station again', 'error');
      });
  }
}

/* ---- Volume — one level shared by both engines (<audio> takes 0..1, the YT
   player 0..100), persisted per device in localStorage['hq.musicVolume'].
   The slider appears at the top of the topbar picker and in Focus mode's sound
   flyout; syncMusicVolumeUI() keeps every copy in step without a render(). ---- */
const MUSIC_VOLUME_KEY = 'hq.musicVolume';
const MUSIC_VOLUME_DEFAULT = 40;
let musicVolume = (() => {
  try {
    const v = JSON.parse(localStorage.getItem(MUSIC_VOLUME_KEY));
    if (v && typeof v.level === 'number') return { level: Math.max(0, Math.min(100, Math.round(v.level))), muted: !!v.muted };
  } catch (e) {}
  return { level: MUSIC_VOLUME_DEFAULT, muted: false };
})();
function effectiveMusicVolume() { return musicVolume.muted ? 0 : musicVolume.level; }
function applyMusicVolume() {
  const v = effectiveMusicVolume();
  if (ambientPlayer.audio) ambientPlayer.audio.volume = v / 100;
  if (ytPlayer && typeof ytPlayer.setVolume === 'function') { try { ytPlayer.setVolume(v); } catch (e) {} }
}
function saveMusicVolume() {
  try { localStorage.setItem(MUSIC_VOLUME_KEY, JSON.stringify(musicVolume)); } catch (e) {}
}
function setMusicVolume(level) {
  musicVolume.level = Math.max(0, Math.min(100, Math.round(level)));
  musicVolume.muted = false;
  applyMusicVolume();
  saveMusicVolume();
  syncMusicVolumeUI();
}
function toggleMusicMute() {
  // Unmuting from a slider dragged all the way down restores an audible level.
  if (musicVolume.level === 0) { setMusicVolume(MUSIC_VOLUME_DEFAULT); return; }
  musicVolume.muted = !musicVolume.muted;
  applyMusicVolume();
  saveMusicVolume();
  syncMusicVolumeUI();
}
function musicVolumeIcon(v) {
  const speaker = '<path d="M4 9h3l4-4v14l-4-4H4z" fill="currentColor" stroke="none"/>';
  const waves = v === 0 ? '<path d="M16 9l5 6M21 9l-5 6"/>'
    : v < 50 ? '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/>'
    : '<path d="M15.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18 7a7 7 0 0 1 0 10"/>';
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${speaker}${waves}</svg>`;
}
function musicVolumeHtml() {
  const v = effectiveMusicVolume();
  return `<div class="music-vol" data-music-vol style="--vol:${v}%">
    <button type="button" class="music-vol-mute" data-music-mute aria-label="${v === 0 ? 'Unmute' : 'Mute'}" title="${v === 0 ? 'Unmute' : 'Mute'}">${musicVolumeIcon(v)}</button>
    <input type="range" class="music-vol-range" data-music-vol-range min="0" max="100" step="1" value="${v}" aria-label="Volume">
    <span class="music-vol-val">${v}</span>
  </div>`;
}
function syncMusicVolumeUI() {
  const v = effectiveMusicVolume();
  document.querySelectorAll('[data-music-vol]').forEach(el => {
    el.style.setProperty('--vol', v + '%');
    const range = el.querySelector('[data-music-vol-range]');
    if (range && Number(range.value) !== v) range.value = v;
    const val = el.querySelector('.music-vol-val');
    if (val) val.textContent = v;
    const mute = el.querySelector('[data-music-mute]');
    if (mute) {
      mute.innerHTML = musicVolumeIcon(v);
      mute.setAttribute('aria-label', v === 0 ? 'Unmute' : 'Mute');
      mute.title = v === 0 ? 'Unmute' : 'Mute';
    }
  });
}
function bindMusicVolume(root) {
  root.querySelectorAll('[data-music-vol]').forEach(el => {
    // Clicks inside must not bubble into the picker's station/close handlers.
    el.addEventListener('click', e => e.stopPropagation());
    el.querySelector('[data-music-vol-range]')?.addEventListener('input', e => setMusicVolume(Number(e.target.value)));
    el.querySelector('[data-music-mute]')?.addEventListener('click', toggleMusicMute);
  });
}

/* ---- Spotify-style music panel (2026-10-14) ----
   Topbar pill = play/pause button + station name + "m:ss / m:ss" (YouTube) or
   LIVE (radio). Panel (#music-dropdown) = now-playing card with thumbnail,
   seekable progress bar, ⏮ ❚❚ ⏭, volume, All / Radio / My stations tabs, and a
   station list with cached durations. Progress is updated in place every 1s
   by musicTick(); the panel itself is rebuilt by refreshMusicPanel() only on
   station / play-state changes. ---- */
const YT_DURATIONS_KEY = 'hq.ytDurations';
let ytDurations = (() => { try { return JSON.parse(localStorage.getItem(YT_DURATIONS_KEY)) || {}; } catch (e) { return {}; } })();
let musicPanelTab = 'all';   // 'all' | 'radio' | 'mine' — remembered for the session

function fmtDur(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
// { cur, dur } in seconds for the current YouTube station, or null (radio / nothing loaded)
function musicProgress() {
  if (ambientPlayer.kind !== 'youtube' || !ytPlayer || typeof ytPlayer.getDuration !== 'function') return null;
  try {
    const dur = ytPlayer.getDuration() || 0, cur = ytPlayer.getCurrentTime() || 0;
    return dur > 0 ? { cur, dur } : null;
  } catch (e) { return null; }
}
function musicTimeText() {
  const st = ambientPlayer.stationIndex != null ? getAllStations()[ambientPlayer.stationIndex] : null;
  if (!st) return '';
  if (st.kind !== 'youtube') return 'LIVE';
  const p = musicProgress();
  return p ? `${fmtDur(p.cur)} / ${fmtDur(p.dur)}` : '…';
}
function stationThumbHtml(st, size) {
  if (st && st.kind === 'youtube') return `<img class="mp-thumb" style="width:${size}px;height:${size}px" src="https://i.ytimg.com/vi/${st.videoId}/mqdefault.jpg" alt="" loading="lazy" onerror="this.onerror=null;this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">`;
  return `<span class="mp-thumb mp-thumb-radio" style="width:${size}px;height:${size}px"><svg width="${Math.round(size * 0.45)}" height="${Math.round(size * 0.45)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5"/></svg></span>`;
}

function musicDropdownHtml() {
  const all = getAllStations();
  const builtN = AMBIENT_STREAMS.length;
  const ui = musicUiState();
  const curIdx = ambientPlayer.stationIndex;
  const cur = curIdx != null ? all[curIdx] : null;
  const p = musicProgress();
  const pct = p ? (p.cur / p.dur) * 100 : 0;
  const nowHtml = cur ? `
    <div class="mp-now">
      ${stationThumbHtml(cur, 64)}
      <div class="mp-now-main">
        <div class="mp-now-title" title="${escapeHtml(cur.name)}">${escapeHtml(cur.name)}</div>
        <div class="mp-now-sub">${cur.kind === 'youtube' ? 'My stations · YouTube' : 'Radio'}${ui === 'paused' ? ' · Paused' : ''}</div>
        ${cur.kind === 'youtube'
          ? `<div class="mp-bar" data-mp-seek title="Seek"><i data-mp-fill style="width:${pct}%"></i></div>
             <div class="mp-times"><span data-mp-cur>${p ? fmtDur(p.cur) : '0:00'}</span><span data-mp-dur>${p ? fmtDur(p.dur) : (ytDurations[cur.videoId] ? fmtDur(ytDurations[cur.videoId]) : '—')}</span></div>`
          : `<div class="mp-live-row"><span class="mp-live">LIVE</span><span class="mp-now-sub">Streaming</span></div>`}
      </div>
    </div>`
    : `<div class="mp-now mp-now-empty">Pick a station below.</div>`;
  const playIcon = ui === 'playing'
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
  const row = (s, i) => {
    const isCur = ui !== 'idle' && i === curIdx;
    const dur = s.kind === 'youtube' ? (ytDurations[s.videoId] ? fmtDur(ytDurations[s.videoId]) : '—') : '<span class="mp-live">LIVE</span>';
    return `<button class="mp-row${isCur ? ' sel' : ''}" data-station-idx="${i}" data-kind="${s.kind === 'youtube' ? 'mine' : 'radio'}">
      ${stationThumbHtml(s, 30)}
      <span class="mp-row-name">${isCur && ui === 'playing' ? '<span class="eq-bars mp-row-eq"><span class="eq-bar b1"></span><span class="eq-bar b2"></span><span class="eq-bar b3"></span></span>' : ''}${escapeHtml(s.name)}</span>
      <span class="mp-row-dur">${dur}</span>
    </button>`;
  };
  return `
    ${nowHtml}
    <div class="mp-ctl">
      <button class="mp-ctl-btn" data-mp-step="-1" aria-label="Previous station" title="Previous station"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5.5v13L9.5 12z"/></svg></button>
      <button class="mp-ctl-btn mp-play" data-mp-play aria-label="${ui === 'playing' ? 'Pause' : 'Play'}">${playIcon}</button>
      <button class="mp-ctl-btn" data-mp-step="1" aria-label="Next station" title="Next station"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5.5v13L14.5 12z"/></svg></button>
    </div>
    ${musicVolumeHtml()}
    <div class="mp-tabs">
      ${[['all', 'All'], ['radio', 'Radio'], ['mine', 'My stations']].map(([k, l]) => `<button class="mp-tab${musicPanelTab === k ? ' on' : ''}" data-mp-tab="${k}">${l}</button>`).join('')}
    </div>
    <div class="mp-list" data-tab="${musicPanelTab}">
      ${all.map(row).join('')}
      ${all.length === builtN && musicPanelTab === 'mine' ? '<div class="mp-empty">No YouTube stations yet.</div>' : ''}
    </div>
    <button class="mp-manage" data-manage-stations>${all.length > builtN ? 'Manage stations' : '+ Add a YouTube station'}</button>
  `;
}

// Binds one panel element. Safe to call again after refreshMusicPanel().
function bindMusicPanel(dd) {
  if (!dd) return;
  if (!dd._mpRootBound) {
    // keep clicks inside from reaching the document-level "close dropdowns" handler —
    // the panel re-renders itself, so the click target may already be detached
    dd.addEventListener('click', e => e.stopPropagation());
    dd._mpRootBound = true;
  }
  dd.querySelectorAll('[data-station-idx]').forEach(el => el.addEventListener('click', () => selectStation(Number(el.dataset.stationIdx))));
  dd.querySelector('[data-manage-stations]')?.addEventListener('click', () => showStationsModal());
  dd.querySelector('[data-mp-play]')?.addEventListener('click', () => {
    if (ambientPlayer.stationIndex == null) { selectStation(0); return; }
    toggleAmbientMusic();
  });
  dd.querySelectorAll('[data-mp-step]').forEach(el => el.addEventListener('click', () => {
    const n = getAllStations().length;
    if (!n) return;
    const base = ambientPlayer.stationIndex == null ? -1 : ambientPlayer.stationIndex;
    selectStation((base + Number(el.dataset.mpStep) + n) % n);
  }));
  dd.querySelectorAll('[data-mp-tab]').forEach(el => el.addEventListener('click', () => {
    musicPanelTab = el.dataset.mpTab;
    dd.querySelectorAll('[data-mp-tab]').forEach(t => t.classList.toggle('on', t === el));
    const list = dd.querySelector('.mp-list');
    if (list) list.dataset.tab = musicPanelTab;
  }));
  dd.querySelector('[data-mp-seek]')?.addEventListener('click', (e) => {
    const p = musicProgress();
    if (!p) return;
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1);
    try { ytPlayer.seekTo(frac * p.dur, true); } catch (err) {}
    musicTick();
  });
  bindMusicVolume(dd);
}

function refreshMusicPanel() {
  ['music-dropdown', 'focus-music-panel'].forEach(id => {
    const dd = document.getElementById(id);
    if (!dd) return;
    dd.innerHTML = musicDropdownHtml();
    bindMusicPanel(dd);
  });
}

// 1s tick: pill time, panel progress, and caching YouTube durations.
function musicTick() {
  const p = musicProgress();
  const st = ambientPlayer.stationIndex != null ? getAllStations()[ambientPlayer.stationIndex] : null;
  if (p && st && st.videoId && Math.round(ytDurations[st.videoId] || 0) !== Math.round(p.dur)) {
    ytDurations[st.videoId] = Math.round(p.dur);
    try { localStorage.setItem(YT_DURATIONS_KEY, JSON.stringify(ytDurations)); } catch (e) {}
    document.querySelectorAll(`.mp-row[data-station-idx="${ambientPlayer.stationIndex}"] .mp-row-dur`).forEach(c => { c.textContent = fmtDur(p.dur); });
  }
  const t = document.getElementById('music-time');
  if (t) t.textContent = musicUiState() === 'idle' ? '' : musicTimeText();
  if (p) {
    document.querySelectorAll('[data-mp-fill]').forEach(f => { f.style.width = (p.cur / p.dur * 100) + '%'; });
    document.querySelectorAll('[data-mp-cur]').forEach(c => { c.textContent = fmtDur(p.cur); });
    document.querySelectorAll('[data-mp-dur]').forEach(d => { d.textContent = fmtDur(p.dur); });
  }
}
setInterval(musicTick, 1000);

/* =========================================================
   LOADING — anything that waits on the network shows it.
   Two levels: a spinner on the button that started the wait (setBtnLoading /
   withBtnLoading, also blocks double-clicks), and a small top "Saving…" pill
   (beginBusy/endBusy) that every dbCall() raises — shown only once a wait
   passes BUSY_DELAY_MS so quick writes don't flicker, and skipped while a
   button spinner is already on screen.
========================================================= */
const BUSY_DELAY_MS = 300;
let busyCount = 0;
let busyTimer = null;
function beginBusy(label = 'Saving…') {
  busyCount++;
  let el = document.getElementById('hq-busy');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hq-busy';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span class="hq-spinner"></span><span>${escapeHtml(label)}</span>`;
  if (!busyTimer && !el.classList.contains('show')) {
    busyTimer = setTimeout(() => {
      busyTimer = null;
      if (busyCount > 0 && !document.querySelector('.is-loading')) el.classList.add('show');
    }, BUSY_DELAY_MS);
  }
}
function endBusy() {
  busyCount = Math.max(0, busyCount - 1);
  if (busyCount) return;
  clearTimeout(busyTimer);
  busyTimer = null;
  document.getElementById('hq-busy')?.classList.remove('show');
}
async function withBusy(fn, label) {
  beginBusy(label);
  try { return await fn(); } finally { endBusy(); }
}
function setBtnLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('is-loading', on);
  btn.disabled = on;
  if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
}
// Runs fn with btn spinning; ignores clicks while it's already spinning.
async function withBtnLoading(btn, fn) {
  if (btn?.classList.contains('is-loading')) return;
  setBtnLoading(btn, true);
  try { return await fn(); } finally { setBtnLoading(btn, false); }
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
  btn.style.color = danger ? '#ededed' : '#0f0f0f';
  btn.style.setProperty('--spin-c', danger ? '#ededed' : '#0f0f0f');
  setBtnLoading(btn, false);

  // A later showConfirmModal() (e.g. the recurring-series follow-up) reuses this
  // overlay — the token stops an older async confirm from closing the newer one.
  const token = {};
  overlay._hqToken = token;
  let busy = false;
  function close() {
    document.removeEventListener('keydown', escHandler);
    if (overlay._hqToken === token) hideConfirmModal();
  }
  // Sync onConfirm → close first, as before. Async onConfirm → stay open with a
  // spinner until it settles; on failure stay open so it can be retried.
  function confirm() {
    if (busy) return;
    const result = onConfirm();
    if (!result || typeof result.then !== 'function') { close(); return; }
    busy = true;
    setBtnLoading(btn, true);
    result.then(() => { busy = false; setBtnLoading(btn, false); close(); },
                e  => { busy = false; setBtnLoading(btn, false); console.error(e); });
  }
  function escHandler(e) {
    if (busy) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'Enter' && !e.shiftKey) {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      confirm();
    }
  }

  btn.onclick       = confirm;
  cancelBtn.onclick = (e) => { e.stopPropagation(); if (!busy) close(); };
  overlay.onclick   = (e) => { if (e.target === overlay && !busy) close(); };
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
    viewMonth: state.viewMonth,
    scheduleView: state.scheduleView
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
    if (p.scheduleView) state.scheduleView = p.scheduleView;
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
  // ▶ when idle/paused, live eq bars while playing, ❚❚ on hover while playing (2026-10-14)
  // quick-actions: the app you're currently in is white and listed first (Headquarter, or Focus while its overlay is open)
  const focusIsOpen = !!document.getElementById('focus-overlay')?.classList.contains('open');
  const musicNoteSvg = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style="margin-left:2px"><path d="M7 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2c.6-.4.6-1.4 0-1.8L8.6 3.9C7.9 3.5 7 4 7 4.8z"/></svg>`;
  return `
    <header class="topbar">
      <div class="greet">
        <div class="hello">${greeting()}, <span style="color:var(--text)">${escapeHtml(name)}</span></div>
        <div class="date">${todayLabel()} &bull; <span id="live-clock">${fmtClock()}</span></div>
      </div>
      <div class="right">
        <button class="mobile-signout-btn" id="topbar-logout-btn" aria-label="Sign out">${signOutSvg}</button>
        <div class="music-wrap">
          <div class="music-pill${musicUiState() === 'idle' ? '' : ' active ' + musicUiState()}" id="music-pill">
            <button class="icon-btn music-btn${musicUiState() === 'idle' ? '' : ' ' + musicUiState()}" id="music-toggle" title="Play/pause ambient music" aria-label="Play/pause ambient music"><span id="music-note-icon" style="${musicUiState() === 'playing' ? 'display:none' : 'display:inline-flex'}">${musicNoteSvg}</span><span class="eq-bars" id="eq-bars" style="${musicUiState() === 'playing' ? 'display:inline-flex' : 'display:none'}"><span class="eq-bar b1"></span><span class="eq-bar b2"></span><span class="eq-bar b3"></span><span class="eq-bar b4"></span></span><span class="music-pause-icon" aria-hidden="true"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16" rx="1.2"/><rect x="14" y="4" width="5" height="16" rx="1.2"/></svg></span></button>
            <button class="music-pill-text" data-dd-toggle data-music-open title="Open player">
              <span id="music-label">${musicUiState() !== 'idle' ? escapeHtml(getAllStations()[ambientPlayer.stationIndex]?.name || '') : ''}</span>
              <span id="music-time" class="music-time">${musicUiState() !== 'idle' ? musicTimeText() : ''}</span>
            </button>
          </div>
          <button class="music-caret-btn${ambientPlayer.isPlaying ? ' playing' : ''}" id="music-caret-btn" title="Open player" aria-label="Open player">&#9662;</button>
          <div class="notes-dropdown music-panel" id="music-dropdown">${musicDropdownHtml()}</div>
        </div>
        <div class="apps-wrap">
          <button class="icon-btn apps-btn" id="apps-btn" title="Quick actions" aria-label="Quick actions" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg></button>
          <div class="apps-dropdown" id="apps-dropdown">
            ${focusIsOpen ? `            <button class="apps-tile${focusIsOpen ? ' is-active' : ''}" data-app-action="focus"><span class="apps-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/></svg></span><span class="apps-label">Focus</span></button>` : `            <button class="apps-tile${focusIsOpen ? '' : ' is-active'}" data-app-action="home"><span class="apps-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5L12 4l8 6.5"/><path d="M6 9v10h12V9"/><path d="M10 19v-5h4v5"/></svg></span><span class="apps-label">Headquarter</span></button>`}
            ${focusIsOpen ? `            <button class="apps-tile${focusIsOpen ? '' : ' is-active'}" data-app-action="home"><span class="apps-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5L12 4l8 6.5"/><path d="M6 9v10h12V9"/><path d="M10 19v-5h4v5"/></svg></span><span class="apps-label">Headquarter</span></button>` : `            <button class="apps-tile${focusIsOpen ? ' is-active' : ''}" data-app-action="focus"><span class="apps-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.8" fill="currentColor"/></svg></span><span class="apps-label">Focus</span></button>`}
          </div>
        </div>
        <!-- Tweaks retired 2026-09-29, see index.html:
        <button class="icon-btn" id="open-tweaks" title="Tweaks" aria-label="Tweaks">&#x2699;&#xFE0E;</button>
        -->
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
const ICON_PLAY  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>`;
const ICON_PAUSE = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>`;
const ICON_MUSIC_NOTE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
const ICON_TAG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41L11 3.83A2 2 0 009.59 3.24L4 3a1 1 0 00-1 1l.24 5.59a2 2 0 00.59 1.41l9.58 9.58a2 2 0 002.83 0l4.35-4.35a2 2 0 000-2.82z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none"/></svg>`;
const ICON_CLOUD_RAIN = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M7 15a4.5 4.5 0 01-.5-8.97A6 6 0 0118 7.5a3.75 3.75 0 01-.5 7.5H7z"/><path d="M8 18.5l-1 2M12 18.5l-1 2M16 18.5l-1 2"/></svg>`;
const ICON_IMAGE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>`;
const FOCUS_WEATHER_ICONS = {
  none: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>`,
  snow: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/></svg>`,
  rain: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4.5 4.5 0 01-.5-8.97A6 6 0 0118 5.5a3.75 3.75 0 01-.5 7.5H7z"/><path d="M8 16l-1.5 3.5M12 16l-1.5 3.5M16 16l-1.5 3.5"/></svg>`,
  both: `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 13a4.5 4.5 0 01-.5-8.97A6 6 0 0118 5.5a3.75 3.75 0 01-.5 7.5H7z"/><path d="M8 16l-1.5 3.5M15.5 16l-1.5 3.5"/><circle cx="11.5" cy="18" r="0.9" fill="currentColor"/><circle cx="18" cy="20" r="0.9" fill="currentColor"/></svg>`
};
const ICON_PALETTE = `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21a9 9 0 110-18 7 7 0 017 7c0 1.5-1 2.5-2.5 2.5H15a1.5 1.5 0 00-1 2.6c.4.4.6.9.6 1.4 0 1.5-1.2 2.5-2.6 2.5z"/><circle cx="7.5" cy="10.5" r="1" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1" fill="currentColor" stroke="none"/></svg>`;
const ICON_FULLSCREEN_ENTER = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3"/></svg>`;
const ICON_FULLSCREEN_EXIT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v3a2 2 0 01-2 2H4M15 3v3a2 2 0 002 2h3M9 21v-3a2 2 0 00-2-2H4M15 21v-3a2 2 0 012-2h3"/></svg>`;


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
      const t = Math.min(1, Math.max(0, (now - start) / dur)); // rAF's timestamp can predate `start` → would count up from a negative number
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

  // True while an async onSave (an insert waiting on Supabase) is in flight —
  // the modal stays open with a spinner and can't be dismissed meanwhile.
  let saving = false;
  const card = document.getElementById('modal-card');
  function closeModal() {
    if (saving) return;
    document.removeEventListener('keydown', modalKeyHandler);
    // onSave may have opened another modal into the same container — leave it be.
    if (!container.contains(card)) return;
    container.innerHTML = '';
    if (onClose) onClose();
  }
  function modalKeyHandler(e) {
    if (saving) return;
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

  const saveBtn = document.getElementById('modal-save');
  saveBtn.addEventListener('click', async () => {
    if (saving) return;
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
    const result = onSave ? onSave(values) : null;
    if (!result || typeof result.then !== 'function') { closeModal(); return; }
    // Async save: keep the form up with a spinner until the write lands. On
    // failure (dbCall already toasted) it stays open so the input isn't lost.
    saving = true;
    setBtnLoading(saveBtn, true);
    card.classList.add('is-saving');
    try {
      await result;
      saving = false;
      closeModal();
    } catch (e) {
      console.error(e);
      saving = false;
      setBtnLoading(saveBtn, false);
      card.classList.remove('is-saving');
    }
  });

  // Focus first text input
  setTimeout(() => {
    const first = container.querySelector('input:not([type="checkbox"]), select, textarea');
    if (first) first.focus();
  }, 50);
}

/* =========================================================
   FOCUS MODE — Pomodoro overlay opened from the bottom-right quick FAB.
   Device-only state (like goalTimers/alarmBannerEl) — not part of `state`,
   mirrored to localStorage so a reload/navigation doesn't lose a running
   timer. DOM lives outside #main (see index.html), so render() never tears
   it down.
========================================================= */
const FOCUS_DEFAULT_MINUTES = 25;
// The picker plays the SAME stations as the topbar ambient music widget
// (AMBIENT_STREAMS / getCustomStations() / getAllStations(), all in this file,
// above) — not a separate parallel sound feature.
const FOCUS_SOUND_TABS = [
  { id: 'mymusic', label: 'My Music' },
  { id: 'radio',   label: 'Radio' },
  { id: 'all',     label: 'All' }
];
let focusTimer = loadFocusTimer();   // { totalSeconds, endsAt, remainingSeconds, running, tag } | null
let focusPrefs = loadFocusPrefs();   // { theme: 'light'|'dark'|'forest' } — persisted
let focusSoundTab = 'radio';         // not persisted — always reopens on Radio (guaranteed non-empty)
let focusOpenPanel = null;           // null | 'sound' | 'theme' — which bottom-corner flyout is open
let focusTags = loadFocusTags();     // string[] — persisted, grows as the user adds tags
let focusSelectedTag = focusTimer?.tag || null; // what this session is for; restored from a running timer
let focusTagPanelOpen = false;       // is the "select a tag" dropdown open
let focusTagAdding = false;          // is the dropdown showing its "new tag" text input
let focusStagedMinutes = FOCUS_DEFAULT_MINUTES; // duration to start with, adjustable via +1/+5/+10 before Start
let focusTickInterval = null;
let focusOverlayEl = null;

function loadFocusTimer() {
  try {
    const raw = localStorage.getItem('hq.focusTimer');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function saveFocusTimer() {
  try {
    if (focusTimer) localStorage.setItem('hq.focusTimer', JSON.stringify(focusTimer));
    else localStorage.removeItem('hq.focusTimer');
  } catch (e) {}
}
function loadFocusPrefs() {
  try {
    const raw = localStorage.getItem('hq.focusPrefs');
    return raw ? JSON.parse(raw) : { theme: 'forest' };
  } catch (e) { return { theme: 'forest' }; }
}
function saveFocusPrefs() {
  try { localStorage.setItem('hq.focusPrefs', JSON.stringify(focusPrefs)); } catch (e) {}
}
function loadFocusTags() {
  try {
    const raw = localStorage.getItem('hq.focusTags');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveFocusTags() {
  try { localStorage.setItem('hq.focusTags', JSON.stringify(focusTags)); } catch (e) {}
}
function focusRemainingSeconds() {
  if (!focusTimer) return 0;
  if (!focusTimer.running) return focusTimer.remainingSeconds;
  return Math.max(0, Math.round((focusTimer.endsAt - Date.now()) / 1000));
}
function focusTimeLabel(seconds) {
  const m = Math.floor(seconds / 60), s = seconds % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
function ensureFocusTicker() {
  if (focusTickInterval || !focusTimer || !focusTimer.running) return;
  focusTickInterval = setInterval(tickFocusTimer, 1000);
}
function stopFocusTicker() {
  if (focusTickInterval) { clearInterval(focusTickInterval); focusTickInterval = null; }
}
function tickFocusTimer() {
  if (!focusTimer || !focusTimer.running) { stopFocusTicker(); return; }
  const remaining = focusRemainingSeconds();
  const disp = focusOverlayEl?.querySelector('#focus-time-display');
  if (disp) disp.textContent = focusTimeLabel(remaining);
  if (remaining <= 0) finishFocusTimer();
}
function startFocusTimer(minutes) {
  const totalSeconds = minutes * 60;
  focusTimer = { totalSeconds, remainingSeconds: totalSeconds, endsAt: Date.now() + totalSeconds * 1000, running: true, tag: focusSelectedTag };
  saveFocusTimer();
  ensureFocusTicker();
  renderFocusOverlay();
}
function addFocusMinutes(mins) {
  if (focusTimer) {
    const addSec = mins * 60;
    focusTimer.totalSeconds += addSec;
    if (focusTimer.running) focusTimer.endsAt += addSec * 1000;
    else focusTimer.remainingSeconds += addSec;
    saveFocusTimer();
  } else {
    focusStagedMinutes = Math.min(180, focusStagedMinutes + mins);
  }
  renderFocusOverlay();
}
function pauseFocusTimer() {
  if (!focusTimer || !focusTimer.running) return;
  focusTimer.remainingSeconds = focusRemainingSeconds();
  focusTimer.running = false;
  stopFocusTicker();
  saveFocusTimer();
  renderFocusOverlay();
}
function resumeFocusTimer() {
  if (!focusTimer || focusTimer.running) return;
  focusTimer.endsAt = Date.now() + focusTimer.remainingSeconds * 1000;
  focusTimer.running = true;
  saveFocusTimer();
  ensureFocusTicker();
  renderFocusOverlay();
}
function resetFocusTimer() {
  stopFocusTicker();
  focusTimer = null;
  focusStagedMinutes = FOCUS_DEFAULT_MINUTES;
  saveFocusTimer();
  renderFocusOverlay();
}
function finishFocusTimer() {
  stopFocusTicker();
  focusTimer = null;
  focusStagedMinutes = FOCUS_DEFAULT_MINUTES;
  saveFocusTimer();
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('HQ — Focus session complete', { icon: '/icon-192.png' });
  }
  playAlarmBeep(); // js/pages/schedule.js — reuses the same alarm sound
  showToast('Focus session complete', 'success');
  renderFocusOverlay();
}
function ensureFocusOverlay() {
  if (focusOverlayEl) return focusOverlayEl;
  const el = document.createElement('div');
  el.id = 'focus-overlay';
  document.body.appendChild(el);
  focusOverlayEl = el;
  el.addEventListener('click', e => {
    if (e.target === el) { closeFocusOverlay(); return; }
    // clicking anywhere outside an open corner flyout (but still inside the overlay) closes it
    if (focusOpenPanel && !e.target.closest('.focus-flyout') && !e.target.closest('.focus-corner-btn') && !e.target.closest('.focus-scene-modal')) {
      focusOpenPanel = null;
      renderFocusOverlay();
    }
    // same for the tag dropdown, which lives up top rather than in a bottom corner.
    // .focus-tag-noclose (self-matched, so it survives the toggle/add button's own
    // click handler re-rendering — and detaching e.target — before this listener runs)
    // covers the buttons that open the panel/input, so opening it doesn't also close it.
    if (focusTagPanelOpen && !e.target.closest('.focus-tag-wrap') && !e.target.closest('.focus-tag-noclose')) {
      focusTagPanelOpen = false;
      focusTagAdding = false;
      renderFocusOverlay();
    }
  });
  document.addEventListener('fullscreenchange', updateFocusFullscreenBtn);
  return el;
}
function toggleFocusFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
function updateFocusFullscreenBtn() {
  const btn = focusOverlayEl?.querySelector('#focus-fullscreen-btn');
  if (btn) btn.innerHTML = document.fullscreenElement ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN_ENTER;
}
const FOCUS_PRESETS = [25, 15, 10];   // the three dots above the clock (2026-10-14)
// Backgrounds offered in "Set your focus scene" — only images that live in assets/.
// Each maps to an existing focus theme class (theme-dark = Killua, theme-forest = torii).
const FOCUS_SCENES = [
  { theme: 'dark',   name: 'Killua', img: 'assets/focus-bg-killua.webp' },
  { theme: 'forest', name: 'Torii',  img: 'assets/focus-bg.jpg' },
  { theme: 'lofi',   name: 'Lofi room', img: 'assets/focus-bg-lofi-poster.webp', video: 'assets/focus-bg-lofi.mp4', webm: 'assets/focus-bg-lofi.webm' }
];

/* ---- video scenes (2026-10-14): one muted, looping <video> kept across
   renderFocusOverlay() rebuilds (moved into the new .focus-bg each time and
   resumed at the same spot); paused while the overlay is closed. ---- */
let focusVideoEl = null;
function attachFocusVideo(el) {
  const scene = FOCUS_SCENES.find(sc => sc.theme === focusPrefs.theme);
  const bg = el.querySelector('.focus-bg');
  if (!scene || !scene.video || !bg) { if (focusVideoEl) { focusVideoEl.pause(); focusVideoEl.remove(); } return; }
  if (!focusVideoEl || focusVideoEl.dataset.src !== scene.video) {
    focusVideoEl?.remove();
    focusVideoEl = document.createElement('video');
    Object.assign(focusVideoEl, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' });
    focusVideoEl.setAttribute('muted', ''); focusVideoEl.setAttribute('playsinline', ''); focusVideoEl.setAttribute('aria-hidden', 'true');
    focusVideoEl.className = 'focus-bg-video';
    focusVideoEl.poster = scene.img;
    // WebM (VP9) first, MP4 (H.264) as fallback — Chromium builds without H.264 still play it
    focusVideoEl.innerHTML = (scene.webm ? `<source src="${scene.webm}" type="video/webm">` : '') + `<source src="${scene.video}" type="video/mp4">`;
    focusVideoEl.dataset.src = scene.video;
  }
  bg.prepend(focusVideoEl);
  if (el.classList.contains('open')) focusVideoEl.play().catch(() => {});
  else focusVideoEl.pause();
}
function focusCurrentMinutes() {
  return focusTimer ? Math.round(focusTimer.totalSeconds / 60) : focusStagedMinutes;
}
function setFocusPreset(mins) {
  if (focusTimer) return;               // presets only set the length before a session starts
  focusStagedMinutes = mins;
  renderFocusOverlay();
}

/* ---- Weather layer: snow and/or rain over ANY scene (2026-10-14).
   focusPrefs.weather = 'none' | 'snow' | 'rain' | 'both'. One canvas, re-attached
   after every renderFocusOverlay() innerHTML rebuild so the animation never
   restarts; paused while the overlay is closed. Under prefers-reduced-motion it
   stays on (it's a scene the user picked) but calmer: half the particles, slower. ---- */
const FOCUS_WEATHERS = [
  { id: 'none', name: 'Clear' },
  { id: 'snow', name: 'Snow' },
  { id: 'rain', name: 'Rain' },
  { id: 'both', name: 'Rain + snow' }
];
const focusSnow = { canvas: null, ctx: null, flakes: [], drops: [], raf: null, w: 0, h: 0 };
function focusWeather() {
  if (!focusPrefs.weather) focusPrefs.weather = focusPrefs.theme === 'dark' ? 'snow' : 'none';   // migrate: Killua used to always snow
  return focusPrefs.weather;
}
function focusSnowCalm() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function focusSnowResize() {
  const c = focusSnow.canvas; if (!c) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  focusSnow.w = window.innerWidth; focusSnow.h = window.innerHeight;
  c.width = focusSnow.w * dpr; c.height = focusSnow.h * dpr;
  focusSnow.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const area = focusSnow.w * focusSnow.h, k = focusSnowCalm() ? 0.5 : 1, wx = focusWeather();
  const both = wx === 'both';
  focusSnow.flakes = (wx === 'snow' || both) ? Array.from({ length: Math.round(Math.min(170, area / 11000) * k * (both ? 0.6 : 1)) }, () => newFlake(true)) : [];
  focusSnow.drops  = (wx === 'rain' || both) ? Array.from({ length: Math.round(Math.min(220, area / 8000) * k) }, () => newDrop(true)) : [];
}
function newFlake(anywhere) {
  const r = 0.6 + Math.random() * 1.9;
  return { x: Math.random() * focusSnow.w, y: anywhere ? Math.random() * focusSnow.h : -6,
           r, vy: (0.25 + r * 0.32 + Math.random() * 0.25) * (focusSnowCalm() ? 0.55 : 1),
           phase: Math.random() * Math.PI * 2, sway: 0.2 + Math.random() * 0.5, a: 0.25 + Math.random() * 0.55 };
}
function newDrop(anywhere) {
  const len = 10 + Math.random() * 16;
  return { x: Math.random() * (focusSnow.w + 100) - 50, y: anywhere ? Math.random() * focusSnow.h : -len - Math.random() * 100,
           len, vy: (9 + Math.random() * 7) * (focusSnowCalm() ? 0.5 : 1), a: 0.12 + Math.random() * 0.22 };
}
const RAIN_WIND = 0.18;   // horizontal drift per unit of fall (slight slant)
function focusSnowFrame() {
  const { ctx, w, h } = focusSnow;
  ctx.clearRect(0, 0, w, h);
  if (focusSnow.drops.length) {
    ctx.strokeStyle = '#cfd8ff'; ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (const d of focusSnow.drops) {
      d.y += d.vy; d.x += d.vy * RAIN_WIND;
      if (d.y - d.len > h) Object.assign(d, newDrop(false));
      ctx.globalAlpha = d.a;
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * RAIN_WIND, d.y - d.len); ctx.stroke();
    }
  }
  ctx.fillStyle = '#ffffff';
  for (const f of focusSnow.flakes) {
    f.phase += 0.012; f.y += f.vy; f.x += Math.sin(f.phase) * f.sway * 0.4;
    if (f.y > h + 6) Object.assign(f, newFlake(false));
    ctx.globalAlpha = f.a;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (focusOverlayEl?.classList.contains('open') && focusWeather() !== 'none') focusSnow.raf = requestAnimationFrame(focusSnowFrame);
  else focusSnow.raf = null;
}
function attachFocusSnow(el) {
  if (focusWeather() === 'none') { if (focusSnow.raf) cancelAnimationFrame(focusSnow.raf); focusSnow.raf = null; focusSnow.canvas?.remove(); return; }
  if (!focusSnow.canvas) {
    focusSnow.canvas = document.createElement('canvas');
    focusSnow.canvas.className = 'focus-snow';
    focusSnow.canvas.setAttribute('aria-hidden', 'true');
    focusSnow.ctx = focusSnow.canvas.getContext('2d');
    window.addEventListener('resize', focusSnowResize);
  }
  const bg = el.querySelector('.focus-bg');
  if (bg) bg.after(focusSnow.canvas); else el.prepend(focusSnow.canvas);
  if (focusSnow.kind !== focusWeather() || !focusSnow.w) { focusSnow.kind = focusWeather(); focusSnowResize(); }
  if (!focusSnow.raf) requestAnimationFrame(() => { if (!focusSnow.raf) focusSnow.raf = requestAnimationFrame(focusSnowFrame); });
}
function setFocusWeather(id) {
  focusPrefs.weather = id;
  saveFocusPrefs();
  renderFocusOverlay();
}
let focusSceneTab = 'background';   // 'background' | 'weather' — tab inside "Set your focus scene"

function toggleFocusPanel(which) {
  focusOpenPanel = focusOpenPanel === which ? null : which;
  renderFocusOverlay();
}
function setFocusTheme(theme) {
  focusPrefs.theme = theme;
  saveFocusPrefs();
  renderFocusOverlay();
}
function setFocusSoundTab(tab) {
  focusSoundTab = tab;
  renderFocusOverlay();
}
function toggleFocusTagPanel() {
  focusTagPanelOpen = !focusTagPanelOpen;
  focusTagAdding = false;
  renderFocusOverlay();
}
function selectFocusTag(name) {
  focusSelectedTag = name;
  if (focusTimer) { focusTimer.tag = name; saveFocusTimer(); }
  focusTagPanelOpen = false;
  renderFocusOverlay();
}
function startFocusTagAdd() {
  focusTagAdding = true;
  renderFocusOverlay();
  setTimeout(() => focusOverlayEl?.querySelector('#focus-tag-input')?.focus(), 30);
}
function submitFocusTagAdd(raw) {
  const name = (raw || '').trim().slice(0, 30);
  focusTagAdding = false;
  if (!name) { renderFocusOverlay(); return; }
  if (!focusTags.includes(name)) { focusTags.push(name); saveFocusTags(); }
  selectFocusTag(name);
}
function focusTagDropdownHtml() {
  const opts = focusTags.map(t => `<button class="focus-tag-opt${focusSelectedTag === t ? ' sel' : ''}" data-focus-tag-select="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  const addRow = focusTagAdding
    ? `<input type="text" id="focus-tag-input" class="focus-tag-input" placeholder="Tag name" maxlength="30">`
    : `<button class="focus-tag-add focus-tag-noclose" id="focus-tag-add-btn">+ Add tag</button>`;
  return opts + addRow;
}
// idx is always an index into getAllStations() (built-ins first, then custom),
// the same indexing selectStation()/ambientPlayer.stationIndex already use —
// so picking a station here IS picking it in the topbar widget, not a separate state.
function focusStationListHtml() {
  const built = AMBIENT_STREAMS;
  const custom = getCustomStations();
  const entries = focusSoundTab === 'radio' ? built.map((s, i) => [s, i])
    : focusSoundTab === 'mymusic' ? custom.map((s, i) => [s, built.length + i])
    : getAllStations().map((s, i) => [s, i]);
  const manage = focusSoundTab === 'radio' ? ''
    : `<button class="focus-sound-manage" data-manage-stations>${custom.length ? 'Manage stations' : '+ Add a YouTube station'}</button>`;
  if (!entries.length) {
    return `<div class="focus-sound-empty">No YouTube stations yet.</div>${manage}`;
  }
  return entries.map(([s, idx]) => `
    <button class="focus-sound-item${musicUiState() !== 'idle' && ambientPlayer.stationIndex === idx ? ' sel' : ''}" data-focus-station-idx="${idx}">
      <span class="focus-sound-dot"></span><span>${escapeHtml(s.name)}</span>
    </button>`).join('') + manage;
}
function renderFocusOverlay() {
  const el = ensureFocusOverlay();
  const wasOpen = el.classList.contains('open');
  el.className = 'focus-overlay theme-' + focusPrefs.theme + (wasOpen ? ' open' : '');
  const active = !!focusTimer;
  const running = !!(focusTimer && focusTimer.running);
  const remaining = active ? focusRemainingSeconds() : focusStagedMinutes * 60;
  el.innerHTML = `
    <div class="focus-bg seigaiha"></div>
    <div class="focus-content">
      <div class="focus-top">
        <div class="focus-tag-wrap">
          <button class="focus-tag-btn focus-tag-noclose" id="focus-tag-toggle"><span>${escapeHtml(focusSelectedTag || 'Select a tag')}</span><svg class="focus-tag-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg></button>
          <div class="focus-tag-dropdown${focusTagPanelOpen ? ' open' : ''}">${focusTagDropdownHtml()}</div>
        </div>
        <div class="focus-presets" role="group" aria-label="Session length">
          ${FOCUS_PRESETS.map(m => `<button class="focus-preset${focusCurrentMinutes() === m ? ' on' : ''}" data-focus-preset="${m}" title="${m} min" aria-label="${m} minutes"${active ? ' disabled' : ''}></button>`).join('')}
        </div>
        <div class="focus-time" id="focus-time-display">${focusTimeLabel(remaining)}</div>
        <div class="focus-adjust">
          <button class="focus-adjust-btn" data-focus-add-min="1">+1</button>
          <button class="focus-adjust-btn" data-focus-add-min="5">+5</button>
          <button class="focus-adjust-btn" data-focus-add-min="10">+10</button>
        </div>
        <div class="focus-controls">
          ${!active
            ? `<button class="focus-start-btn" id="focus-start-btn">Start</button>`
            : running
              ? `<button class="focus-start-btn" id="focus-pause-btn">Pause</button>
                 <button class="focus-reset-btn" id="focus-reset-btn" aria-label="Reset">${ICON_UNDO}</button>`
              : `<button class="focus-start-btn" id="focus-resume-btn">Resume</button>
                 <button class="focus-reset-btn" id="focus-reset-btn" aria-label="Reset">${ICON_UNDO}</button>`
          }
        </div>
      </div>
    </div>
    <div class="focus-corner focus-corner-left${focusOpenPanel === 'sound' || focusOpenPanel === 'noise' ? ' open' : ''}">
      ${focusOpenPanel === 'sound' ? `<div class="focus-flyout focus-sound-flyout focus-music-panel" id="focus-music-panel">${musicDropdownHtml()}</div>` : ''}
      ${focusOpenPanel === 'noise' ? `<div class="focus-flyout focus-noise-flyout">
        <div class="focus-noise-title">White noise</div>
        <div class="focus-noise-sub">Rain, café, fireplace… coming soon.</div>
      </div>` : ''}
      <div class="focus-corner-btn-row">
        <button class="focus-icon-btn focus-corner-btn${focusOpenPanel === 'noise' ? ' sel' : ''}" id="focus-noise-toggle" aria-label="White noise" title="White noise">${ICON_CLOUD_RAIN}</button>
        <button class="focus-icon-btn focus-corner-btn${focusOpenPanel === 'sound' ? ' sel' : ''}" id="focus-sound-toggle" aria-label="Music" title="Music">${ICON_MUSIC_NOTE}</button>
        <button class="focus-icon-btn focus-corner-btn${focusOpenPanel === 'scene' ? ' sel' : ''}" id="focus-scene-toggle" aria-label="Background" title="Background">${ICON_IMAGE}</button>
      </div>
    </div>
    <div class="focus-corner focus-corner-right">
      <button class="focus-icon-btn focus-corner-btn" id="focus-fullscreen-btn" aria-label="Fullscreen" title="Fullscreen">${document.fullscreenElement ? ICON_FULLSCREEN_EXIT : ICON_FULLSCREEN_ENTER}</button>
    </div>
    ${focusOpenPanel === 'scene' ? `<div class="focus-scene-backdrop">
      <div class="focus-scene-modal" role="dialog" aria-label="Set your focus scene">
        <div class="focus-scene-head"><div class="focus-scene-title">Set your focus scene</div><button class="focus-scene-close" id="focus-scene-close" aria-label="Close">&#x2715;</button></div>
        <div class="focus-scene-tabs">
          <button class="focus-scene-tab${focusSceneTab === 'background' ? ' on' : ''}" data-focus-scene-tab="background">${ICON_IMAGE} Background</button>
          <button class="focus-scene-tab${focusSceneTab === 'weather' ? ' on' : ''}" data-focus-scene-tab="weather">${ICON_CLOUD_RAIN} Weather</button>
        </div>
        ${focusSceneTab === 'background' ? `<div class="focus-scene-grid">
          ${FOCUS_SCENES.map(sc => `<button class="focus-scene-item${focusPrefs.theme === sc.theme ? ' sel' : ''}" data-focus-theme="${sc.theme}">
            <img src="${sc.img}" alt="" loading="lazy"><span>${sc.name}</span></button>`).join('')}
        </div>` : `<div class="focus-weather-grid">
          ${FOCUS_WEATHERS.map(wx => `<button class="focus-weather-item${focusWeather() === wx.id ? ' sel' : ''}" data-focus-weather="${wx.id}">
            <span class="focus-weather-ic">${FOCUS_WEATHER_ICONS[wx.id]}</span><span>${wx.name}</span></button>`).join('')}
        </div>`}
      </div>
    </div>` : ''}
    </div>`;
  attachFocusVideo(el);
  attachFocusSnow(el);
  el.querySelector('#focus-fullscreen-btn').addEventListener('click', toggleFocusFullscreen);
  el.querySelector('#focus-start-btn')?.addEventListener('click', () => startFocusTimer(focusStagedMinutes));
  el.querySelector('#focus-pause-btn')?.addEventListener('click', pauseFocusTimer);
  el.querySelector('#focus-resume-btn')?.addEventListener('click', resumeFocusTimer);
  el.querySelector('#focus-reset-btn')?.addEventListener('click', resetFocusTimer);
  el.querySelector('#focus-sound-toggle').addEventListener('click', () => toggleFocusPanel('sound'));
  bindMusicPanel(el.querySelector('#focus-music-panel'));   // same player as the topbar panel (2026-10-14)
  el.querySelector('#focus-noise-toggle').addEventListener('click', () => toggleFocusPanel('noise'));
  el.querySelector('#focus-scene-toggle').addEventListener('click', () => toggleFocusPanel('scene'));
  el.querySelector('#focus-scene-close')?.addEventListener('click', () => toggleFocusPanel('scene'));
  el.querySelectorAll('[data-focus-scene-tab]').forEach(btn => btn.addEventListener('click', () => { focusSceneTab = btn.dataset.focusSceneTab; renderFocusOverlay(); }));
  el.querySelectorAll('[data-focus-weather]').forEach(btn => btn.addEventListener('click', () => setFocusWeather(btn.dataset.focusWeather)));
  el.querySelectorAll('[data-focus-preset]').forEach(btn => btn.addEventListener('click', () => setFocusPreset(Number(btn.dataset.focusPreset))));
  el.querySelectorAll('[data-focus-tab]').forEach(btn => btn.addEventListener('click', () => setFocusSoundTab(btn.dataset.focusTab)));
  el.querySelectorAll('[data-focus-station-idx]').forEach(btn => btn.addEventListener('click', () => {
    selectStation(Number(btn.dataset.focusStationIdx)); // js/core.js — same picker the topbar music widget uses
    renderFocusOverlay();
  }));
  el.querySelector('[data-manage-stations]')?.addEventListener('click', showStationsModal);
  bindMusicVolume(el);
  el.querySelectorAll('[data-focus-theme]').forEach(btn => btn.addEventListener('click', () => setFocusTheme(btn.dataset.focusTheme)));
  el.querySelectorAll('[data-focus-add-min]').forEach(btn => btn.addEventListener('click', () => addFocusMinutes(Number(btn.dataset.focusAddMin))));
  el.querySelector('#focus-tag-toggle').addEventListener('click', toggleFocusTagPanel);
  el.querySelectorAll('[data-focus-tag-select]').forEach(btn => btn.addEventListener('click', () => selectFocusTag(btn.dataset.focusTagSelect)));
  el.querySelector('#focus-tag-add-btn')?.addEventListener('click', startFocusTagAdd);
  el.querySelector('#focus-tag-input')?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') submitFocusTagAdd(this.value);
    else if (e.key === 'Escape') { focusTagAdding = false; renderFocusOverlay(); }
  });
}
function openFocusOverlay() {
  focusOpenPanel = null;
  focusTagPanelOpen = false;
  focusTagAdding = false;
  ensureFocusOverlay().classList.add('open');
  renderFocusOverlay();   // after .open so the snow loop (theme-dark) starts
  ensureFocusTicker();
  document.body.style.overflow = 'hidden'; // fullscreen overlay — don't let the page behind it scroll/bounce
}
function closeFocusOverlay() {
  focusOverlayEl?.classList.remove('open');
  focusVideoEl?.pause();
  document.body.style.overflow = '';
}

/* ---- bottom-right quick FAB: expands to Focus mode / Note mode (icon-only) ---- */
function toggleQuickFab(forceOpen) {
  const fab = document.getElementById('quick-fab');
  if (!fab) return;
  const open = typeof forceOpen === 'boolean' ? forceOpen : !fab.classList.contains('open');
  fab.classList.toggle('open', open);
  document.getElementById('quick-fab-main')?.setAttribute('aria-expanded', String(open));
}
function initQuickFab() {
  const mainBtn = document.getElementById('quick-fab-main');
  if (!mainBtn) return;
  mainBtn.addEventListener('click', () => toggleQuickFab());
  document.getElementById('fab-focus-btn')?.addEventListener('click', () => {
    toggleQuickFab(false);
    openFocusOverlay();
  });
  document.getElementById('fab-note-btn')?.addEventListener('click', () => {
    toggleQuickFab(false);
    // the FAB sits above the Focus overlay (z-index), so this can be clicked from inside
    // Focus mode — close it, or Notes renders hidden behind it. The timer keeps running.
    closeFocusOverlay();
    setActiveTab('life:notes');
  });
  // close the topbar quick-actions dropdown on any outside click
  document.addEventListener('click', e => {
    const dd = document.getElementById('apps-dropdown');
    if (dd && dd.classList.contains('open') && !e.target.closest('.apps-wrap')) {
      dd.classList.remove('open');
      document.getElementById('apps-btn')?.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('click', e => {
    const fab = document.getElementById('quick-fab');
    if (fab && fab.classList.contains('open') && !fab.contains(e.target)) toggleQuickFab(false);
  });
  // a timer already running before reload/navigation keeps counting in the background
  if (focusTimer && focusTimer.running) ensureFocusTicker();
}

/* =========================================================
   EVENT BINDING — shared (topbar tweaks/logout/music, nav pills)
========================================================= */

function bindSharedEvents() {
  // logout (inside main, re-bound on each render)
  // const ot = main.querySelector('#open-tweaks');   // Tweaks retired 2026-09-29
  // if (ot) ot.addEventListener('click', toggleTweaks);
  const tlb = main.querySelector('#topbar-logout-btn');
  if (tlb) tlb.addEventListener('click', signOut);
  // Quick actions (9-dot) — replaced the bottom-right + FAB on 2026-10-14
  const appsBtn = main.querySelector('#apps-btn');
  if (appsBtn) appsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = main.querySelector('#apps-dropdown');
    const open = !dd.classList.contains('open');
    dd.classList.toggle('open', open);
    appsBtn.setAttribute('aria-expanded', String(open));
    if (open) document.getElementById('music-dropdown')?.classList.remove('open');
  });
  main.querySelectorAll('[data-app-action]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    main.querySelector('#apps-dropdown')?.classList.remove('open');
    if (el.dataset.appAction === 'focus') openFocusOverlay();
    else setActiveTab('life:home');
  }));
  const mt = main.querySelector('#music-toggle');
  if (mt) { mt.addEventListener('click', toggleAmbientMusic); updateMusicBtn(ambientPlayer.isPlaying); }
  const mc = main.querySelector('#music-caret-btn');
  if (mc) mc.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = main.querySelector('#music-dropdown');
    dd?.classList.toggle('open');
  });
  main.querySelector('[data-music-open]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    main.querySelector('#music-dropdown')?.classList.toggle('open');
  });
  bindMusicPanel(main.querySelector('#music-dropdown'));  // (the panel's volume row is bound inside bindMusicPanel)

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
   TWEAKS PANEL: retired 2026-09-29, kept commented out for reference.
   Its only live settings were density / Today layout / quick pills (in-memory,
   reset on every refresh, so never real settings) plus custom YouTube stations.
   Density is locked to compact via the window.__HQ_TWEAKS default in index.html
   (applyTweaks() still applies it); stations moved to the "Manage stations"
   modal below. The panel markup is commented out in index.html too.
========================================================= */
/*
const tweaksEl = document.getElementById('tweaks-panel');
function toggleTweaks() {
  const opening = !tweaksEl.classList.contains('open');
  tweaksEl.classList.toggle('open');
  if (opening) document.getElementById('music-dropdown')?.classList.remove('open');
}

document.getElementById('tweaks-close').addEventListener('click', () => tweaksEl.classList.remove('open'));

function setTweak(key, value) {
  window.__HQ_TWEAKS[key] = value;
  applyTweaks();
  render();
  syncTweaksUI();
}

function syncTweaksUI() {
  const tw = window.__HQ_TWEAKS;
  const twCurr = document.getElementById('tw-currency');
  if (twCurr) twCurr.value = tw.currencyPrefix || '$';
  document.querySelectorAll('#tw-swatches .sw').forEach(s => s.classList.toggle('active', s.dataset.c === tw.accent));
  document.querySelectorAll('#tw-density button').forEach(b => b.classList.toggle('active', b.dataset.v === tw.density));
  document.querySelectorAll('#tw-weight button').forEach(b => b.classList.toggle('active', String(b.dataset.v) === String(tw.numberWeight)));
  document.querySelectorAll('#tw-home button').forEach(b => b.classList.toggle('active', b.dataset.v === tw.homeLayout));
  document.querySelectorAll('#tw-pills button').forEach(b => b.classList.toggle('active', String(b.dataset.v) === String(tw.showQuickPills)));
  renderCustomStationsList(); // re-sync with window.__HQ_TWEAKS.customStations once loadFromSupabase() has populated it
}

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
*/

/* ---- Custom YouTube stations: "Manage stations" modal ----
   Opened from the topbar music picker (and Focus mode's sound flyout). Persisted to
   their own Supabase table ('custom_stations', see schema_fix.sql section 22), so
   they survive a reload AND follow the user across devices. loadFromSupabase()
   populates window.__HQ_TWEAKS.customStations at login.
   The modal lives on <body>, outside #main, so the render() each keystroke triggers
   (to refresh the picker) never touches it. #stations-list is rebuilt
   (renderCustomStationsList()) only when a row is added/removed; typing only
   patches that row's status line, so an input never loses focus. */
function customStationStatus(s) {
  const url = (s.url || '').trim();
  if (!url) return { cls: 'idle', text: 'Paste a YouTube link' };
  if (!extractYouTubeId(url)) return { cls: 'bad', text: "That link isn't a YouTube video" };
  if (!(s.name || '').trim()) return { cls: 'idle', text: 'Give it a name to show it in the picker' };
  return { cls: 'ok', text: 'In the picker' };
}

function renderCustomStationsList() {
  const el = document.getElementById('stations-list');
  if (!el) return;
  const stations = window.__HQ_TWEAKS.customStations || [];
  el.innerHTML = stations.map((s, i) => {
    const st = customStationStatus(s);
    return `
    <li class="station-row">
      <div class="station-fields">
        <input type="text" class="station-name" data-i="${i}" placeholder="Name (e.g. Study Beats)" value="${escapeHtml(s.name || '')}" maxlength="40">
        <input type="text" class="station-url" data-i="${i}" placeholder="YouTube link" value="${escapeHtml(s.url || '')}">
        <div class="station-status ${st.cls}" data-station-status="${i}">${escapeHtml(st.text)}</div>
      </div>
      <button class="station-del" data-i="${i}" title="Remove station" aria-label="Remove station">${ICON_TRASH}</button>
    </li>`;
  }).join('') || `<li class="stations-empty">No stations yet. Add a YouTube link (a lofi stream, a long mix, rain sounds) and it plays in the background like the built-in radios.</li>`;
}

function refreshStationPickers() {
  render(); // rebuilds the topbar music dropdown
  if (document.getElementById('focus-overlay')?.classList.contains('open')) renderFocusOverlay();
}

async function addCustomStation() {
  if (!window.__HQ_TWEAKS.customStations) window.__HQ_TWEAKS.customStations = [];
  if (!currentUser) return;
  const { data } = await dbCall(() => sb.from('custom_stations').insert({ user_id: currentUser.id, name: '', url: '' }).select().single());
  if (!data) return;
  window.__HQ_TWEAKS.customStations.push({ id: data.id, name: '', url: '' });
  renderCustomStationsList();
  refreshStationPickers();
  const names = document.querySelectorAll('#stations-list .station-name');
  names[names.length - 1]?.focus();
}

function removeCustomStation(i) {
  const s = (window.__HQ_TWEAKS.customStations || [])[i];
  if (!s) return;
  window.__HQ_TWEAKS.customStations.splice(i, 1);
  clearTimeout(customStationSaveTimers[s.id]);
  renderCustomStationsList();
  refreshStationPickers();
  dbCall(() => sb.from('custom_stations').delete().eq('id', s.id));
}

// Debounced per-row so fast typing doesn't fire a write on every keystroke;
// mirrors Notes' 1000ms autosave debounce in js/pages/notes.js.
const customStationSaveTimers = {};
function setCustomStationField(i, field, value) {
  const s = (window.__HQ_TWEAKS.customStations || [])[i];
  if (!s) return;
  s[field] = value;
  const statusEl = document.querySelector(`#stations-list [data-station-status="${i}"]`);
  if (statusEl) {
    const st = customStationStatus(s);
    statusEl.className = `station-status ${st.cls}`;
    statusEl.textContent = st.text;
  }
  refreshStationPickers();
  clearTimeout(customStationSaveTimers[s.id]);
  customStationSaveTimers[s.id] = setTimeout(() => {
    dbCall(() => sb.from('custom_stations').update({ [field]: value }).eq('id', s.id));
  }, 1000);
}

function showStationsModal() {
  document.getElementById('music-dropdown')?.classList.remove('open');
  let overlay = document.getElementById('stations-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'stations-modal-overlay';
    overlay.className = 'hq-modal-overlay stations-modal-overlay';
    overlay.innerHTML = `
      <div class="hq-modal-card stations-modal-card" role="dialog" aria-modal="true" aria-label="YouTube stations">
        <div class="hq-modal-header">
          <div>
            <div class="hq-modal-title">YouTube stations</div>
            <div class="stations-sub">Your own stations, listed next to the built-in radios in the music picker.</div>
          </div>
          <button class="hq-modal-close" data-stations-close aria-label="Close">&#x2715;</button>
        </div>
        <div class="hq-modal-body">
          <ul class="stations-list" id="stations-list"></ul>
        </div>
        <div class="hq-modal-footer">
          <button class="btn stations-add-btn" data-stations-add>+ Add station</button>
          <button class="btn primary" data-stations-close>Done</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const list = overlay.querySelector('#stations-list');
    list.addEventListener('input', (e) => {
      const t = e.target, i = Number(t.dataset.i);
      if (t.classList.contains('station-name')) setCustomStationField(i, 'name', t.value);
      else if (t.classList.contains('station-url')) setCustomStationField(i, 'url', t.value);
    });
    list.addEventListener('click', (e) => {
      const delBtn = e.target.closest('.station-del');
      if (delBtn) removeCustomStation(Number(delBtn.dataset.i));
    });
    overlay.querySelector('[data-stations-add]').addEventListener('click', (e) => withBtnLoading(e.currentTarget, addCustomStation).catch(() => {}));
    const close = () => {
      overlay.classList.remove('open');
      document.removeEventListener('keydown', overlay._escHandler);
    };
    overlay._escHandler = (e) => { if (e.key === 'Escape') close(); };
    overlay.querySelectorAll('[data-stations-close]').forEach(b => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  }
  renderCustomStationsList();
  document.removeEventListener('keydown', overlay._escHandler);
  document.addEventListener('keydown', overlay._escHandler);
  requestAnimationFrame(() => overlay.classList.add('open'));
}

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
