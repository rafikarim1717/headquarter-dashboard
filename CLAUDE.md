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
  'life:goals': renderGoals,
  'life:habits': renderHabits,
  'life:focus': renderFocus,
  'life:notes': renderNotes,
  'finance:overview': renderFinanceOverview,
  'finance:income': renderIncome,
  'finance:spending': renderSpending,
  'finance:debts': renderDebts
};
```

`render()` fades `<main>` out (opacity 0), waits 60ms, replaces `innerHTML` via `ROUTES[tab]()`, calls `bindMainEvents()` + `animateNumbers()` + `animateBars()`, then fades back in. The page is **always fully re-rendered** from state — no partial DOM patching (except some in-place edit updates for performance).

### In-Memory State

All data lives in `state` (defined top of `app.js`). Loaded once from Supabase on login, then all mutations write to state + fire Supabase calls in background.

```js
let state = {
  profile: { name: 'Friend' },
  schedule: {},       // { [iso-date]: [{id, time, title, sub, alarm_time}] }
  goals: { dos: [], donts: [] },
  habits: [],         // [{id, name, streak, doneToday, log:[7]}]
  focus: { main: '', tasks: [] },
  notes: [],          // [{id, title, content, created_at, updated_at}]
  income: [],
  spending: [],
  debts: [],
  selectedDay: todayISO(),
  activeTab: 'life:home',
  viewMonth: todayISO().slice(0, 7),
  activeNoteId: null,
  notesSort: 'newest',
  notesFilter: 'all',
  notesDisplay: 'grid'
};
```

UI navigation prefs (`activeTab`, `selectedDay`, `viewMonth`) are also saved to `localStorage('hq.prefs')` and restored on login.

---

## Supabase Tables

All tables use Row Level Security (RLS). Every row is owned by a user via `user_id = auth.uid()`.

### `profiles`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | References `auth.users(id)`, cascade delete |
| `name` | text | User's display name |
| `created_at` | timestamptz | Default `now()` (schema.sql) |

Operations: `select` (maybeSingle by id), `upsert` (on first login), `update` (name via Tweaks panel).

### `schedule_events`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid FK | → `auth.users` |
| `date` | date | Event date |
| `time` | text | "HH:MM" format |
| `title` | text | Event title |
| `note` | text | Subtitle/note |
| `alarm_time` | text | **[MISSING FROM SCHEMA FILES]** "HH:MM" alarm, used in code |
| `created_at` | timestamptz | Default `now()` |

Index on `(user_id, date)`.

### `goals`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `type` | text | `'do'` or `'dont'` (check constraint in schema.sql) |
| `text` | text | Goal description |
| `checked` | boolean | Default false |
| `created_at` | timestamptz | |

### `habits`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `name` | text | Habit name |
| `streak` | integer | Current streak count, updated on toggle |
| `created_at` | timestamptz | |

### `habit_logs`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `habit_id` | uuid FK | → `habits(id)`, cascade delete |
| `date` | date | Log date |
| `checked` | boolean | Default false |
| UNIQUE | `(habit_id, date)` | Prevents duplicate log per day |

Written via `upsert` on conflict `habit_id,date`.

### `focus_board`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid UNIQUE FK | → `auth.users` (one row per user) |
| `main_focus` | text | The main focus statement |
| `created_at` | timestamptz | (schema.sql only) |

One row per user. The `id` is stored in `focusBoardId` global for use in focus_tasks FK.

### `focus_tasks`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | → `auth.users` |
| `focus_id` | uuid FK | → `focus_board(id)`, cascade delete |
| `text` | text | Task title |
| `checked` | boolean | Default false |
| `description` | text | **[MISSING FROM SCHEMA FILES]** used in code |
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
| `life:home` | Today | Greeting + live clock, Today's schedule preview (5 items), Current focus statement + 3 sub-tasks, optional quick-navigation pills. Layout togglable (Stacked / Hero). |
| `life:schedule` | Schedule | Full month calendar view, day selector, event list for selected day. Add/edit/delete events. Alarm toggle per event (Web Notifications + AudioContext beep). |
| `life:goals` | Goals & Rules | Two columns: Do's and Don'ts. Progress bar based on Do's checked. Add/edit/delete/toggle goals. |
| `life:habits` | Habits | Grid of habit cards (2 cols mobile, 3 cols desktop). Each card: name, streak, 7-day dot grid, check-off. Long-press mobile to enter delete mode. Hover desktop shows edit/delete. |
| `life:focus` | Focus | Large textarea for main focus statement (autosaves debounced 600ms). Sub-tasks list with check/add/edit/delete. Each task has optional description field. |
| `life:notes` | Notes | Grid/list view of note cards. Sort (Newest/Oldest/A-Z) and filter (All/Today/Week) dropdowns. New note → rich text editor (contenteditable, toolbar: H1/H2/H3/Normal/Bold/Italic/Bullet). Heading collapse toggle. Autosaves title+content debounced 1000ms. Relative timestamps. |

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
Habits have animated delete: `card.classList.add('deleting')` → 260ms → filter state → render().

### Toggle Pattern (checkboxes)
```
[Checkbox] (data-toggle-XXX="id")
  ↓ click → mutate state → pulse(el) → render()
  ↓ dbCall(() => sb.from(...).update({ checked: ... }).eq('id', id))
```
Habits also upsert `habit_logs` and update `habits.streak`.

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

These columns/tables are used in the code but **missing from both schema files**:

1. **`notes` table** — entire table missing from schema. Create with: `id uuid PK, user_id uuid FK, title text, content text, created_at timestamptz, updated_at timestamptz`. Enable RLS.
2. **`schedule_events.alarm_time`** — `text` column, nullable. Add: `ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS alarm_time text;`
3. **`focus_tasks.description`** — `text` column, nullable. Add: `ALTER TABLE focus_tasks ADD COLUMN IF NOT EXISTS description text;`
