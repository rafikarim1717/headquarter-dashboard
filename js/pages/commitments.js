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
function getMondayOf(dateIso) {
  const d = new Date(dateIso + 'T00:00:00');
  const dow = d.getDay();
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
  return isoLocal(d);
}
function getWeekDays(mondayIso) {
  const monday = new Date(mondayIso + 'T00:00:00');
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push(d);
  }
  return days;
}
// Habit-grid table (2026-09-18, replaced the old separate Week strip + Month calendar tabs):
// rows = commitments, columns = days — the classic bullet-journal/habit-tracker layout, so a
// glance shows both per-commitment patterns (reading a row) and same-day comparisons (reading
// a column), which neither the old aggregate-%-only Week/Month views nor a single day's drill-down
// could show at once. `commitGridRange` toggles the column count between a 7-day week and a
// full month (horizontally scrollable — the name column stays sticky via CSS position:sticky).
function renderCommitHabitGrid() {
  const today = todayISO();
  const allGoals = state.goals.items || [];
  const range = state.commitGridRange || 'week';
  let days, rangeLabel, isCurrent, navKey;

  if (range === 'month') {
    const viewMonthStr = state.commitViewMonth || today.slice(0, 7);
    const [vy, vm] = viewMonthStr.split('-').map(Number);
    isCurrent = viewMonthStr === today.slice(0, 7);
    const daysInMonth = new Date(vy, vm, 0).getDate();
    days = Array.from({ length: daysInMonth }, (_, i) => `${String(vy).padStart(4, '0')}-${String(vm).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
    rangeLabel = new Date(vy, vm - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    navKey = 'month';
  } else {
    const monday = state.commitViewWeekStart || getMondayOf(today);
    isCurrent = monday === getMondayOf(today);
    days = getWeekDays(monday).map(isoLocal);
    rangeLabel = `${fmtDate(days[0])} – ${fmtDate(days[6])}`;
    navKey = 'week';
  }

  const headerCells = days.map(iso => {
    const d = new Date(iso + 'T00:00:00');
    const isToday = iso === today;
    const isFuture = iso > today;
    const dow = range === 'week' ? `<div class="habit-table-dow">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()]}</div>` : '';
    return `<th class="habit-table-daycol${isToday ? ' today' : ''}${isFuture ? ' future' : ''}">${dow}<div class="habit-table-daynum">${d.getDate()}</div></th>`;
  }).join('');

  function habitCellHtml(g, iso) {
    if (iso > today) return `<td class="habit-cell future">–</td>`;
    const target = g.target_count || 1;
    const log = getLogByDate(g.id, iso);
    const checked = log?.checked || false;
    const count = log?.count || 0;
    if (target > 1) {
      const cls = `habit-cell counter${checked ? ' done' : count > 0 ? ' partial' : ''}`;
      return `<td class="${cls}" title="${iso} · ${count}/${target}${g.unit ? ' ' + escapeHtml(g.unit) : ''}">${count}</td>`;
    }
    return `<td class="habit-cell${checked ? ' done' : ''}" title="${iso}${checked ? ' · done' : ''}">${checked ? '&#10003;' : '&#183;'}</td>`;
  }

  // Sorted by category (not labeled inline — the point is a quick per-row/per-column scan,
  // not a second copy of the category cards above) so related commitments still sit together.
  const orderedGoals = getGoalCategories().flatMap(cat => categoryItems(cat));
  const rows = orderedGoals.map(g => {
    const streak = computeGoalStreak(g.id);
    return `
      <tr>
        <td class="habit-table-namecol" title="${escapeHtml(g.text)}">${escapeHtml(g.text)}${streak > 0 ? ` <span class="habit-table-streak">&#128293;${streak}</span>` : ''}</td>
        ${days.map(iso => habitCellHtml(g, iso)).join('')}
      </tr>`;
  }).join('');

  const footerCells = days.map(iso => {
    if (iso > today) return `<td class="habit-cell future">–</td>`;
    const pct = allGoals.length ? Math.round(getDayCompliancePct(iso)) : 0;
    return `<td class="habit-cell" style="${commitHeatTint(pct)}" title="${iso} · ${pct}%">${pct}</td>`;
  }).join('');

  return `
    <div class="commit-grid-toolbar">
      <div class="commit-grid-range-toggle">
        <button class="commit-tab-btn${range === 'week' ? ' active' : ''}" data-commit-grid-range="week">Week</button>
        <button class="commit-tab-btn${range === 'month' ? ' active' : ''}" data-commit-grid-range="month">Month</button>
      </div>
      <div class="commit-day-nav" style="margin-top:0;flex:1;min-width:160px">
        <button class="proj-nav-btn" data-commit-${navKey}-nav="-1" title="Previous ${range}">&#8249;</button>
        <span class="commit-day-label">${rangeLabel}</span>
        <button class="proj-nav-btn" data-commit-${navKey}-nav="1" title="Next ${range}"${isCurrent ? ' disabled style="opacity:.3;pointer-events:none"' : ''}>&#8250;</button>
        ${!isCurrent ? `<button class="commit-tab-btn" data-commit-${navKey}-today>This ${range}</button>` : ''}
      </div>
    </div>
    ${allGoals.length ? `
      <div class="habit-table-wrap">
        <table class="habit-table">
          <thead><tr><th class="habit-table-namecol"></th>${headerCells}</tr></thead>
          <tbody>
            ${rows}
            <tr class="habit-table-footer-row">
              <td class="habit-table-namecol">Daily %</td>
              ${footerCells}
            </tr>
          </tbody>
        </table>
      </div>` : `<div class="item-sub" style="margin-top:10px">No commitments yet.</div>`}`;
}
function buildCommitYearHeatmapData(year) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const jan1 = new Date(year, 0, 1);
  const start = new Date(year, 0, 1 - jan1.getDay());
  const yearEnd = year < today.getFullYear() ? new Date(year, 11, 31) : today;
  const end = new Date(yearEnd.getFullYear(), yearEnd.getMonth(), yearEnd.getDate() + (6 - yearEnd.getDay()));
  const cells = [], monthLabels = [];
  let col = 0, prevMonth = -1, d = new Date(start);
  let sum = 0, dayCount = 0, perfectDays = 0, activeDays = 0;
  while (d <= end) {
    for (let row = 0; row < 7; row++) {
      const iso = isoLocal(d);
      const inYear = d.getFullYear() === year;
      const m = d.getMonth();
      const isFuture = d > today;
      if (row === 0 && inYear && m !== prevMonth) { monthLabels.push({ month: m, col }); prevMonth = m; }
      let pct = 0;
      if (inYear && !isFuture) {
        pct = getDayCompliancePct(iso);
        sum += pct; dayCount++;
        if (pct >= 100) perfectDays++;
        if (pct > 0) activeDays++;
      }
      cells.push({ iso, pct, isFuture, isOut: !inYear });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    col++;
  }
  const avgPct = dayCount ? Math.round(sum / dayCount) : 0;
  return { cells, monthLabels, totalCols: col, avgPct, perfectDays, activeDays };
}
// Continuous (not bucketed) heat tint — blends var(--danger) toward var(--accent) as pct climbs
// from 0 to 100, then dims to a pastel via a second color-mix, for a smoother-looking gradient
// than the old 3-bucket (low/mid/high) scheme.
function commitHeatTint(pct) {
  if (pct <= 0) return '';
  return `background: color-mix(in oklab, color-mix(in oklab, var(--accent) ${Math.round(pct)}%, var(--danger)) 55%, transparent);`;
}
function renderCommitYearHeatmap(year, hasGoals) {
  const { cells, monthLabels, totalCols, avgPct, perfectDays, activeDays } = buildCommitYearHeatmapData(year);
  const todayYear = new Date().getFullYear();
  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  const cols = `24px repeat(${totalCols},1fr)`;
  return `
    <div class="heatmap-header">
      <span class="heatmap-total">${hasGoals ? `${avgPct}% average · ${perfectDays} perfect day${perfectDays === 1 ? '' : 's'} · ${activeDays} active day${activeDays === 1 ? '' : 's'} in ${year}` : 'No commitments yet'}</span>
      <div class="heatmap-year-nav">
        <button class="proj-nav-btn" data-commit-year-nav="-1" title="Previous year">&#8249;</button>
        <span style="font-size:11px;color:var(--text-faint)">${year}</span>
        <button class="proj-nav-btn" data-commit-year-nav="1" title="Next year"${year >= todayYear ? ' disabled style="opacity:.3;pointer-events:none"' : ''}>&#8250;</button>
      </div>
    </div>
    <div class="heatmap-month-row" style="grid-template-columns:${cols}">
      <span></span>
      ${monthLabels.map(({month, col}) => `<span class="heatmap-month-lbl" style="grid-column:${col + 2}">${MONTH_NAMES[month]}</span>`).join('')}
    </div>
    <div class="proj-heatmap" style="grid-template-columns:${cols};grid-template-rows:repeat(7,1fr)">
      ${DAY_LABELS.map(l => `<span class="hm-day-lbl">${l}</span>`).join('')}
      ${cells.map(c => {
        if (c.isOut || c.isFuture) return `<div class="heatmap-cell empty"></div>`;
        const selected = c.iso === state.commitViewDay;
        const cls = `heatmap-cell clickable${selected ? ' selected' : ''}`;
        return `<div class="${cls}" style="${commitHeatTint(c.pct)}" title="${c.iso} · ${Math.round(c.pct)}%" data-commit-day-select="${c.iso}"></div>`;
      }).join('')}
    </div>
    <div class="heatmap-legend">
      <span>Less</span>
      <div class="heatmap-cell" style="width:10px;height:10px"></div>
      <div class="heatmap-cell" style="width:10px;height:10px;${commitHeatTint(30)}"></div>
      <div class="heatmap-cell" style="width:10px;height:10px;${commitHeatTint(60)}"></div>
      <div class="heatmap-cell" style="width:10px;height:10px;${commitHeatTint(100)}"></div>
      <span>More</span>
    </div>`;
}
// Day-detail drill-down panel, opened by clicking a Month/Year cell (data-commit-day-select) —
// replaced the standalone "Day" tab (2026-09-18): that tab only ever showed one day at a time
// with no calendar context, so seeing a specific day's detail now lives one click away from
// the Month/Year view that day belongs to, instead of being its own tab. Shows the same
// per-commitment checked/count info the old Day tab did, plus the reminder cue time and the
// actual completed_at time so you can see not just whether you did it, but when.
function commitDayDetailHtml(iso) {
  const allGoals = state.goals.items || [];
  const dayPct = allGoals.length ? Math.round(getDayCompliancePct(iso)) : 0;
  const isToday = iso === todayISO();
  const dayLabel = isToday ? 'Today' : new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const cats = getGoalCategories();
  const rows = cats.map(cat => {
    const items = categoryItems(cat);
    if (!items.length) return '';
    const catRows = items.map(g => {
      const target = g.target_count || 1;
      const log = getLogByDate(g.id, iso);
      const checked = log?.checked || false;
      const count = log?.count || 0;
      const doneTime = checked && log?.completed_at ? new Date(log.completed_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
      return `
        <li class="commit-day-row${checked ? ' checked' : ''}">
          <span class="commit-day-icon">${checked ? '&#10003;' : '&#8211;'}</span>
          <span class="commit-day-text">${escapeHtml(g.text)}</span>
          ${target > 1 ? `<span class="commit-day-count">${count}/${target}</span>` : ''}
          ${g.reminder_time ? `<span class="commit-day-time" title="Cue time">&#128337; ${escapeHtml(g.reminder_time)}</span>` : ''}
          ${doneTime ? `<span class="commit-day-time" title="Completed at">&#10003; ${doneTime}</span>` : ''}
        </li>`;
    }).join('');
    return `<div class="commit-day-cat-label">${escapeHtml(cat)}</div>${catRows}`;
  }).join('');
  return `
    <div class="commit-day-detail">
      <div class="commit-day-detail-header">
        <span class="commit-day-label" style="text-align:left">${dayLabel}</span>
        <span class="commit-day-pct-badge">${dayPct}%</span>
        <button class="commit-day-detail-close" data-commit-day-close title="Close">&times;</button>
      </div>
      <ul class="commit-day-list">${rows || `<li class="commit-day-row"><span class="commit-day-text" style="color:var(--text-faint)">No commitments yet.</span></li>`}</ul>
    </div>`;
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

  // History tab content — Grid (habit-tracker table, Week/Month range) / Year.
  // 'day'/'week'/'month' were standalone tabs until 2026-09-18; any legacy in-session
  // value falls back to the unified 'grid' tab.
  if (['day', 'week', 'month'].includes(state.commitPreviewTab)) state.commitPreviewTab = 'grid';
  const tab = state.commitPreviewTab;
  let tabBodyHtml = '';

  if (tab === 'grid') {
    tabBodyHtml = renderCommitHabitGrid();
  } else {
    tabBodyHtml = renderCommitYearHeatmap(state.commitHeatmapYear, totalGoals > 0) + (state.commitViewDay ? commitDayDetailHtml(state.commitViewDay) : '');
  }

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
        <button class="commit-tab-btn${tab === 'grid'  ? ' active' : ''}" data-commit-tab="grid">Grid</button>
        <button class="commit-tab-btn${tab === 'year'  ? ' active' : ''}" data-commit-tab="year">Year</button>
      </div>
      ${tabBodyHtml}
    </div>
  `;
}


/* ---- COMMIT: event binding ---- */

function bindCommitmentsEvents() {
  // commitments preview tab switch — clears any open day-detail panel, since it
  // was drilled into from a specific Month/Year view that's no longer showing
  main.querySelectorAll('[data-commit-tab]').forEach(el => el.addEventListener('click', () => {
    state.commitPreviewTab = el.dataset.commitTab;
    state.commitViewDay = null;
    render();
  }));


  // habit grid: Week/Month range toggle
  main.querySelectorAll('[data-commit-grid-range]').forEach(el => el.addEventListener('click', () => {
    state.commitGridRange = el.dataset.commitGridRange;
    render();
  }));


  // commitments history — Month/Year day-detail drill-down: click a cell to open
  // (click the same cell again, or the panel's × button, to close)
  main.querySelectorAll('[data-commit-day-select]').forEach(el => el.addEventListener('click', () => {
    const iso = el.dataset.commitDaySelect;
    state.commitViewDay = state.commitViewDay === iso ? null : iso;
    render();
  }));
  const commitDayClose = main.querySelector('[data-commit-day-close]');
  if (commitDayClose) commitDayClose.addEventListener('click', () => { state.commitViewDay = null; render(); });


  // commitments history nav — Week
  main.querySelectorAll('[data-commit-week-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.commitWeekNav);
    const monday = state.commitViewWeekStart || getMondayOf(todayISO());
    const d = new Date(monday + 'T00:00:00');
    d.setDate(d.getDate() + dir * 7);
    const iso = isoLocal(d);
    if (iso > getMondayOf(todayISO())) return;
    state.commitViewWeekStart = iso;
    render();
  }));
  const commitWeekToday = main.querySelector('[data-commit-week-today]');
  if (commitWeekToday) commitWeekToday.addEventListener('click', () => { state.commitViewWeekStart = null; render(); });


  // commitments history nav — Month (clears the day-detail panel — it belonged to the month being left)
  main.querySelectorAll('[data-commit-month-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.commitMonthNav);
    const [y, m] = (state.commitViewMonth || todayISO().slice(0, 7)).split('-').map(Number);
    const next = ymLocal(new Date(y, m - 1 + dir, 1));
    if (next > todayISO().slice(0, 7)) return;
    state.commitViewMonth = next;
    state.commitViewDay = null;
    render();
  }));
  const commitMonthToday = main.querySelector('[data-commit-month-today]');
  if (commitMonthToday) commitMonthToday.addEventListener('click', () => { state.commitViewMonth = todayISO().slice(0, 7); state.commitViewDay = null; render(); });


  // commitments history nav — Year (clears the day-detail panel — same reasoning as Month)
  main.querySelectorAll('[data-commit-year-nav]').forEach(el => el.addEventListener('click', () => {
    const dir = Number(el.dataset.commitYearNav);
    const todayYear = new Date().getFullYear();
    state.commitHeatmapYear = Math.min(todayYear, (state.commitHeatmapYear || todayYear) + dir);
    state.commitViewDay = null;
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

