# IA.md — Information Architecture

> Last audited against the code on 2026-09-25 (incl. the Sumi & Washi theme). For implementation detail (functions, state, edge cases) see `CLAUDE.md`; for tables and columns see `ERD.md`.

## App Overview

**Headquarter (HQ)** is a single-page application with two top-level sections: **Life** and **Finance**. Within each section are sub-pages rendered into a single `<main>` element. Navigation is either via a collapsible left sidebar (desktop) or a bottom tab bar + horizontal pill strip (mobile).

There is no routing library — the app uses a simple `state.activeTab` string (e.g. `'life:home'`, `'finance:spending'`) mapped to render functions in `ROUTES` (`js/navigation.js`). The URL does not change between pages. The active tab, selected schedule day and calendar month are remembered per device in `localStorage('hq.prefs')`.

---

## Navigation Structure

```
App
├── Life (section)
│   ├── Today          life:home
│   ├── Schedule       life:schedule
│   ├── Commitments    life:commitments
│   ├── Projects       life:projects
│   └── Notes          life:notes
└── Finance (section)
    ├── Overview        finance:overview
    ├── Income          finance:income
    ├── Spending        finance:spending
    └── Debts           finance:debts
```

### Desktop Navigation (sidebar)
- Left sidebar: 200px expanded, 60px collapsed (kanji-only)
- Brand: 本部 hanko seal + "Headquarters"; chevron toggle button next to it (points down when expanded, right when collapsed) collapses/expands; state persisted in `localStorage('hq.sidebar')`. Collapsed, the hanko and chevron stack vertically.
- Each nav item has a kanji in the icon slot + English label: 今日 Today · 予定 Schedule · 習慣 Commitments · 計画 Projects · 覚書 Notes · 概要 Overview · 収入 Income · 支出 Spending · 借金 Debts
- Active item highlighted; its kanji turns vermillion (shu)
- Collapsed mode: labels hidden, tooltip shown on hover via `#nav-tooltip`
- Section labels ("Life", "Finance") fade out when collapsed
- Footer: Sign out button

### Mobile Navigation (bottom bar + pills)
- `<nav class="bottom-nav">` — 2 buttons: **Life** (home icon) and **Finance** (chart icon)
- Tapping Life → navigates to `life:home`; tapping Finance → `finance:overview`
- Sub-nav: horizontal scrollable pill strip rendered inside `<div class="mobile-sub-nav">` as part of each page's `topbar()` output (Today / Schedule / Commitments / Projects / Notes for Life; Overview / Income / Spending / Debts for Finance)
- Active pill highlighted with accent background

### Topbar (rendered per page)
Every page renders `topbar()` which outputs:
- Greeting (time-based: Late night / Good morning / Good afternoon / Good evening) + user name
- Date + live clock (seconds tick; the interval is cleared on re-render)
- Right side: mobile sign-out button, the **ambient music** widget (station name while playing, ♪/equalizer play-pause button, ▾ station picker with 3 built-in radios + custom YouTube stations), and the ⚙ **Tweaks** button
- Horizontal sub-nav pills for the current section (shown on mobile)

### Login / loading
- **Login screen** (`#login-screen`): a seigaiha wave background with a centred panel — 本部 hanko, "Headquarters", and only **Continue with Google**. The email + password fields, Sign in button and "Forgot password" are commented out in `index.html` (handlers still wired, no-op while the elements are missing); the sign-up button exists but is hidden.

### Quick-action FAB (global, bottom-right)
- `#quick-fab` — a round `+` button fixed bottom-right on every page once logged in (sits above the mobile bottom nav). Lives outside `<main>`, so it isn't re-rendered on navigation.
- Tapping it expands two icon-only options: **Focus mode** (target icon → opens the Focus overlay, see below) and **Note mode** (pen icon → goes to `life:notes`). Tapping outside collapses it.

### Focus mode (global overlay)
Fullscreen Pomodoro-style overlay (`#focus-overlay`) opened from the FAB — not a route, `state.activeTab` doesn't change.
```
┌─────────────────────────────────────┐
│          [🏷 Select a tag ▾]          │
│               25:00                 │
│          [+1] [+5] [+10]            │
│      [▶ Start]  (→ Pause/Resume + ↺) │
│                                     │
│ [♪]                        [⛶] [🎨] │
└─────────────────────────────────────┘
```
- **Top:** tag dropdown (pick a tag or `+ Add tag`), big countdown (default 25:00), `+1/+5/+10` minute buttons (before start: adjust the duration, max 180; during: extend it), Start → Pause/Resume + Reset
- **Bottom-left ♪:** sound flyout with tabs **My Music / Radio / All** — the same stations as the topbar music widget (picking one plays it in that widget)
- **Bottom-right:** fullscreen toggle + 🎨 theme flyout (**Light** = washi paper / **Dark** = sumi + seigaiha / **Forest** = photo)
- Finishing a session → Web Notification + alarm sound + "Focus session complete" toast
- Click the backdrop to close; the timer keeps running in the background and survives reload
- **Persisted (per device):** `localStorage('hq.focusTimer')`, `('hq.focusPrefs')` (theme), `('hq.focusTags')`. **No Supabase data** — sessions aren't logged.
- **Loading screen** (`#app-loading`): shown while the session is checked and data loads (minimum 800ms, then fades out). New users (no `profiles` row) get sample data seeded first.

---

## Pages

---

### Life: Today (`life:home`)

**Purpose:** At-a-glance overview of the current day, ordered by urgency.

**Cards, in order** (each is a collapsible `<details>` card; collapse state resets on re-render):
1. **Today's schedule** — top 3 blocks, windowed around "now" so the next upcoming one ("Up Next", with a live `in Xh Ym Zs` countdown) is always visible; each has a checkbox to mark it done, plus alarm/repeat/"Missed" tags
2. **Today's commitments** — top 3 commitments *that have a reminder time*, sorted by that time. Yes/No items have a checkbox; Count items a tap-to-log control (+1, wraps to 0 at target) with a `(count/target)` suffix; **Duration items are read-only** (logged only via the timer on Commitments)
3. **Today's focus** — quick priority list: add an item (input + Add / Enter), tick it, delete it
4. **Commitments** — per-category compliance bars (partial-credit %) and a compact **Daily score ring** in the header, coloured red / white / green by ratio
5. **Finance snapshot** — spent today, income this month, nearest debt due
6. **Active project** — one active project at a time (progress bar + tasks; ‹ / › to cycle when several are active); click the body to jump to Projects
7. **Activity** — GitHub-style year heatmap of completed project tasks + fully-done commitments + done schedule blocks, with a year selector, click-a-day filter, and a chronological feed tagged Project / Habit / Schedule (10 rows, "Show all")
8. Optional quick-navigation pills (Schedule, Commitments, Projects) — Tweaks → Quick pills on Today

**Layouts** (Tweaks → Today layout): **Stacked** (above order) or **Hero** (Active project moved up to right after Today's commitments).

**Data reads:** `schedule_events`, `goals`, `goal_logs`, `today_focus_items`, `income_entries`, `spending_entries`, `debts`, `projects`, `project_tasks`
**Data writes:** schedule "done" (`schedule_events.completed_at`), commitment quick-log (`goal_logs`), project-task check (`project_tasks`), Today's focus add/tick/delete (`today_focus_items`)

---

### Life: Schedule (`life:schedule`)

**Purpose:** Full calendar + daily event management.

**Features:**
- Header with **+ Add event**
- Collapsible **Calendar** card: month grid (Sun–Sat, 42 cells) with ‹ / Today / › navigation, a dot on days with events, today and selected-day highlights
- Collapsible **day** card for the selected date: block count, then each event — done checkbox, time, title, note, ⏰ alarm tag, 🔁 repeat tag, red **Missed** tag when its time has passed unchecked, edit ✎ and delete 🗑
- **Add event** modal: time, title, note, **Remind me** (No reminder / At event time / 5, 10, 15, 30 min or 1 hour before / Custom time…), **Repeat** (Doesn't repeat / Every day / Weekdays / Every week — materialized as real rows, 90 days ahead or 26 weeks)
- **Edit event** modal: same fields minus Repeat
- **Delete**: confirmation; for a recurring event a second confirmation offers to delete the rest of the series
- **Alarms:** a Web Notification + beep + persistent in-app banner (Dismiss / Snooze 5 min, beep repeating every 20s), fired ±1 min of the alarm time; checked every 60s while the app is open

**State managed:** `state.schedule`, `state.selectedDay`, `state.viewMonth`
**UI prefs persisted:** `selectedDay`, `viewMonth` in `localStorage('hq.prefs')`
**Supabase tables:** `schedule_events`

---

### Life: Commitments (`life:commitments`)

**Purpose:** Daily commitments (habits) — yes/no, counted or timed — with streaks, reminders and a compliance history.

**Commitment types** (chosen in the Add/Edit modal, stored as `target_count` + `unit`):

| Type | Example | How you log it |
|---|---|---|
| **Yes / No** | Push up | Tap the checkbox |
| **Count** | Dzikir 33x, Sholat 5 waktu, Cold DM 3 | Progress bar + `count/target unit`; buttons `−`, `+1` and (target ≥ 20) `+10`; tap the number to type an exact amount; the left checkbox = mark fully done / reset |
| **Duration** | Belajar 10 menit, Plank 60 detik | **Only** the **▶ Start** timer: counts down the time still missing, auto-completes at 0:00 (notification + beep + toast), **Stop** early logs the time actually spent; survives reload; no manual +/− or typing |

**Features:**
- **Today's Compliance** card (collapsible): a ring showing today's % — **partial credit** (dzikir 20/33 ≈ 61%, not 0) — coloured **red below 10%**, normal white **10–70%**, **green from 70% (light) deepening to dark green at 100%**; per-category bars; the % also stays visible in the collapsed header
- **⚔️ Main Quest**: collapsible **category cards** (Olahraga, Kerja, Learning, Spiritual, Personal & Mental, or custom) with a `done / total` count, mini progress bar and **+ Add to <category>**; **+ New category** in the section header
- Each row: name · 🕐 reminder time · 🔥 streak (left, in that order) · edit ✎ / delete 🗑 (right, on hover); Count/Duration rows add the progress line underneath; rows are **drag-and-drop reorderable** within their category
- **Add / Edit Commitment** modal: name, **Type**, target per day + unit (Count) or minutes/seconds (Duration), category (+ new category), and "Give this a time" (daily reminder time)
- **Daily reminders:** a commitment with a time fires a notification/banner at that time and a gentler nudge 45 min later if still not done
- **History** (own section): tabs **Month** (calendar heatmap — each day's compliance % with a green ≥80 / yellow 60–79 / red <60 tint; ‹ › month navigation) and **Year** (12-point monthly-average sparkline; click a point to jump to that month). Clicking a Month day opens a **day-detail modal** listing every commitment that day with ✓ / ○ partial / ✗ missed and the logged amounts

**State managed:** `state.goals`, `state.goalLogs`, `state.commitPreviewTab`, `state.commitViewMonth`, `state.commitHeatmapYear`; running timers in `localStorage('hq.goalTimers')`
**Supabase tables:** `goals`, `goal_logs`

---

### Life: Projects (`life:projects`)

**Purpose:** Objectives broken into small tasks, each with a progress bar.

**Features:**
- Header with **+ New Project**; filter pills **All / Active / On Hold / Done**
- Each project is a collapsible card: name, status and deadline badges, edit ✎ / delete 🗑 (confirmed — cascades to its tasks); collapsed it shows `done/total · %`; expanded it shows the description, a progress bar, and an independently collapsible task list
- Tasks: checkbox, title, optional description, edit, delete (confirmed), **Assign to Today's Schedule** (creates a schedule event), **Add task**
- Home's Active-project card deep-links here with the project expanded

**State managed:** `state.projects`, `state.projectsFilter`, `state.expandedProjectIds`, `state.homeProjectIndex`
**Supabase tables:** `projects`, `project_tasks` (and `schedule_events` insert for "Assign")

---

### Life: Notes (`life:notes`)

**Purpose:** Freeform rich-text note-taking.

**Features (List view):**
- Header: **+ Add**, sort dropdown (Newest / Oldest / A–Z, by `updated_at`), filter dropdown (All / Today / This week), grid ▦ / list ☰ layout toggle
- Each note card: title (or "Untitled"), 100-char content preview, relative timestamp (auto-refreshes every 60s), delete 🗑 (confirmed)
- New note → creates the DB row → opens the editor

**Features (Editor view):**
- Full-width title input and a contenteditable body
- Docs/Word-style toolbar: **Style** dropdown (Normal / Title / Subtitle / Heading 1–3, plus an Options flyout to save / use / reset a personal default style), **Font family** (10 fonts, click to expand weight variants), **Font size** stepper with preset dropdown, Bold / Italic / Underline, Bullet / Numbered list, Text colour + Highlight swatches, Insert table (with row/column controls and a confirmed delete)
- Collapsible headings; pasted tables/markdown tables are converted
- Autosave debounced 1000ms (title + HTML), "Saved" flash; delete (confirmed); back button returns to the list

**State managed:** `state.notes`, `state.activeNoteId`, `state.notesSort`, `state.notesFilter`, `state.notesDisplay`
**Supabase tables:** `notes` (and `profiles.note_default_style`)

---

### Finance: Overview (`finance:overview`)

**Purpose:** Financial health at a glance.

**Features:**
- 4 metric cards with animated number counters: Income · this month, Spent · today, Total debt (unpaid), **Net · this month** (income − spending; green when ≥ 0, red when negative; sub-line "±X vs last month")
- Alert pills: "N debts overdue" and a due-soon pill for debts due today / within 7 days
- 7-day spending bar chart (one bar per day, height proportional to daily total, 3-letter weekday labels, today's column highlighted, hover/focus tooltip with date + amount)

**Data reads:** `income_entries`, `spending_entries`, `debts`
**Data writes:** None

---

### Finance: Income (`finance:income`)

**Purpose:** Log and review income entries.

**Features:**
- Header with **+ Log income**
- Total (animated) + entry count + average for the selected range: filter tabs **This Month / This Year / All Time**, or **Jump to date** (× to clear)
- Log sorted by date descending, **7 per page** with a pager; each entry: date, source, amount (+prefix), edit ✎, delete 🗑 (confirmed)
- Add / Edit modals: source, amount, date

**Supabase tables:** `income_entries`

---

### Finance: Spending (`finance:spending`)

**Purpose:** Log and review spending entries.

**Features:**
- Header with **+ Log spend**
- Total (animated) for the selected range: **Daily / Weekly (Mon–today) / Monthly / All Time**, or **Jump to date** (× to clear); category breakdown pills Food / Transport / Shopping / Other with per-category totals
- **Recent** list sorted by date+time descending, capped at 5 rows with "Show all N activities" / "Show less"; each entry: category pill, note, time (today) or date, amount (−prefix), edit ✎, delete 🗑 (confirmed)
- Add modal: category, amount, note (the date is today and the time is set to now); Edit modal: category, amount, note

**Supabase tables:** `spending_entries`

---

### Finance: Debts (`finance:debts`)

**Purpose:** Track money owed with due dates.

**Features:**
- Header with **+ Add debt**
- Open total (animated) + open / paid counts
- All debts sorted unpaid first (by due date), paid last, **7 per page** with a pager
- Each debt: creditor, due label (Paid / Due today / Due in Nd / Overdue), amount; due ≤7 days and unpaid gets "soon" (danger) styling; a **paid ↔ unpaid toggle** (✓ marks paid, ↩ marks unpaid again; toasts "Marked as paid/unpaid"), edit ✎, delete 🗑 (confirmed)
- Add / Edit modals: creditor, amount, due date

**Supabase tables:** `debts`

---

## Component Patterns

### Cards
```html
<div class="card">
  <div class="section-title">Title <span class="meta">meta text</span></div>
  <!-- content -->
</div>
```
Cards stack with `margin-top: var(--gap)`. **Collapsible cards** — used for most Home cards, Schedule's calendar/day cards, Commitments' compliance card and category cards, and each Project — are native `<details class="card cat-card" open>` with a `<summary>` (title, meta, chevron) and a `.cat-body`; they render open on every render.

### Metric Cards
```html
<div class="card metric">
  <div class="label">LABEL</div>
  <div class="num" data-target="12345" data-prefix="Rp ">Rp 0</div>
  <div class="sub">subtitle</div>
</div>
```
Numbers animate from 0 to `data-target` (600ms) on every render.

### List Items
```html
<ul class="list">
  <li class="list-item">
    <div class="time-col">09:00</div>
    <div class="item-main">
      <div class="item-title">Title</div>
      <div class="item-sub">Subtitle</div>
    </div>
  </li>
</ul>
```

### Modals (all Add / Edit flows)
`showModal({ title, fields, saveLabel, onSave })` renders a form from a field list — types `text`, `number`, `date`, `textarea`, `select`, `toggle`, `time` (hour/minute spinner) and `amount` (live dot-formatted). A field can be shown/hidden by another field with `controls`/`controlsWhen` (toggle or select → one field) or `showWhen: { field, values }` (visible while another field's value is in the list — used by the commitment Type select). Add buttons: `data-modal-add="…"`, `#add-sched-btn`, `data-add-commit`. Edit buttons: `data-edit-XXX="id"`. There are no inline add/edit forms anymore.

### Confirm dialog (all deletes)
`showConfirmModal({ title, message, confirmLabel, onConfirm })` — used before deleting a commitment, event, project, task, note, table, income, spending or debt. The one exception is Home's Today's-focus delete, which is immediate.

### Checkboxes
```html
<span class="check [checked]" data-toggle-XXX="id"></span>
<span class="check-label [done]">Label</span>
```
Styled box with CSS checkmark. `pulse` triggers a scale animation on toggle. `.check.static` is a non-interactive variant that only mirrors state (Duration commitments).

### Progress bar + quick buttons (Count / Duration commitments)
`.goal-prog` = full-width `.goal-prog-track`/`.goal-prog-fill` (green `.done` when the target is hit), a `count/target unit` value, and `.goal-quick` buttons (`.goal-count-btn` circular `−`, `.goal-quick-btn` pills, `.goal-quick-btn.timer` for Start/Stop).

### Pills (Navigation)
```html
<button class="mobile-pill [active]" data-go="life:commitments">Commitments</button>
```

### Pills (Category / Info / Filters)
```html
<span class="pill cat">Food<span class="amt">Rp 35.000</span></span>
<button class="pill [active]" data-income-filter="month">This Month</button>
```

### Tweaks Panel
Global settings panel (`#tweaks-panel`, slide-in from the ⚙ button):
- **Your name** (text input → updates `profiles.name` in Supabase)
- **Density:** Comfortable / Compact
- **Today layout:** Stacked / Hero focus
- **Quick pills on Today:** On / Off
- **Currency prefix** (text input, max 3 chars)
- **Custom YouTube stations:** name + link rows, **+ Add station** (persisted per-user in the `custom_stations` Supabase table)

(Accent colour and Big-number-weight controls exist in the markup but are hidden; their values come from the `index.html` defaults.) Settings live in the in-page `window.__HQ_TWEAKS` object and reset to the `index.html` defaults on reload — except the name and the custom stations, both Supabase-backed.

### Toast
```js
showToast('Message text')            // success (✓)
showToast('Message text', 'error')   // error (✕)
```
`#toast` element: appears with `.show`, auto-hides after 3500ms.

### Alarm banner
Persistent fixed banner (`.alarm-banner`) with Dismiss / Snooze 5 min, used by schedule alarms and commitment reminders. The alarm sound (`sounds/alarm.mp3`) is shared with duration-timer and Focus-session completion.

### Alert
```html
<div class="alert"><span class="glyph">⚠</span> Message</div>
```
Danger-coloured pill, used for overdue / due-soon debt warnings on Finance → Overview.
