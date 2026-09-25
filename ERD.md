# ERD.md — Entity Relationship Document

> Last audited against `js/supabase.js` (`loadFromSupabase()`), the page files and both schema files on 2026-09-25 (no schema changes since `custom_stations` on 2026-09-20).
>
> **Schema files:** `schema.sql` is a fresh-project schema (every table below **except `projects` and `project_tasks`**). `schema_fix.sql` is the idempotent, numbered (sections 1–22) version that also backfills columns onto an existing DB — run it on the live DB after any schema change; it contains every table below.
>
> **Legacy tables** `habits`, `habit_logs`, `focus_board`, `focus_tasks` still exist in both schema files but **no code reads or writes them** — they were replaced by Commitments (`goals` + `goal_logs`) and Projects (`projects` + `project_tasks`) and are safe to drop.

Non-unique indexes listed per table are the ones `schema.sql` creates; `schema_fix.sql` itself only creates `goal_logs(goal_id, date)` and `schedule_events(series_id)`.

All tables have Row Level Security enabled with policies restricting every operation to the owning user (`auth.uid() = user_id`, or `= id` for `profiles`). All app queries also filter `user_id = auth.uid()`. All reads happen once at login in a single `Promise.all()` in `loadFromSupabase()`; writes go through `dbCall()` (retry once).

## Tables

---

### `profiles`

Stores the display name and the Notes editor's saved default style. One row per user (created by `seedSampleData()` on first login).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | — | **PK** · References `auth.users(id)` · cascade delete |
| `name` | text | YES | `'Friend'` (schema.sql) | Display name shown in the greeting. Auth metadata (`full_name` → `name` → email prefix) takes priority over this value on load |
| `note_default_style` | jsonb | YES | — | `{ fontFamily, fontSize, fontWeight, color }` from the Notes editor's "Save as my default style"; `NULL` = none saved |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `id → auth.users(id)` ON DELETE CASCADE
**RLS:** select / insert / update / delete restricted to `auth.uid() = id`
**Operations in code:** `select * where id = userId` (maybeSingle), `upsert` on first login, `update name` via the Tweaks panel, `update note_default_style` via the Notes editor

---

### `schedule_events`

One row per calendar event occurrence. Recurring events are stored as many real rows sharing a `series_id`.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `date` | date | NOT NULL | — | Event date (ISO YYYY-MM-DD) |
| `time` | text | YES | `'09:00'` (schema.sql) | Start time "HH:MM" |
| `title` | text | YES | — | Event name |
| `note` | text | YES | `''` (schema.sql) | Sub-title / note |
| `alarm_time` | text | YES | — | Alarm "HH:MM" computed from the "Remind me" dropdown (at time / N min before / custom); `NULL` = no reminder |
| `completed_at` | timestamptz | YES | — | Set to `now()` when the block's checkbox is ticked, `NULL` when unticked. A past, uncompleted block shows a "Missed" tag; completed blocks feed Home's Activity heatmap/feed |
| `repeat` | text | NOT NULL | `'none'` | `'none'` \| `'daily'` \| `'weekdays'` \| `'weekly'` — set on Add only |
| `series_id` | uuid | YES | — | Shared by every row generated from one recurring Add; `NULL` for non-recurring events |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id, date)`, `(series_id)`
**Operations in code:** `select * where user_id = userId` (grouped by date client-side), `insert` (Add — one row per occurrence: 90 days ahead for daily/weekdays, 26 occurrences for weekly), `update time/title/note/alarm_time` (Edit), `update completed_at` (done checkbox), `delete by id`, `delete where series_id = … and date >= today` (opt-in "delete the rest of the series")

---

### `goals`

The static list of **commitments** (one flat list — the old Do/Don't split was removed). Per-day state lives in `goal_logs`, not on this row.

A commitment's **kind** is *derived* from `target_count` + `unit` (there is no `kind` column): `unit` = `menit`/`detik` ⇒ **Duration** (logged only via a Start/Stop timer); any other non-empty `unit`, or `target_count > 1` ⇒ **Count**; otherwise **Yes/No**.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `type` | text | NOT NULL | — | `'do'` \| `'dont'` (check constraint in schema.sql). **Legacy** — the app always inserts `'do'` and never reads it |
| `text` | text | YES | — | Commitment name |
| `checked` | boolean | NOT NULL | `false` | **Legacy** — no longer read or written; per-day state lives in `goal_logs` |
| `order_index` | integer | NOT NULL | `0` | Manual sort position across all commitments. Set on insert; rewritten for every item on drag-and-drop reorder. Load order: `order_index`, then `created_at` |
| `target_count` | integer | NOT NULL | `1` | Daily target: number of times (Count), minutes/seconds (Duration), or `1` (Yes/No) |
| `unit` | text | YES | — | Label for the target (`'x'`, `'DM'`, `'waktu'`, `'halaman'`, …) or `'menit'`/`'detik'` for a Duration; `NULL` for Yes/No |
| `category` | text | NOT NULL | `'General'` | Life area used to group commitments (presets: Olahraga, Kerja, Learning, Spiritual, Personal & Mental; any custom text allowed) |
| `reminder_time` | text | YES | — | Daily reminder cue "HH:MM"; fires once at that time and once ~45 min later if still not done; `NULL` = none |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**Operations in code:** `select * where user_id = userId order by order_index, created_at`, `insert` (Add — with `type: 'do'`, `order_index`, `target_count`, `unit`, `category`, `reminder_time`), `update text/target_count/unit/category/reminder_time` (Edit — also how a commitment's type is changed), `update order_index` (drag-to-reorder), `delete` (cascades to its `goal_logs`)

---

### `goal_logs`

The daily log for each commitment. One row per `(goal_id, date)`, created on the first log of a day by an upsert.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `goal_id` | uuid | NOT NULL | — | **FK** → `goals(id)` cascade delete |
| `date` | date | NOT NULL | — | Log date (ISO YYYY-MM-DD) |
| `checked` | boolean | NOT NULL | `false` | **Always `count >= goals.target_count`** — "target fully hit". Drives streaks, reminders, "N / M done" counts and Home's Activity feed |
| `count` | integer | NOT NULL | `0` | That day's logged amount toward `target_count` (times, or minutes/seconds). Compliance percentages use `min(count / target_count, 1)` — **partial credit** — not `checked` |
| `completed_at` | timestamptz | YES | — | Set to `now()` when `checked` flips to true, cleared to `NULL` when it flips back; unchanged by count changes that don't cross the boundary. Feeds Home's Activity feed (falls back to midday on `date` when `NULL`) |
| UNIQUE | — | — | — | `(goal_id, date)` — one log per goal per day |

**Primary Key:** `id`
**Foreign Keys:**
- `user_id → auth.users(id)` ON DELETE CASCADE
- `goal_id → goals(id)` ON DELETE CASCADE
**Indexes:** `(goal_id, date)` (plus the unique constraint)
**Operations in code:** `select * where user_id = userId` (bulk load), `upsert on (goal_id, date)` writing `{ checked, count, completed_at }` — from the Commitments page (`setGoalCountToday()`: checkbox, `+N/−1`, typed amount, duration timer) and from Home's Today's-commitments quick-log controls

---

### `projects`

A project: an objective broken into small tasks with a progress bar. Replaced the old single-board Focus page. **Only in `schema_fix.sql` (section 11).**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `name` | text | NOT NULL | — | Project name |
| `description` | text | YES | — | Optional, shown truncated on the card |
| `status` | text | NOT NULL | `'active'` | `'active'` \| `'on_hold'` \| `'done'` |
| `deadline` | date | YES | — | Optional |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | timestamptz | NOT NULL | `now()` | Bumped on every edit |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Operations in code:** `select * where user_id = userId order by created_at`, `insert` (New Project), `update name/description/status/deadline/updated_at` (Edit Project), `delete` (behind a confirm modal — cascades to `project_tasks`)

---

### `project_tasks`

Sub-tasks under a project. **Only in `schema_fix.sql` (section 12).**

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `project_id` | uuid | NOT NULL | — | **FK** → `projects(id)` cascade delete |
| `text` | text | NOT NULL | — | Task title |
| `description` | text | YES | — | Optional long-form description |
| `checked` | boolean | NOT NULL | `false` | Task completion state |
| `completed_at` | timestamptz | YES | — | Set to `now()` when `checked` flips to `true`, cleared on uncheck. Feeds Home's Activity heatmap/feed (1 task completed that day = 1 activity) |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:**
- `user_id → auth.users(id)` ON DELETE CASCADE
- `project_id → projects(id)` ON DELETE CASCADE
**Operations in code:** `select * where user_id = userId order by created_at` (grouped under their project client-side), `insert` (Add Task), `update checked, completed_at` (toggle), `update text/description` (Edit Task), `delete`. The Projects page can also turn a task into a `schedule_events` row ("Assign to Today's Schedule" — insert only, no link back to the task)

---

### `today_focus_items`

Home's "Today's focus" quick priority list.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `text` | text | NOT NULL | — | The priority |
| `checked` | boolean | NOT NULL | `false` | Done state |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp; the list loads `order by created_at` |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**Operations in code:** `select … order by created_at`, `insert` (Add), `update checked` (toggle), `delete` (immediate, no confirm). Not seeded for new users

---

### `custom_stations`

The ambient music widget's user-added YouTube stations (topbar, Tweaks panel). Loaded into `window.__HQ_TWEAKS.customStations`, not `state`. Previously `localStorage`-only (device-scoped); moved here so stations follow the user across devices.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `name` | text | NOT NULL | `''` | Station label shown in the picker |
| `url` | text | NOT NULL | `''` | A YouTube link; `extractYouTubeId()` parses the video id client-side |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp; the list loads `order by created_at` |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**Operations in code:** `select … order by created_at`, `insert` (+ Add station — a blank row, awaited so it has a real id before it's added to state), `update name/url` (debounced 1000ms per keystroke), `delete` (🗑, immediate, no confirm). Not seeded for new users

---

### `income_entries`

Income log entries.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `date` | date | NOT NULL | — | Income date |
| `source` | text | YES | — | Income source description |
| `amount` | numeric(18,2) | NOT NULL | `0` | Income amount |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id, date)`
**Operations in code:** `select * where user_id = userId order by date desc`, `insert` (Log income), `update date/source/amount` (Edit), `delete`

---

### `spending_entries`

Spending/expense log entries.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `date` | date | NOT NULL | — | Spending date |
| `time` | text | YES | `'00:00'` (schema.sql) | Time "HH:MM" |
| `category` | text | YES | `'Other'` (schema.sql) | One of: Food / Transport / Shopping / Other |
| `note` | text | YES | `''` (schema.sql) | Description |
| `amount` | numeric(18,2) | NOT NULL | `0` | Spending amount |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id, date)`
**Operations in code:** `select * where user_id = userId order by date desc`, `insert` (Log spend), `update category/amount/note/time` (Edit — the date isn't editable), `delete`

---

### `debts`

Debt obligations owed to creditors.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `creditor` | text | YES | — | Name of who you owe |
| `amount` | numeric(18,2) | NOT NULL | `0` | Amount owed |
| `due_date` | date | YES | — | Payment due date |
| `paid` | boolean | NOT NULL | `false` | Whether the debt has been settled |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**Operations in code:** `select * where user_id = userId order by due_date`, `insert` (Add debt), `update creditor/amount/due_date` (Edit), `update paid` (paid ↔ unpaid toggle), `delete`

---

### `notes`

Freeform rich-text notes.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `title` | text | NOT NULL | `''` | Note title |
| `content` | text | NOT NULL | `''` | Note body as HTML (from contenteditable) |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | timestamptz | NOT NULL | `now()` | Last save timestamp (set on every autosave); the list loads `order by updated_at desc` |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)` (schema.sql)
**Operations in code:** `select * where user_id = userId order by updated_at desc`, `insert` (new note), `update title/content/updated_at` (autosave, debounced 1000ms), `delete` (confirmed)

---

## Text-Based ERD Diagram

```
auth.users (Supabase managed)
  │
  ├──< profiles (1:1)
  │       id ──────────── auth.users.id
  │
  ├──< schedule_events (1:many)
  │       user_id ─────── auth.users.id
  │       series_id ───── (shared uuid, not a FK) groups a recurring series
  │
  ├──< goals (1:many)                       ← the "commitments"
  │       user_id ─────── auth.users.id
  │       │
  │       └──< goal_logs (1:many per goal, one per day)
  │               goal_id ──── goals.id
  │               user_id ──── auth.users.id
  │               UNIQUE (goal_id, date)
  │
  ├──< projects (1:many)
  │       user_id ─────── auth.users.id
  │       │
  │       └──< project_tasks (1:many)
  │               project_id ── projects.id
  │               user_id ──── auth.users.id
  │
  ├──< today_focus_items (1:many)
  │       user_id ─────── auth.users.id
  │
  ├──< income_entries (1:many)
  │       user_id ─────── auth.users.id
  │
  ├──< spending_entries (1:many)
  │       user_id ─────── auth.users.id
  │
  ├──< debts (1:many)
  │       user_id ─────── auth.users.id
  │
  ├──< notes (1:many)
  │       user_id ─────── auth.users.id
  │
  └──< custom_stations (1:many)
          user_id ─────── auth.users.id
```

**Cardinality key:**
- `──<` = one-to-many (parent ── child)
- `(1:1)` = the child's PK is also the FK to the parent

---

## Table × Page Usage Matrix

| Table | Home | Schedule | Commitments | Projects | Notes | F:Overview | F:Income | F:Spending | F:Debts |
|---|---|---|---|---|---|---|---|---|---|
| `profiles` | R | — | — | — | R W¹ | — | — | — | — |
| `schedule_events` | R W | R W | — | W² | — | — | — | — | — |
| `goals` | R | — | R W | — | — | — | — | — | — |
| `goal_logs` | R W | — | R W | — | — | — | — | — | — |
| `projects` | R | — | — | R W | — | — | — | — | — |
| `project_tasks` | R W | — | — | R W | — | — | — | — | — |
| `today_focus_items` | R W | — | — | — | — | — | — | — | — |
| `income_entries` | R | — | — | — | — | R | R W | — | — |
| `spending_entries` | R | — | — | — | — | R | — | R W | — |
| `debts` | R | — | — | — | — | R | — | — | R W |
| `notes` | — | — | — | — | R W | — | — | — | — |

**R** = Read only, **W** = Read + Write (insert / update / delete). ¹ `profiles.note_default_style` is written by the Notes editor; `profiles.name` by the Tweaks panel (any page). ² Projects only inserts (its "Assign to Today's Schedule" action).

Home writes: `schedule_events.completed_at` (schedule checkboxes), `goal_logs` (Today's-commitments quick-log — Yes/No and Count only; Duration is read-only there), `project_tasks` (Active-project checkboxes), `today_focus_items`. Home reads `goals`/`goal_logs` for the compliance bars + Daily score, and `projects`/`project_tasks`/`schedule_events`/`goal_logs` for the Activity heatmap/feed. Finance snapshot on Home reads `income_entries`, `spending_entries`, `debts`.

`custom_stations` isn't in the matrix above since it's not page-scoped — R W from the topbar's Tweaks panel, available on every page (Focus mode's sound picker only reads it, via the same in-memory station list).

**Focus mode** (global overlay from the bottom-right FAB) has **no table** — its timer, theme and tags live only in `localStorage` (`hq.focusTimer`, `hq.focusPrefs`, `hq.focusTags`) and sessions are never written to Supabase.

All data is bulk-loaded once on login in `loadFromSupabase()` via a single `Promise.all()` (and again after the tab has been hidden for more than 5 minutes).

---

## Schema Gaps to Fix

The complete, idempotent migration is `schema_fix.sql` — running the whole file in the Supabase SQL Editor brings any older live DB up to what the app expects. The sections that matter for features added over time:

| `schema_fix.sql` section | What it adds | What breaks without it |
|---|---|---|
| 2 | `schedule_events.alarm_time`, `.completed_at` | Reminders; schedule "done"/"Missed"; Activity feed |
| 11–12 | `projects`, `project_tasks` (+ `completed_at`) | Projects page, Active project card, Activity heatmap |
| 13 | `goals.order_index` | Loading/inserting commitments |
| 14 | `notes` | Notes page |
| 15 | `today_focus_items` | Home's Today's focus |
| 16 | `goals.target_count`, `.unit`; `goal_logs` table + `.count` | Commitment types (Yes/No, Count, Duration) and daily progress — adding/editing commitments |
| 17 | `profiles.note_default_style` | Notes "default style" options |
| 18 | `goals.category` | Category grouping |
| 19 | `goal_logs.completed_at` | Logging any commitment; Activity feed |
| 20 | `schedule_events.repeat`, `.series_id` | Adding any schedule event |
| 21 | `goals.reminder_time` | Adding/editing commitments |
| 22 | `custom_stations` | Ambient music widget's custom YouTube stations — without it they load empty every login and `+ Add station` fails outright |

The Yes/No / Count / Duration types, duration timers, partial-credit compliance and ring colours introduced on 2026-09-19 need **no schema change** — they only use `goals.target_count`/`unit` and `goal_logs.count`/`checked`.

## Deprecated Tables (no longer referenced by the app)

`habits`, `habit_logs`, `focus_board`, `focus_tasks` — replaced by `goals` + `goal_logs` (Commitments) and `projects` + `project_tasks` (Projects). They are still created by `schema.sql` / `schema_fix.sql`, and may exist in the live DB; safe to ignore or drop.
