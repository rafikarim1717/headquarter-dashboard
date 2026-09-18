/* =========================================================
   Life — Commitments
   (split from js/app.js — see CLAUDE.md for the page map)
========================================================= */

/* ---- LIFE: COMMITMENTS — helpers ---- */
function getTodayLog(goalId) {
  const t = todayISO();
  return state.goalLogs.find(l => l.goal_id === goalId && l.date === t) || null;
}
function getLogByDate(goalId, date) {
  return state.goalLogs.find(l => l.goal_id === goalId && l.date === date) || null;
}
// Consecutive-day streak ending today, with a grace period: if today isn't checked yet,
// counting starts from yesterday instead of zeroing out immediately (the day isn't over
// yet). Supersedes the unused computeStreak() in js/supabase.js, which broke the streak
// the instant today was unchecked, even first thing in the morning.
function computeGoalStreak(goalId) {
  const checkedDates = new Set(state.goalLogs.filter(l => l.goal_id === goalId && l.checked).map(l => l.date));
  const today = todayISO();
  const cursor = new Date(today + 'T00:00:00');
  if (!checkedDates.has(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (checkedDates.has(isoLocal(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function getDayCompliancePct(dateIso) {
  const allGoals = state.goals.items || [];
  if (!allGoals.length) return 0;
  const checked = allGoals.filter(g => {
    const log = state.goalLogs.find(l => l.goal_id === g.id && l.date === dateIso);
    return log && log.checked;
  }).length;
  return (checked / allGoals.length) * 100;
}
const GOAL_CATEGORY_PRESET = ['Olahraga', 'Kerja', 'Bahasa', 'Spiritual', 'Personal & Mental'];
function categoryItems(cat) {
  return (state.goals.items || []).filter(g => (g.category || 'General') === cat);
}
// Categories that currently have at least one commitment, in preset order then any custom ones alphabetically, 'General' last.
function getGoalCategories() {
  const used = new Set((state.goals.items || []).map(g => g.category || 'General'));
  const ordered = GOAL_CATEGORY_PRESET.filter(c => used.has(c));
  const extra = [...used].filter(c => !GOAL_CATEGORY_PRESET.includes(c) && c !== 'General').sort();
  const result = ordered.concat(extra);
  if (used.has('General')) result.push('General');
  return result;
}
// Full pickable category list for the Add/Edit modals — presets always offered, plus any custom ones already in use.
function getCategoryOptions() {
  const used = new Set((state.goals.items || []).map(g => g.category || 'General'));
  const extra = [...used].filter(c => !GOAL_CATEGORY_PRESET.includes(c)).sort();
  return [...GOAL_CATEGORY_PRESET, ...extra];
}
// =========================================================
// Commitments — History: 3-layer design (2026-09-18, replaced the habit-grid
// table from the same day — that table was rejected as too busy/cluttered).
//   Layer 1 (default): Month heatmap calendar — one cell per day, % + a
//     traffic-light tier (green/yellow/red) for quick scanning.
//   Layer 2: Year sparkline — 12 monthly averages as a line chart; click a
//     point to jump to Layer 1 for that month.
//   Layer 3: a day-detail MODAL (not an inline panel) — click any Month cell
//     to open it; ESC or an outside click closes it, mirroring the existing
//     showConfirmModal() pattern in js/core.js.
// =========================================================

// Layer 1 — Month heatmap calendar.
// Colorblind note: the % is always rendered as text inside the cell (not
// color-only), so the tier color is a redundant reinforcement, not the sole
// signal — satisfies the "accessible heat map" requirement without needing
// a separate colorblind palette mode.
function renderCommitMonthHeatmap() {
  const today = todayISO();
  const totalGoals = (state.goals.items || []).length;
  const viewMonthStr = state.commitViewMonth || today.slice(0, 7);
  const [vy, vm] = viewMonthStr.split('-').map(Number);
  const monthLabel = new Date(vy, vm - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const isCurrentMonth = viewMonthStr === today.slice(0, 7);
  const firstDow = new Date(vy, vm - 1, 1).getDay();
  const daysInMonth = new Date(vy, vm, 0).getDate();
  const dowLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  let cellsHtml = dowLabels.map(d => `<div class="commit-hm-dow">${d}</div>`).join('');
  for (let i = 0; i < firstDow; i++) cellsHtml += `<div class="commit-hm-cell other"></div>`;
  let monthSum = 0, monthCount = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = `${String(vy).padStart(4, '0')}-${String(vm).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = iso === today;
    const isFuture = iso > today;
    if (isFuture || totalGoals === 0) {
      cellsHtml += `<div class="commit-hm-cell${isToday ? ' today' : ''}${isFuture ? ' future' : ''}"><span class="commit-hm-daynum">${day}</span></div>`;
      continue;
    }
    const checked = (state.goals.items || []).filter(g => getLogByDate(g.id, iso)?.checked).length;
    const pct = Math.round(getDayCompliancePct(iso));
    monthSum += pct; monthCount++;
    const tier = pct >= 80 ? 'good' : pct >= 60 ? 'warn' : 'bad';
    cellsHtml += `
      <div class="commit-hm-cell tier-${tier}${isToday ? ' today' : ''} clickable" data-commit-day-select="${iso}" title="${checked}/${totalGoals} commitments completed">
        <span class="commit-hm-daynum">${day}</span>
        <span class="commit-hm-pct">${pct}%</span>
      </div>`;
  }
  const monthAvgPct = monthCount ? Math.round(monthSum / monthCount) : 0;

  return `
    <div class="commit-day-nav">
      <button class="proj-nav-btn" data-commit-month-nav="-1" title="Previous month">&#8249;</button>
      <span class="commit-day-label">${monthLabel}</span>
      <button class="proj-nav-btn" data-commit-month-nav="1" title="Next month"${isCurrentMonth ? ' disabled style="opacity:.3;pointer-events:none"' : ''}>&#8250;</button>
      ${!isCurrentMonth ? `<button class="commit-tab-btn" data-commit-month-today>This month</button>` : ''}
    </div>
    ${totalGoals ? `<div class="commit-month-stats">${monthAvgPct}% average this month</div>` : `<div class="commit-month-stats">No commitments yet.</div>`}
    <div class="commit-hm-grid">${cellsHtml}</div>
    <div class="commit-hm-legend">
      <span class="commit-hm-legend-sw tier-good"></span><span>&ge;80%</span>
      <span class="commit-hm-legend-sw tier-warn"></span><span>60&ndash;79%</span>
      <span class="commit-hm-legend-sw tier-bad"></span><span>&lt;60%</span>
    </div>`;
}

// Layer 2 — Year sparkline: 12 monthly averages as a simple SVG line chart.
// Months after the current one (or, for a future year, every month) have no
// data yet and are left out of the line entirely rather than plotted as 0%.
function buildCommitYearSparklineData(year) {
  const today = todayISO();
  const todayD = new Date(); todayD.setHours(0, 0, 0, 0);
  const points = [];
  for (let m = 0; m < 12; m++) {
    const monthStart = new Date(year, m, 1);
    const isFutureMonth = monthStart > todayD && !(monthStart.getFullYear() === todayD.getFullYear() && monthStart.getMonth() === todayD.getMonth());
    if (isFutureMonth) { points.push({ month: m, pct: null }); continue; }
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    let sum = 0, count = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = `${year}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (iso > today) break;
      sum += getDayCompliancePct(iso);
      count++;
    }
    points.push({ month: m, pct: count ? Math.round(sum / count) : 0 });
  }
  return points;
}
function renderCommitYearSparkline(year, hasGoals) {
  const points = buildCommitYearSparklineData(year);
  const todayYear = new Date().getFullYear();
  const nowMonth = new Date().getMonth();
  const validPoints = points.filter(p => p.pct !== null);
  const avgPct = validPoints.length ? Math.round(validPoints.reduce((s, p) => s + p.pct, 0) / validPoints.length) : 0;

  const W = 600, H = 180, padX = 28, padY = 20;
  const plotW = W - padX * 2, plotH = H - padY * 2;
  const xFor = i => padX + (i / 11) * plotW;
  const yFor = pct => padY + plotH - (pct / 100) * plotH;

  const linePoints = points.map((p, i) => p.pct === null ? null : `${xFor(i).toFixed(1)},${yFor(p.pct).toFixed(1)}`).filter(Boolean).join(' ');
  const gridLines = [0, 50, 100].map(v => `
      <line x1="${padX}" y1="${yFor(v).toFixed(1)}" x2="${W - padX}" y2="${yFor(v).toFixed(1)}" class="commit-spark-grid"/>
      <text x="${padX - 6}" y="${(yFor(v) + 3).toFixed(1)}" class="commit-spark-axis-lbl" text-anchor="end">${v}</text>`).join('');
  const xLabels = points.map((_, i) => `<text x="${xFor(i).toFixed(1)}" y="${H - 4}" class="commit-spark-axis-lbl" text-anchor="middle">${MONTH_NAMES[i]}</text>`).join('');
  const dots = points.map((p, i) => {
    if (p.pct === null) return '';
    const isCurrentMonth = year === todayYear && i === nowMonth;
    return `<circle class="commit-spark-dot${isCurrentMonth ? ' current' : ''}" cx="${xFor(i).toFixed(1)}" cy="${yFor(p.pct).toFixed(1)}" r="4.5" data-commit-spark-month="${i}" title="${MONTH_NAMES[i]} ${year} · ${p.pct}%"></circle>`;
  }).join('');

  return `
    <div class="heatmap-header">
      <span class="heatmap-total">${hasGoals && validPoints.length ? `${avgPct}% average in ${year}` : 'No commitments yet'}</span>
      <div class="heatmap-year-nav">
        <button class="proj-nav-btn" data-commit-year-nav="-1" title="Previous year">&#8249;</button>
        <span style="font-size:11px;color:var(--text-faint)">${year}</span>
        <button class="proj-nav-btn" data-commit-year-nav="1" title="Next year"${year >= todayYear ? ' disabled style="opacity:.3;pointer-events:none"' : ''}>&#8250;</button>
      </div>
    </div>
    <svg viewBox="0 0 ${W} ${H}" class="commit-sparkline" role="img" aria-label="Monthly completion trend for ${year}">
      ${gridLines}
      <polyline class="commit-spark-line" points="${linePoints}" fill="none"/>
      ${dots}
      ${xLabels}
    </svg>`;
}

// Layer 3 — day-detail modal. Reuses the app's shared .hq-modal-* CSS (see
// showConfirmModal() in js/core.js for the same overlay/ESC/outside-click
// pattern) via its own dynamically-created overlay, so it doesn't need to
// touch state or go through render() to open/close.
function showCommitDayModal(iso) {
  let overlay = document.getElementById('commit-day-modal-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'commit-day-modal-overlay';
    overlay.className = 'hq-modal-overlay';
    document.body.appendChild(overlay);
  }
  const allGoals = state.goals.items || [];
  const dayPct = allGoals.length ? Math.round(getDayCompliancePct(iso)) : 0;
  const isToday = iso === todayISO();
  const dayLabel = isToday ? 'Today' : new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });

  const rows = getGoalCategories().map(cat => {
    const items = categoryItems(cat);
    if (!items.length) return '';
    const catRows = items.map(g => {
      const target = g.target_count || 1;
      const log = getLogByDate(g.id, iso);
      const checked = log?.checked || false;
      const count = log?.count || 0;
      const status = checked ? 'done' : count > 0 ? 'partial' : 'missed';
      const icon = status === 'done' ? '&#10003;' : status === 'partial' ? '&#9675;' : '&#10007;';
      const value = target > 1 ? `${count}/${target}${g.unit ? ' ' + escapeHtml(g.unit) : ''}` : '';
      return `
        <li class="commit-day-modal-row status-${status}">
          <span class="commit-day-modal-icon">${icon}</span>
          <span class="commit-day-modal-text">${escapeHtml(g.text)}</span>
          ${value ? `<span class="commit-day-modal-value">${value}</span>` : ''}
        </li>`;
    }).join('');
    return `<div class="commit-day-cat-label">${escapeHtml(cat)}</div><ul class="commit-day-modal-list">${catRows}</ul>`;
  }).join('');

  overlay.innerHTML = `
    <div class="hq-modal-card commit-day-modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(dayLabel)} detail">
      <div class="hq-modal-header">
        <div>
          <div class="hq-modal-title">${dayLabel}</div>
          <div class="commit-day-modal-pct">${dayPct}% complete</div>
        </div>
        <button class="hq-modal-close" data-commit-day-modal-close aria-label="Close">&#x2715;</button>
      </div>
      <div class="hq-modal-body">
        ${rows || `<div class="item-sub">No commitments yet.</div>`}
      </div>
    </div>`;

  function close() {
    overlay.classList.remove('open');
    document.removeEventListener('keydown', escHandler);
  }
  function escHandler(e) { if (e.key === 'Escape') close(); }
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelector('[data-commit-day-modal-close]').onclick = close;
  document.addEventListener('keydown', escHandler);

  requestAnimationFrame(() => overlay.classList.add('open'));
}
function updateCategoryHeaderCount(cat) {
  const items = categoryItems(cat);
  const checked = items.filter(i => getTodayLog(i.id)?.checked).length;
  const pct = items.length ? Math.round(checked / items.length * 100) : 0;
  document.querySelectorAll('[data-goal-count-header]').forEach(el => {
    if (el.dataset.goalCountHeader === cat) el.textContent = `${checked} / ${items.length}`;
  });
  document.querySelectorAll('[data-goal-progress-mini]').forEach(el => {
    if (el.dataset.goalProgressMini === cat) el.style.width = pct + '%';
  });
}
// Daily reminder cue (goals.reminder_time) — an Atomic Habits-style
// implementation intention ("at this time, do this"), distinct from
// Schedule's one-off alarm_time. Reuses Schedule's alarm banner/beep/
// notification system (fireAlarm/showAlarmBanner in js/pages/schedule.js)
// and its firedAlarms Set, namespaced with a 'goal:'/'goal-nudge:' prefix
// so ids never collide with schedule_events ids. Fires once at
// reminder_time, then once more GOAL_REMINDER_GRACE_MINUTES later as a
// gentler nudge — both only if the commitment isn't checked off yet today.
const GOAL_REMINDER_GRACE_MINUTES = 45;
function fireGoalReminder(g, isNudge) {
  fireAlarm(
    { id: g.id, title: g.text, time: g.reminder_time },
    isNudge ? `Still open today${g.category ? ' · ' + g.category : ''}` : `Time for your commitment${g.category ? ' · ' + g.category : ''}`
  );
}
function checkGoalReminders() {
  const items = state.goals.items || [];
  if (!items.length) return;
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  items.forEach(g => {
    if (!g.reminder_time) return;
    if (getTodayLog(g.id)?.checked) return;
    const [hh, mm] = g.reminder_time.split(':').map(Number);
    const remindMinutes = hh * 60 + mm;
    const primaryKey = 'goal:' + g.id;
    const nudgeKey = 'goal-nudge:' + g.id;
    if (!firedAlarms.has(primaryKey) && Math.abs(nowMinutes - remindMinutes) <= 1) {
      firedAlarms.add(primaryKey);
      fireGoalReminder(g, false);
    } else if (!firedAlarms.has(nudgeKey) && Math.abs(nowMinutes - (remindMinutes + GOAL_REMINDER_GRACE_MINUTES)) <= 1) {
      firedAlarms.add(nudgeKey);
      fireGoalReminder(g, true);
    }
  });
}
function updateGoalStreakBadge(goalId) {
  const el = document.querySelector(`[data-goal-streak="${goalId}"]`);
  if (!el) return;
  const streak = computeGoalStreak(goalId);
  el.textContent = streak > 0 ? '\u{1F525}' + streak : '';
  if (streak > 0) el.title = `${streak}-day streak`;
  else el.removeAttribute('title');
}
function computeDailyScore() {
  const allGoals = state.goals.items || [];
  const totalGoals = allGoals.length;
  if (!totalGoals) return 0;
  const checkedToday = allGoals.filter(g => getTodayLog(g.id)?.checked).length;
  return Math.round((checkedToday / totalGoals) * 100);
}

function animateComplianceRing() {
  const card = document.getElementById('commit-compliance-card');
  if (!card) return;
  card.querySelectorAll('.compliance-arc').forEach(arc => {
    const full = parseFloat(arc.dataset.full || arc.getAttribute('stroke-dasharray') || 213.63);
    const pct  = parseFloat(arc.dataset.pct || 0);
    arc.style.strokeDashoffset = full - (pct / 100 * full);
  });
  const firstArc = card.querySelector('.compliance-arc');
  const pct = firstArc ? parseFloat(firstArc.dataset.pct || 0) : 0;
  card.querySelectorAll('.compliance-pct-text').forEach(el => el.textContent = Math.round(pct));
}

function updateComplianceRing() {
  const card = document.getElementById('commit-compliance-card');
  if (!card) return;
  const allGoals = state.goals.items || [];
  const total    = allGoals.length;
  const checked  = allGoals.filter(g => getTodayLog(g.id)?.checked).length;
  const pct      = total ? Math.round(checked / total * 100) : 0;
  card.querySelectorAll('.compliance-arc').forEach(arc => {
    const full = parseFloat(arc.getAttribute('stroke-dasharray') || 213.63);
    arc.style.strokeDashoffset = full - (pct / 100 * full);
    arc.dataset.pct = pct;
  });
  card.querySelectorAll('.compliance-pct-text').forEach(el => el.textContent = pct);
  const summaryPct = card.querySelector('[data-compliance-summary-pct]');
  if (summaryPct) summaryPct.textContent = pct + '%'; // kept in sync so the score still shows while the card is collapsed
  card.querySelectorAll('[data-compliance-fill]').forEach(el => {
    const items = categoryItems(el.dataset.complianceFill);
    const chk = items.filter(g => getTodayLog(g.id)?.checked).length;
    el.style.width = (items.length ? Math.round(chk / items.length * 100) : 0) + '%';
  });
  card.querySelectorAll('[data-compliance-count]').forEach(el => {
    const items = categoryItems(el.dataset.complianceCount);
    const chk = items.filter(g => getTodayLog(g.id)?.checked).length;
    el.textContent = `${chk}/${items.length}`;
  });
}

function renderCommitments() {
  const allGoals  = state.goals.items || [];
  const totalGoals = allGoals.length;

  const overallChecked = allGoals.filter(g => getTodayLog(g.id)?.checked).length;
  const overallPct     = totalGoals ? Math.round(overallChecked / totalGoals * 100) : 0;
  const categories      = getGoalCategories();

  function goalRow(i) {
    const target = i.target_count || 1;
    const log = getTodayLog(i.id);
    const count = log?.count || 0;
    const isDone = log?.checked || false;
    const control = target > 1 ? `
        <div class="goal-counter">
          <button type="button" class="goal-count-btn" data-goal-bump="-1|${i.id}" aria-label="Decrease">&#8722;</button>
          <span class="goal-count-val" data-goal-count-val="${i.id}">${count}/${target}${i.unit ? ' ' + escapeHtml(i.unit) : ''}</span>
          <button type="button" class="goal-count-btn" data-goal-bump="1|${i.id}" aria-label="Increase">&#43;</button>
        </div>` : `<span class="check ${isDone ? 'checked' : ''}" data-toggle-goal="${i.id}"></span>`;
    const streak = computeGoalStreak(i.id);
    const streakBadge = `<span class="goal-streak" data-goal-streak="${i.id}"${streak > 0 ? ` title="${streak}-day streak"` : ''}>${streak > 0 ? '&#128293;' + streak : ''}</span>`;
    const timeBadge = i.reminder_time ? `<span class="goal-time-badge" title="Cue time">&#128337; ${escapeHtml(i.reminder_time)}</span>` : '';
    return `
    <li class="goal-item${isDone ? ' goal-done' : ''}" draggable="true" data-goal-drag="${i.id}" data-goal-row="${i.id}">
      <div class="list-item" style="padding:10px 0;align-items:center">
        ${control}
        <span class="check-label ${isDone ? 'done' : ''}" style="flex:1" data-goal-text="${i.id}">${escapeHtml(i.text)}</span>
        ${timeBadge}
        ${streakBadge}
        <div class="fin-acts">
          <button class="fin-edit-btn" data-edit-goal="${i.id}">&#x270E;</button>
          <button class="fin-del-btn" data-del-goal="${i.id}" title="Delete">${ICON_TRASH}</button>
        </div>
      </div>
    </li>`;
  }

  function categoryCard(cat, idx) {
    const itemsInCat = categoryItems(cat);
    const checkedInCat = itemsInCat.filter(g => getTodayLog(g.id)?.checked).length;
    const pctInCat = itemsInCat.length ? Math.round(checkedInCat / itemsInCat.length * 100) : 0;
    return `
      <details class="card cat-card" style="animation-delay:${40 + idx * 20}ms" open>
        <summary>
          <div class="section-title" style="margin:0">${escapeHtml(cat)} <span class="meta" data-goal-count-header="${escapeHtml(cat)}">${checkedInCat} / ${itemsInCat.length}</span></div>
          <div class="cat-head-right">
            <div class="cat-progress-mini"><div data-goal-progress-mini="${escapeHtml(cat)}" style="width:${pctInCat}%"></div></div>
            <span class="chevron">&#8250;</span>
          </div>
        </summary>
        <div class="cat-body">
          ${itemsInCat.length ? `<ul class="list" style="padding:0" data-goal-list data-goal-cat="${escapeHtml(cat)}">${itemsInCat.map(i => goalRow(i)).join('')}</ul>` : ''}
          <button class="add-btn" data-add-commit="${escapeHtml(cat)}" style="margin-top:14px"><span class="plus">+</span> Add to ${escapeHtml(cat)}</button>
        </div>
      </details>`;
  }

  // History tab content — Month (Layer 1, default) / Year (Layer 2 sparkline).
  // Layer 3 (day detail) is a modal, not a tab — see showCommitDayModal().
  // 'day'/'week'/'grid' were prior designs (all replaced 2026-09-18); any legacy
  // in-session value falls back to 'month'.
  if (['day', 'week', 'grid'].includes(state.commitPreviewTab)) state.commitPreviewTab = 'month';
  const tab = state.commitPreviewTab;
  const tabBodyHtml = tab === 'year'
    ? renderCommitYearSparkline(state.commitHeatmapYear, totalGoals > 0)
    : renderCommitMonthHeatmap();

  return `
    ${topbar()}
    <h1 class="page-title">Commitments</h1>
    <details class="card cat-card commit-compliance-card" id="commit-compliance-card" style="animation-delay:0ms" open>
      <summary>
        <div class="section-title" style="margin:0">Today's Compliance <span class="meta" data-compliance-summary-pct>${overallPct}%</span></div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        <div class="compliance-inner">
          <svg class="compliance-ring-desktop" width="80" height="80" viewBox="0 0 80 80" aria-hidden="true">
            <circle cx="40" cy="40" r="34" fill="none" stroke="#2a2a2a" stroke-width="6"/>
            <circle class="compliance-arc" cx="40" cy="40" r="34" fill="none"
              stroke="var(--accent)" stroke-width="6" stroke-linecap="round"
              stroke-dasharray="213.63"
              style="stroke-dashoffset:213.63;transform:rotate(-90deg);transform-origin:40px 40px"
              data-pct="${overallPct}" data-full="213.63"/>
            <text x="40" y="40" text-anchor="middle" dominant-baseline="middle"
              font-size="18" font-weight="300" fill="var(--accent)"
              class="compliance-pct-text">0</text>
          </svg>
          <svg class="compliance-ring-mobile" width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#2a2a2a" stroke-width="7"/>
            <circle class="compliance-arc" cx="50" cy="50" r="42" fill="none"
              stroke="var(--accent)" stroke-width="7" stroke-linecap="round"
              stroke-dasharray="263.89"
              style="stroke-dashoffset:263.89;transform:rotate(-90deg);transform-origin:50px 50px"
              data-pct="${overallPct}" data-full="263.89"/>
            <text x="50" y="46" text-anchor="middle" dominant-baseline="middle"
              font-size="20" font-weight="300" fill="var(--accent)"
              class="compliance-pct-text">0</text>
            <text x="50" y="64" text-anchor="middle" dominant-baseline="middle"
              font-size="9" fill="#6a6a6a">today</text>
          </svg>
          <div class="compliance-bars">
            <div class="compliance-label">TODAY'S COMPLIANCE</div>
            ${categories.map(cat => {
              const items = categoryItems(cat);
              const chk = items.filter(g => getTodayLog(g.id)?.checked).length;
              const pct = items.length ? Math.round(chk / items.length * 100) : 0;
              return `
            <div class="compliance-bar-row">
              <span class="compliance-bar-lbl" title="${escapeHtml(cat)}">${escapeHtml(cat)}</span>
              <div class="compliance-bar-track"><div class="compliance-bar-fill" data-compliance-fill="${escapeHtml(cat)}" style="width:${pct}%"></div></div>
              <span class="compliance-bar-count" data-compliance-count="${escapeHtml(cat)}">${chk}/${items.length}</span>
            </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </details>
    <div class="commit-quest-label" style="justify-content:space-between">
      <span>&#9876;&#65039; Main Quest</span>
      <button class="add-btn-inline" data-add-commit="">+ New category</button>
    </div>
    ${categories.map((cat, idx) => `<div style="margin-top:16px">${categoryCard(cat, idx)}</div>`).join('')}
    <div class="commit-quest-label">History</div>
    <div class="card" style="animation-delay:80ms">
      <div class="commit-preview-tabs">
        <button class="commit-tab-btn${tab === 'month' ? ' active' : ''}" data-commit-tab="month">Month</button>
        <button class="commit-tab-btn${tab === 'year'  ? ' active' : ''}" data-commit-tab="year">Year</button>
      </div>
      ${tabBodyHtml}
    </div>
  `;
}


/* ---- COMMIT: event binding ---- */

function bindCommitmentsEvents() {
  // commitments preview tab switch
  main.querySelectorAll('[data-commit-tab]').forEach(el => el.addEventListener('click', () => {
    state.commitPreviewTab = el.dataset.commitTab;
    render();
  }));


  // Layer 1 → Layer 3: click a Month heatmap cell to open the day-detail modal.
  // Purely a DOM/overlay concern — no state mutation or render() needed to open it.
  main.querySelectorAll('[data-commit-day-select]').forEach(el => el.addEventListener('click', () => {
    showCommitDayModal(el.dataset.commitDaySelect);
  }));


  // Layer 2 → Layer 1: click a sparkline month point to jump to the Month heatmap for that month
  main.querySelectorAll('[data-commit-spark-month]').forEach(el => el.addEventListener('click', () => {
    const m = Number(el.dataset.commitSparkMonth);
    const year = state.commitHeatmapYear || new Date().getFullYear();
    state.commitViewMonth = `${year}-${String(m + 1).padStart(2, '0')}`;
    state.commitPreviewTab = 'month';
    render();
  }));


  // commitments history nav — Month
  main.querySelectorAll('[data-commit-month-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.commitMonthNav);
    const [y, m] = (state.commitViewMonth || todayISO().slice(0, 7)).split('-').map(Number);
    const next = ymLocal(new Date(y, m - 1 + dir, 1));
    if (next > todayISO().slice(0, 7)) return;
    state.commitViewMonth = next;
    render();
  }));
  const commitMonthToday = main.querySelector('[data-commit-month-today]');
  if (commitMonthToday) commitMonthToday.addEventListener('click', () => { state.commitViewMonth = todayISO().slice(0, 7); render(); });


  // commitments history nav — Year
  main.querySelectorAll('[data-commit-year-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.commitYearNav);
    const todayYear = new Date().getFullYear();
    state.commitHeatmapYear = Math.min(todayYear, (state.commitHeatmapYear || todayYear) + dir);
    render();
  }));


  // goal toggle → upsert goal_logs (target_count === 1 items only; counter items use data-goal-bump)
  main.querySelectorAll('[data-toggle-goal]').forEach(el => el.addEventListener('click', async () => {
    const id = el.dataset.toggleGoal;
    const g = (state.goals.items || []).find(x => x.id === id);
    if (!g || !currentUser) return;
    const target = g.target_count || 1;
    const today = todayISO();
    const existingLog = getTodayLog(id);
    const newChecked = existingLog ? !existingLog.checked : true;
    const newCount = newChecked ? target : 0;
    const newCompletedAt = newChecked ? new Date().toISOString() : null; // feeds Home's activity heatmap/feed
    if (existingLog) {
      existingLog.checked = newChecked;
      existingLog.count = newCount;
      existingLog.completed_at = newCompletedAt;
    } else {
      state.goalLogs.push({ id: null, goal_id: id, user_id: currentUser.id, date: today, checked: newChecked, count: newCount, completed_at: newCompletedAt });
    }
    pulse(el);
    el.classList.toggle('checked', newChecked);
    el.closest('.goal-item')?.classList.toggle('goal-done', newChecked);
    const labelEl = el.closest('.goal-item')?.querySelector('.check-label');
    if (labelEl) labelEl.classList.toggle('done', newChecked);
    updateCategoryHeaderCount(g.category || 'General');
    updateComplianceRing();
    updateGoalStreakBadge(id);
    const { data } = await dbCall(() => sb.from('goal_logs').upsert(
      { user_id: currentUser.id, goal_id: id, date: today, checked: newChecked, count: newCount, completed_at: newCompletedAt },
      { onConflict: 'goal_id,date' }
    ).select().single());
    if (data) {
      const localLog = state.goalLogs.find(l => l.goal_id === id && l.date === today);
      if (localLog && !localLog.id) localLog.id = data.id;
    }
  }));


  // goal counter bump (+/-) → upsert goal_logs.count, derives checked = count >= target_count
  main.querySelectorAll('[data-goal-bump]').forEach(el => el.addEventListener('click', async () => {
    const [dirStr, id] = el.dataset.goalBump.split('|');
    const dir = Number(dirStr);
    const g = (state.goals.items || []).find(x => x.id === id);
    if (!g || !currentUser) return;
    const target = g.target_count || 1;
    const today = todayISO();
    const existingLog = getTodayLog(id);
    const prevCount = existingLog?.count || 0;
    const wasChecked = existingLog?.checked || false;
    const newCount = Math.max(0, prevCount + dir);
    const newChecked = newCount >= target;
    // Only stamp/clear completed_at on an actual checked transition — bumping the
    // counter further up/down while already done (or already not done) shouldn't move it.
    const newCompletedAt = newChecked === wasChecked ? (existingLog?.completed_at || null) : (newChecked ? new Date().toISOString() : null);
    if (existingLog) {
      existingLog.count = newCount;
      existingLog.checked = newChecked;
      existingLog.completed_at = newCompletedAt;
    } else {
      state.goalLogs.push({ id: null, goal_id: id, user_id: currentUser.id, date: today, checked: newChecked, count: newCount, completed_at: newCompletedAt });
    }
    const valEl = document.querySelector(`[data-goal-count-val="${id}"]`);
    if (valEl) valEl.textContent = `${newCount}/${target}${g.unit ? ' ' + g.unit : ''}`;
    const rowEl = document.querySelector(`[data-goal-row="${id}"]`);
    if (rowEl) rowEl.classList.toggle('goal-done', newChecked);
    const labelEl = document.querySelector(`[data-goal-text="${id}"]`);
    if (labelEl) labelEl.classList.toggle('done', newChecked);
    updateCategoryHeaderCount(g.category || 'General');
    updateComplianceRing();
    updateGoalStreakBadge(id);
    const { data } = await dbCall(() => sb.from('goal_logs').upsert(
      { user_id: currentUser.id, goal_id: id, date: today, checked: newChecked, count: newCount, completed_at: newCompletedAt },
      { onConflict: 'goal_id,date' }
    ).select().single());
    if (data) {
      const localLog = state.goalLogs.find(l => l.goal_id === id && l.date === today);
      if (localLog && !localLog.id) localLog.id = data.id;
    }
  }));


  // ---- COMMITMENTS ----
  main.querySelectorAll('[data-del-goal]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delGoal;
    showConfirmModal({
      title: 'Delete Commitment?',
      message: 'Remove this from your commitments?',
      onConfirm: () => {
        state.goals.items = state.goals.items.filter(x => x.id !== id);
        render();
        dbCall(() => sb.from('goals').delete().eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-edit-goal]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = el.dataset.editGoal;
    const g = (state.goals.items || []).find(x => x.id === id);
    if (!g) return;
    showModal({
      title: 'Edit Commitment',
      fields: [
        { id: 'text', label: 'Commitment', type: 'text', value: g.text, placeholder: '...' },
        { id: 'category', label: 'Category', type: 'select', value: g.category || 'General', options: getCategoryOptions() },
        { id: 'newCategory', label: 'Or new category', type: 'text', value: '', placeholder: 'e.g. Reading' },
        { id: 'target_count', label: 'Times per day', type: 'number', value: g.target_count || 1, placeholder: '1' },
        { id: 'unit', label: 'Unit (optional)', type: 'text', value: g.unit || '', placeholder: 'e.g. DM, halaman, menit' },
        { id: 'reminderEnabled', label: 'Give this a time', type: 'toggle', value: !!g.reminder_time, controls: 'reminderTime' },
        { id: 'reminderTime', label: 'At', type: 'time', value: g.reminder_time || '08:00' }
      ],
      saveLabel: 'Save',
      onSave: ({ text, category, newCategory, target_count, unit, reminderEnabled, reminderTime }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const categoryVal = newCategory.trim() || category || 'General';
        const targetVal = Math.max(1, Math.round(Number(target_count)) || 1);
        const unitVal = unit.trim() || null;
        const reminderVal = reminderEnabled ? reminderTime : null;
        g.text = trimmed;
        g.category = categoryVal;
        g.target_count = targetVal;
        g.unit = unitVal;
        g.reminder_time = reminderVal;
        render();
        dbCall(() => sb.from('goals').update({ text: trimmed, category: categoryVal, target_count: targetVal, unit: unitVal, reminder_time: reminderVal }).eq('id', id));
      }
    });
  }));

  main.querySelectorAll('[data-goal-list]').forEach(ul => {
    ul.addEventListener('dragstart', e => {
      const li = e.target.closest('.goal-item');
      if (!li) return;
      draggedGoalId = li.dataset.goalDrag;
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => li.classList.add('dragging'));
    });

    ul.addEventListener('dragend', () => {
      ul.querySelectorAll('.goal-item').forEach(x => x.classList.remove('dragging', 'drag-over-top', 'drag-over-bottom'));
      draggedGoalId = null;
    });

    ul.addEventListener('dragover', e => {
      if (!draggedGoalId) return;
      e.preventDefault();
      const li = e.target.closest('.goal-item');
      ul.querySelectorAll('.goal-item').forEach(x => x.classList.remove('drag-over-top', 'drag-over-bottom'));
      if (li && li.dataset.goalDrag !== draggedGoalId) {
        const rect = li.getBoundingClientRect();
        const before = e.clientY - rect.top < rect.height / 2;
        li.classList.add(before ? 'drag-over-top' : 'drag-over-bottom');
      }
    });

    ul.addEventListener('drop', e => {
      if (!draggedGoalId) return;
      e.preventDefault();
      const list = state.goals.items || [];
      const fromIdx = list.findIndex(x => x.id === draggedGoalId);
      if (fromIdx === -1) return;
      if (ul.dataset.goalCat && (list[fromIdx].category || 'General') !== ul.dataset.goalCat) {
        draggedGoalId = null;
        return;
      }

      const li = e.target.closest('.goal-item');
      let toIdx = list.length - 1;
      if (li && li.dataset.goalDrag !== draggedGoalId) {
        const targetIdx = list.findIndex(x => x.id === li.dataset.goalDrag);
        const rect = li.getBoundingClientRect();
        const before = e.clientY - rect.top < rect.height / 2;
        toIdx = targetIdx + (before ? 0 : 1);
        if (toIdx > fromIdx) toIdx--;
      }
      if (toIdx === fromIdx) return;

      const [moved] = list.splice(fromIdx, 1);
      list.splice(toIdx, 0, moved);
      draggedGoalId = null;
      render();
      list.forEach((g, idx) => dbCall(() => sb.from('goals').update({ order_index: idx }).eq('id', g.id)));
    });
  });

  main.querySelectorAll('[data-add-commit]').forEach(btn => btn.addEventListener('click', () => {
    const presetCat = btn.dataset.addCommit || '';
    const catOptions = getCategoryOptions();
    showModal({
      title: presetCat ? `Add to ${presetCat}` : 'New Commitment',
      fields: [
        { id: 'text', label: 'Commitment', type: 'text', value: '', placeholder: 'e.g. Push Up' },
        { id: 'category', label: 'Category', type: 'select', value: presetCat || catOptions[0], options: catOptions },
        { id: 'newCategory', label: 'Or new category', type: 'text', value: '', placeholder: 'e.g. Reading' },
        { id: 'target_count', label: 'Times per day', type: 'number', value: 1, placeholder: '1' },
        { id: 'unit', label: 'Unit (optional)', type: 'text', value: '', placeholder: 'e.g. DM, halaman, menit' },
        { id: 'reminderEnabled', label: 'Give this a time', type: 'toggle', value: false, controls: 'reminderTime' },
        { id: 'reminderTime', label: 'At', type: 'time', value: '08:00' }
      ],
      saveLabel: 'Add',
      onSave: async ({ text, category, newCategory, target_count, unit, reminderEnabled, reminderTime }) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const categoryVal = newCategory.trim() || category || 'General';
        const order_index = state.goals.items.length;
        const targetVal = Math.max(1, Math.round(Number(target_count)) || 1);
        const unitVal = unit.trim() || null;
        const reminderVal = reminderEnabled ? reminderTime : null;
        const { data } = await dbCall(() => sb.from('goals').insert({ user_id: currentUser.id, type: 'do', text: trimmed, category: categoryVal, order_index, target_count: targetVal, unit: unitVal, reminder_time: reminderVal }).select().single());
        if (data) { state.goals.items.push({ id: data.id, text: trimmed, category: categoryVal, target_count: targetVal, unit: unitVal, reminder_time: reminderVal }); render(); }
      }
    });
  }));

}

