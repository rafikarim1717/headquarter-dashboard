# CLAUDE.md — HQ Dashboard

> Last audited against the code on 2026-09-19. Companion docs: `ERD.md` (tables/columns/relations), `IA.md` (pages, navigation, components), `README.md` (setup/deploy).

## Project Overview

**Headquarter (HQ Dashboard)** is a personal life + finance management Progressive Web App (PWA). It gives a single user a unified dashboard to manage their daily schedule, **commitments** (daily habits — yes/no, counted, or timed — with streaks and a compliance history), **projects** (objective → small tasks), a Today's-focus list, freeform rich-text notes, income, spending, and debts. The app is dark-mode, mobile-first, and fully backed by Supabase with Google OAuth and email/password authentication.

---

## Tech Stack & File Map

| File/Dir | Role |
|---|---|
| `index.html` | Single HTML shell — login screen, loading screen, app shell (sidebar + `<main>`), mobile bottom nav, Tweaks panel, toast, modal containers, hidden YouTube player mount. Loads all JS/CSS. Also holds the hardcoded `window.__HQ_TWEAKS` defaults. |
| `css/styles.css` | All styles — design tokens, layout, components, responsive rules. No preprocessor. Contains some dead leftovers from removed pages (`.habit*`, `.inline-form*`, `.focus-task-item*`) that no JS emits anymore. |
| `js/core.js` | Shared foundation, split out of the old monolithic `js/app.js` (2026-09-13): `state` + `defaultState()`, date/format helpers, the modal system (`showModal`/`showConfirmModal`, see "Modal system" below), tweaks panel logic, ambient music widget, shared `ICON_*` SVGs, `paginationHtml()`, `animateNumbers()`, `bindSharedEvents()` (topbar tweaks/logout/music toggle, nav pills), and the `bindMainEvents()` orchestrator that calls every page's `bind*Events()` after each render. Loads first — every page file depends on it. |
| `js/pages/home.js` | `life:home` — `renderLifeHome()`, the Home Activity heatmap (`buildHomeActivityEvents/Data`, `renderHomeActivityHeatmap`), the Today's Focus quick-add widget, `bindHomeEvents()`. |
| `js/pages/schedule.js` | `life:schedule` — `buildMonthGrid()`, `renderSchedule()`, recurrence/reminder helpers, the alarm system (`checkAlarms`/`fireAlarm`/`showAlarmBanner`/`playAlarmBeep`), `bindScheduleEvents()`. |
| `js/pages/commitments.js` | `life:commitments` — commitment kinds (`getGoalKind`), partial-credit progress (`goalProgress`/`avgProgressPct`/`getDayCompliancePct`), the write path `setGoalCountToday()`, duration timers, ring colour (`complianceColor`), streak/reminder helpers, the History layers, `renderCommitments()`, `bindCommitmentsEvents()`. |
| `js/pages/projects.js` | `life:projects` — `renderProjectCard()`, `renderProjects()`, `bindProjectsEvents()`. |
| `js/pages/notes.js` | `life:notes` — note list/editor/table helpers, rich-text toolbar reference data, `bindNotesEvents()`. |
| `js/pages/finance.js` | `finance:overview` / `income` / `spending` / `debts` — all four render functions + finance helpers, `bindFinanceEvents()`. |
| `js/navigation.js` | `ROUTES` map, `setActiveTab()`, `render()`, `initGlobalBindings()` (sidebar toggle, nav clicks, tooltips). |
| `js/supabase.js` | Supabase client init, `dbCall()`, `loadFromSupabase()`, `seedSampleData()`, all auth handlers (Google OAuth, email/password, forgot password), session management, visibility-change refresh. |
| `schema.sql` | DB schema for a fresh project — run once in the Supabase SQL Editor. Has every table/column the app uses **except `projects` / `project_tasks`** (those are only in `schema_fix.sql`), and still contains the legacy `habits`/`habit_logs`/`focus_board`/`focus_tasks` tables. |
| `schema_fix.sql` | Safe idempotent version (uses `IF NOT EXISTS` + `DO $$ EXCEPTION WHEN duplicate_object`) organized as numbered sections 1–21 that also backfill columns onto an existing DB. Re-run safe. This is the file to run on the live DB after schema changes. |
| `ERD.md` / `IA.md` / `README.md` | Table reference / page + navigation reference / setup + deploy guide. |
| `manifest.json` | PWA manifest — `standalone` display, icons 192/512, theme `#0f0f0f`. |
| `sw.js` | Service worker — network-first with cache fallback, caches `'hq-v1'`. Registered from `js/core.js` on `window.load`. |
| `icon-192.png` / `icon-512.png` | PWA icons. |

**Script load order in `index.html`:** `core.js` → `pages/home.js` → `pages/schedule.js` → `pages/commitments.js` → `pages/projects.js` → `pages/notes.js` → `pages/finance.js` → `navigation.js` → `supabase.js` (then the YouTube IFrame API script last, so `onYouTubeIframeAPIReady` already exists). These are plain classic scripts (no bundler, no `type="module"`), so every file shares one global scope — `core.js` must load first since it defines `state`, `main`, and every shared helper the page files call; the six page files may load in any order relative to each other, since none of them execute page-rendering code at parse time (only function declarations and constants), and each only runs later via `ROUTES`/`bindMainEvents()` once all scripts have finished loading. Cross-file calls resolve at call time, e.g. `home.js` uses `complianceColor()`/`avgProgressPct()`/`getGoalKind()` from `commitments.js`, and `commitments.js` uses `fireAlarm()`/`playAlarmBeep()` from `schedule.js`.

**Modal system** (`js/core.js`): `showModal({ title, fields, saveLabel, onSave, onClose })` is the field-based form modal used by every Add/Edit flow (field types: `text`, `number`, `textarea`, `select`, `toggle`, `time` [spinner], `date`, `amount` [live Indonesian dot formatting]). Two ways for one field to react to another: `controls`/`controlsWhen` (a toggle/select shows/hides one named field) and `showWhen: { field, values: [...] }` (a field is visible only while another field's value is in the list — several fields can key off the same select; added 2026-09-19 for the commitment Type select). `showConfirmModal({ title, message, confirmLabel, onConfirm })` is the shared delete-confirmation dialog. `core.js` still contains an older `showModal({ fieldsHtml, ... })` declaration + `hideModal()` targeting `#hq-modal-overlay`; because it is declared *before* the field-based one in the same script, the later declaration wins and the old one is dead code. The Commitments day-detail modal builds its own overlay (see "Commitments — history").

---

## Architecture

### App Shell (Desktop vs Mobile)

- **Desktop (≥768px):** Left sidebar (`<aside class="sidebar">`), 200px wide, collapsible to 60px icon-only mode. Sidebar state persisted in `localStorage('hq.sidebar')`.
- **Mobile (<768px):** Sidebar hidden. Bottom tab bar (`<nav class="bottom-nav">`) with **Life** and **Finance** tabs. Sub-navigation rendered as horizontal pills inside `<div class="mobile-sub-nav">` at top of each page.
- Both nav systems call `setActiveTab(route)` which sets `state.activeTab`, saves prefs, and calls `render()`.

### Navigation / Router

Routes are defined in `navigation.js` as a plain object:

```js
const ROUTES = {
  'life:home': renderLifeHome,
  'life:schedule': renderSchedule,
  'life:commitments': renderCommitments,
  'life:projects': renderProjects,
  'life:notes': renderNotes,
  'finance:overview': renderFinanceOverview,
  'finance:income': renderIncome,
  'finance:spending': renderSpending,
  'finance:debts': renderDebts
};
```

> Habits/Goals/Focus as separate pages no longer exist — they were merged into **Commitments** (positively-framed commitments, no Do/Don't split, with daily check-off, per-item streaks, drag-to-reorder, a colour-coded compliance ring, and a Month/Year compliance history). **Projects** is a newer page (objective → small tasks → progress bar → activity heatmap) that replaced the old single-board Focus page.

`render()` sets `<main>.innerHTML = ROUTES[tab]()` (falling back to `life:home` for an unknown tab), then calls `bindMainEvents()` + `animateNumbers()` + `animateComplianceRing()` and updates the active state of the sidebar/bottom-nav buttons. There is no fade or page transition. `bindMainEvents()` clears the clock/notes intervals from the previous render and then runs **every** page's `bind*Events()` regardless of the active route — each binder just finds nothing to attach to on other pages, and a control rendered by one page can be bound by another (Home's schedule checkboxes are bound by `bindScheduleEvents()`). The page is **always fully re-rendered** from state — no partial DOM patching, except the in-place updates called out below (commitment count/timer/streak updates, Home's active-project carousel, project-task expand state).

### In-Memory State

All data lives in `state` (defined near the top of `js/core.js`, next to `defaultState()`). Loaded once from Supabase on login, then all mutations write to state + fire Supabase calls in background.

```js
let state = {
  profile: { name: 'Friend', noteDefaultStyle: null },  // noteDefaultStyle = profiles.note_default_style
  schedule: {},        // { [iso-date]: [{id, time, title, sub, alarm_time, completed_at, repeat, series_id}] }, sorted ascending by time at render time
  goals: { items: [] },  // flat list backing Commitments: {id, text, target_count, unit, category, reminder_time} — no Do/Don't split
  goalLogs: [],        // [{id, goal_id, user_id, date, checked, count, completed_at}] — one per (goal, day); drives progress, streaks, compliance
  projects: [],        // [{id, name, description, status, deadline, tasks:[{id,text,description,checked,completed_at}]}]
  projectsFilter: 'all',
  expandedProjectIds: [],
  homeProjectIndex: 0,  // which active project is shown in the Home "Active project" carousel
  notes: [],           // [{id, title, content, created_at, updated_at}]
  todayFocus: [],      // [{id, text, checked, created_at}] — Home's "Today's focus" list
  income: [],          // [{id, date, source, amount}]
  spending: [],        // [{id, date, time, cat, note, amount}]
  debts: [],           // [{id, creditor, amount, due, paid}]
  selectedDay: todayISO(),
  activeTab: 'life:home',
  viewMonth: todayISO().slice(0, 7),
  activeNoteId: null,
  notesSort: 'newest',
  notesFilter: 'all',
  notesDisplay: 'grid',
  commitPreviewTab: 'month',  // 'month' | 'year' — Commitments History tab (day detail is a modal, not state)
  commitViewMonth: todayISO().slice(0, 7),
  commitHeatmapYear: new Date().getFullYear(),
  incomePage: 1, incomeFilter: 'month', incomePickedDate: null,
  spendingFilter: 'daily', spendingPickedDate: null, spendingPage: 1, spendingShowAll: false,
  debtsPage: 1,
  heatmapYear: new Date().getFullYear(),  // year shown in Home's Activity heatmap
  homeActivityDayFilter: null,            // iso date; clicking a heatmap cell filters the activity feed
  homeActivityShowAll: false              // false = feed capped at 10 rows
};
```

`goals`/`goalLogs` together implement "Commitments" — `goals` are the static commitment items (one flat list), `goalLogs` is one row per `(goal_id, date)` recording that day's logged amount (`count`) and whether the target was reached (`checked`). This is what powers the daily compliance ring, per-item streaks, and the Month/Year history on the Commitments page (see below).

UI navigation prefs (`activeTab`, `selectedDay`, `viewMonth`) are also saved to `localStorage('hq.prefs')` and restored on login. Other per-device `localStorage` keys: `hq.sidebar` (sidebar collapsed/expanded), `hq.customStations` (custom YouTube stations), `hq.goalTimers` (running duration timers).

---

## Supabase Tables

All tables use Row Level Security (RLS). Every row is owned by a user via `user_id = auth.uid()`. Full column reference (types, defaults, indexes, relations) lives in `ERD.md`; this section explains behaviour.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users(id)`, cascade delete |
| `name` | text | User's display name |
| `note_default_style` | jsonb | Nullable. `{ fontFamily, fontSize, fontWeight, color }` captured by the Notes editor's style dropdown → Options → "Save as my default style", applied by "Use my default style". In `schema.sql` and `schema_fix.sql` (section 17); **run `schema_fix.sql` on the live DB** to backfill the column there. |
| `created_at` | timestamptz | Default `now()` (schema.sql) |

Operations: `select` (maybeSingle by id), `upsert` (on first login), `update` (name via Tweaks panel; `note_default_style` via Notes editor style options).

### `schedule_events`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK | → `auth.users` |
| `date` | date | Event date |
| `time` | text | "HH:MM" format |
| `title` | text | Event title |
| `note` | text | Subtitle/note |
| `alarm_time` | text | Nullable. "HH:MM" alarm, computed from the "Remind me" dropdown. In both schema files; **run `schema_fix.sql` on the live DB** to backfill. |
| `completed_at` | timestamptz | Nullable. Set to `now()` when a schedule block's `.check` checkbox is toggled on (Home's Today's-schedule card and the Schedule page share the same `toggleScheduleDone()` in `js/pages/schedule.js`), cleared to `NULL` on toggle off — mirrors `project_tasks.completed_at`. A block whose time has passed with `completed_at` still `NULL` gets a red "Missed" tag (`.missed-tag`) instead (for a past day, every unchecked block is Missed; for today, blocks earlier than now). Feeds Home's combined "Activity" heatmap/feed (see "Home — Activity heatmap" below) — 1 schedule block done = 1 activity. In both schema files; **run `schema_fix.sql` on the live DB**. |
| `repeat` | text | Default `'none'`. `'daily'` \| `'weekdays'` \| `'weekly'` for a recurring event. The app materializes one real row per occurrence up front (90 days ahead for daily/weekdays, 26 occurrences for weekly, via `expandRecurrenceDates()` in `js/pages/schedule.js`) rather than expanding a rule at render time — each occurrence stays independently editable/deletable. Set on the Add Event modal only (editing a single occurrence never changes recurrence). Shown as a 🔁 tag on the row. In both schema files (section 20); **run `schema_fix.sql` on the live DB**. |
| `series_id` | uuid | Nullable. Shared by every row generated from one recurring Add (`crypto.randomUUID()`), `NULL` for non-recurring events. Deleting one occurrence never deletes the series — after the delete confirm, the app asks separately, as an opt-in second step, whether to also delete the rest (`.eq('series_id', id).gte('date', today)`). In both schema files (section 20); **run `schema_fix.sql` on the live DB**. |
| `created_at` | timestamptz | Default `now()` |

Index on `(user_id, date)` and on `series_id`.

**Reminder offset** (`js/pages/schedule.js`): the Add/Edit Event modals expose a single "Remind me" dropdown (`REMINDER_OPTIONS`: No reminder / At event time / 5–60 min before / Custom time…) instead of a raw alarm-time picker; `computeAlarmTime()` converts the choice into the stored `alarm_time` (`offsetMinutes()` handles the midnight rollover), and `reminderValueFromAlarm()` reverses that mapping to pre-fill the dropdown on Edit. The "Custom time…" option reveals the underlying time-picker field — wired via `showModal()`'s `controls`/`controlsWhen` (in `js/core.js`).

**Alarm banner (snooze)** (`js/pages/schedule.js`): `fireAlarm(ev, sub)` fires a Web Notification (if permission is granted), plays `playAlarmBeep()`, and calls `showAlarmBanner()`, which injects a persistent fixed-position banner (`.alarm-banner` in `css/styles.css`) with Dismiss / Snooze 5 min buttons and repeats the beep every 20s until dismissed. Snooze re-fires the same alarm via `setTimeout` 5 minutes later. `sub` overrides the subtitle (used by commitment reminders). This is foreground-only (the tab must be open) — a lock-screen-capable version needs Web Push + a scheduled server-side check, intentionally out of scope.

### `goals`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `type` | text | `'do'` or `'dont'` (check constraint in schema.sql) — **legacy column, no longer meaningful app-side** (2026-09-17: the Do/Don't split was removed, see "Commitments — no Do/Don't split" below). The app always inserts `'do'` and never reads `type`; existing `'dont'` rows load in as regular commitments. Kept in the DB purely to avoid a migration. **Not the commitment "Type" (Yes/No / Count / Duration)** — that is derived, see next rows. |
| `text` | text | Commitment description |
| `checked` | boolean | Default false — legacy column, no longer written to; per-day state lives in `goal_logs` |
| `order_index` | integer | Default 0. Manual sort position across all commitments (one flat ordering) — dragging within one category's list splices within the full `state.goals.items` array at the dragged/target item's true position, so it stays correct without per-category renumbering. Set on insert (`state.goals.items.length`); reordered via native HTML5 drag-and-drop on the card itself (see "Commitments — drag-and-drop reorder"). Load query orders by `order_index` then `created_at`. |
| `target_count` | integer | Default 1. The daily target. Meaning depends on the derived kind (see "Commitments — types"): for a **Count** it is how many times per day (33 dzikir, 5 sholat), for a **Duration** it is how many minutes/seconds, for **Yes/No** it is always 1. In both schema files (section 16); **run `schema_fix.sql` on the live DB**. |
| `unit` | text | Nullable. Label for the target and — together with `target_count` — what determines the kind: `'menit'` or `'detik'` ⇒ Duration; any other non-empty unit (`'x'`, `'DM'`, `'waktu'`, `'halaman'`) ⇒ Count; `NULL` with `target_count` 1 ⇒ Yes/No. In both schema files (section 16); **run `schema_fix.sql` on the live DB**. |
| `category` | text | Default `'General'`. Life area this commitment belongs to — drives the Commitments page's grouping. Free text, but the Add/Edit modals offer a preset list (`Olahraga`, `Kerja`, `Bahasa`, `Spiritual`, `Personal & Mental`, see `GOAL_CATEGORY_PRESET` in `js/pages/commitments.js`) plus any custom categories already in use, with a "new category" text field that overrides the dropdown when filled. In both schema files (section 18); **run `schema_fix.sql` on the live DB** — existing rows default to `'General'` until re-categorized via Edit. |
| `reminder_time` | text | Nullable. "HH:MM" daily reminder cue — an Atomic Habits-style implementation intention ("at this time, do this"), distinct from `schedule_events.alarm_time` which is a one-off event alarm. Set via the "Give this a time" toggle + "At" time field on the Add/Edit Commitment modals (the toggle uses `controls` to show/hide the time field). See "Commitments — daily reminders" below for the firing logic. In both schema files (section 21); **run `schema_fix.sql` on the live DB**. |
| `created_at` | timestamptz | |

### `goal_logs`
One row per `(goal_id, date)`, written via upsert by `setGoalCountToday()` (Commitments page) and by Home's quick-log controls. In both schema files (section 16 of `schema_fix.sql`) — **run `schema_fix.sql` on the live DB**.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `goal_id` | uuid FK | → `goals(id)`, cascade delete |
| `date` | date | Log date |
| `checked` | boolean | Default false. **Always kept equal to `count >= goals.target_count`** — every write recomputes and upserts `checked` and `count` together. It means "target fully hit" and is what streaks, reminders, "N / M done" counts, the Home Activity feed, and the day-detail ✓ read. It is **not** what the compliance percentages read anymore — those use `count/target` (partial credit, see "Commitments — partial-credit compliance"). |
| `count` | integer | Default 0. That day's logged amount toward the parent goal's `target_count` (2 of 3 cold DMs, 20 of 33 dzikir, 4 of 10 minutes). Changed by: the `+N`/`−1` buttons and typing an exact amount (Count kind), the Start/Stop timer (Duration kind — the only way), the left checkbox (sets to `target_count` or back to 0, Yes/No and Count kinds), and Home's quick-log tap (Yes/No and Count kinds only). |
| `completed_at` | timestamptz | Nullable. Set to `now()` on the transition into `checked = true`, cleared to `NULL` on the transition back to `false` (mirrors `project_tasks.completed_at`) — changing `count` without crossing that boundary leaves it untouched. Feeds Home's combined "Activity" heatmap + chronological activity feed (see "Home — Activity heatmap" below). Rows written before this column existed have no timestamp; the app falls back to midday on their `date` so they still appear in the feed. In both schema files (section 19); **run `schema_fix.sql` on the live DB**. |
| UNIQUE | `(goal_id, date)` | Prevents duplicate log per day (also indexed) |

Drives: the compliance ring (Commitments + Home), category bars, Home's Daily score, the Month heatmap and Year sparkline (via partial-credit `count/target`), per-item streaks (via `checked`), and (via `completed_at`) Home's Activity heatmap/feed.

> Note: `habits`/`habit_logs`/`focus_board`/`focus_tasks` tables described in older versions of this doc are **no longer used by the app** — the Habits and Focus pages were replaced by Commitments and Projects. The tables still exist in `schema.sql`/`schema_fix.sql` as unused leftovers; safe to ignore or drop.

### `projects`
Created by `schema_fix.sql` section 11 — **not in `schema.sql`**, so a project set up from `schema.sql` alone needs `schema_fix.sql` run too. Read/written by the Projects page, Home's "Active project" card and Activity heatmap (`loadFromSupabase()`).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `name` | text | Project name |
| `description` | text | Optional, shown truncated on the card |
| `status` | text | `'active'` \| `'on_hold'` \| `'done'` |
| `deadline` | date | Optional |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Bumped on every edit |

### `project_tasks`
Created by `schema_fix.sql` section 12 (including `completed_at`) — **not in `schema.sql`**.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `project_id` | uuid FK | → `projects(id)`, cascade delete |
| `text` | text | Task title |
| `description` | text | Optional |
| `checked` | boolean | Default false |
| `completed_at` | timestamptz | Set to `now()` when `checked` flips to `true`, cleared to `NULL` on uncheck. Feeds Home's combined "Activity" heatmap/feed (see "Home — Activity heatmap" below) — 1 task completed that day = 1 activity. |
| `created_at` | timestamptz | |

### `today_focus_items`
Backs Home's "Today's focus" quick-priority list (`state.todayFocus`). In both schema files (`schema_fix.sql` section 15).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `text` | text | The priority, not null |
| `checked` | boolean | Default false |
| `created_at` | timestamptz | Load order (`order('created_at')`) |

Operations: `insert` (Add button / Enter), `update checked`, `delete`. Not seeded for new users.

### `income_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `date` | date | |
| `source` | text | Income source/label |
| `amount` | numeric(18,2) | |
| `created_at` | timestamptz | (schema.sql only) |

### `spending_entries`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `date` | date | |
| `time` | text | "HH:MM" |
| `category` | text | One of: Food, Transport, Shopping, Other |
| `note` | text | Description |
| `amount` | numeric(18,2) | |
| `created_at` | timestamptz | (schema.sql only) |

### `debts`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `creditor` | text | Who you owe |
| `amount` | numeric(18,2) | |
| `due_date` | date | |
| `paid` | boolean | Default false |
| `created_at` | timestamptz | (schema.sql only) |

### `notes`
In both schema files (`schema.sql`, `schema_fix.sql` section 14).
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `title` | text | Not null, default `''` |
| `content` | text | HTML (from contenteditable), not null, default `''` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Updated on every autosave; the list is loaded ordered by it |

---

## Auth Method

- **Google OAuth:** `sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`
- **Email/Password sign-in:** `sb.auth.signInWithPassword({ email, password })`
- **Sign-up:** `sb.auth.signUp({ email, password })` (min 6 chars) — the button (`#email-signup-btn`) is hidden by default (`display:none`), can be re-enabled
- **Forgot password:** `sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href })`
- **Session management:** `sb.auth.onAuthStateChange` + `getSession()` on page load. Sessions cached in `cachedSession`.
- **Sign out:** `sb.auth.signOut()`
- **First login detection:** if `profiles` has no row for the user, `seedSampleData()` is called to populate sample data (schedule, commitments, projects, income, spending, debts — not notes or Today's focus).
- **Display name priority:** `user_metadata.full_name` → `user_metadata.name` → email prefix → `'Friend'` (first letter capitalized)
- **Loading screen:** `#app-loading` shows for at least 800ms, then fades out over ~200ms, on every session start.
- **Auto-refresh:** if tab was hidden for >5 minutes, `loadFromSupabase()` is re-called on visibility, then the page re-renders and alarms are re-checked.

---

## Design System

### Color Tokens (CSS custom properties)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0f0f0f` | Page background |
| `--card` | `#1a1a1a` | Card background |
| `--card-2` | `#161616` | Inline form / secondary control background |
| `--border` | `#2a2a2a` | Default borders |
| `--border-strong` | `#353535` | Focused / emphasized borders |
| `--text` | `#f4f4f4` | Primary text |
| `--text-dim` | `#9a9a9a` | Secondary text |
| `--text-faint` | `#6a6a6a` | Placeholder / meta text |
| `--accent` | `#f5f0e8` | Warm off-white — checkboxes, active states, bars. Set from `window.__HQ_TWEAKS.accent` by `applyTweaks()`; the accent swatch row in the Tweaks panel is currently hidden (`display:none` in `index.html`), so in practice it is the `index.html` default. |
| `--danger` | `#d97a6c` | Delete actions, debt warnings, "bad" heatmap tier |
| `--good` | `#8aa888` | Success states, "good" heatmap tier, completed progress bars |
| `--warn` | `#c8a850` | Mid-tier warning (the Commitments Month heatmap's yellow tier) |

The Commitments/Home compliance **ring** uses its own colours rather than these tokens — see "Commitments — compliance ring colour".

### Typography

- **Body font:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- **Login screen font:** `Quicksand` (Google Fonts, 400 + 600)
- **Base size:** `13px`
- **Number weight:** CSS var `--num-weight` (200 / 300 / 400), applied from `window.__HQ_TWEAKS.numberWeight`; its Tweaks control is currently hidden, so it is the `index.html` default (400)
- **Density:** `body[data-density="comfortable"|"compact"]` (Tweaks → Density; default `compact`) tightens card padding, gaps and list rows

### Spacing & Shape

| Token | Value |
|---|---|
| `--r-card` | `16px` |
| `--r-sm` | `10px` |
| `--r-pill` | `50px` |
| `--pad-card` | `24px` (18px in compact density) |
| `--gap` | `16px` (12px in compact density) |

### Transitions

| Token | Duration | Usage |
|---|---|---|
| `--t-fast` | `150ms` | Hovers, toggles |
| `--t-mid` | `200ms` | Card state changes |
| `--t-slow` | `400ms` | Slower state changes |

### Animations

- **Number counter:** `animateNumbers()` animates every `.num[data-target]` from 0 to its target over `600ms` with cubic ease-out, using `requestAnimationFrame` (re-runs for the whole page on every full `render()`).
- **Checkbox pulse:** 150ms scale 1→1.15→1 on check/uncheck (`pulse()` in `core.js`).
- **Progress fills:** commitment progress bars ease width over 300ms; the compliance ring eases its stroke/fill colour over 300ms when it crosses a tier.
- **Timer dot:** the running-timer dot blinks (`goal-timer-blink`, 1.2s).
- **Modals:** `modal-fade-in` (overlay) / `modal-scale-in` (card).
- **Login / loading / music:** spinning rings on the login screen, dot-pulse on the loading screen, equalizer bars while ambient music plays.
- There is **no** page fade or card-entrance animation in the CSS: the inline `animation-delay:Nms` styles that render functions still emit have no keyframes to drive, and the bar-chart has no height animation. `.habit*`/`habit-shake` CSS is dead code from the removed Habits page.

---

## Ambient Music Widget (topbar, `js/core.js`)

Two playback engines behind one station picker, always visible in the topbar (right side, next to ⚙ Tweaks):
- **3 built-in radios** (`AMBIENT_STREAMS`) — plain `<audio>` streams (`kind: 'audio'`).
- **An unbounded list of user-supplied YouTube links** (`kind: 'youtube'`) — managed from the Tweaks panel's "Custom YouTube stations" section: `#tw-custom-stations-list` (rebuilt by `renderCustomStationsList()`, only on add/remove — never per keystroke, so typing never fights a rebuild for input focus) plus a `+ Add station` button (`addCustomStation()`) and a per-row 🗑 (`removeCustomStation()`). Played through the **YouTube IFrame Player API** (`ytPlayer`, mounted into `#yt-audio-player`). `extractYouTubeId()` pulls the video id out of watch/live/embed/shorts/`youtu.be` link shapes; `getCustomStations()` silently drops any row missing a name, a link, or a parseable id — so a half-filled row just doesn't show up in the picker yet, no validation error. This is the only supported way to play a YouTube link as ambient audio — there's no download/convert-to-mp3 step (no backend for that, and it'd violate YouTube's ToS); the video plays for real, just visually hidden.
- `getAllStations()` returns the combined list (3 radios + however many valid custom ones) — this is what both the picker dropdown and `updateMusicBtn()` index into.

**Custom station persistence is the one exception to Tweaks' normal (in-memory-only) behavior**: every other Tweak resets to its hardcoded `index.html` default on refresh (see `window.__HQ_TWEAKS`), but `customStations` (a plain array, any length) also round-trips through its own `localStorage['hq.customStations']` key (read once at boot in `index.html`, written by `persistCustomStations()` on every add/remove/edit) — there's no Supabase column for it, so this is the only place it can survive a reload. (The Tweaks "Your name" field is the other persisted one — it updates `profiles.name`.)

**`#yt-audio-player-wrap` lives outside `#main`** (in `index.html`, alongside `#toast`/`#modal-container`) — it must not be inside `#main`, or `render()`'s `main.innerHTML = ...` on every page navigation would tear down and recreate the YouTube player (interrupting playback) on every unrelated click. The built-in `<audio>` streams don't have this constraint since they're plain JS objects (`ambientPlayer.audio`), not DOM nodes.

**Interaction model** (deliberately not "click cycles through streams", the old behavior): the note icon (`#music-toggle`) only ever pauses/resumes whatever station is already selected (`toggleAmbientMusic()` → `pauseCurrentStation()`, which keeps the `Audio`/yt player loaded for resume — distinct from `stopCurrentStation()`, which fully discards the `Audio` object when switching to a different station). The small `▾` caret (`#music-caret-btn`) opens a dropdown (`#music-dropdown`, reuses `.notes-dropdown` styling) listing every station — built-ins first, then a separator, then custom ones (or a hint pointing at Tweaks if none are configured yet); picking one calls `selectStation(idx)`. If nothing has ever been selected, clicking the note icon also opens the dropdown (there's nothing to resume). While playing, the button shows the equalizer-bar animation instead of the note icon, and `#music-label` shows the current station's name.

---

## Pages & Features

### Life Tab

| Route | Page | Description |
|---|---|---|
| `life:home` | Today | Greeting + live clock. Card order (2026-09-13, deliberately urgency-first, not feature-category order — see below): **Today's schedule** (top 3, windowed around "now" — see "Home — Today's schedule/commitments preview windowing" below — each with a `.check` checkbox to mark it done — see `schedule_events.completed_at` above — and the next upcoming one (by time, regardless of done state) highlighted as "Up Next" with a live countdown ticking every second down to `in Xh Ym Zs`, same 1s interval as the clock, `bindHomeEvents()` in `js/pages/home.js`) → **Today's commitments** (its own card, top 3 commitments that have a `reminder_time`, sorted by it, styled identically to Today's schedule — see below) → **Today's focus** → **Commitments** (category compliance bars + Daily score as a compact colour-coded ring in the card header) → **Finance snapshot** (spent today / income this month / nearest debt due — Home's only daily Finance touchpoint) → **Active project** (progress bar + carousel if multiple active) → a combined **Activity** heatmap + chronological activity feed (see "Home — Activity heatmap" below) → optional quick-navigation pills (Schedule / Commitments / Projects). Layout togglable via Tweaks (Stacked / Hero — Hero keeps its original purpose of surfacing Active project right after Today's commitments; every other card follows the same order as Stacked). |
| `life:schedule` | Schedule | Full month calendar view, day selector, event list for selected day. Add/edit/delete events (all via modals; delete asks for confirmation), plus a `.check` checkbox per event to mark it done (`schedule_events.completed_at`, see above) — a past block left unchecked gets a red "Missed" tag instead. "Remind me" dropdown per event (at event time / N minutes before / custom — see "Reminder offset" above) triggers a persistent alarm banner (Web Notification + repeating beep, Dismiss/Snooze 5 min) until handled, instead of a one-shot beep. Recurring events (daily/weekdays/weekly) on Add (see `schedule_events.repeat`/`.series_id`). The Calendar card and the day's-events card are collapsible (see below). |
| `life:commitments` | Commitments | Replaces the old Goals/Habits pages. Every commitment is framed positively — no Do/Don't split (see "Commitments — no Do/Don't split" below). Each commitment has a **type**: Yes/No (checkbox), Count (33× dzikir, 5 waktu — progress bar + `+1`/`+10` buttons), or Duration (10 menit belajar — progress bar + Start/Stop timer, timer is the only way to log it) — see "Commitments — types". Commitments are grouped into collapsible **category** cards (Olahraga, Kerja, Bahasa, Spiritual, Personal & Mental, or any custom category — see "Commitments — categories") and support drag-and-drop reordering; daily state is backed by `goal_logs`. Top: a **Today's Compliance** ring card (partial-credit %, colour-coded red/white/green — see "Commitments — partial-credit compliance" and "…compliance ring colour") plus per-category bars. Each row shows name · 🕐 reminder time · 🔥 streak on the left and edit/delete on the right. Bottom: a **History** section — **Month** heatmap, **Year** sparkline, and a day-detail modal (see "Commitments — history section, a 3-layer design"). |
| `life:projects` | Projects | List of projects (filter: All/Active/On Hold/Done). Each card: name, description, status/deadline badges, progress bar (tasks done / total), expandable task list with check/edit/delete/assign-to-schedule, add task. New/Edit Project and Add/Edit Task are modals; deleting a project or task asks for confirmation. |
| `life:notes` | Notes | Grid/list view of note cards. Sort (Newest/Oldest/A-Z) and filter (All/Today/Week) dropdowns. New note → rich text editor (contenteditable, Docs/Word-style toolbar: Style dropdown [Normal/Title/Subtitle/Heading 1-3 + Options flyout to save/use/reset a personal default style], Font family picker [10 fonts, click-to-expand weight variants], Font-size stepper [−/number/+  with a preset dropdown], Bold/Italic/Underline, Bullet/Numbered list, Text color + Highlight color swatches, Insert table). Heading collapse toggle. Autosaves title+content debounced 1000ms. Relative timestamps. Deleting a note (or a table inside one) asks for confirmation. |

**Commitments — no Do/Don't split** (2026-09-17): commitments used to come in two types (`do`/`dont`, rendered in separate lists with a red "Don't" pill). Removed — every commitment is now framed as something you're building, matching Atomic Habits' identity-based framing (an avoidance goal like "Don't smoke" becomes a positive one like "Stay smoke-free" instead of a checkbox you have to remember to confirm you *didn't* trigger). `state.goals` is `{ items: [] }` (one flat array, was `{ dos: [], donts: [] }`) and `goalRow()`/`categoryCard()` take a plain item. The `goals.type` DB column still exists (`'do'`/`'dont'`, check constraint in schema.sql) purely because dropping it would require a migration — the app always inserts `'do'` and never reads `type` for branching logic; any pre-existing `'dont'` rows just load in as regular commitments. (The new commitment **Type** select — Yes/No / Count / Duration — is unrelated to this column.)

**Commitments — types** (2026-09-19, `getGoalKind()`/`goalFormFields()`/`parseGoalForm()`, `js/pages/commitments.js`): a commitment's kind is **derived from `target_count` + `unit`**, not stored, so there is no schema change (see the `goals.unit` row above): `'duration'` when the unit is `menit`/`detik` (`GOAL_DURATION_UNITS`), `'count'` when `target_count > 1` or any other unit is set, else `'check'`.
- **Add/Edit Commitment modal** (`goalFormFields()`, shared so Add and Edit can't drift; `showModal()`'s `showWhen` toggles the fields): **Commitment** (text) → **Type** select (Yes/No · Count (e.g. 33x, 3 CV) · Duration (e.g. 10 min)) → **Target per day** (Count/Duration only) → **Unit (optional)** free text (Count only) or **Unit** select `menit`/`detik` (Duration only) → **Category** + "Or new category" → "Give this a time" toggle + "At" time. `parseGoalForm()` maps the form back onto the two stored columns: Yes/No → `target_count 1, unit null`; Count → `target_count ≥ 1, unit text|null`; Duration → `target_count ≥ 1, unit menit|detik`. Changing a commitment's type in Edit just rewrites those two columns; existing `goal_logs` are kept.
- **Row layout** (`goalRow()`): left control · `.goal-title-wrap` (name, then the 🕐 `HH:MM` cue badge, then the 🔥 streak badge, 8px apart — all left-aligned, only the name is struck through when done) · edit ✎ / delete 🗑 on the right (fade in on hover). Count and Duration rows add a `.goal-prog` block underneath, indented to line up with the title.
- **Yes/No**: a plain `.check` checkbox (`data-toggle-goal`); tapping sets today's `count` to 1 / back to 0.
- **Count** (`goalProgressRow()`): a full-width progress bar (`.goal-prog-track`/`.goal-prog-fill`, turns `--good` green once the target is hit), the value `count/target unit` (click it to type an exact amount — replaced by an inline `.goal-count-input`, committed on Enter/blur, Esc cancels), then buttons: a `−` (−1), a **`+1`** (`.goal-quick-btn.primary` — same size/shape as its neighbours, only slightly brighter/bolder text; deliberately *not* a filled white pill, which clashed with the theme) and a **`+10`** when `target_count ≥ 20` (`goalQuickSteps()`), so 33× dzikir isn't 33 taps. Buttons carry `data-goal-bump="<delta>|<id>"`; there is no upper clamp (overshooting is allowed), count clamps at ≥ 0. The left checkbox is a shortcut: mark fully done (`count = target`) / reset to 0.
- **Duration**: **timer-only** — see "Commitments — duration timers". No `−`/`+`/quick buttons, no typing, the value is read-only (`.goal-count-val.ro`), and the left checkbox is a non-interactive `.check.static` that only mirrors done/not-done. Home shows durations read-only too.
- **Write path** (`setGoalCountToday(id, rawCount)`): the single function behind every count change (checkbox, `+N/−1`, typed amount, timer). It clamps to ≥ 0, sets `checked = count >= target`, stamps/clears `completed_at` only on a checked-boundary crossing, mutates `state.goalLogs`, updates the row **in place** (value text, progress fill + `done` colour, checkbox, `.goal-done`/strike-through, category header count + mini bar via `updateCategoryHeaderCount()`, the ring/bars/summary % via `updateComplianceRing()`, the streak badge via `updateGoalStreakBadge()`) and upserts `{ user_id, goal_id, date, checked, count, completed_at }` on `(goal_id, date)` — no full `render()`.

**Commitments — duration timers** (2026-09-19, `startGoalTimer()`/`finishGoalTimer()`/`tickGoalTimers()`/`toggle` binding in `bindCommitmentsEvents()`, `js/pages/commitments.js`): a Duration commitment can only be logged by running its timer — "press Start and wait".
- **Start** counts down the time still missing to today's target (`(target_count − count) × unit`), shown on the button as `mm:ss left · Stop` with a blinking dot; the progress bar advances live each second (`count` + elapsed). Nothing starts if the target is already met.
- **Auto-finish**: when the countdown reaches 0 the timer stops itself, adds the full planned amount to today's count through `setGoalCountToday()` (so the commitment becomes checked), fires a Web Notification (if permitted), `playAlarmBeep()` and a toast ("`<name>` — done").
- **Stop** (early) credits only the whole units actually spent, rounded to the nearest unit and capped at the planned amount; under half a unit logs nothing and shows a toast.
- Once done the button becomes a disabled "✓ Done" (`.goal-quick-btn.timer.done`).
- **Persistence & background**: running timers are `{ startedAt, endsAt }` (wall-clock ms) per goal id in `goalTimers`, mirrored to `localStorage['hq.goalTimers']` (entries without `endsAt` are dropped on load), so a reload, navigation or a closed tab doesn't lose one — time that passed while the app was closed still counts, and the timer completes on the next tick. A single 1s `setInterval` (`goalTimerInterval`, `ensureGoalTimerTicker()`) drives all timers and stops itself when none are left. It is started by `bindCommitmentsEvents()` and by `checkGoalReminders()` (which runs on the app-wide 60s alarm tick), so a timer resumes even if Commitments isn't the open page. Like the alarm system, it needs the app tab open (no push).
- Multiple durations can run at once (one timer per commitment).
- Known quirk: `setGoalCountToday()` always writes to *today's* log, so a timer that finishes on a later calendar day than it started (e.g. left running past midnight) is credited to the day it finishes, not the day it started. A forgotten timer is capped at 12h when stopped manually.

**Commitments — partial-credit compliance** (2026-09-19, `goalProgress()`/`avgProgressPct()`/`getDayCompliancePct()`, `js/pages/commitments.js`): compliance percentages count **how far along** each commitment is, not just whether it is fully done. `goalProgress(goal, log)` is `0..1`: Yes/No is all-or-nothing (`checked ? 1 : 0`); Count/Duration earn `min(count / target_count, 1)` (dzikir 20/33 ≈ 0.61, previously 0). `avgProgressPct(items, dateIso)` averages that over a set of commitments and is the single formula behind: the Today's Compliance ring and its summary %, every per-category bar (Commitments and Home), category-header mini bars, `computeDailyScore()` (Home's Daily score ring), the Month heatmap cells, the Year sparkline and the day-detail modal's "N% complete". What deliberately still uses `checked` ("target fully hit"): per-item **streaks**, **reminders** (a commitment stops nagging once done), the "N / M" counts in category/compliance headers and Home's "N of M done today", the day-detail ✓ status and Home's Activity feed/heatmap.

**Commitments — compliance ring colour** (2026-09-19, `complianceColor(pct, hasGoals)`/`paintComplianceRingColor()`, `js/pages/commitments.js`): the ring (arc + the number in its centre) is coloured by the ratio: **below 10%** bright red (`#ff4d4f`); **10% up to 70%** the normal accent (warm white, unchanged); **70% and up** green that starts light (`rgb(168,230,161)`) at 70% and deepens linearly to dark green (`rgb(31,143,70)`) at 100%. With no commitments at all there is no ratio, so it stays the accent instead of red. Applied in three places so it never lags: the ring on Commitments (set by `animateComplianceRing()` after each render and by `updateComplianceRing()` on every in-place change; `.compliance-arc`/`.compliance-pct-text` ease colour over 300ms) and the Daily score ring in Home's Commitments card (`renderLifeHome()` calls the same `complianceColor()`). At exactly 0% only the "0" is red because the arc has zero length. The summary "N%" text in the card header is not coloured.

**Commitments — per-item streak** (2026-09-17, `computeGoalStreak()` in `js/pages/commitments.js`): each `goalRow()` shows a `🔥N` badge (`.goal-streak`, hidden via `:empty` when streak is 0) right after the name (and the reminder-time badge, if any) — consecutive days that commitment's `goal_logs.checked` (target fully hit) was true, ending today. Grace period: if today isn't checked yet, counting starts from yesterday instead of zeroing out immediately (the day isn't over) — this supersedes the older, unused `computeStreak()` in `js/supabase.js`, which broke on the instant today was unchecked. Updated in-place (`updateGoalStreakBadge()`) by `setGoalCountToday()`, no full re-render needed.

**Commitments — daily reminders** (2026-09-17, `checkGoalReminders()`/`fireGoalReminder()` in `js/pages/commitments.js`): an optional daily notification cue per commitment (`goals.reminder_time`), reusing Schedule's existing alarm banner/beep/Notification system (`fireAlarm()`/`showAlarmBanner()` in `js/pages/schedule.js`, which accept an optional `sub` subtitle override) rather than building a parallel one.
- `checkAlarms()` (Schedule's 60s-interval function, wired into `js/supabase.js` on login, on the interval and after a visibility refresh) also calls `checkGoalReminders()` every tick — one shared ticker for both schedule alarms and commitment reminders, rather than a second `setInterval`. `checkGoalReminders()` additionally calls `ensureGoalTimerTicker()` so duration timers resume app-wide.
- For each commitment with a `reminder_time` that isn't checked off yet today: fires once at `reminder_time` (±1 min, same tolerance as schedule alarms), then once more `GOAL_REMINDER_GRACE_MINUTES` (45) later as a gentler nudge if it's *still* unchecked — this is the "jam + jendela toleransi" behavior (a hard time cue, but not naggy the instant it passes).
- Both firings are guarded by the same `firedAlarms` Set schedule alarms use, namespaced `'goal:<id>'` / `'goal-nudge:<id>'` so they never collide with `schedule_events` ids. Like the rest of this alarm system, `firedAlarms` only resets on page reload — so a reminder won't re-fire again the same session once handled, but also won't naturally reset at midnight without a reload.
- Set via the "Give this a time" toggle + "At" time field on the Add/Edit Commitment modals; no time by default. Not just a silent notification setting — a commitment with a time shows a `🕐 HH:MM` badge (`.goal-time-badge`) right after its name on `goalRow()`, so the cue is visible on the page even before the reminder ever fires.

**Commitments — categories** (`renderCommitments`'s `categoryCard()`/`goalRow()`, `js/pages/commitments.js`): commitments are grouped by `goals.category`.
- `getGoalCategories()` returns the categories that currently have at least one commitment, ordered by `GOAL_CATEGORY_PRESET` (`['Olahraga', 'Kerja', 'Bahasa', 'Spiritual', 'Personal & Mental']`) first, then any custom categories alphabetically, with legacy/uncategorized `'General'` items last. `getCategoryOptions()` is the superset used to populate the Add/Edit modal dropdowns — always offers the 5 presets plus whatever custom categories are already in use.
- Each category renders as a collapsible `<details class="cat-card">` card: header shows the category name, today's `checked / total` count (fully-done commitments), a small inline progress bar (partial-credit %), and a chevron that rotates on open/close (pure native `<details>`/`<summary>`, no JS needed for the collapse itself).
- Within a category card, all items in that category render in one `<ul data-goal-list data-goal-cat="<category>">`.
- The Add button on each category card (`data-add-commit="<category>"`, modal titled "Add to <category>") pre-fills that category in the Add modal; a "+ New category" button next to the "⚔️ Main Quest" label (`data-add-commit=""`, modal titled "New Commitment") opens the same modal with no category preset. See "Commitments — types" for the modal's fields.
- The top compliance card's bars are generated per-category (one `.compliance-bar-row` per entry from `getGoalCategories()`).
- The category card stack sits under a small `.commit-quest-label` ("⚔️ Main Quest") — deliberately not reusing "Commitments" (already the `page-title` above it) or "Life" (already the top-level nav tab name), to avoid a duplicate/ambiguous heading.

**Commitments — drag-and-drop reorder** (`renderCommitments`/`bindCommitmentsEvents`, `js/pages/commitments.js`):
- Each `.goal-item` card is `draggable="true"`. Hover shows `cursor: grab`; an active drag shows `cursor: grabbing` and `opacity: 0.4` on the source card (`.dragging` class). The dragged id is held in the global `draggedGoalId` (`core.js`).
- Drop position is computed from the pointer's Y position relative to the hovered card's midpoint (`.drag-over-top` / `.drag-over-bottom` gives a 2px accent-colored edge as the insert indicator). Dropping splices the item to its new position, then re-syncs `order_index` for every item in `state.goals.items`.
- Cross-category drops are explicitly rejected by comparing the dragged item's `category` against the target `<ul>`'s `data-goal-cat`.
- No arrow buttons — this replaced the old ▲/▼ `data-move-goal` pattern entirely.

**Commitments — history section, a 3-layer design** (bottom card on the page, `js/pages/commitments.js`; replaced a habit-grid table from earlier the same day (2026-09-18) after it was rejected as too busy/cluttered — this is the second redesign that day). Two tabs — **Month** (Layer 1, default) **/ Year** (Layer 2, a sparkline) — plus a day-detail **modal** (Layer 3, not a tab). State: `commitPreviewTab` (`'month'|'year'`) — any legacy `'day'|'week'|'grid'` value from earlier designs falls back to `'month'`.
- **Layer 1 — Month heatmap** (`renderCommitMonthHeatmap()`): a calendar grid, one cell per day, navigable to any past month via `commitViewMonth` (future months blocked). Each cell shows the day number and that day's compliance **%** (partial-credit average, `getDayCompliancePct()`) as visible text (not just a hover tooltip), tinted by a 3-tier traffic light — `tier-good` (`--good`, ≥80%), `tier-warn` (`--warn`, 60–79%), `tier-bad` (`--danger`, <60%). Hovering a cell's native `title` tooltip shows the fully-done count ("`6/8 commitments completed`"). Showing the % as text (not color alone) is the colorblind mitigation — the tier color reinforces it, it isn't the only signal. A `commit-month-stats` line above the grid shows that month's average %, and a small legend below the grid spells out the tier thresholds.
- **Layer 2 — Year sparkline** (`renderCommitYearSparkline()` / `buildCommitYearSparklineData()`): a hand-rolled inline SVG line chart (no charting library — see "No build step" in Deployment) of 12 points, one per month, each the average daily compliance % for that month (`getDayCompliancePct()` averaged over the month's days-so-far). Months after the current one (or, for a future year, every month) have no data and are left out of the line entirely — not plotted as 0%. Y gridlines at 0/50/100, X labels Jan–Dec, current month's dot filled solid (`.commit-spark-dot.current`) vs. hollow for the rest. **Clicking a dot** (`data-commit-spark-month`) sets `commitViewMonth` to that year+month and switches `commitPreviewTab` to `'month'` — Layer 2 → Layer 1 drill-in. Navigable to any past year via `commitHeatmapYear` (`data-commit-year-nav`).
- **Layer 3 — day-detail modal** (`showCommitDayModal()`): opened by clicking any clickable Month cell (`data-commit-day-select`) — imperative, not state-backed (no `render()` needed to open/close it). Reuses the app's shared `.hq-modal-*` CSS (see `showConfirmModal()` in `js/core.js` for the same overlay/ESC-key/outside-click-close pattern) via its own dynamically-created `#commit-day-modal-overlay` element, rather than the generic field-based `showModal()` (that one is form/Save-button shaped, not a fit for a read-only breakdown). Content: the day's "N% complete", then every commitment for that date grouped by category (`getGoalCategories()`/`categoryItems()`), each row showing a status icon (✓ done / ○ partial / ✗ missed — "partial" applies to Count and Duration commitments with `count > 0` but `< target_count`) and, for those, the logged value (`count/target unit`, e.g. "2/3 DM", "4/10 menit").
- Month is the only place a day can be clicked into; Year has no day-detail entry point of its own.

**Home — Today's schedule/commitments preview windowing** (2026-09-18, `renderLifeHome()`, `js/pages/home.js`): both Today's schedule and the (separate) Today's commitments card show a top-3 preview instead of the full day's list — full lists still live on their own pages (Schedule, Commitments).
- **Today's schedule**: `schedToday` (full sorted day) still backs the "N blocks" count in the summary and the "Up Next" lookup (`upNextEvent`), so both stay correct even once the visible window no longer starts at midnight. The displayed `sched` is a 3-item window starting at `upNextEvent`'s index (`schedStart`), clamped so it never runs past the end of the day — i.e. it shows "up next" plus what follows it, backfilling from earlier (already-past) blocks only once fewer than 3 remain ahead.
- **Today's commitments** (`commitPreviewBlock`, its own `<details class="card cat-card">` right after Today's schedule — deliberately *not* nested inside the "Commitments" card below it, which stays focused on the category compliance bars + Daily score ring): `commitPreview` **filters to only commitments with a `reminder_time` set** (this card answers "when do I need to do this today" — an untimed commitment has no "when" to show), then sorts the remainder ascending by that time and slices to 3. Simpler than the schedule window since a commitment's cue isn't "used up" for the day just because its `reminder_time` passed (unlike a schedule block, it can still be done any time before midnight). Uses the exact same `.list`/`.list-item`/`.time-col`/`.item-main` markup and card chrome as Today's schedule (down to the `<summary>`'s "N items" meta count) so the two cards read as a matched pair. Empty state nudges toward setting one ("No commitments with a reminder time set. Add one from Commitments → Edit.").
- The preview rows are interactive by kind: a **Yes/No** commitment gets the usual `.check` checkbox (`data-toggle-goal-home`, toggles fully done/0); a **Count** commitment gets a single tap-to-log control (`data-goal-quickbump`) that bumps `+1` and wraps back to `0` once `target_count` is hit, with a `(count/target)` suffix on the label — no `−`/`+` stepper here, fine-grained adjustment stays on the Commitments page; a **Duration** commitment gets a **read-only** `.check.static` (it can only be logged by the Commitments page's timer; its click handler is skipped). Tapping the row's title jumps to Commitments (`data-go`). Both interactive controls call a shared `upsertGoalLog()` helper in `bindHomeEvents()` (mutate `state.goalLogs` → `render()` → fire-and-forget `goal_logs` upsert) — a **full `render()`**, not commitments.js's in-place DOM update, since it also has to refresh the Commitments card's compliance bars/score ring elsewhere on the page.

**Home "Active project" card details** (`activeProjectCardHtml()`, `js/pages/home.js`; `renderLifeHome`'s `projectsBlock` is a thin wrapper around it):
- Shows one active project at a time from `state.projects.filter(p => p.status === 'active')`, indexed by `state.homeProjectIndex`.
- If more than one active project exists, `‹`/`›` nav buttons (`data-home-proj-nav="-1"|"1"`) cycle through them — must call `e.stopPropagation()` since `data-open-project="<id>"` lives on `.cat-body` (jumps to Projects, expanded on that project) and both the nav buttons and the project name/task list sit inside that same card (see "Home — collapsible cards" below for why `data-open-project` is on `.cat-body` and not the outer `<details>`).
- Its own card — no heatmap inside it. The Activity heatmap lives in a separate card at the bottom of Home (see below).
- **‹/› is an in-place update, not a full `render()`** (`updateActiveProjectCard()`): clicking nav used to call `render()`, which re-runs `animateNumbers()` over the whole page (it's a plain `document.querySelectorAll('.num[data-target]')`, not scoped to what changed) — every other card's numbers, notably the unrelated Finance snapshot, would replay their count-up animation as if the page had reloaded. `updateActiveProjectCard()` regenerates only this card's `<details data-home-card="active-project">` via `activeProjectCardHtml(layout, delay)`, swaps it in with `replaceWith`, preserves its open/closed state across the swap, and re-binds its contents with `bindActiveProjectCardEvents()` (nav buttons stay in-place-update; `data-open-project`/`data-toggle-proj-task` inside it still do a full `render()`, same as always, since those legitimately affect other cards — Projects page, Activity heatmap). `bindHomeEvents()`'s own `[data-home-proj-nav]` binding (bound once per full render, over all of `main`) calls the same `updateActiveProjectCard()`.

**Home — Today's focus** (`focusBlock`, `js/pages/home.js`, table `today_focus_items`): a quick priority list — an input + "Add" button (Enter also adds) above a divider, then the items, each with a checkbox (`data-toggle-tf`, updates `checked`) and a trash button (`data-del-tf`, deletes immediately, no confirm). Backed by `state.todayFocus`.

**Home — collapsible cards** (`renderLifeHome`, `js/pages/home.js`): every card on Home (Today's schedule, Today's commitments, Today's focus, Commitments, Finance, Active project, Activity) is a native `<details class="card cat-card" open>`/`<summary>`/`.cat-body` — the exact same collapse pattern, chevron icon, and CSS (`details.cat-card`, `.chevron`, `.cat-body` in `css/styles.css`) as Commitments' category cards (see "Commitments — categories" above). `open` is hardcoded on every card on every render (not persisted in state), matching Commitments' own behavior — collapsing a card survives in-place DOM updates (e.g. ticking a checkbox) but resets to open on any interaction that triggers a full `render()`. The Active project card's `data-open-project` (click-to-navigate) sits on `.cat-body` rather than the outer `<details>`, since the card header is now the collapse toggle — only the body (title/progress/task list) navigates to Projects on click, not the header.

**Same collapsible pattern extended to Schedule and Commitments' compliance card** (`js/pages/schedule.js`, `js/pages/commitments.js`): Schedule's Calendar card and its day's-events card, and Commitments' top "Today's Compliance" ring card, are `<details class="card cat-card" open>`/`<summary>`/`.cat-body`, identical to Home's cards above — `open` hardcoded on every render, not persisted. The compliance card keeps its overall `%` visible in the summary itself (`[data-compliance-summary-pct]`, kept in sync by `updateComplianceRing()` alongside the ring/bars) specifically so the score is still readable while the card is collapsed.

**Commitments — History is its own section, not a collapsible card**: styled to read as a second, clearly separate section from "Main Quest" — a plain `.commit-quest-label` ("History", same styling/spacing as "⚔️ Main Quest" above the category cards) sits above a plain `.card` holding the Month/Year tabs and `tabBodyHtml`. Deliberately *not* a `<details>`/`.cat-card` (that was tried and reverted) — the label-outside-a-plain-card shape is what visually separates it from "Main Quest"'s category-card stack, rather than making History look like just another collapsible card in the same list.

**Projects — two independent levels of collapse** (`renderProjectCard()`, `js/pages/projects.js`): each project is a `<details class="card cat-card proj-card" open>` — name/status/deadline/edit/delete move into `<summary>` (a `.proj-card-header` wrapper keeps them grouped so `justify-content:space-between` in the summary CSS puts only the chevron on the right; `data-del-proj`'s handler needs `e.stopPropagation()` for this reason — without it, deleting would also toggle the card, since a click's `stopPropagation()` on a descendant is what stops a native `<summary>` from treating that click as its own toggle), description/progress bar/task-list move into `.cat-body`, and the collapsed-state summary shows a `doneTasks/totalTasks · pct%` meta pill so that much stays visible either way. Nested one level deeper, the task list itself is a *separate*, independently-collapsible `<details class="proj-tasks-details">`/`<summary class="proj-expand-btn">` (reusing `.chevron` with its own rotate rule, since it isn't a `.cat-card`) — collapsing/expanding the outer card doesn't affect whether the inner task list remembers its own open state, and vice versa. That inner one is the one exception to the hardcoded-`open` convention: its expand state is intentionally persisted in `state.expandedProjectIds`, because Home's "jump to project" deep-link (`data-open-project` in `renderLifeHome`) needs a specific project to land pre-expanded with its tasks already visible. The `toggle` event on that inner `<details>` just syncs `expandedProjectIds` — no `render()` call, since the browser already shows/hides the task list on its own; this replaced the old `data-toggle-proj-expand` button+`render()` version, so expanding one project's tasks no longer replays every other card's entrance animation. The outer card-level collapse, by contrast, follows the normal hardcoded-`open` convention (resets on every full render, same as Home/Schedule/Commitments) since nothing else needs it to persist.

**Home — Activity heatmap** (`renderHomeActivityHeatmap()` + `buildHomeActivityEvents()` / `buildHomeActivityData()`, `js/pages/home.js`; own collapsible card, rendered last on Home in both Stacked and Hero layouts): a single GitHub-style contribution grid combining **project tasks completed**, **commitments checked**, and **schedule blocks marked done**, plus a chronological feed of the underlying events below it (tagged `Project` / `Habit` / `Schedule`, from `ACT_KIND_LABEL`). Replaced the older per-project-only `renderProjectHeatmap()`.
- **Counting rule** (`buildHomeActivityEvents()`): 1 activity = 1 completed `project_tasks` row (`completed_at` on that day) **or** 1 `goal_logs` row with `checked = true` on that day **or** 1 `schedule_events` row with `completed_at` on that day — a Count/Duration commitment (e.g. "Cold DM" 3×/day, 10 menit belajar) still counts as exactly **1** activity once it reaches its `target_count`, not one per unit. Only fully-done commitments count (partial progress doesn't). Recomputed from current state on every render (not an append-only event log), so unchecking something the same day removes it from that day's count automatically.
- **Intensity**: 4 shades of `--accent` (`.act-low`/`.act-mid`/`.act-high`/`.act-max`, via `activityLevelClass()`), bucketed relative to that year's single busiest day — mirrors GitHub's own relative (not absolute) shading.
- **Year selector**: `<select data-heatmap-year-select>` (`.hm-year-select`) lists every year from the earliest activity through the current year, most recent first. Changing it also clears any active day filter (see next). Selected year lives in `state.heatmapYear`.
- **Activity feed**: below the grid, a chronological list (`.act-feed-list`) of every event in the selected year — project tasks tagged `Project` (`--accent`), commitments tagged `Habit` (`--good`), schedule blocks tagged `Schedule` (base tag colour) — newest first, capped at 10 rows (`HOME_ACTIVITY_FEED_CAP`) with a "Show all N activities" / "Show less" toggle (`state.homeActivityShowAll`), each row showing title, source (project name / commitment category / "Schedule"), and a relative timestamp. `goal_logs` rows written before `completed_at` existed fall back to midday on their `date` so they still appear (just without an exact time).
- **Click-to-filter**: clicking a heatmap cell with activity (`data-act-day="<iso>"`) sets `state.homeActivityDayFilter` to that date and narrows the feed to just that day (click the same cell again, or the `× <date>` clear pill, to reset). Selected cell gets a `.act-selected` outline.

### Finance Tab

| Route | Page | Description |
|---|---|---|
| `finance:overview` | Overview | 3 metric cards (income this month, spent today, total debt). Alert pills for debts that are overdue and for debts due within 7 days (worded for today / N days / several). 7-day spending bar chart. |
| `finance:income` | Income | Big total + entry count + average for the selected range: filter tabs **This Month / This Year / All Time**, or a "Jump to date" picker (× clears it). Log below, sorted by date descending, **7 per page** with a pager. `+ Log income` sits top-right of the page header (`.projects-header`/`.add-btn-inline`, reused from Projects), not at the bottom of the card. Add/edit via modals, delete with confirmation. |
| `finance:spending` | Spending | Total + category breakdown pills (Food/Transport/Shopping/Other) for the selected range: filter tabs **Daily / Weekly (Mon–today) / Monthly**, or a "Jump to date" picker. "Recent" list capped at 5 rows + a "Show all N activities"/"Show less" toggle (`state.spendingShowAll`, `.act-feed-toggle`), mirroring Home's Activity feed — resets to capped whenever the filter or the date picker changes. `+ Log spend` sits top-right of the page header, same as Income. Add via modal (category, amount, note — the date is today and the time is set to now), edit via modal (category, amount, note), delete with confirmation. |
| `finance:debts` | Debts | Open total + open/paid counts. All debts sorted by paid status then due date, **7 per page**. Paid / Due today / Due in Nd / Overdue labels, "soon" (≤7 days) styling. A paid ↔ unpaid toggle button (✓ / ↩; awaits the DB write, then toasts "Marked as paid/unpaid"), edit, delete (confirmed). `+ Add debt` in the page header. |

---

## Known Patterns

### Data Fetch
- All data fetched in parallel via `Promise.all()` in `loadFromSupabase()` (profiles, schedule_events, goals, goal_logs, projects, project_tasks, income_entries, spending_entries, debts, notes, today_focus_items).
- All Supabase calls go through `dbCall(fn)` which retries once after 1500ms on failure (toasts "Sync failed, retrying…" / "Sync failed. Check connection.").
- State is mutated optimistically (before Supabase call) to keep UI instant.

### Add / Edit Pattern (modals)
```
[+ Add button]  (data-modal-add="income" | data-add-commit | #add-sched-btn | …)
  ↓ click → showModal({ title, fields, saveLabel: 'Add', onSave })
  ↓ onSave(values) → validate → dbCall(insert) → push into state → render()

[✎ Edit button]  (data-edit-XXX="id")
  ↓ click → showModal({ title, fields prefilled from the item, saveLabel: 'Save', onSave })
  ↓ onSave(values) → validate → mutate the state item → render() → dbCall(update)   [fire and forget]
```
There are no inline add/edit forms anymore (`.inline-form`, `data-open-form`, `closeAllForms()` remain in the code but nothing emits them). Adds await the insert so the new row's id is available before it is pushed into state; edits are optimistic.

### Delete Pattern
```
[🗑 button] (data-del-XXX="id")   — the shared ICON_TRASH SVG, `.fin-del-btn`
  ↓ click → showConfirmModal({ title, message, onConfirm })
  ↓ onConfirm → filter item out of state → render()
  ↓ dbCall(() => sb.from(...).delete().eq('id', id))  [fire and forget]
```
Every entity is confirmed (Commitments, Schedule events, Projects, Project tasks, Notes, Income, Spending, Debts); deleting a project cascades to its tasks, deleting a recurring occurrence offers a second confirm for the rest of the series. The one exception is Home's Today's-focus item, which deletes immediately.

### Toggle Pattern (checkboxes)
```
[Checkbox] (data-toggle-XXX="id")
  ↓ click → mutate state → pulse(el) → render()   (or an in-place update, see below)
  ↓ dbCall(() => sb.from(...).update({ checked: ... }).eq('id', id))
```
**Commitments** don't use this: every change goes through `setGoalCountToday()` (see "Commitments — types"), which updates the DOM in place and upserts `goal_logs` — `{ checked, count, completed_at }` together, where `checked` is always `count >= goal.target_count` and `completed_at` is stamped `new Date().toISOString()` only on the transition into checked, cleared to `null` only on the transition back out. Home's quick-log controls do the same upsert but with a full `render()`. Project task toggle and the schedule-block "done" checkbox (`toggleScheduleDone()`, `js/pages/schedule.js`, shared by the Schedule page and Home) likewise set/clear their own `completed_at` — schedule's toggle does a full `render()` rather than an in-place DOM update, since it also needs to recompute the "Missed" tag. All three feed Home's combined Activity heatmap/feed (see "Home — Activity heatmap" above).

### Notes Autosave
Title + content changes debounced 1000ms, then `sb.from('notes').update(...)`.

---

## Things to Never Change

- **Auth flow** in `supabase.js` — `onAuthStateChange`, `handleSession`, `showLogin`, `showApp`.
- **`loadFromSupabase()` structure** — all tables fetched in one `Promise.all`, state populated in-order.
- **`state` object shape** — all render functions depend on exact property names.
- **`dbCall()` wrapper** — all Supabase writes must go through this for retry logic.
- **Supabase client** (`sb`) initialization — URL and anon key in `supabase.js`.
- **RLS policies** — never bypass; all queries filter by `user_id = auth.uid()`.
- **`ROUTES` object** — render function references must stay in sync with nav items.
- **CSS custom properties** — render functions emit inline styles referencing these tokens.
- **`window.__HQ_TWEAKS`** — defined in `index.html` and read/written across `core.js` and the page files for user customization; do not rename.
- **`goal_logs.checked = count >= target_count`** — keep every write path (`setGoalCountToday()`, Home's `upsertGoalLog()`) consistent with this; streaks, reminders and the Activity feed depend on it.

---

## Deployment

- **Platform:** Vercel (implied by OAuth `redirectTo: window.location.origin`); Netlify works too (see `README.md`).
- **Environment:** No `.env` file — Supabase URL and anon key are hardcoded in `js/supabase.js`. For production, these should be public anon keys (safe to expose).
- **PWA:** `manifest.json` + `sw.js`. Service worker uses network-first strategy with `'hq-v1'` cache. Registered on `window.load` from `js/core.js`.
- **No build step** — vanilla HTML/CSS/JS served as static files. Locally: `python -m http.server` / `npx serve .` (Google OAuth needs a real origin, not `file://`).
- **Notifications:** Requests `Notification` permission on first login. Schedule alarms, commitment reminders and duration-timer resumption are checked on a 60-second `setInterval` (`checkAlarms()`), plus a 1-second interval while a duration timer is running. All foreground-only.
- **After schema changes:** run `schema_fix.sql` in the Supabase SQL Editor (see below).

---

## Schema Gaps (Action Required)

Tables/columns the code uses that older live databases may still lack. All of them are in `schema_fix.sql` (safe to re-run in full on the live DB); `schema.sql` covers everything except `projects`/`project_tasks`. If the live DB predates any item below, the matching feature fails outright (Postgrest rejects a whole insert/update/select that mentions an unknown column or table).

1. **`notes` table** — in both schema files (`schema_fix.sql` section 14). Needed for the Notes page.
2. **`schedule_events.alarm_time` / `schedule_events.completed_at`** — both schema files (section 2). `alarm_time` powers the "Remind me" reminders; `completed_at` powers the schedule "done"/"Missed" state and Home's Activity feed.
3. **`goal_logs` table** — both schema files (section 16), including `count`. Needed for Commitments to track per-day progress at all.
4. **`projects` / `project_tasks` tables** — **only in `schema_fix.sql`** (sections 11–12), including `project_tasks.completed_at`. Needed for the Projects page, Home's Active project card and the Activity heatmap; checking off a project task fails outright until `completed_at` exists.
5. **`goals.order_index`** — both schema files (section 13). Until it exists, loading goals (`.order('order_index')`) and inserting a commitment fail ("Sync failed" toast / empty Commitments list).
6. **`profiles.note_default_style`** — both schema files (section 17). Needed for the Notes editor's "Save as my default style" / "Use my default style".
7. **`goals.target_count` / `goals.unit` / `goal_logs.count`** — both schema files (section 16). These carry the commitment **Type** (Yes/No, Count, Duration) and daily progress; until they exist, adding/editing a commitment fails.
8. **`goals.category`** — both schema files (section 18). Needed for category grouping; existing rows default to `'General'`.
9. **`goal_logs.completed_at`** — both schema files (section 19). Needed for Home's Activity feed; until it exists, logging any commitment fails.
10. **`schedule_events.repeat` / `schedule_events.series_id`** — both schema files (section 20). Until they exist, adding *any* schedule event fails, not just recurring ones.
11. **`goals.reminder_time`** — both schema files (section 21). Needed for Commitments' daily reminder cue; adding/editing a commitment fails until it exists.
12. **`today_focus_items` table** — both schema files (`schema_fix.sql` section 15). Needed for Home's "Today's focus" list; without it the list loads empty and adding an item fails.

The 2026-09-19 commitment work (Yes/No / Count / Duration types, timers, partial credit, ring colours) needed **no new schema** — it reuses `goals.target_count`/`unit` and `goal_logs.count`/`checked`.
