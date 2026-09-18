/* =========================================================
   Life — Home
   (split from js/app.js — see CLAUDE.md for the page map)
========================================================= */


/* =========================================================
   HOME ACTIVITY HEATMAP (GitHub-style yearly contribution grid)
   Combines project tasks completed + commitments checked + schedule
   blocks checked done into a single per-day "activity" count, plus a
   chronological feed of the underlying events. See
   buildHomeActivityEvents() for the exact counting rule: 1 completed
   project task = 1 activity, 1 commitment marked done that day (checkbox
   or counter reaching its target) = 1 activity — regardless of
   target_count, so a 3x/day counter still counts once — and 1 schedule
   block checked done = 1 activity.
========================================================= */
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// One entry per completed project task + per "checked" goal_logs row +
// per schedule block marked done (schedule_events.completed_at).
// ts is used only for the activity feed's ordering/relative-time display;
// iso (calendar day) is what the heatmap buckets on.
function buildHomeActivityEvents() {
  const events = [];
  (state.projects || []).forEach(p => {
    (p.tasks || []).forEach(t => {
      if (!t.completed_at) return;
      const d = new Date(t.completed_at);
      events.push({ ts: d.getTime(), iso: isoLocal(d), title: t.text, sub: p.name, kind: 'project' });
    });
  });
  Object.keys(state.schedule || {}).forEach(day => {
    (state.schedule[day] || []).forEach(s => {
      if (!s.completed_at) return;
      const d = new Date(s.completed_at);
      events.push({ ts: d.getTime(), iso: isoLocal(d), title: s.title, sub: 'Schedule', kind: 'schedule' });
    });
  });
  (state.goals.items || []).forEach(g => {
    state.goalLogs.filter(l => l.goal_id === g.id && l.checked).forEach(l => {
      // Logs written before goal_logs.completed_at existed have no timestamp —
      // fall back to midday on their date so they still show up in the feed.
      const ts = l.completed_at ? new Date(l.completed_at).getTime() : new Date(l.date + 'T12:00:00').getTime();
      events.push({ ts, iso: l.date, title: g.text, sub: g.category || 'General', kind: 'do' });
    });
  });
  return events;
}

function buildHomeActivityData(events, year) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const counts = {};
  events.forEach(e => { counts[e.iso] = (counts[e.iso] || 0) + 1; });
  // Start: Sunday of week containing Jan 1
  const jan1 = new Date(year, 0, 1);
  const start = new Date(year, 0, 1 - jan1.getDay());
  // End: Dec 31 or today (whichever is earlier), extended to Saturday
  const yearEnd = year < today.getFullYear() ? new Date(year, 11, 31) : today;
  const end = new Date(yearEnd.getFullYear(), yearEnd.getMonth(), yearEnd.getDate() + (6 - yearEnd.getDay()));
  const cells = [], monthLabels = [];
  let col = 0, prevMonth = -1, d = new Date(start), maxCount = 0;
  while (d <= end) {
    for (let row = 0; row < 7; row++) {
      const iso = isoLocal(d);
      const inYear = d.getFullYear() === year;
      const m = d.getMonth();
      if (row === 0 && inYear && m !== prevMonth) { monthLabels.push({ month: m, col }); prevMonth = m; }
      const count = counts[iso] || 0;
      if (inYear && count > maxCount) maxCount = count;
      cells.push({ iso, count, isFuture: d > today, isOut: !inYear });
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    }
    col++;
  }
  const total = Object.entries(counts).filter(([iso]) => iso.startsWith(String(year))).reduce((s,[,n]) => s + n, 0);
  return { cells, monthLabels, totalCols: col, total, maxCount };
}

function getEarliestHomeActivityYear(events) {
  const years = events.map(e => Number(e.iso.slice(0, 4)));
  return years.length ? Math.min(...years) : new Date().getFullYear();
}

// 4-shade intensity relative to this year's busiest day (GitHub-style) — all
// tints of --accent since this is a volume metric, not a compliance/pass-fail one.
function activityLevelClass(count, maxCount) {
  if (!count) return '';
  const pct = count / maxCount;
  if (pct >= 0.75) return ' act-max';
  if (pct >= 0.5)  return ' act-high';
  if (pct >= 0.25) return ' act-mid';
  return ' act-low';
}

const ACT_KIND_LABEL = { project: 'Project', do: 'Habit', schedule: 'Schedule' };

const HOME_ACTIVITY_FEED_CAP = 10;

function renderHomeActivityHeatmap(year, dayFilter, showAll) {
  const events = buildHomeActivityEvents();
  const { cells, monthLabels, totalCols, total, maxCount } = buildHomeActivityData(events, year);
  const todayYear = new Date().getFullYear();
  const earliestYear = getEarliestHomeActivityYear(events);
  const yearOptions = [];
  for (let y = todayYear; y >= earliestYear; y--) yearOptions.push(y);
  const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
  const cols = `24px repeat(${totalCols},1fr)`;

  const feedEvents = events
    .filter(e => e.iso.startsWith(String(year)) && (!dayFilter || e.iso === dayFilter))
    .sort((a, b) => b.ts - a.ts);
  const capped = !showAll && feedEvents.length > HOME_ACTIVITY_FEED_CAP;
  const visibleEvents = capped ? feedEvents.slice(0, HOME_ACTIVITY_FEED_CAP) : feedEvents;

  const feedHtml = visibleEvents.length ? `
    <ul class="list act-feed-list">
      ${visibleEvents.map(e => `
        <li class="list-item act-feed-item">
          <span class="act-feed-tag act-feed-tag-${e.kind}">${ACT_KIND_LABEL[e.kind]}</span>
          <div class="item-main">
            <div class="item-title">${escapeHtml(e.title)}</div>
            <div class="item-sub">${escapeHtml(e.sub)}</div>
          </div>
          <div class="act-feed-time">${relativeTime(e.ts)}</div>
        </li>`).join('')}
    </ul>
    ${capped ? `<button class="act-feed-toggle" data-act-feed-toggle>Show all ${feedEvents.length} activities</button>` : ''}
    ${!capped && showAll && feedEvents.length > HOME_ACTIVITY_FEED_CAP ? `<button class="act-feed-toggle" data-act-feed-toggle>Show less</button>` : ''}
  ` : `<div style="font-size:12px;color:var(--text-faint);padding:10px 2px">${dayFilter ? 'Nothing done that day.' : 'No activity yet.'}</div>`;

  return `
    <div class="heatmap-header">
      <span class="heatmap-total">${total} activit${total !== 1 ? 'ies' : 'y'} in ${year}</span>
      <select class="hm-year-select" data-heatmap-year-select aria-label="Select year">
        ${yearOptions.map(y => `<option value="${y}"${y === year ? ' selected' : ''}>${y}</option>`).join('')}
      </select>
    </div>
    <div class="heatmap-month-row" style="grid-template-columns:${cols}">
      <span></span>
      ${monthLabels.map(({month, col}) => `<span class="heatmap-month-lbl" style="grid-column:${col + 2}">${MONTH_NAMES[month]}</span>`).join('')}
    </div>
    <div class="proj-heatmap" style="grid-template-columns:${cols};grid-template-rows:repeat(7,1fr)">
      ${DAY_LABELS.map(l => `<span class="hm-day-lbl">${l}</span>`).join('')}
      ${cells.map(c => {
        if (c.isOut || c.isFuture) return `<div class="heatmap-cell empty"></div>`;
        const cls = 'heatmap-cell' + activityLevelClass(c.count, maxCount) + (c.iso === dayFilter ? ' act-selected' : '');
        const clickAttr = c.count ? ` data-act-day="${c.iso}"` : '';
        return `<div class="${cls}"${clickAttr} title="${c.iso}${c.count ? ` · ${c.count} activit${c.count > 1 ? 'ies' : 'y'}` : ''}"></div>`;
      }).join('')}
    </div>
    <div class="act-feed-header">
      <span class="section-title" style="margin:0">Recent activity</span>
      ${dayFilter ? `<button class="act-feed-clear" data-act-day-clear>${fmtDate(dayFilter)} &times;</button>` : ''}
    </div>
    ${feedHtml}`;
}


/* ---- LIFE: HOME ---- */

// Extracted from renderLifeHome so the "Active project" card can also be
// regenerated on its own (see updateActiveProjectCard()) when only the
// ‹/› carousel nav changes — clicking it used to call a full render(),
// which re-triggered animateNumbers() for the whole page and made the
// unrelated Finance snapshot numbers look like they were recounting/reloading.
function activeProjectCardHtml(layout, delay) {
  const activeProjects = (state.projects || []).filter(p => p.status === 'active');
  if (!(state.homeProjectIndex >= 0 && state.homeProjectIndex < activeProjects.length)) state.homeProjectIndex = 0;
  const homeProjIdx = state.homeProjectIndex;
  const current   = activeProjects[homeProjIdx] || null;
  const projDone  = current ? current.tasks.filter(t => t.checked).length : 0;
  const projTotal = current ? current.tasks.length : 0;
  const projPct   = projTotal ? Math.round(projDone / projTotal * 100) : 0;
  return `
    <details class="card cat-card" data-home-card="active-project" style="animation-delay:${delay}ms" open>
      <summary>
        <div class="section-title" style="margin:0;display:flex;align-items:center;justify-content:space-between;flex:1">
          <span>Active project</span>
          ${activeProjects.length > 1 ? `
            <span style="display:flex;align-items:center;gap:6px">
              <button class="proj-nav-btn" data-home-proj-nav="-1" title="Previous project">&#x2039;</button>
              <span style="font-size:11px;color:var(--text-faint)">${homeProjIdx + 1}/${activeProjects.length}</span>
              <button class="proj-nav-btn" data-home-proj-nav="1" title="Next project">&#x203A;</button>
            </span>
          ` : ''}
        </div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body" style="cursor:pointer" data-open-project="${current ? current.id : ''}">
        ${current ? `
          <div style="font-size:${layout === 'hero' ? '18px' : '15px'};font-weight:500;line-height:1.35">${escapeHtml(current.name)}</div>
          ${projTotal > 0 ? `
            <div class="proj-progress">
              <div class="proj-progress-meta"><span>${projDone} / ${projTotal} tasks done</span><span>${projPct}%</span></div>
              <div class="progress"><div class="bar" style="width:${projPct}%"></div></div>
            </div>
            <ul class="list" style="margin-top:12px;${current.tasks.length > 5 ? 'max-height:190px;overflow-y:auto' : ''}">
              ${current.tasks.map(t => `
                <li class="list-item" style="padding:8px 0">
                  <span class="check ${t.checked ? 'checked' : ''}" data-toggle-proj-task="${current.id}|${t.id}"></span>
                  <span class="check-label ${t.checked ? 'done' : ''}">${escapeHtml(t.text)}</span>
                </li>
              `).join('')}
            </ul>
          ` : '<div style="font-size:12px;color:var(--text-faint);margin-top:8px">No tasks yet.</div>'}
        ` : `<div style="font-size:12px;color:var(--text-faint)">No active projects.</div>`}
      </div>
    </details>`;
}

// Regenerates just the "Active project" card in place (no full render()),
// so cycling through active projects with ‹/› doesn't replay the entrance
// animation / number count-up of every other card on Home.
function updateActiveProjectCard() {
  const card = main.querySelector('[data-home-card="active-project"]');
  if (!card) return;
  const wasOpen = card.open;
  const layout = window.__HQ_TWEAKS.homeLayout;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = activeProjectCardHtml(layout, 0).trim();
  const newCard = wrapper.firstElementChild;
  newCard.open = wasOpen;
  card.replaceWith(newCard);
  bindActiveProjectCardEvents(newCard);
}

// Re-binds every interactive element inside a freshly swapped-in Active
// project card — the outerHTML replace above means the old node (and any
// listeners bound to it by bindHomeEvents/bindProjectsEvents during the
// last full render) is gone. ‹/› stays an in-place update (that's the whole
// point); opening the project / toggling a task still does a full render(),
// same as it always has, since those legitimately affect other cards too
// (Projects page, Activity heatmap).
function bindActiveProjectCardEvents(card) {
  card.querySelectorAll('[data-home-proj-nav]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const dir = Number(el.dataset.homeProjNav);
    const activeProjects = (state.projects || []).filter(p => p.status === 'active');
    if (!activeProjects.length) return;
    state.homeProjectIndex = ((state.homeProjectIndex || 0) + dir + activeProjects.length) % activeProjects.length;
    updateActiveProjectCard();
  }));

  const body = card.querySelector('[data-open-project]');
  if (body) body.addEventListener('click', () => {
    const id = body.dataset.openProject;
    if (id) {
      if (!(state.expandedProjectIds || []).includes(id)) {
        state.expandedProjectIds = [...(state.expandedProjectIds || []), id];
      }
      state.projectsFilter = 'all';
    }
    setActiveTab('life:projects');
    if (id) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-proj-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  });

  card.querySelectorAll('[data-toggle-proj-task]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const [projId, taskId] = el.dataset.toggleProjTask.split('|');
    const proj = state.projects.find(p => p.id === projId);
    if (!proj) return;
    const task = proj.tasks.find(t => t.id === taskId);
    if (!task) return;
    task.checked = !task.checked;
    task.completed_at = task.checked ? new Date().toISOString() : null;
    pulse(el); render();
    dbCall(() => sb.from('project_tasks').update({ checked: task.checked, completed_at: task.completed_at }).eq('id', taskId));
  }));
}

function renderLifeHome() {
  const today = todayISO();
  const nowHHMM = fmtClock().slice(0, 5); // "HH:MM" in the visitor's local time, same as event.time
  const schedToday = (state.schedule[today] || []).slice().sort((a, b) => a.time.localeCompare(b.time));
  const upNextEvent = schedToday.find(s => s.time >= nowHHMM) || null;
  // Top 3 preview, windowed to keep "up next" (and what follows it) visible rather
  // than always showing the day's earliest 3 blocks — once those are in the past,
  // backfill from before so the card still shows 3 when fewer than 3 remain ahead.
  const upNextIdx = upNextEvent ? schedToday.findIndex(s => s.id === upNextEvent.id) : schedToday.length;
  const schedStart = Math.max(0, Math.min(upNextIdx, schedToday.length - 3));
  const sched = schedToday.slice(schedStart, schedStart + 3);
  const layout = window.__HQ_TWEAKS.homeLayout;
  const showPills = String(window.__HQ_TWEAKS.showQuickPills) === 'true' || window.__HQ_TWEAKS.showQuickPills === true;

  const score = computeDailyScore();
  const _totalGoalsHome = (state.goals.items || []).length;
  const scoreColor = score >= 70 ? 'var(--accent)' : score >= 40 ? '#c8a850' : 'var(--danger)';
  // Daily score as a compact ring, shown inside the Commitments card header
  // (moved off its own top-of-page hero card — see CLAUDE.md's Home row for why).
  const scoreRingHtml = _totalGoalsHome === 0 ? '' : (() => {
    const r = 22, c = 2 * Math.PI * r;
    const offset = c - (score / 100) * c;
    return `<svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true" style="flex-shrink:0">
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="#2a2a2a" stroke-width="5"/>
      <circle cx="26" cy="26" r="${r}" fill="none" stroke="${scoreColor}" stroke-width="5" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
        style="transform:rotate(-90deg);transform-origin:26px 26px"/>
      <text x="26" y="26" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="500" fill="${scoreColor}">${score}</text>
    </svg>`;
  })();

  const focusItems = state.todayFocus || [];
  const focusBlock = (delay) => `
    <details class="card cat-card" style="animation-delay:${delay}ms" open>
      <summary>
        <div class="section-title" style="margin:0">Today's focus</div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        <div class="tf-add-row">
          <input type="text" class="tf-input" id="tf-input" placeholder="Add a priority..." aria-label="Add a focus item" autocomplete="off"/>
          <button class="tf-add-btn" id="tf-add-btn">Add</button>
        </div>
        <div class="tf-divider"></div>
        ${focusItems.length ? `
          <ul class="list tf-list">
            ${focusItems.map(it => `
              <li class="list-item tf-item" data-tf-id="${it.id}">
                <span class="check ${it.checked ? 'checked' : ''}" data-toggle-tf="${it.id}" style="flex-shrink:0"></span>
                <span class="check-label ${it.checked ? 'done' : ''}" style="flex:1;min-width:0">${escapeHtml(it.text)}</span>
                <button class="tf-del-btn" data-del-tf="${it.id}" title="Delete" aria-label="Delete focus item">${ICON_TRASH}</button>
              </li>
            `).join('')}
          </ul>
        ` : `<div style="font-size:12px;color:var(--text-faint);padding:4px 0 2px">No focus items yet. Add one above.</div>`}
      </div>
    </details>`;

  const allGoals = state.goals.items || [];
  const totalGoals = allGoals.length;
  const checkedTodayCount = allGoals.filter(g => getTodayLog(g.id)?.checked).length;
  const homeCommitCats = getGoalCategories();
  const commitmentsBlock = (delay) => `
    <details class="card cat-card" style="animation-delay:${delay}ms" open>
      <summary>
        <div class="section-title" style="margin:0;display:flex;align-items:center;gap:10px">
          ${scoreRingHtml}
          <span style="flex:1">Commitments</span>
          <span class="meta" data-go="life:commitments" style="cursor:pointer">View all →</span>
        </div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        ${totalGoals === 0
          ? `<div class="item-sub" style="margin-top:4px">No commitments yet.</div>`
          : `<div style="margin-top:4px">
              ${homeCommitCats.map(cat => {
                const items = categoryItems(cat);
                const chk = items.filter(g => getTodayLog(g.id)?.checked).length;
                const pct = items.length ? Math.round(chk / items.length * 100) : 0;
                return `
              <div class="compliance-bar-row" data-go="life:commitments" style="cursor:pointer">
                <span class="compliance-bar-lbl" title="${escapeHtml(cat)}">${escapeHtml(cat)}</span>
                <div class="compliance-bar-track"><div class="compliance-bar-fill" style="width:${pct}%"></div></div>
                <span class="compliance-bar-count">${chk}/${items.length}</span>
              </div>`;
              }).join('')}
            </div>`
        }
        <div style="font-size:12px;color:var(--text-faint);margin-top:10px;padding-top:10px;border-top:1px solid var(--border)">${checkedTodayCount} of ${totalGoals} done today</div>
      </div>
    </details>`;

  // Top 3 preview, sorted by reminder_time ascending (untimed items keep their
  // existing order_index order and sort after every timed one) — its own card,
  // separate from the Commitments card above, styled identically to Today's
  // schedule (same .list/.list-item/.time-col/.item-main markup) so "what do I
  // need to do and when" reads the same way on both cards.
  const commitPreview = allGoals.slice().sort((a, b) => (a.reminder_time || '99:99').localeCompare(b.reminder_time || '99:99')).slice(0, 3);
  const commitPreviewBlock = (delay) => `
    <details class="card cat-card" style="animation-delay:${delay}ms" open>
      <summary>
        <div class="section-title" style="margin:0">Today's commitments <span class="meta">${commitPreview.length} items</span></div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        <ul class="list">
          ${commitPreview.map(g => {
            const target = g.target_count || 1;
            const log = getTodayLog(g.id);
            const count = log?.count || 0;
            const isDone = log?.checked || false;
            const control = target > 1
              ? `<button type="button" data-goal-quickbump="${g.id}" title="Tap to log (${count}/${target}${g.unit ? ' ' + escapeHtml(g.unit) : ''})" style="all:unset;cursor:pointer;flex-shrink:0"><span class="check ${isDone ? 'checked' : ''}"></span></button>`
              : `<span class="check ${isDone ? 'checked' : ''}" data-toggle-goal-home="${g.id}"></span>`;
            return `
            <li class="list-item">
              ${control}
              <div class="time-col">${g.reminder_time || ''}</div>
              <div class="item-main" data-go="life:commitments" style="cursor:pointer">
                <div class="item-title${isDone ? ' done' : ''}">${escapeHtml(g.text)}${target > 1 ? ` <span style="color:var(--text-faint);font-weight:400">(${count}/${target})</span>` : ''}</div>
                ${g.category ? `<div class="item-sub">${escapeHtml(g.category)}</div>` : ''}
              </div>
            </li>`;
          }).join('') || `<li class="list-item"><div class="item-sub">No commitments yet.</div></li>`}
        </ul>
      </div>
    </details>`;

  // Finance snapshot — spent today, income this month, nearest debt due.
  // Home's only daily touchpoint for Finance (previously had none at all).
  const pfxHome = window.__HQ_TWEAKS.currencyPrefix || '$';
  const homeSpentToday = todaySpend();
  const homeIncomeMonth = thisMonthIncome();
  const homeNextDebt = state.debts.filter(d => !d.paid).slice().sort((a, b) => daysUntil(a.due) - daysUntil(b.due))[0] || null;
  const financeBlock = (delay) => `
    <details class="card cat-card" style="animation-delay:${delay}ms" open>
      <summary>
        <div class="section-title" style="margin:0">Finance <span class="meta" data-go="finance:overview" style="cursor:pointer">View all →</span></div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        <div class="fin-snapshot-grid">
          <div>
            <div class="label">Spent today</div>
            <div class="num" data-target="${homeSpentToday}" data-prefix="${pfxHome}" style="font-size:20px">${fmtMoney(0)}</div>
          </div>
          <div>
            <div class="label">Income this month</div>
            <div class="num" data-target="${homeIncomeMonth}" data-prefix="${pfxHome}" style="font-size:20px">${fmtMoney(0)}</div>
          </div>
        </div>
        ${homeNextDebt ? (() => {
            const n = daysUntil(homeNextDebt.due);
            const overdue = n < 0;
            return `<div style="font-size:12px;color:${overdue ? 'var(--danger)' : 'var(--text-faint)'};margin-top:12px;padding-top:10px;border-top:1px solid var(--border)">${overdue ? `⚠ ${escapeHtml(homeNextDebt.creditor)} overdue by ${Math.abs(n)}d` : `${escapeHtml(homeNextDebt.creditor)} due in ${n}d`}</div>`;
          })()
          : ''}
      </div>
    </details>`;

  const projectsBlock = (delay) => activeProjectCardHtml(layout, delay);

  const scheduleBlock = (delay) => `
    <details class="card cat-card" style="animation-delay:${delay}ms" open>
      <summary>
        <div class="section-title" style="margin:0">Today's schedule <span class="meta">${schedToday.length} blocks</span></div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        <ul class="list">
          ${sched.map(s => {
            const isUpNext = upNextEvent && s.id === upNextEvent.id;
            const isDone = !!s.completed_at;
            const isMissed = !isDone && s.time < nowHHMM;
            return `
            <li class="list-item${isUpNext ? ' up-next' : ''}">
              <span class="check ${isDone ? 'checked' : ''}" data-toggle-sched-done="${s.id}" title="${isDone ? 'Mark not done' : 'Mark done'}"></span>
              <div class="time-col">${s.time}</div>
              <div class="item-main">
                <div class="item-title${isDone ? ' done' : ''}">${escapeHtml(s.title)}${s.alarm_time ? `<span class="alarm-tag">⏰ ${s.alarm_time}</span>` : ''}${isMissed ? `<span class="missed-tag">Missed</span>` : ''}</div>
                ${s.sub ? `<div class="item-sub">${escapeHtml(s.sub)}</div>` : ''}
              </div>
              ${isUpNext ? `<div class="up-next-countdown" id="up-next-countdown" data-target-time="${s.time}">now</div>` : ''}
            </li>`;
          }).join('') || `<li class="list-item"><div class="item-sub">Nothing scheduled. Take it easy.</div></li>`}
        </ul>
      </div>
    </details>`;

  const pillsBlock = showPills ? `
    <div class="pills" style="margin:18px 4px 4px">
      <button class="pill" data-go="life:schedule">Schedule</button>
      <button class="pill" data-go="life:commitments">Commitments</button>
      <button class="pill" data-go="life:projects">Projects</button>
    </div>` : '';

  const heatmapBlock = `
    <details class="card cat-card" style="animation-delay:360ms" open>
      <summary>
        <div class="section-title" style="margin:0">Activity</div>
        <span class="chevron">&#8250;</span>
      </summary>
      <div class="cat-body">
        ${renderHomeActivityHeatmap(state.heatmapYear, state.homeActivityDayFilter, state.homeActivityShowAll)}
      </div>
    </details>`;

  // Ordered by urgency/actionability, not by feature category: what's
  // time-critical (Schedule/Up Next, then Today's commitments right after —
  // same "when do I need to do this" framing) leads, same-day action items
  // (Focus, Commitments overview) follow, then Finance/Project context, then
  // the purely retrospective Activity heatmap last. "Hero" layout keeps its
  // original purpose — Active project surfaced right after Schedule —
  // everything else follows the same order as "Stacked".
  const stacked = scheduleBlock(0) + commitPreviewBlock(60) + focusBlock(120) + commitmentsBlock(180) + financeBlock(240) + projectsBlock(300) + heatmapBlock;
  const hero    = scheduleBlock(0) + commitPreviewBlock(60) + projectsBlock(120) + focusBlock(180) + commitmentsBlock(240) + financeBlock(300) + heatmapBlock;

  return `
    ${topbar()}
    ${layout === 'hero' ? hero : stacked}
    ${pillsBlock}
  `;
}


/* ---- HOME: event binding ---- */

function bindHomeEvents() {
  // live clock + "Up Next" countdown (same 1s tick, no full re-render)
  const clockEl = main.querySelector('#live-clock');
  const countdownEl = main.querySelector('#up-next-countdown');
  const tick = () => {
    if (clockEl) clockEl.textContent = fmtClock();
    if (countdownEl) {
      const [th, tm] = countdownEl.dataset.targetTime.split(':').map(Number);
      const now = new Date();
      const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), th, tm, 0, 0);
      const diffSec = Math.round((target - now) / 1000);
      const h = Math.floor(diffSec / 3600);
      const m = Math.floor((diffSec % 3600) / 60);
      const s = diffSec % 60;
      countdownEl.textContent = diffSec <= 0 ? 'now'
        : h > 0 ? `in ${h}h ${m}m ${s}s`
        : m > 0 ? `in ${m}m ${s}s`
        : `in ${s}s`;
    }
  };
  if (clockEl || countdownEl) {
    tick();
    clockIntervalId = setInterval(tick, 1000);
  }


  // home: "Active project" card → jump to Projects page, expanded on that project
  main.querySelectorAll('[data-open-project]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.openProject;
    if (id) {
      if (!(state.expandedProjectIds || []).includes(id)) {
        state.expandedProjectIds = [...(state.expandedProjectIds || []), id];
      }
      state.projectsFilter = 'all';
    }
    setActiveTab('life:projects');
    if (id) {
      requestAnimationFrame(() => {
        document.querySelector(`[data-proj-id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }));

  // home activity heatmap: year dropdown
  const heatmapYearSelect = main.querySelector('[data-heatmap-year-select]');
  if (heatmapYearSelect) heatmapYearSelect.addEventListener('change', (e) => {
    e.stopPropagation();
    state.heatmapYear = Number(heatmapYearSelect.value);
    state.homeActivityDayFilter = null; // switching year clears any day filter from the previous year
    state.homeActivityShowAll = false;
    render();
  });

  // home activity heatmap: click a day to filter the feed below to just that day (click again / clear button to reset)
  main.querySelectorAll('[data-act-day]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const iso = el.dataset.actDay;
    state.homeActivityDayFilter = state.homeActivityDayFilter === iso ? null : iso;
    state.homeActivityShowAll = false;
    render();
  }));
  const actDayClear = main.querySelector('[data-act-day-clear]');
  if (actDayClear) actDayClear.addEventListener('click', (e) => {
    e.stopPropagation();
    state.homeActivityDayFilter = null;
    state.homeActivityShowAll = false;
    render();
  });

  // home activity heatmap: "Show all activities" / "Show less" toggle for the feed
  const actFeedToggle = main.querySelector('[data-act-feed-toggle]');
  if (actFeedToggle) actFeedToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    state.homeActivityShowAll = !state.homeActivityShowAll;
    render();
  });

  // home: cycle through active projects — in-place update (see updateActiveProjectCard()),
  // not a full render(), so it doesn't replay the entrance animation / number
  // count-up of every other Home card (Finance snapshot included).
  main.querySelectorAll('[data-home-proj-nav]').forEach(el => el.addEventListener('click', (e) => {
    e.stopPropagation();
    const dir = Number(el.dataset.homeProjNav);
    const activeProjects = (state.projects || []).filter(p => p.status === 'active');
    if (!activeProjects.length) return;
    state.homeProjectIndex = ((state.homeProjectIndex || 0) + dir + activeProjects.length) % activeProjects.length;
    updateActiveProjectCard();
  }));


  // ---- TODAY'S FOCUS ----
  const addFocusItem = async () => {
    const input = main.querySelector('#tf-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !currentUser) return;
    input.value = '';
    const { data } = await dbCall(() =>
      sb.from('today_focus_items').insert({ user_id: currentUser.id, text, checked: false }).select().single()
    );
    if (data) {
      state.todayFocus.push({ id: data.id, text: data.text, checked: data.checked, created_at: data.created_at });
      render();
    }
  };
  const tfAddBtn = main.querySelector('#tf-add-btn');
  if (tfAddBtn) tfAddBtn.addEventListener('click', addFocusItem);
  const tfInput = main.querySelector('#tf-input');
  if (tfInput) tfInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addFocusItem(); }
  });

  main.querySelectorAll('[data-toggle-tf]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.toggleTf;
    const item = state.todayFocus.find(x => x.id === id);
    if (!item) return;
    item.checked = !item.checked;
    pulse(el);
    render();
    dbCall(() => sb.from('today_focus_items').update({ checked: item.checked }).eq('id', id));
  }));

  main.querySelectorAll('[data-del-tf]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.delTf;
    state.todayFocus = state.todayFocus.filter(x => x.id !== id);
    render();
    dbCall(() => sb.from('today_focus_items').delete().eq('id', id));
  }));

  // ---- COMMITMENTS preview (top 3, see commitPreview in renderLifeHome) ----
  // Mirrors the checkbox toggle in js/pages/commitments.js, but this preview
  // does a full render() rather than an in-place DOM update (like Schedule's
  // toggle) since it also has to refresh the compliance bars/score ring above it.
  const upsertGoalLog = (g, newChecked, newCount) => {
    const today = todayISO();
    const existingLog = getTodayLog(g.id);
    const newCompletedAt = newChecked ? new Date().toISOString() : null;
    if (existingLog) {
      existingLog.checked = newChecked;
      existingLog.count = newCount;
      existingLog.completed_at = newCompletedAt;
    } else {
      state.goalLogs.push({ id: null, goal_id: g.id, user_id: currentUser.id, date: today, checked: newChecked, count: newCount, completed_at: newCompletedAt });
    }
    render();
    dbCall(() => sb.from('goal_logs').upsert(
      { user_id: currentUser.id, goal_id: g.id, date: today, checked: newChecked, count: newCount, completed_at: newCompletedAt },
      { onConflict: 'goal_id,date' }
    ).select().single()).then(({ data } = {}) => {
      if (data) {
        const localLog = state.goalLogs.find(l => l.goal_id === g.id && l.date === today);
        if (localLog && !localLog.id) localLog.id = data.id;
      }
    });
  };

  main.querySelectorAll('[data-toggle-goal-home]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.toggleGoalHome;
    const g = (state.goals.items || []).find(x => x.id === id);
    if (!g || !currentUser) return;
    const target = g.target_count || 1;
    const existingLog = getTodayLog(id);
    const newChecked = existingLog ? !existingLog.checked : true;
    upsertGoalLog(g, newChecked, newChecked ? target : 0);
  }));

  // counter commitments (target_count > 1): a single tap bumps +1, wrapping
  // back to 0 once target is hit — fine-grained -/+ adjustment stays on the
  // Commitments page itself, this preview is a quick-log tap only.
  main.querySelectorAll('[data-goal-quickbump]').forEach(el => el.addEventListener('click', () => {
    const id = el.dataset.goalQuickbump;
    const g = (state.goals.items || []).find(x => x.id === id);
    if (!g || !currentUser) return;
    const target = g.target_count || 1;
    const prevCount = getTodayLog(id)?.count || 0;
    const newCount = prevCount + 1 > target ? 0 : prevCount + 1;
    upsertGoalLog(g, newCount >= target, newCount);
  }));

}

