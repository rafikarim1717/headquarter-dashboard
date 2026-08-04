# CLAUDE.md — HQ Dashboard

## Project Overview

**Headquarter (HQ Dashboard)** is a personal life + finance management Progressive Web App (PWA). It gives a single user a unified dashboard to manage their daily schedule, habits, goals, focus tasks, freeform notes, income, spending, and debts. The app is dark-mode, mobile-first, and fully backed by Supabase with Google OAuth and email/password authentication.

---

## Tech Stack & File Map

| File/Dir | Role |
|---|---|
| `index.html` | Single HTML shell — login screen, app shell (sidebar + `<main>`), mobile bottom nav, tweaks panel, toast. Loads all JS/CSS. |
| `css/styles.css` | All styles — design tokens, layout, components, responsive rules. No preprocessor. |
| `js/app.js` | State, all render functions (one per page), all event binding, animation helpers, alarm system, tweaks panel logic. The main logic file. |
| `js/navigation.js` | ROUTES map, `setActiveTab()`, `render()`, `initGlobalBindings()` (sidebar toggle, nav clicks, tooltips). |
| `js/supabase.js` | Supabase client init, `loadFromSupabase()`, `seedSampleData()`, all auth handlers (Google OAuth, email/password, forgot password), session management, visibility-change refresh. |
| `schema.sql` | Canonical DB schema — run once in Supabase SQL Editor to create all tables. |
| `schema_fix.sql` | Safe idempotent version of the schema (uses `IF NOT EXISTS` + `DO $$ EXCEPTION WHEN duplicate_object`). Re-run safe. |
| `manifest.json` | PWA manifest — `standalone` display, icons 192/512, theme `#0f0f0f`. |
| `sw.js` | Service worker — network-first with cache fallback, caches `'hq-v1'`. |
| `icon-192.png` / `icon-512.png` | PWA icons. |

**Script load order in `index.html`:** `app.js` → `navigation.js` → `supabase.js`

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

> Habits/Goals/Focus as separate pages no longer exist — they were merged into **Commitments** (do's/don'ts with daily check-off, drag-to-reorder, streak ring, and a Day/Week/Month/Year compliance history view). **Projects** is a newer page (objective → small tasks → progress bar → activity heatmap) that replaced the old single-board Focus page.

`render()` fades `<main>` out (opacity 0), waits 60ms, replaces `innerHTML` via `ROUTES[tab]()`, calls `bindMainEvents()` + `animateNumbers()` + `animateBars()`, then fades back in. The page is **always fully re-rendered** from state — no partial DOM patching (except some in-place edit updates for performance).

### In-Memory State

All data lives in `state` (defined top of `app.js`). Loaded once from Supabase on login, then all mutations write to state + fire Supabase calls in background.

```js
let state = {
  profile: { name: 'Friend' },
  schedule: {},        // { [iso-date]: [{id, time, title, sub, alarm_time, completed_at}] }, sorted ascending by time at render time
  goals: { dos: [], donts: [] },           // backing data for the Commitments page
  goalLogs: [],         // [{id, goal_id, user_id, date, checked}] — daily check-off log, drives streak/compliance %
  projects: [],         // [{id, name, description, status, deadline, tasks:[{id,text,description,checked,completed_at}]}]
  projectsFilter: 'all',
  expandedProjectIds: [],
  homeProjectIndex: 0,  // which active project is shown in the Home "Active project" carousel
  notes: [],            // [{id, title, content, created_at, updated_at}]
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
  commitPreviewTab: 'week',   // 'day' | 'week' | 'month' | 'year' — Commitments history tab
  commitViewDay: todayISO(),
  commitViewWeekStart: null,  // Monday ISO date; null = current week
  commitViewMonth: todayISO().slice(0, 7),
  commitHeatmapYear: new Date().getFullYear()
};
```

`goals`/`goalLogs` together implement "Commitments" — `goals` are the static do/dont items, `goalLogs` is one row per `(goal_id, date)` recording whether it was checked that day. This is what powers the daily compliance ring and the Day/Week/Month/Year history section on the Commitments page (see below).

UI navigation prefs (`activeTab`, `selectedDay`, `viewMonth`) are also saved to `localStorage('hq.prefs')` and restored on login.

---

## Supabase Tables

All tables use Row Level Security (RLS). Every row is owned by a user via `user_id = auth.uid()`.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users(id)`, cascade delete |
| `name` | text | User's display name |
| `note_default_style` | jsonb | Nullable. `{ fontFamily, fontSize, fontWeight, color }` captured by the Notes editor's style dropdown → Options → "Save as my default style", applied by "Use my default style". Added to `schema.sql`/`schema_fix.sql`; **run `schema_fix.sql` on the live DB** to backfill the column there. |
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
| `alarm_time` | text | Nullable. "HH:MM" alarm, used in code. Added to `schema.sql`/`schema_fix.sql`; **run `schema_fix.sql` on the live DB** to backfill the column there. |
| `completed_at` | timestamptz | Nullable. Not yet written to by any UI — added as a foundation column for a future "mark schedule block done" visualization (parallels `project_tasks.completed_at`). Added to `schema.sql`/`schema_fix.sql`; **run `schema_fix.sql` on the live DB**. |
| `created_at` | timestamptz | Default `now()` |

Index on `(user_id, date)`.

### `goals`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `type` | text | `'do'` or `'dont'` (check constraint in schema.sql) |
| `text` | text | Goal description |
| `checked` | boolean | Default false — legacy column, no longer written to; per-day state now lives in `goal_logs` |
| `order_index` | integer | Default 0. Manual sort position within its `type` (dos/donts ordered independently, across all categories) — dragging within one category's list still just splices within the full `dos`/`donts` array at the dragged/target item's true position, so it stays correct without needing per-category renumbering. Set on insert (`state.goals[key].length`); reordered via native HTML5 drag-and-drop on the card itself (`draggable="true"` on `.goal-item`, `dragstart`/`dragover`/`drop`/`dragend` handlers in `bindMainEvents()` — no arrow buttons). Dropping a card splices it to its new array position, then re-syncs `order_index` for every item in that `type` array. Load query orders by `order_index` then `created_at`. |
| `target_count` | integer | Default 1. How many times/day this commitment must be logged to count as done. `1` (default) renders as a plain checkbox on Commitments/Home — no behavior change from before. `>1` (e.g. "Cold DM" = 3) renders as a `−`/count/`+` stepper instead (`.goal-counter` in `renderCommitments`'s `goalRow()`), tapping bumps `goal_logs.count` for today. Set via the "Times per day" field on the Add/Edit Commitment modals. Added to `schema.sql`/`schema_fix.sql` (section 16); **run `schema_fix.sql` on the live DB**. |
| `unit` | text | Nullable. Optional label shown next to the counter, e.g. `'DM'`, `'halaman'`, `'menit'` (Cold DM 2/3 DM). Set via the "Unit (optional)" field on the same modals. Added to `schema.sql`/`schema_fix.sql` (section 16); **run `schema_fix.sql` on the live DB**. |
| `category` | text | Default `'General'`. Life area this commitment belongs to — drives the Commitments page's grouping (replaced the old flat Do's/Don'ts columns). Free text, but the Add/Edit modals offer a preset list (`Olahraga`, `Kerja`, `Bahasa`, `Spiritual`, `Personal & Mental`, see `GOAL_CATEGORY_PRESET` in `js/app.js`) plus any custom categories already in use, with a "new category" text field that overrides the dropdown when filled. Added to `schema.sql`/`schema_fix.sql` (section 18); **run `schema_fix.sql` on the live DB** — existing rows default to `'General'` until re-categorized via Edit. |
| `created_at` | timestamptz | |

### `goal_logs`
One row per `(goal_id, date)`, written via upsert whenever a commitment's checkbox is toggled or its counter is bumped. Added to `schema.sql`/`schema_fix.sql` (section 16 of `schema_fix.sql`) — was previously entirely missing from both schema files; **run `schema_fix.sql` on the live DB**.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `goal_id` | uuid FK | → `goals(id)`, cascade delete |
| `date` | date | Log date |
| `checked` | boolean | Default false. **Always kept equal to `count >= goals.target_count`** — every write (checkbox toggle or counter bump, in `js/app.js` `bindMainEvents()`) recomputes and upserts both fields together, so this stays the single source of truth for every compliance/history view (ring, week strip, month calendar, year heatmap, daily score) without those views needing to know about `target_count` at all. |
| `count` | integer | Default 0. Today's progress toward the parent goal's `target_count` (e.g. 2 of 3 cold DMs sent). Bumped by the `−`/`+` counter on Commitments, or by tapping the checkbox on Home (wraps back to 0 once it hits target). Added to `schema.sql`/`schema_fix.sql` (section 16); **run `schema_fix.sql` on the live DB**. |
| UNIQUE | `(goal_id, date)` | Prevents duplicate log per day |

Drives: daily compliance ring (Home + Commitments), weekly strip, monthly compliance calendar, year heatmap, and Home's "Daily score" — all still read only `checked`, never `count` or `target_count` directly.

> Note: `habits`/`habit_logs`/`focus_board`/`focus_tasks` tables described in older versions of this doc are **no longer used by the app** — the Habits and Focus pages were replaced by Commitments and Projects. The tables may still exist in `schema_fix.sql`/the live DB as unused leftovers; safe to ignore or drop.

### `projects`
**[MISSING FROM SCHEMA FILES]** — Referenced throughout `app.js` (Projects page, Home "Active project" card) and `supabase.js` `loadFromSupabase()`. Run the migration in `schema_fix.sql` (section 11) to create it.
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
**[MISSING FROM SCHEMA FILES]** — Run the migration in `schema_fix.sql` (section 12) to create it.
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `project_id` | uuid FK | → `projects(id)`, cascade delete |
| `text` | text | Task title |
| `description` | text | Optional |
| `checked` | boolean | Default false |
| `completed_at` | timestamptz | Set to `now()` when `checked` flips to `true`, cleared to `NULL` on uncheck. Drives the GitHub-style activity heatmap on the Home "Active project" card — a day is "green" if any task in that project has `completed_at` on that date. |
| `created_at` | timestamptz | |

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
**[MISSING FROM SCHEMA FILES]** — Referenced in `supabase.js` `loadFromSupabase()` and throughout `app.js`. Must be created manually. Inferred columns:
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `title` | text | |
| `content` | text | HTML (from contenteditable) |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | Updated on every autosave |

---

## Auth Method

- **Google OAuth:** `sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })`
- **Email/Password sign-in:** `sb.auth.signInWithPassword({ email, password })`
- **Sign-up:** `sb.auth.signUp({ email, password })` — button hidden by default (`display:none`), can be re-enabled
- **Forgot password:** `sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.href })`
- **Session management:** `sb.auth.onAuthStateChange` + `getSession()` on page load. Sessions cached in `cachedSession`.
- **Sign out:** `sb.auth.signOut()`
- **First login detection:** if `profiles` has no row for the user, `seedSampleData()` is called to populate sample data.
- **Display name priority:** `user_metadata.full_name` → `user_metadata.name` → email prefix → `'Friend'`
- **Auto-refresh:** if tab was hidden for >5 minutes, `loadFromSupabase()` is re-called on visibility.

---

## Design System

### Color Tokens (CSS custom properties)

| Token | Value | Usage |
|---|---|---|
| `--bg` | `#0f0f0f` | Page background |
| `--card` | `#1a1a1a` | Card background |
| `--card-2` | `#161616` | Inline form background |
| `--border` | `#2a2a2a` | Default borders |
| `--border-strong` | `#353535` | Focused / emphasized borders |
| `--text` | `#f4f4f4` | Primary text |
| `--text-dim` | `#9a9a9a` | Secondary text |
| `--text-faint` | `#6a6a6a` | Placeholder / meta text |
| `--accent` | `#f5f0e8` | Warm off-white — checkboxes, active states, bars (user-configurable in Tweaks) |
| `--danger` | `#d97a6c` | Delete actions, debt warnings |
| `--good` | `#8aa888` | Success states |

### Typography

- **Body font:** `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`
- **Login screen font:** `Quicksand` (Google Fonts, 400 + 600)
- **Base size:** `13px`
- **Number weight:** CSS var `--num-weight` (200 / 300 / 400), user-configurable via Tweaks panel

### Spacing & Shape

| Token | Value |
|---|---|
| `--r-card` | `16px` |
| `--r-sm` | `10px` |
| `--r-pill` | `50px` |
| `--pad-card` | `24px` |
| `--gap` | `16px` |

### Transitions

| Token | Duration | Usage |
|---|---|---|
| `--t-fast` | `150ms` | Hovers, toggles |
| `--t-mid` | `200ms` | Card state changes |
| `--t-slow` | `400ms` | Card entrance animation |

### Animations

- **Card entrance:** `card-in` — opacity 0→1, translateY 12px→0, `400ms ease-out forwards`. Each card gets an `animation-delay` (0ms, 60ms, 80ms, etc.).
- **Number counter:** animates from 0 to target over `600ms` with cubic ease-out, using `requestAnimationFrame`.
- **Bar chart:** height animates 0→target (600ms ease) with per-column `transition-delay` of 40ms steps.
- **Checkbox pulse:** 150ms scale 1→1.15→1 on check/uncheck.
- **Page transition:** `<main>` fades opacity 0→1 over 200ms on each render.
- **Habit delete:** fade + scale out over 250ms.
- **Habit shake:** triggered on long-press (mobile), 300ms translateX keyframe.

---

## Pages & Features

### Life Tab

| Route | Page | Description |
|---|---|---|
| `life:home` | Today | Greeting + live clock, Daily score, Today's commitments preview, Today's schedule preview (5 items), "Active project" card (progress bar + activity heatmap + carousel if multiple active projects), optional quick-navigation pills. Layout togglable (Stacked / Hero). |
| `life:schedule` | Schedule | Full month calendar view, day selector, event list for selected day. Add/edit/delete events. Alarm toggle per event (Web Notifications + AudioContext beep). |
| `life:commitments` | Commitments | Replaces the old Goals/Habits pages. Commitments are grouped into collapsible **category** cards (Olahraga, Kerja, Bahasa, Spiritual, Personal & Mental, or any custom category — see "Commitments — categories" below) instead of a flat Do's/Don'ts split; daily check-off is backed by `goal_logs`, not a static `checked` flag, and each category card supports drag-and-drop reordering. Commitments with `target_count` 1 (the default) render as a plain checkbox; `target_count` >1 (e.g. "Cold DM" 3×/day) render as a `−`/count/`+` stepper instead — see "Counter-based commitments" below. Compliance ring (today's %) plus per-category compliance bars, plus a history card with **Day / Week / Month / Year** tabs (see below). |
| `life:projects` | Projects | List of projects (filter: All/Active/On Hold/Done). Each card: name, description, status/deadline badges, progress bar (tasks done / total), expandable task list with check/edit/delete/assign-to-schedule, add task. |
| `life:notes` | Notes | Grid/list view of note cards. Sort (Newest/Oldest/A-Z) and filter (All/Today/Week) dropdowns. New note → rich text editor (contenteditable, Docs/Word-style toolbar: Style dropdown [Normal/Title/Subtitle/Heading 1-3 + Options flyout to save/use/reset a personal default style], Font family picker [10 fonts, click-to-expand weight variants], Font-size stepper [−/number/+  with a preset dropdown], Bold/Italic/Underline, Bullet/Numbered list, Text color + Highlight color swatches, Insert table). Heading collapse toggle. Autosaves title+content debounced 1000ms. Relative timestamps. |

**Commitments — categories** (`renderCommitments`'s `categoryCard()`/`goalRow()`, `js/app.js`): commitments are grouped by `goals.category` instead of a flat Do's/Don'ts split.
- `getGoalCategories()` returns the categories that currently have at least one commitment, ordered by `GOAL_CATEGORY_PRESET` (`['Olahraga', 'Kerja', 'Bahasa', 'Spiritual', 'Personal & Mental']`) first, then any custom categories alphabetically, with legacy/uncategorized `'General'` items last. `getCategoryOptions()` is the superset used to populate the Add/Edit modal dropdowns — always offers the 5 presets plus whatever custom categories are already in use.
- Each category renders as a collapsible `<details class="cat-card">` card: header shows the category name, today's `checked / total` count, a small inline progress bar, and a chevron that rotates on open/close (pure native `<details>`/`<summary>`, no JS needed for the collapse itself).
- Within a category card, `do`-type items render in one `<ul data-goal-list="dos" data-goal-cat="<category>">` and `dont`-type items (if any) in a second `<ul data-goal-list="donts" data-goal-cat="<category>">` directly below — a `dont`-type item shows a small red "Don't" pill (`.dont-tag`) next to its label instead of living in a separate column. Either `<ul>` is omitted entirely if the category has no items of that type.
- The Add button on each category card (`data-add-commit="<category>"`) pre-fills that category in the Add modal; a "+ New category" button at the bottom of the page (`data-add-commit=""`) opens the same modal with no category preset. The modal always asks for Type (Do/Don't) and Category (dropdown + an "or new category" text field that overrides the dropdown when filled) — there's no more separate "Add Do" vs "Add Don't" button.
- The top compliance card's bars are generated per-category (one `.compliance-bar-row` per entry from `getGoalCategories()`) instead of the old fixed two (Do's/Don'ts) rows.

**Commitments — counter-based commitments** (`renderCommitments`'s `goalRow()`, `js/app.js`): lets a commitment require doing something N times a day (e.g. "Cold DM" `target_count: 3`, `unit: 'DM'`) instead of a single yes/no.
- Set via the "Times per day" (+ optional "Unit") fields on the Add/Edit Commitment modals. `target_count` defaults to 1.
- `target_count === 1` renders the original plain `.check` checkbox (`data-toggle-goal`) — zero behavior change for existing simple commitments.
- `target_count > 1` renders a `.goal-counter` stepper (`−` / `count/target[ unit]` / `+`, `data-goal-bump="<dir>|<key>|<id>"`) instead. Each tap adjusts `goal_logs.count` for today (clamped ≥0, no upper clamp — overshooting past target is allowed).
- On every write (checkbox toggle or counter bump), `goal_logs.checked` is recomputed as `count >= target_count` and upserted alongside `count` — this is what keeps the compliance ring, week strip, month calendar, year heatmap, and daily score working unmodified, since they only ever read `checked`. The same write also calls `updateCategoryHeaderCount(g.category)` to refresh that category's header count/mini progress bar in place, and `updateComplianceRing()` to refresh the top ring + all per-category bars, without a full re-render.
- Home's "Today's commitments" preview shows a `(count/target)` suffix next to the label for counter items; tapping its checkbox there does a quick +1 (wrapping back to 0 once target is hit) rather than opening the full stepper — fine-grained adjustment happens on the Commitments page itself.
- The Day tab of the history card also shows `count/target` next to counter commitments for the viewed date.

**Commitments — drag-and-drop reorder** (`renderCommitments`, `js/app.js`):
- Each `.goal-item` card is `draggable="true"`. Hover shows `cursor: grab`; an active drag shows `cursor: grabbing` and `opacity: 0.4` on the source card (`.dragging` class).
- Drop position is computed from the pointer's Y position relative to the hovered card's midpoint (`.drag-over-top` / `.drag-over-bottom` gives a 2px accent-colored edge as the insert indicator).
- Cross-type drops (Do → Don't) are naturally rejected — the drop handler looks up the dragged id inside the target `<ul data-goal-list>`'s own array, which fails for an id from the other type. Cross-category drops are explicitly rejected by comparing the dragged item's `category` against the target `<ul>`'s `data-goal-cat`.
- No arrow buttons anymore — this replaced the old ▲/▼ `data-move-goal` pattern entirely.

**Commitments — history section** (bottom card on the page, `renderCommitments`, `js/app.js`): four tabs, all derived purely from `goalLogs` already held in memory (no extra fetch). State: `commitPreviewTab` (`'day'|'week'|'month'|'year'`), `commitViewDay`, `commitViewWeekStart`, `commitViewMonth`, `commitHeatmapYear` — each tab remembers its own navigation position independently. None of the four allow navigating into the future (no compliance data can exist there); all allow navigating arbitrarily far into the past.
- **Day** — the only per-commitment drill-down: ‹/› step one date at a time (+ a "Today" jump button), shows that date's overall % plus a checked/unchecked row for every Do/Don't (`getLogByDate(goalId, date)`).
- **Week** — the old "weekly strip" (7 circles, Mon–Sun), now navigable to any past week via `getMondayOf()` / `getWeekDays()` instead of being locked to the current week.
- **Month** — the old compliance calendar grid, now navigable to any past month instead of being locked to the current month.
- **Year** — new: a GitHub-style contribution heatmap (`buildCommitYearHeatmapData()` / `renderCommitYearHeatmap()`, reuses the `.proj-heatmap`/`.heatmap-cell` CSS from the Projects heatmap) — one cell per day, intensity = that day's compliance %.
- Shared color rule (Week circles, Month cells, Year cells): **≥80% → `--accent` full, ≥40% → `--accent` ~30-40% mix, >0% → `--danger` ~30-40% mix, 0%/no data → default dark**.

**Home "Active project" card details** (`projectsBlock` inside `renderLifeHome`, `js/app.js`):
- Shows one active project at a time from `state.projects.filter(p => p.status === 'active')`, indexed by `state.homeProjectIndex`.
- If more than one active project exists, `‹`/`›` nav buttons (`data-home-proj-nav="-1"|"1"`) cycle through them — bound in `bindMainEvents()`, must call `e.stopPropagation()` since the whole card has `data-go="life:projects"`.
- Below the progress bar: `renderProjectHeatmap(tasks)` renders a 7-row × N-week GitHub-style contribution grid (`.proj-heatmap`, CSS `grid-auto-flow: column`). A cell is "active" (green) if any task in the project has `completed_at` on that date — computed by `buildProjectHeatmapCells()`.

### Finance Tab

| Route | Page | Description |
|---|---|---|
| `finance:overview` | Overview | 3 metric cards (income this month, spent today, total debt). Overdue/soon alert pill. 7-day spending bar chart. |
| `finance:income` | Income | Total income this month + entry count + average. Full log sorted by date. Add/edit/delete entries. |
| `finance:spending` | Spending | Today's total + category breakdown pills (Food/Transport/Shopping/Other). Full recent log. Add/edit/delete entries. |
| `finance:debts` | Debts | Open total + counts. All debts sorted by paid status then due date. Overdue/soon indicators. Mark paid / edit / delete. Add new debt. |

---

## Known Patterns

### Data Fetch
- All data fetched in parallel via `Promise.all()` in `loadFromSupabase()`.
- All Supabase calls go through `dbCall(fn)` which retries once after 1500ms on failure.
- State is mutated optimistically (before Supabase call) to keep UI instant.

### Add Form Pattern
```
[+ Add button] (data-open-form="form-id")
  ↓ click → closeAllForms() → target.classList.add('open')
  ↓ Cancel (data-cancel="form-id") → classList.remove('open')
  ↓ Save → validate → sb.from(...).insert(...) → push to state → render()
```
Inline forms use CSS `max-height: 0 → 360px` transition. Only one form open at a time. Global click closes forms when clicking outside.

### Edit Pattern
```
[Edit button] (data-edit-XXX="id")
  ↓ click → closeAllForms() → open inline-form for that item
  ↓ Save (data-save-XXX="id") → validate → sb.from(...).update(...) → update state → update DOM in-place (no full re-render)
  ↓ Cancel → close inline-form
```
For schedule, income, spending, debts: DOM is updated in-place (specific div.textContent updates) then form closes, no full re-render.
For goals: full re-render.

### Delete Pattern
```
[Delete button] (data-del-XXX="id")
  ↓ click → filter item out of state array → render()
  ↓ dbCall(() => sb.from(...).delete().eq('id', id))  [fire and forget]
```
Projects have a confirm modal before delete (cascades to its tasks). Most delete buttons (`.fin-del-btn`, red/`--danger`) render the shared `ICON_TRASH` SVG — used by Commitments, Income, Spending, Debts, Projects, Project Tasks, Notes. Schedule's delete button (`.sched-del-btn`) is the one holdout still using the text "Delete" instead of the icon.

### Toggle Pattern (checkboxes)
```
[Checkbox] (data-toggle-XXX="id")
  ↓ click → mutate state → pulse(el) → render()
  ↓ dbCall(() => sb.from(...).update({ checked: ... }).eq('id', id))
```
Commitments also upsert `goal_logs` for the day — `{ checked, count }` together, where `checked` is always recomputed as `count >= goal.target_count` (see "Counter-based commitments" above). Project task toggle additionally sets/clears `completed_at` (`new Date().toISOString()` on check, `null` on uncheck) — this is what feeds the Home activity heatmap.

### Notes Autosave
Title + content changes debounced 1000ms, then `sb.from('notes').update(...)`. Focus textarea changes debounced 600ms.

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
- **`window.__HQ_TWEAKS`** — used across `app.js` for user customization; do not rename.

---

## Deployment

- **Platform:** Vercel (implied by OAuth `redirectTo: window.location.origin`).
- **Environment:** No `.env` file — Supabase URL and anon key are hardcoded in `js/supabase.js`. For production, these should be public anon keys (safe to expose).
- **PWA:** `manifest.json` + `sw.js`. Service worker uses network-first strategy with `'hq-v1'` cache. Registered on `window.load`.
- **No build step** — vanilla HTML/CSS/JS served as static files.
- **Notifications:** Requests `Notification` permission on first login. Alarms checked every 60 seconds via `setInterval`.

---

## Schema Gaps (Action Required)

These columns/tables are used in the code but **missing from both schema files** (or only just added to `schema_fix.sql` and still need to be run against the live Supabase project):

1. **`notes` table** — entire table missing from schema. Create with: `id uuid PK, user_id uuid FK, title text, content text, created_at timestamptz, updated_at timestamptz`. Enable RLS.
2. **`schedule_events.alarm_time` / `schedule_events.completed_at`** — now added to `schema.sql` and `schema_fix.sql` (section 2). **Run `schema_fix.sql` on the live DB** to backfill both columns — `alarm_time text` (used by the alarm toggle) and `completed_at timestamptz` (foundation column, not yet written to by any UI — reserved for a future schedule-completion visualization, parallel to `project_tasks.completed_at`).
3. **`goal_logs` table** — now added to `schema.sql` and `schema_fix.sql` (section 16), including `count`. **Run `schema_fix.sql` on the live DB** — needed for Commitments to track per-day check-off at all.
4. **`projects` / `project_tasks` tables** — now added to `schema_fix.sql` (sections 11–12), including `project_tasks.completed_at`. **Run `schema_fix.sql` in the Supabase SQL editor** to create/patch these on the live DB — the app already reads/writes `completed_at` in code, so checking off a project task fails outright (Postgrest rejects the whole `UPDATE` when an unknown column is referenced) until this migration is run.
5. **`goals.order_index`** — added to `schema.sql` and `schema_fix.sql` (section 13) to support Commitments drag-to-reorder. **Run this migration on the live DB** — until then, both loading goals (`.order('order_index')`) and inserting a new Do/Don't fail ("Sync failed" toast / empty Commitments list).
6. **`profiles.note_default_style`** — added to `schema.sql` and `schema_fix.sql` (section 17) to support the Notes editor's "Save as my default style" / "Use my default style" options. **Run `schema_fix.sql` on the live DB** — until then, saving a default style fails outright (Postgrest rejects the `UPDATE` on the unknown column).
7. **`goals.target_count` / `goals.unit` / `goal_logs.count`** — added to `schema.sql` and `schema_fix.sql` (section 16) to support counter-based commitments (e.g. "Cold DM" 3×/day) instead of only plain yes/no. **Run `schema_fix.sql` on the live DB** — until then, adding/editing a commitment fails outright (Postgrest rejects insert/update referencing the unknown `target_count`/`unit` columns).
8. **`goals.category`** — added to `schema.sql` and `schema_fix.sql` (section 18) to support grouping Commitments by life area (Olahraga, Kerja, Bahasa, Spiritual, Personal & Mental, or custom) instead of only a flat Do's/Don'ts split. **Run `schema_fix.sql` on the live DB** — until then, adding/editing a commitment fails outright (Postgrest rejects insert/update referencing the unknown `category` column). Existing rows default to `'General'` once the migration runs; re-categorize them via the Edit Commitment modal.
