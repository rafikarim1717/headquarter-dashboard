# CLAUDE.md — HQ Dashboard

## Project Overview

**Headquarter (HQ Dashboard)** is a personal life + finance management Progressive Web App (PWA). It gives a single user a unified dashboard to manage their daily schedule, habits, goals, focus tasks, freeform notes, income, spending, and debts. The app is dark-mode, mobile-first, and fully backed by Supabase with Google OAuth and email/password authentication.

---

## Tech Stack & File Map

| File/Dir | Role |
|---|---|
| `index.html` | Single HTML shell — login screen, app shell (sidebar + `<main>`), mobile bottom nav, tweaks panel, toast. Loads all JS/CSS. |
| `css/styles.css` | All styles — design tokens, layout, components, responsive rules. No preprocessor. |
| `js/core.js` | Shared foundation, split out of the old monolithic `js/app.js` (2026-09-13): `state` + `defaultState()`, date/format helpers, the modal system (`showModal`/`hideModal`/`showConfirmModal`), tweaks panel logic, ambient music widget, shared `ICON_*` SVGs, `paginationHtml()`, `animateNumbers()`, `bindSharedEvents()` (topbar tweaks/logout/music toggle, nav pills), and the `bindMainEvents()` orchestrator that calls every page's `bind*Events()` after each render. Loads first — every page file depends on it. |
| `js/pages/home.js` | `life:home` — `renderLifeHome()`, the Home Activity heatmap (`buildHomeActivityEvents/Data`, `renderHomeActivityHeatmap`), the Today's Focus quick-add widget, `bindHomeEvents()`. |
| `js/pages/schedule.js` | `life:schedule` — `buildMonthGrid()`, `renderSchedule()`, the alarm system (`checkAlarms`/`fireAlarm`/`playAlarmBeep`), `bindScheduleEvents()`. |
| `js/pages/commitments.js` | `life:commitments` — goal/goalLogs helpers (`getTodayLog`, `getGoalCategories`, compliance/heatmap builders), `renderCommitments()`, `bindCommitmentsEvents()`. |
| `js/pages/projects.js` | `life:projects` — `renderProjectCard()`, `renderProjects()`, `bindProjectsEvents()`. |
| `js/pages/notes.js` | `life:notes` — note list/editor/table helpers, rich-text toolbar reference data, `bindNotesEvents()`. |
| `js/pages/finance.js` | `finance:overview` / `income` / `spending` / `debts` — all four render functions + finance helpers, `bindFinanceEvents()`. |
| `js/navigation.js` | ROUTES map, `setActiveTab()`, `render()`, `initGlobalBindings()` (sidebar toggle, nav clicks, tooltips). |
| `js/supabase.js` | Supabase client init, `loadFromSupabase()`, `seedSampleData()`, all auth handlers (Google OAuth, email/password, forgot password), session management, visibility-change refresh. |
| `schema.sql` | Canonical DB schema — run once in Supabase SQL Editor to create all tables. |
| `schema_fix.sql` | Safe idempotent version of the schema (uses `IF NOT EXISTS` + `DO $$ EXCEPTION WHEN duplicate_object`). Re-run safe. |
| `manifest.json` | PWA manifest — `standalone` display, icons 192/512, theme `#0f0f0f`. |
| `sw.js` | Service worker — network-first with cache fallback, caches `'hq-v1'`. |
| `icon-192.png` / `icon-512.png` | PWA icons. |

**Script load order in `index.html`:** `core.js` → `pages/home.js` → `pages/schedule.js` → `pages/commitments.js` → `pages/projects.js` → `pages/notes.js` → `pages/finance.js` → `navigation.js` → `supabase.js`. These are plain classic scripts (no bundler, no `type="module"`), so every file shares one global scope — `core.js` must load first since it defines `state`, `main`, and every shared helper the page files call; the six page files may load in any order relative to each other, since none of them execute page-rendering code at parse time (only function declarations), and each only runs later via `ROUTES`/`bindMainEvents()` once all scripts have finished loading.

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

> Habits/Goals/Focus as separate pages no longer exist — they were merged into **Commitments** (positively-framed commitments, no Do/Don't split, with daily check-off, per-item streaks, drag-to-reorder, streak ring, and a Day/Week/Month/Year compliance history view). **Projects** is a newer page (objective → small tasks → progress bar → activity heatmap) that replaced the old single-board Focus page.

`render()` fades `<main>` out (opacity 0), waits 60ms, replaces `innerHTML` via `ROUTES[tab]()`, calls `bindMainEvents()` + `animateNumbers()` + `animateBars()`, then fades back in. The page is **always fully re-rendered** from state — no partial DOM patching (except some in-place edit updates for performance).

### In-Memory State

All data lives in `state` (defined top of `app.js`). Loaded once from Supabase on login, then all mutations write to state + fire Supabase calls in background.

```js
let state = {
  profile: { name: 'Friend' },
  schedule: {},        // { [iso-date]: [{id, time, title, sub, alarm_time, completed_at}] }, sorted ascending by time at render time
  goals: { items: [] },                    // flat list backing the Commitments page — no Do/Don't split (see "Commitments — no Do/Don't split" below)
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

`goals`/`goalLogs` together implement "Commitments" — `goals` are the static commitment items (one flat list, no Do/Don't split), `goalLogs` is one row per `(goal_id, date)` recording whether it was checked that day. This is what powers the daily compliance ring, per-item streaks, and the Day/Week/Month/Year history section on the Commitments page (see below).

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
| `completed_at` | timestamptz | Nullable. Set to `now()` when a schedule block's `.check` checkbox is toggled on (Home's Today's-schedule card and the Schedule page share the same `toggleScheduleDone()` in `js/pages/schedule.js`), cleared to `NULL` on toggle off — mirrors `project_tasks.completed_at`. A block whose time has passed with `completed_at` still `NULL` gets a red "Missed" tag (`.missed-tag`) instead. Feeds Home's combined "Activity" heatmap/feed (see "Home — Activity heatmap" below) — 1 schedule block done = 1 activity. Added to `schema.sql`/`schema_fix.sql`; **run `schema_fix.sql` on the live DB**. |
| `repeat` | text | Default `'none'`. `'daily'` \| `'weekdays'` \| `'weekly'` for a recurring event. The app materializes one real row per occurrence up front (90 days ahead for daily/weekdays, 26 occurrences for weekly, via `expandRecurrenceDates()` in `js/pages/schedule.js`) rather than expanding a rule at render time — each occurrence stays independently editable/deletable. Set on the Add Event modal only (editing a single occurrence never changes recurrence). Added to `schema.sql`/`schema_fix.sql` (section 20); **run `schema_fix.sql` on the live DB**. |
| `series_id` | uuid | Nullable. Shared by every row generated from one recurring Add (`crypto.randomUUID()`), `NULL` for non-recurring events. Deleting one occurrence never deletes the series — the app asks separately, as an opt-in second step, whether to also delete the rest (`.eq('series_id', id).gte('date', today)`). Added to `schema.sql`/`schema_fix.sql` (section 20); **run `schema_fix.sql` on the live DB**. |
| `created_at` | timestamptz | Default `now()` |

Index on `(user_id, date)` and on `series_id`.

**Reminder offset** (`js/pages/schedule.js`): the Add/Edit Event modals expose a single "Remind me" dropdown (`REMINDER_OPTIONS`: No reminder / At event time / 5–60 min before / Custom time…) instead of a raw alarm-time picker; `computeAlarmTime()` converts the choice into the stored `alarm_time` (`offsetMinutes()` handles the midnight rollover), and `reminderValueFromAlarm()` reverses that mapping to pre-fill the dropdown on Edit. The "Custom time…" option reveals the underlying time-picker field — wired via `showModal()`'s `controls`/`controlsWhen` (in `js/core.js`), which also still supports the original toggle-based show/hide used elsewhere.

**Alarm banner (snooze)** (`js/pages/schedule.js`): `fireAlarm()` now also calls `showAlarmBanner()`, which injects a persistent fixed-position banner (`.alarm-banner` in `css/styles.css`) with Dismiss / Snooze 5 min buttons and repeats `playAlarmBeep()` every 20s until dismissed, instead of beeping once and going silent. Snooze re-fires the same alarm via `setTimeout` 5 minutes later. This is still foreground-only (same limitation as the rest of this alarm system) — a lock-screen-capable version needs Web Push + a scheduled server-side check, intentionally out of scope here.

### `goals`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `type` | text | `'do'` or `'dont'` (check constraint in schema.sql) — **legacy column, no longer meaningful app-side** (2026-09-17: the Do/Don't split was removed, see "Commitments — no Do/Don't split" below). The app always inserts `'do'` now; existing `'dont'` rows from before the change just load in as regular commitments, ignoring `type`. Kept as-is in the DB purely to avoid a migration — never read for branching logic anymore. |
| `text` | text | Goal description |
| `checked` | boolean | Default false — legacy column, no longer written to; per-day state now lives in `goal_logs` |
| `order_index` | integer | Default 0. Manual sort position across all commitments (one flat ordering, not per-type anymore) — dragging within one category's list still just splices within the full `state.goals.items` array at the dragged/target item's true position, so it stays correct without needing per-category renumbering. Set on insert (`state.goals.items.length`); reordered via native HTML5 drag-and-drop on the card itself (`draggable="true"` on `.goal-item`, `dragstart`/`dragover`/`drop`/`dragend` handlers in `bindCommitmentsEvents()` — no arrow buttons). Dropping a card splices it to its new array position, then re-syncs `order_index` for every item in `state.goals.items`. Load query orders by `order_index` then `created_at`. |
| `target_count` | integer | Default 1. How many times/day this commitment must be logged to count as done. `1` (default) renders as a plain checkbox on Commitments/Home — no behavior change from before. `>1` (e.g. "Cold DM" = 3) renders as a `−`/count/`+` stepper instead (`.goal-counter` in `renderCommitments`'s `goalRow()`), tapping bumps `goal_logs.count` for today. Set via the "Times per day" field on the Add/Edit Commitment modals. Added to `schema.sql`/`schema_fix.sql` (section 16); **run `schema_fix.sql` on the live DB**. |
| `unit` | text | Nullable. Optional label shown next to the counter, e.g. `'DM'`, `'halaman'`, `'menit'` (Cold DM 2/3 DM). Set via the "Unit (optional)" field on the same modals. Added to `schema.sql`/`schema_fix.sql` (section 16); **run `schema_fix.sql` on the live DB**. |
| `category` | text | Default `'General'`. Life area this commitment belongs to — drives the Commitments page's grouping. Free text, but the Add/Edit modals offer a preset list (`Olahraga`, `Kerja`, `Bahasa`, `Spiritual`, `Personal & Mental`, see `GOAL_CATEGORY_PRESET` in `js/pages/commitments.js`) plus any custom categories already in use, with a "new category" text field that overrides the dropdown when filled. Added to `schema.sql`/`schema_fix.sql` (section 18); **run `schema_fix.sql` on the live DB** — existing rows default to `'General'` until re-categorized via Edit. |
| `reminder_time` | text | Nullable. "HH:MM" daily reminder cue — an Atomic Habits-style implementation intention ("at this time, do this"), distinct from `schedule_events.alarm_time` which is a one-off event alarm. Set via the "Daily reminder" toggle + "Remind me at" time field on the Add/Edit Commitment modals (`reminderEnabled` toggle controls the time field's visibility, same `controls`/`controlsWhen` mechanism `showModal()` uses elsewhere). See "Commitments — daily reminders" below for the firing logic. Added to `schema.sql`/`schema_fix.sql` (section 21); **run `schema_fix.sql` on the live DB**. |
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
| `completed_at` | timestamptz | Nullable. Set to `now()` on the transition into `checked = true`, cleared to `NULL` on the transition back to `false` (mirrors `project_tasks.completed_at`) — bumping a counter that doesn't cross the checked/unchecked boundary leaves it untouched. Feeds Home's combined "Activity" heatmap + chronological activity feed (see "Home — Activity heatmap" below). Rows written before this column existed have no timestamp; the app falls back to midday on their `date` so they still appear in the feed. Added to `schema.sql`/`schema_fix.sql` (section 19); **run `schema_fix.sql` on the live DB**. |
| UNIQUE | `(goal_id, date)` | Prevents duplicate log per day |

Drives: daily compliance ring (Home + Commitments), weekly strip, monthly compliance calendar, year heatmap, Home's "Daily score", and (via `completed_at`) Home's Activity heatmap/feed. The compliance-percentage views (ring, strips, calendars) still read only `checked`, never `count`/`target_count`/`completed_at` directly.

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
| `completed_at` | timestamptz | Set to `now()` when `checked` flips to `true`, cleared to `NULL` on uncheck. Feeds Home's combined "Activity" heatmap/feed (see "Home — Activity heatmap" below) — 1 task completed that day = 1 activity. |
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

## Ambient Music Widget (topbar, `js/core.js`)

Two playback engines behind one station picker, always visible in the topbar (right side, next to ⚙ Tweaks):
- **3 built-in radios** (`AMBIENT_STREAMS`) — plain `<audio>` streams (`kind: 'audio'`).
- **An unbounded list of user-supplied YouTube links** (`kind: 'youtube'`) — managed from the Tweaks panel's "Custom YouTube stations" section: `#tw-custom-stations-list` (rebuilt by `renderCustomStationsList()`, only on add/remove — never per keystroke, so typing never fights a rebuild for input focus) plus a `+ Add station` button (`addCustomStation()`) and a per-row 🗑 (`removeCustomStation()`). Played through the **YouTube IFrame Player API** (`ytPlayer`, mounted into `#yt-audio-player`). `extractYouTubeId()` pulls the video id out of watch/live/embed/shorts/`youtu.be` link shapes; `getCustomStations()` silently drops any row missing a name, a link, or a parseable id — so a half-filled row just doesn't show up in the picker yet, no validation error. This is the only supported way to play a YouTube link as ambient audio — there's no download/convert-to-mp3 step (no backend for that, and it'd violate YouTube's ToS); the video plays for real, just visually hidden.
- `getAllStations()` returns the combined list (3 radios + however many valid custom ones) — this is what both the picker dropdown and `updateMusicBtn()` index into.

**Custom station persistence is the one exception to Tweaks' normal (in-memory-only) behavior**: every other Tweak resets to its hardcoded `index.html` default on refresh (see `window.__HQ_TWEAKS`), but `customStations` (a plain array, any length) also round-trips through its own `localStorage['hq.customStations']` key (read once at boot in `index.html`, written by `persistCustomStations()` on every add/remove/edit) — there's no Supabase column for it, so this is the only place it can survive a reload.

**`#yt-audio-player-wrap` lives outside `#main`** (in `index.html`, alongside `#toast`/`#modal-container`) — it must not be inside `#main`, or `render()`'s `main.innerHTML = ...` on every page navigation would tear down and recreate the YouTube player (interrupting playback) on every unrelated click. The built-in `<audio>` streams don't have this constraint since they're plain JS objects (`ambientPlayer.audio`), not DOM nodes.

**Interaction model** (deliberately not "click cycles through streams", the old behavior): the note icon (`#music-toggle`) only ever pauses/resumes whatever station is already selected (`toggleAmbientMusic()` → `pauseCurrentStation()`, which keeps the `Audio`/yt player loaded for resume — distinct from `stopCurrentStation()`, which fully discards the `Audio` object when switching to a different station). The small `▾` caret (`#music-caret-btn`) opens a dropdown (`#music-dropdown`, reuses `.notes-dropdown` styling) listing every station — built-ins first, then a separator, then custom ones (or a hint pointing at Tweaks if none are configured yet); picking one calls `selectStation(idx)`. If nothing has ever been selected, clicking the note icon also opens the dropdown (there's nothing to resume). While playing, the button shows the equalizer-bar animation instead of the note icon, and `#music-label` shows the current station's name.

---

## Pages & Features

### Life Tab

| Route | Page | Description |
|---|---|---|
| `life:home` | Today | Greeting + live clock. Card order (2026-09-13, deliberately urgency-first, not feature-category order — see below): **Today's schedule** (top 3, windowed around "now" — see "Home — Today's schedule/commitments preview windowing" below — each with a `.check` checkbox to mark it done — see `schedule_events.completed_at` above — and the next upcoming one (by time, regardless of done state) highlighted as "Up Next" with a live countdown ticking every second down to `in Xh Ym Zs`, same 1s interval as the clock, `bindHomeEvents()` in `js/pages/home.js`) → **Today's commitments** (its own card, top 3 commitments sorted by `reminder_time`, styled identically to Today's schedule — see below) → **Today's focus** → **Commitments** (category compliance bars + Daily score, as a compact ring in the card header, instead of its own top-of-page card) → **Finance snapshot** (spent today / income this month / nearest debt due — Home's only daily Finance touchpoint) → **Active project** (progress bar + carousel if multiple active) → a combined **Activity** heatmap + chronological activity feed (see "Home — Activity heatmap" below) → optional quick-navigation pills. Layout togglable (Stacked / Hero — Hero keeps its original purpose of surfacing Active project right after Schedule; every other card follows the same order as Stacked). |
| `life:schedule` | Schedule | Full month calendar view, day selector, event list for selected day. Add/edit/delete events, plus a `.check` checkbox per event to mark it done (`schedule_events.completed_at`, see above) — a past block left unchecked gets a red "Missed" tag instead. "Remind me" dropdown per event (at event time / N minutes before / custom — see `schedule_events.repeat`/`.series_id` above) triggers a persistent alarm banner (Web Notification + repeating beep, Dismiss/Snooze 5 min) until handled, instead of a one-shot beep. Recurring events (daily/weekdays/weekly) on Add. |
| `life:commitments` | Commitments | Replaces the old Goals/Habits pages. Every commitment is framed positively — no Do/Don't split (see "Commitments — no Do/Don't split" below). Commitments are grouped into collapsible **category** cards (Olahraga, Kerja, Bahasa, Spiritual, Personal & Mental, or any custom category — see "Commitments — categories" below); daily check-off is backed by `goal_logs`, not a static `checked` flag, and each category card supports drag-and-drop reordering. Commitments with `target_count` 1 (the default) render as a plain checkbox; `target_count` >1 (e.g. "Cold DM" 3×/day) render as a `−`/count/`+` stepper instead — see "Counter-based commitments" below. Compliance ring (today's %) plus per-category compliance bars, a per-item 🔥 streak badge, plus a history card with **Day / Week / Month / Year** tabs (see below). |
| `life:projects` | Projects | List of projects (filter: All/Active/On Hold/Done). Each card: name, description, status/deadline badges, progress bar (tasks done / total), expandable task list with check/edit/delete/assign-to-schedule, add task. |
| `life:notes` | Notes | Grid/list view of note cards. Sort (Newest/Oldest/A-Z) and filter (All/Today/Week) dropdowns. New note → rich text editor (contenteditable, Docs/Word-style toolbar: Style dropdown [Normal/Title/Subtitle/Heading 1-3 + Options flyout to save/use/reset a personal default style], Font family picker [10 fonts, click-to-expand weight variants], Font-size stepper [−/number/+  with a preset dropdown], Bold/Italic/Underline, Bullet/Numbered list, Text color + Highlight color swatches, Insert table). Heading collapse toggle. Autosaves title+content debounced 1000ms. Relative timestamps. |

**Commitments — no Do/Don't split** (2026-09-17): commitments used to come in two types (`do`/`dont`, rendered in separate lists with a red "Don't" pill). Removed — every commitment is now framed as something you're building, matching Atomic Habits' identity-based framing (an avoidance goal like "Don't smoke" becomes a positive one like "Stay smoke-free" instead of a checkbox you have to remember to confirm you *didn't* trigger). `state.goals` is now `{ items: [] }` (one flat array, was `{ dos: [], donts: [] }`) and `goalRow()`/`categoryCard()` take a plain item instead of an `(item, key)` pair. The `goals.type` DB column still exists (`'do'`/`'dont'`, check constraint in schema.sql) purely because dropping it would require a migration — the app always inserts `'do'` now and never reads `type` for branching logic; any pre-existing `'dont'` rows just load in as regular commitments.

**Commitments — per-item streak** (2026-09-17, `computeGoalStreak()` in `js/pages/commitments.js`): each `goalRow()` shows a `🔥N` badge (`.goal-streak`, hidden via `:empty` when streak is 0) — consecutive days that commitment's `goal_logs.checked` was true, ending today. Grace period: if today isn't checked yet, counting starts from yesterday instead of zeroing out immediately (the day isn't over) — this supersedes the older, unused `computeStreak()` in `js/supabase.js`, which broke on the instant today was unchecked. Updated in-place (`updateGoalStreakBadge()`) alongside the checkbox toggle and counter bump handlers, no full re-render needed.

**Commitments — daily reminders** (2026-09-17, `checkGoalReminders()`/`fireGoalReminder()` in `js/pages/commitments.js`): an optional daily notification cue per commitment (`goals.reminder_time`), reusing Schedule's existing alarm banner/beep/Notification system (`fireAlarm()`/`showAlarmBanner()` in `js/pages/schedule.js`, now accept an optional `sub` subtitle override) rather than building a parallel one.
- `checkAlarms()` (Schedule's 60s-interval function, already wired into `js/supabase.js` on login/interval/visibility-refresh) also calls `checkGoalReminders()` every tick — one shared ticker for both schedule alarms and commitment reminders, rather than a second `setInterval`.
- For each commitment with a `reminder_time` that isn't checked off yet today: fires once at `reminder_time` (±1 min, same tolerance as schedule alarms), then once more `GOAL_REMINDER_GRACE_MINUTES` (45) later as a gentler nudge if it's *still* unchecked — this is the "jam + jendela toleransi" behavior (a hard time cue, but not naggy the instant it passes).
- Both firings are guarded by the same `firedAlarms` Set schedule alarms use, namespaced `'goal:<id>'` / `'goal-nudge:<id>'` so they never collide with `schedule_events` ids. Like the rest of this alarm system, `firedAlarms` only resets on page reload — so a reminder won't re-fire again the same session once handled, but also won't naturally reset at midnight without a reload.
- Set via the "Give this a time" toggle + "At" time field on the Add/Edit Commitment modals; no time by default. Not just a silent notification setting — a commitment with a time shows a `🕐 HH:MM` badge (`.goal-time-badge`) right on its `goalRow()`, same visibility as the streak badge, so the cue is visible on the page even before the reminder ever fires.

**Commitments — categories** (`renderCommitments`'s `categoryCard()`/`goalRow()`, `js/pages/commitments.js`): commitments are grouped by `goals.category`.
- `getGoalCategories()` returns the categories that currently have at least one commitment, ordered by `GOAL_CATEGORY_PRESET` (`['Olahraga', 'Kerja', 'Bahasa', 'Spiritual', 'Personal & Mental']`) first, then any custom categories alphabetically, with legacy/uncategorized `'General'` items last. `getCategoryOptions()` is the superset used to populate the Add/Edit modal dropdowns — always offers the 5 presets plus whatever custom categories are already in use.
- Each category renders as a collapsible `<details class="cat-card">` card: header shows the category name, today's `checked / total` count, a small inline progress bar, and a chevron that rotates on open/close (pure native `<details>`/`<summary>`, no JS needed for the collapse itself).
- Within a category card, all items in that category render in one `<ul data-goal-list data-goal-cat="<category>">`.
- The Add button on each category card (`data-add-commit="<category>"`) pre-fills that category in the Add modal; a "+ New category" button at the bottom of the page (`data-add-commit=""`) opens the same modal with no category preset. The modal asks for the commitment text and Category (dropdown + an "or new category" text field that overrides the dropdown when filled) — no Type field anymore.
- The top compliance card's bars are generated per-category (one `.compliance-bar-row` per entry from `getGoalCategories()`).
- The category card stack sits under a small `.commit-quest-label` ("⚔️ Main Quest") — deliberately not reusing "Commitments" (already the `page-title` above it) or "Life" (already the top-level nav tab name), to avoid a duplicate/ambiguous heading.

**Commitments — counter-based commitments** (`renderCommitments`'s `goalRow()`, `js/app.js`): lets a commitment require doing something N times a day (e.g. "Cold DM" `target_count: 3`, `unit: 'DM'`) instead of a single yes/no.
- Set via the "Times per day" (+ optional "Unit") fields on the Add/Edit Commitment modals. `target_count` defaults to 1.
- `target_count === 1` renders the original plain `.check` checkbox (`data-toggle-goal`) — zero behavior change for existing simple commitments.
- `target_count > 1` renders a `.goal-counter` stepper (`−` / `count/target[ unit]` / `+`, `data-goal-bump="<dir>|<id>"`) instead. Each tap adjusts `goal_logs.count` for today (clamped ≥0, no upper clamp — overshooting past target is allowed).
- On every write (checkbox toggle or counter bump), `goal_logs.checked` is recomputed as `count >= target_count` and upserted alongside `count` — this is what keeps the compliance ring, week strip, month calendar, year heatmap, and daily score working unmodified, since they only ever read `checked`. The same write also calls `updateCategoryHeaderCount(g.category)` to refresh that category's header count/mini progress bar in place, and `updateComplianceRing()` to refresh the top ring + all per-category bars, without a full re-render.
- Home's "Today's commitments" preview shows a `(count/target)` suffix next to the label for counter items; tapping its checkbox there does a quick +1 (wrapping back to 0 once target is hit) rather than opening the full stepper — fine-grained adjustment happens on the Commitments page itself.
- The Day tab of the history card also shows `count/target` next to counter commitments for the viewed date.

**Commitments — drag-and-drop reorder** (`renderCommitments`, `js/app.js`):
- Each `.goal-item` card is `draggable="true"`. Hover shows `cursor: grab`; an active drag shows `cursor: grabbing` and `opacity: 0.4` on the source card (`.dragging` class).
- Drop position is computed from the pointer's Y position relative to the hovered card's midpoint (`.drag-over-top` / `.drag-over-bottom` gives a 2px accent-colored edge as the insert indicator).
- Cross-category drops are explicitly rejected by comparing the dragged item's `category` against the target `<ul>`'s `data-goal-cat`.
- No arrow buttons anymore — this replaced the old ▲/▼ `data-move-goal` pattern entirely.

**Commitments — history section** (bottom card on the page, `renderCommitments`, `js/app.js`): four tabs, all derived purely from `goalLogs` already held in memory (no extra fetch). State: `commitPreviewTab` (`'day'|'week'|'month'|'year'`), `commitViewDay`, `commitViewWeekStart`, `commitViewMonth`, `commitHeatmapYear` — each tab remembers its own navigation position independently. None of the four allow navigating into the future (no compliance data can exist there); all allow navigating arbitrarily far into the past.
- **Day** — the only per-commitment drill-down: ‹/› step one date at a time (+ a "Today" jump button), shows that date's overall % plus a checked/unchecked row for every commitment (`getLogByDate(goalId, date)`).
- **Week** — the old "weekly strip" (7 circles, Mon–Sun), now navigable to any past week via `getMondayOf()` / `getWeekDays()` instead of being locked to the current week.
- **Month** — the old compliance calendar grid, now navigable to any past month instead of being locked to the current month.
- **Year** — a GitHub-style contribution heatmap (`buildCommitYearHeatmapData()` / `renderCommitYearHeatmap()`, reuses the shared `.proj-heatmap`/`.heatmap-cell` CSS) — one cell per day, intensity = that day's compliance %. Distinct from Home's Activity heatmap below: this one measures pass/fail compliance (so its levels mix in `--danger`), Home's measures raw activity volume (all `--accent` tints).
- Shared color rule (Week circles, Month cells, Year cells): **≥80% → `--accent` full, ≥40% → `--accent` ~30-40% mix, >0% → `--danger` ~30-40% mix, 0%/no data → default dark**.

**Home — Today's schedule/commitments preview windowing** (2026-09-18, `renderLifeHome()`, `js/pages/home.js`): both Today's schedule and the (separate) Today's commitments card show a top-3 preview instead of the full day's list (schedule was previously capped at 5) — full lists still live on their own pages (Schedule, Commitments).
- **Today's schedule**: `schedToday` (full sorted day) still backs the "N blocks" count in the summary and the "Up Next" lookup (`upNextEvent`), so both stay correct even once the visible window no longer starts at midnight. The displayed `sched` is a 3-item window starting at `upNextEvent`'s index (`schedStart`), clamped so it never runs past the end of the day — i.e. it shows "up next" plus what follows it, backfilling from earlier (already-past) blocks only once fewer than 3 remain ahead. This replaced the old always-earliest-3 slice, which could go stale/silently drop "Up Next" off-screen once the day's first few blocks were in the past.
- **Today's commitments** (`commitPreviewBlock`, its own `<details class="card cat-card">` right after Today's schedule — deliberately *not* nested inside the "Commitments" card below it, which stays focused on the category compliance bars + Daily score ring): `commitPreview` is `state.goals.items` sorted by `reminder_time` ascending (items with no reminder time sort last, keeping their existing `order_index` order among themselves), sliced to 3 — simpler than the schedule window since a commitment's cue isn't "used up" for the day just because its `reminder_time` passed (unlike a schedule block, it can still be checked off any time before midnight). Uses the exact same `.list`/`.list-item`/`.time-col`/`.item-main` markup and card chrome as Today's schedule (down to the `<summary>`'s "N items" meta count) so the two cards read as a matched pair.
- Both preview lists are interactive, not just links to their full page: a `target_count === 1` commitment gets the usual `.check` checkbox (`data-toggle-goal-home`); a counter commitment (`target_count > 1`) gets a single tap-to-log control (`data-goal-quickbump`) that bumps `+1` and wraps back to `0` once `target_count` is hit — no `−`/`+` stepper here, fine-grained adjustment stays on the Commitments page itself. Both call a shared `upsertGoalLog()` helper in `bindHomeEvents()` (mutate `state.goalLogs` → `render()` → fire-and-forget `goal_logs` upsert) — a **full `render()`**, not commitments.js's in-place DOM update, since toggling here also has to refresh the Commitments card's compliance bars/score ring elsewhere on the page.

**Home "Active project" card details** (`activeProjectCardHtml()`, `js/pages/home.js`; `renderLifeHome`'s `projectsBlock` is a thin wrapper around it):
- Shows one active project at a time from `state.projects.filter(p => p.status === 'active')`, indexed by `state.homeProjectIndex`.
- If more than one active project exists, `‹`/`›` nav buttons (`data-home-proj-nav="-1"|"1"`) cycle through them — must call `e.stopPropagation()` since `data-open-project="<id>"` lives on `.cat-body` (jumps to Projects, expanded on that project) and both the nav buttons and the project name/task list sit inside that same card (see "Home — collapsible cards" below for why `data-open-project` is on `.cat-body` and not the outer `<details>`).
- Its own card — no heatmap inside it. The Activity heatmap lives in a separate card immediately below (see next).
- **‹/› is an in-place update, not a full `render()`** (`updateActiveProjectCard()`): clicking nav used to call `render()`, which re-runs `animateNumbers()` over the whole page (it's a plain `document.querySelectorAll('.num[data-target]')`, not scoped to what changed) — every other card's numbers, notably the unrelated Finance snapshot, would replay their count-up animation as if the page had reloaded. `updateActiveProjectCard()` regenerates only this card's `<details data-home-card="active-project">` via `activeProjectCardHtml(layout, delay)`, swaps it in with `replaceWith`, preserves its open/closed state across the swap, and re-binds its contents with `bindActiveProjectCardEvents()` (nav buttons stay in-place-update; `data-open-project`/`data-toggle-proj-task` inside it still do a full `render()`, same as always, since those legitimately affect other cards — Projects page, Activity heatmap). `bindHomeEvents()`'s own `[data-home-proj-nav]` binding (bound once per full render, over all of `main`) calls the same `updateActiveProjectCard()`.

**Home — collapsible cards** (`renderLifeHome`, `js/pages/home.js`): every card on Home (Today's schedule, Today's focus, Commitments, Finance, Active project, Activity) is a native `<details class="card cat-card" open>`/`<summary>`/`.cat-body` — the exact same collapse pattern, chevron icon, and CSS (`details.cat-card`, `.chevron`, `.cat-body` in `css/styles.css`) as Commitments' category cards (see "Commitments — categories" above). `open` is hardcoded on every card on every render (not persisted in state), matching Commitments' own behavior — collapsing a card survives in-place DOM updates (e.g. ticking a checkbox) but resets to open on any interaction that triggers a full `render()`. The Active project card's `data-open-project` (click-to-navigate) sits on `.cat-body` rather than the outer `<details>`, since the card header is now the collapse toggle — only the body (title/progress/task list) navigates to Projects on click, not the header.

**Same collapsible pattern extended to Schedule and Commitments' compliance card** (`js/pages/schedule.js`, `js/pages/commitments.js`): Schedule's Calendar card and its day's-events card, and Commitments' top "Today's Compliance" ring card, are `<details class="card cat-card" open>`/`<summary>`/`.cat-body`, identical to Home's cards above — `open` hardcoded on every render, not persisted. The compliance card keeps its overall `%` visible in the summary itself (`[data-compliance-summary-pct]`, kept in sync by `updateComplianceRing()` alongside the ring/bars) specifically so the score is still readable while the card is collapsed.

**Commitments — History is its own section, not a collapsible card**: styled to read as a second, clearly separate section from "Main Quest" — a plain `.commit-quest-label` ("History", same styling/spacing as "⚔️ Main Quest" above the category cards) sits above a plain `.card` holding the Day/Week/Month/Year tabs and `tabBodyHtml`. Deliberately *not* a `<details>`/`.cat-card` (that was tried and reverted) — the label-outside-a-plain-card shape is what visually separates it from "Main Quest"'s category-card stack, rather than making History look like just another collapsible card in the same list.

**Projects — two independent levels of collapse** (`renderProjectCard()`, `js/pages/projects.js`): each project is a `<details class="card cat-card proj-card" open>` — name/status/deadline/edit/delete move into `<summary>` (a `.proj-card-header` wrapper keeps them grouped so `justify-content:space-between` in the summary CSS puts only the chevron on the right; `data-del-proj`'s handler needs `e.stopPropagation()` for this reason — without it, deleting would also toggle the card, since a click's `stopPropagation()` on a descendant is what stops a native `<summary>` from treating that click as its own toggle), description/progress bar/task-list move into `.cat-body`, and the collapsed-state summary shows a `doneTasks/totalTasks · pct%` meta pill so that much stays visible either way. Nested one level deeper, the task list itself is a *separate*, independently-collapsible `<details class="proj-tasks-details">`/`<summary class="proj-expand-btn">` (reusing `.chevron` with its own rotate rule, since it isn't a `.cat-card`) — collapsing/expanding the outer card doesn't affect whether the inner task list remembers its own open state, and vice versa. That inner one is the one exception to the hardcoded-`open` convention: its expand state is intentionally persisted in `state.expandedProjectIds`, because Home's "jump to project" deep-link (`data-open-project` in `renderLifeHome`) needs a specific project to land pre-expanded with its tasks already visible. The `toggle` event on that inner `<details>` just syncs `expandedProjectIds` — no `render()` call, since the browser already shows/hides the task list on its own; this replaced the old `data-toggle-proj-expand` button+`render()` version, so expanding one project's tasks no longer replays every other card's entrance animation. The outer card-level collapse, by contrast, follows the normal hardcoded-`open` convention (resets on every full render, same as Home/Schedule/Commitments) since nothing else needs it to persist.

**Home — Activity heatmap** (`renderHomeActivityHeatmap()` + `buildHomeActivityEvents()` / `buildHomeActivityData()`, `js/pages/home.js`; own `.card`, rendered right after the "Active project" card in both Stacked and Hero layouts): a single GitHub-style contribution grid combining **project tasks completed**, **commitments checked**, and **schedule blocks marked done**, plus a chronological feed of the underlying events below it (tagged `Project` / `Do` / `Don't` / `Schedule`). Replaced the older per-project-only `renderProjectHeatmap()`.
- **Counting rule** (`buildHomeActivityEvents()`): 1 activity = 1 completed `project_tasks` row (`completed_at` on that day) **or** 1 `goal_logs` row with `checked = true` on that day — a counter commitment (e.g. "Cold DM" 3×/day) still counts as exactly **1** activity once it crosses its `target_count`, not 3. `Don't`-type commitments count the same as `Do`-type when checked. Recomputed from current state on every render (not an append-only event log), so unchecking something the same day removes it from that day's count automatically.
- **Intensity**: 4 shades of `--accent` (`.act-low`/`.act-mid`/`.act-high`/`.act-max`, via `activityLevelClass()`), bucketed relative to that year's single busiest day — mirrors GitHub's own relative (not absolute) shading.
- **Year selector**: `<select data-heatmap-year-select>` (`.hm-year-select`) lists every year from the earliest activity through the current year, most recent first — replaced the old ‹/› arrow-button nav. Changing it also clears any active day filter (see next). Selected year lives in `state.heatmapYear`.
- **Activity feed**: below the grid, a chronological list (`.act-feed-list`) of every event in the selected year — project tasks tagged `Project` (`--accent`), commitments tagged `Do` (`--good`) or `Don't` (`--danger`) — newest first, each row showing title, source (project name / commitment category), and a relative timestamp. `goal_logs` rows written before `completed_at` existed fall back to midday on their `date` so they still appear (just without an exact time).
- **Click-to-filter**: clicking a heatmap cell with activity (`data-act-day="<iso>"`) sets `state.homeActivityDayFilter` to that date and narrows the feed to just that day (click the same cell again, or the `× <date>` clear pill, to reset). Selected cell gets a `.act-selected` outline.

### Finance Tab

| Route | Page | Description |
|---|---|---|
| `finance:overview` | Overview | 3 metric cards (income this month, spent today, total debt). Overdue/soon alert pill. 7-day spending bar chart. |
| `finance:income` | Income | Total income this month + entry count + average. Full log sorted by date. `+ Log income` sits top-right of the page header (`.projects-header`/`.add-btn-inline`, reused from Projects), not at the bottom of the card. Add/edit/delete entries. |
| `finance:spending` | Spending | Today's total + category breakdown pills (Food/Transport/Shopping/Other). "Recent" list capped at 5 rows + a "Show all N activities"/"Show less" toggle (`state.spendingShowAll`, `.act-feed-toggle`), mirroring Home's Activity feed — resets to capped whenever the Daily/Weekly/Monthly filter or the date picker changes. `+ Log spend` sits top-right of the page header, same as Income. Add/edit/delete entries. |
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
Commitments also upsert `goal_logs` for the day — `{ checked, count, completed_at }` together, where `checked` is always recomputed as `count >= goal.target_count` (see "Counter-based commitments" above) and `completed_at` is stamped `new Date().toISOString()` only on the transition into checked, cleared to `null` only on the transition back out (a counter bump that doesn't cross that boundary leaves it as-is). Project task toggle and the schedule-block "done" checkbox (`toggleScheduleDone()`, `js/pages/schedule.js`, shared by the Schedule page and Home) likewise set/clear their own `completed_at` — schedule's toggle does a full `render()` rather than an in-place DOM update, since it also needs to recompute the "Missed" tag. All three feed Home's combined Activity heatmap/feed (see "Home — Activity heatmap" above).

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
9. **`goal_logs.completed_at`** — added to `schema.sql` and `schema_fix.sql` (section 19) so commitments can feed Home's combined Activity heatmap/feed alongside project tasks (see "Home — Activity heatmap" above). **Run `schema_fix.sql` on the live DB** — until then, checking off a commitment fails outright (Postgrest rejects the `UPDATE`/upsert referencing the unknown `completed_at` column).
10. **`schedule_events.repeat` / `schedule_events.series_id`** — added to `schema.sql` and `schema_fix.sql` (section 20) to support recurring events and the reminder-offset rewrite (2026-09-13, see the Schedule row above). **Run `schema_fix.sql` on the live DB** — until then, adding *any* schedule event fails outright (Postgrest rejects the `INSERT` referencing the unknown `repeat`/`series_id` columns), not just recurring ones.
11. **`goals.reminder_time`** — added to `schema.sql` and `schema_fix.sql` (section 21) to support Commitments' daily reminder cue (2026-09-17, see "Commitments — daily reminders" above). **Run `schema_fix.sql` on the live DB** — until then, adding/editing a commitment with the "Daily reminder" toggle on fails outright (Postgrest rejects insert/update referencing the unknown `reminder_time` column).
