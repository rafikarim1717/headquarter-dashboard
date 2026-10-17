/* =========================================================
   IDENTIFY SONG (2026-10-17)
   Shazam-style: tap the mic (topbar / 9-dot tile / PWA shortcut "?listen=1"),
   HQ records the room, the `identify-song` Edge Function asks AudD what it is.
   Every match is saved straight to `discovered_songs` (catch now, sort later);
   the music panel's "Discovered" tab turns one into a YouTube station via the
   `youtube-search` Edge Function. See CLAUDE.md "Identify song".
========================================================= */
const IDENTIFY_CHECKPOINTS = [5, 10, 14];   // seconds of audio sent to AudD; stops at the first match
let discoveredSongs = [];                   // newest first
let identifyRun = null;                     // { stream, recorder, chunks, startedAt, timer, cancelled, busy, sentAt:Set }
let identifyOverlayEl = null;
let identifyView = { mode: 'idle' };        // listening | nomatch | error | match

async function loadDiscoveredSongs() {
  if (!currentUser) return;
  try {
    const { data, error } = await sb.from('discovered_songs').select('*').eq('user_id', currentUser.id).order('found_at', { ascending: false });
    if (error) throw error;
    discoveredSongs = data || [];
  } catch (e) {
    console.warn('[identify] discovered_songs not available yet — run schema_fix.sql section 26', e);
    discoveredSongs = [];
  }
  if (typeof refreshMusicPanel === 'function') refreshMusicPanel();
}

function ensureIdentifyOverlay() {
  if (identifyOverlayEl) return identifyOverlayEl;
  identifyOverlayEl = document.createElement('div');
  identifyOverlayEl.id = 'identify-overlay';
  identifyOverlayEl.className = 'identify-overlay';
  identifyOverlayEl.setAttribute('role', 'dialog');
  identifyOverlayEl.setAttribute('aria-label', 'Identify song');
  document.body.appendChild(identifyOverlayEl);
  identifyOverlayEl.addEventListener('click', (e) => {
    const t = e.target.closest('[data-id-action]');
    if (!t) return;
    const a = t.dataset.idAction;
    if (a === 'close') closeIdentify();
    else if (a === 'retry') startIdentify();
    else if (a === 'add' && identifyView.song) { closeIdentify(); openYoutubePicker(identifyView.song); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && identifyOverlayEl.classList.contains('open')) closeIdentify(); });
  return identifyOverlayEl;
}

function renderIdentify() {
  const el = ensureIdentifyOverlay();
  const v = identifyView;
  const close = `<button class="identify-close" data-id-action="close" aria-label="Close">&#x2715;</button>`;
  let body = '';
  if (v.mode === 'listening') {
    body = `
      <div class="identify-orb"><span></span><span></span><span></span>
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>
      </div>
      <div class="identify-title">${v.checking ? 'Checking…' : 'Listening…'}</div>
      <div class="identify-sub">Hold your phone toward the music · <span id="identify-secs">${v.secs || 0}s</span></div>
      <button class="btn identify-btn" data-id-action="close">Cancel</button>`;
  } else if (v.mode === 'match') {
    const s = v.song;
    body = `
      ${s.cover_url ? `<img class="identify-cover" src="${escapeHtml(s.cover_url)}" alt="">` : `<div class="identify-cover identify-cover-empty"></div>`}
      <div class="identify-title">${escapeHtml(s.title)}</div>
      <div class="identify-sub">${escapeHtml(s.artist)}${s.album ? ' · ' + escapeHtml(s.album) : ''}</div>
      <div class="identify-saved">&#x2713; Saved to Discovered</div>
      <div class="identify-actions">
        <button class="btn primary identify-btn" data-id-action="add">Add to stations</button>
        ${s.spotify_url ? `<a class="btn identify-btn" href="${escapeHtml(s.spotify_url)}" target="_blank" rel="noopener">Spotify</a>` : ''}
        <button class="btn identify-btn" data-id-action="close">Done</button>
      </div>`;
  } else if (v.mode === 'nomatch') {
    body = `
      <div class="identify-orb identify-orb-idle"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg></div>
      <div class="identify-title">Couldn't catch that one</div>
      <div class="identify-sub">Get closer to the speaker, or try during the chorus.</div>
      <div class="identify-actions"><button class="btn primary identify-btn" data-id-action="retry">Try again</button><button class="btn identify-btn" data-id-action="close">Close</button></div>`;
  } else if (v.mode === 'error') {
    body = `
      <div class="identify-title">Can't listen right now</div>
      <div class="identify-sub">${escapeHtml(v.message || 'Something went wrong.')}</div>
      <div class="identify-actions"><button class="btn primary identify-btn" data-id-action="retry">Try again</button><button class="btn identify-btn" data-id-action="close">Close</button></div>`;
  }
  el.innerHTML = close + `<div class="identify-card">${body}</div>`;
}

function stopIdentifyRecording() {
  const r = identifyRun;
  if (!r) return;
  clearInterval(r.timer);
  try { if (r.recorder && r.recorder.state !== 'inactive') r.recorder.stop(); } catch (e) {}
  r.stream?.getTracks().forEach(t => t.stop());
}

function closeIdentify() {
  if (identifyRun) { identifyRun.cancelled = true; stopIdentifyRecording(); identifyRun = null; }
  identifyOverlayEl?.classList.remove('open');
  document.body.style.overflow = '';
}

async function startIdentify() {
  document.querySelectorAll('#apps-dropdown, #music-dropdown').forEach(d => d.classList.remove('open'));
  if (identifyRun) { identifyRun.cancelled = true; stopIdentifyRecording(); }
  const el = ensureIdentifyOverlay();
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  identifyView = { mode: 'listening', secs: 0 };
  renderIdentify();

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    identifyView = { mode: 'error', message: "This browser can't record audio." }; renderIdentify(); return;
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (e) {
    identifyView = { mode: 'error', message: 'Microphone access was blocked. Allow the mic for HQ in your browser settings, then try again.' };
    renderIdentify(); return;
  }
  const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(m => MediaRecorder.isTypeSupported?.(m)) || '';
  const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const run = identifyRun = { stream, recorder, chunks: [], startedAt: Date.now(), cancelled: false, busy: false, sent: new Set(), mime: recorder.mimeType || mime || 'audio/webm' };
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) run.chunks.push(e.data); };
  recorder.start(1000);

  run.timer = setInterval(() => {
    if (run.cancelled) return;
    const secs = Math.floor((Date.now() - run.startedAt) / 1000);
    identifyView.secs = secs;
    const secEl = document.getElementById('identify-secs');
    if (secEl) secEl.textContent = secs + 's';
    const due = IDENTIFY_CHECKPOINTS.find(c => secs >= c && !run.sent.has(c));
    if (due && !run.busy) { run.sent.add(due); sendIdentifyClip(run, due === IDENTIFY_CHECKPOINTS[IDENTIFY_CHECKPOINTS.length - 1]); }
  }, 250);
}

async function sendIdentifyClip(run, isLast) {
  if (isLast) stopIdentifyRecording();
  run.busy = true;
  identifyView.checking = true; renderIdentify();
  if (isLast) await new Promise(r => setTimeout(r, 300));   // let the final chunk flush
  const blob = new Blob(run.chunks, { type: run.mime });
  const ext = run.mime.includes('mp4') ? 'm4a' : run.mime.includes('ogg') ? 'ogg' : 'webm';
  const form = new FormData();
  form.append('file', blob, 'clip.' + ext);
  let res;
  try {
    const { data, error } = await sb.functions.invoke('identify-song', { body: form });
    if (error) throw error;
    res = data;
  } catch (e) {
    if (run.cancelled) return;
    console.error('[identify] identify-song failed', e);
    stopIdentifyRecording(); identifyRun = null;
    identifyView = { mode: 'error', message: 'The identify service is not reachable. Check that the identify-song function is deployed and AUDD_TOKEN is set.' };
    renderIdentify(); return;
  }
  run.busy = false;
  if (run.cancelled) return;
  if (res?.match) {
    stopIdentifyRecording(); identifyRun = null;
    const song = await saveDiscoveredSong(res.match);
    identifyView = { mode: 'match', song };
    renderIdentify();
    try { navigator.vibrate?.(60); } catch (e) {}
    return;
  }
  if (isLast) { identifyRun = null; identifyView = { mode: 'nomatch' }; renderIdentify(); return; }
  identifyView.checking = false; renderIdentify();
}

// Same song found again → bump it to the top instead of a duplicate row.
async function saveDiscoveredSong(m) {
  const key = s => (s.title + '|' + s.artist).toLowerCase();
  const existing = discoveredSongs.find(s => key(s) === key(m));
  const now = new Date().toISOString();
  if (existing) {
    existing.found_at = now;
    discoveredSongs = [existing, ...discoveredSongs.filter(s => s !== existing)];
    dbCall(() => sb.from('discovered_songs').update({ found_at: now }).eq('id', existing.id)).catch(() => {});
    refreshMusicPanel();
    return existing;
  }
  const row = { user_id: currentUser.id, title: m.title, artist: m.artist, album: m.album || null, cover_url: m.cover_url, song_link: m.song_link, spotify_url: m.spotify_url, apple_url: m.apple_url, found_at: now };
  const local = { ...row, id: null, station_id: null };
  discoveredSongs = [local, ...discoveredSongs];
  refreshMusicPanel();
  try {
    const { data } = await dbCall(() => sb.from('discovered_songs').insert(row).select().single());
    if (data) Object.assign(local, data);
  } catch (e) { showToast("Found it, but couldn't save to Discovered — run schema_fix.sql section 26", 'error'); }
  return local;
}

/* ---- Discovered tab (music panel) ---- */
function discoveredListHtml() {
  if (!discoveredSongs.length) return `<div class="mp-empty">Songs you identify with the mic show up here.</div>`;
  return discoveredSongs.map(s => `
    <div class="mp-row disc-row">
      ${s.cover_url ? `<img class="mp-thumb" style="width:30px;height:30px" src="${escapeHtml(s.cover_url)}" alt="" loading="lazy">` : `<span class="mp-thumb mp-thumb-radio" style="width:30px;height:30px"></span>`}
      <span class="mp-row-name disc-name"><span>${escapeHtml(s.title)}</span><span class="disc-artist">${escapeHtml(s.artist)}</span></span>
      ${s.station_id
        ? `<span class="disc-added" title="In your stations">&#x2713;</span>`
        : `<button class="disc-add" data-disc-add="${escapeHtml(s.id || '')}" title="Add to stations">+ Add</button>`}
    </div>`).join('');
}
function bindDiscovered(dd) {
  dd.querySelectorAll('[data-disc-add]').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const s = discoveredSongs.find(x => x.id === b.dataset.discAdd);
    if (s) openYoutubePicker(s);
  }));
}

/* ---- YouTube picker: discovered song → custom station ---- */
let ytPick = null;   // { song, videos, chosen, cats:Set, loading, error }
function openYoutubePicker(song) {
  document.getElementById('music-dropdown')?.classList.remove('open');
  ytPick = { song, videos: [], chosen: null, cats: new Set(), loading: true, error: null };
  let ov = document.getElementById('ytpick-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'ytpick-overlay';
    ov.className = 'hq-modal-overlay';
    document.body.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-yt-close]')) { ov.classList.remove('open'); return; }
      const v = e.target.closest('[data-yt-video]');
      if (v) { ytPick.chosen = v.dataset.ytVideo; renderYoutubePicker(); return; }
      const c = e.target.closest('[data-yt-cat]');
      if (c) { const n = c.dataset.ytCat; ytPick.cats.has(n) ? ytPick.cats.delete(n) : ytPick.cats.add(n); renderYoutubePicker(); return; }
      if (e.target.closest('[data-yt-save]')) saveYoutubePick(e.target.closest('[data-yt-save]'));
    });
  }
  renderYoutubePicker();
  requestAnimationFrame(() => ov.classList.add('open'));
  sb.functions.invoke('youtube-search', { body: { q: `${song.title} ${song.artist}` } }).then(({ data, error }) => {
    if (error || !data?.videos) throw error || new Error(data?.error || 'no results');
    ytPick.videos = data.videos; ytPick.chosen = data.videos[0]?.videoId || null;
  }).catch(err => {
    console.error('[identify] youtube-search failed', err);
    ytPick.error = 'YouTube search is not reachable. Check that youtube-search is deployed and YOUTUBE_KEY is set.';
  }).finally(() => { ytPick.loading = false; renderYoutubePicker(); });
}
function renderYoutubePicker() {
  const ov = document.getElementById('ytpick-overlay');
  if (!ov || !ytPick) return;
  const p = ytPick, cats = typeof allStationCategories === 'function' ? allStationCategories() : musicCategories();
  ov.innerHTML = `
    <div class="hq-modal-card ytpick-card" role="dialog" aria-modal="true" aria-label="Add to stations">
      <div class="hq-modal-header">
        <div><div class="hq-modal-title">Add to stations</div><div class="stations-sub">${escapeHtml(p.song.title)} — ${escapeHtml(p.song.artist)}</div></div>
        <button class="hq-modal-close" data-yt-close aria-label="Close">&#x2715;</button>
      </div>
      <div class="hq-modal-body">
        <div class="stations-section-label">Pick the video</div>
        ${p.loading ? `<div class="ytpick-msg">Searching YouTube…</div>`
          : p.error ? `<div class="ytpick-msg ytpick-err">${escapeHtml(p.error)}</div>`
          : !p.videos.length ? `<div class="ytpick-msg">No videos found.</div>`
          : `<div class="ytpick-list">${p.videos.map(v => `
            <button class="ytpick-item${p.chosen === v.videoId ? ' sel' : ''}" data-yt-video="${escapeHtml(v.videoId)}">
              <img src="${escapeHtml(v.thumb || '')}" alt="" loading="lazy">
              <span class="ytpick-meta"><span class="ytpick-t">${escapeHtml(v.title)}</span><span class="ytpick-c">${escapeHtml(v.channel)}</span></span>
            </button>`).join('')}</div>`}
        <div class="stations-section-label" style="margin-top:14px">Categories</div>
        <div class="station-cats">${cats.length ? cats.map(c => `<button class="station-cat${p.cats.has(c) ? ' on' : ''}" data-yt-cat="${escapeHtml(c)}">${p.cats.has(c) ? '&#x2713; ' : ''}${escapeHtml(c)}</button>`).join('') : `<span class="scat-count">No categories yet — create them in Manage stations.</span>`}</div>
      </div>
      <div class="hq-modal-footer">
        <button class="btn" data-yt-close>Cancel</button>
        <button class="btn primary" data-yt-save ${p.chosen ? '' : 'disabled'}>Add station</button>
      </div>
    </div>`;
}
async function saveYoutubePick(btn) {
  const p = ytPick;
  if (!p?.chosen || !currentUser) return;
  btn.disabled = true;
  const name = p.song.title.slice(0, 40);
  const url = 'https://www.youtube.com/watch?v=' + p.chosen;
  const categories = [...p.cats];
  try {
    const { data } = await dbCall(() => sb.from('custom_stations').insert({ user_id: currentUser.id, name, url, categories }).select().single());
    if (!data) throw new Error('insert failed');
    window.__HQ_TWEAKS.customStations = window.__HQ_TWEAKS.customStations || [];
    window.__HQ_TWEAKS.customStations.push({ id: data.id, name, url, categories });
    p.song.station_id = data.id;
    if (p.song.id) dbCall(() => sb.from('discovered_songs').update({ station_id: data.id }).eq('id', p.song.id)).catch(() => {});
    document.getElementById('ytpick-overlay')?.classList.remove('open');
    refreshStationPickers();
    showToast(`Saved — ${name} added to your stations${categories.length ? ' (' + categories.join(', ') + ')' : ''}`, 'success');
  } catch (e) {
    btn.disabled = false;
    showToast("Couldn't add the station — try again", 'error');
  }
}

// PWA shortcut / deep link: /?listen=1 starts listening right after login.
function maybeAutoIdentify() {
  const q = new URLSearchParams(location.search);
  if (q.get('listen') !== '1') return;
  q.delete('listen');
  history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash);
  startIdentify();
}
