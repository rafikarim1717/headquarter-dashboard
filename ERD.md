# ERD.md — Entity Relationship Document

> Last synced against `js/app.js` / `js/supabase.js` on 2026-07-07. The **Habits**, **Focus** (`habits`, `habit_logs`, `focus_board`, `focus_tasks`) tables described in older versions of this document no longer exist in the app — they were replaced by **Commitments** (`goals` + `goal_logs`) and **Projects** (`projects` + `project_tasks`). Those tables may still linger in a live DB as unused leftovers; safe to drop.

## Tables

---

### `profiles`

Stores the display name for each authenticated user. One row per user.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | — | **PK** · References `auth.users(id)` · cascade delete |
| `name` | text | YES | `'Friend'` (schema.sql) | Display name shown in greeting |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `id → auth.users(id)` ON DELETE CASCADE
**RLS:** Enabled — select/insert/update/delete restricted to `auth.uid() = id`
**Operations in code:** `select * where id = userId` (maybeSingle), `upsert` on first login, `update name` via Tweaks panel

---

### `schedule_events`

One row per calendar event. Events belong to a user and a date.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `date` | date | NOT NULL | — | Event date (ISO YYYY-MM-DD) |
| `time` | text | YES | `'09:00'` (schema.sql) | Start time "HH:MM" |
| `title` | text | YES | — | Event name |
| `note` | text | YES | `''` (schema.sql) | Sub-title / note |
| `alarm_time` | text | YES | — | **[MISSING FROM SCHEMA FILES — run `ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS alarm_time text;`]** Alarm "HH:MM", nullable |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id, date)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId`, `insert` (add event — includes `alarm_time`), `update` (edit — time/title/note/alarm_time), `delete` (by id)

---

### `goals`

Do's and Don'ts — behavioral commitments the user sets for themselves. Backs the **Commitments** page (formerly separate Goals/Habits pages). The static item list only; per-day check-off state lives in `goal_logs`, not on this row.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `type` | text | YES | — | `'do'` or `'dont'` (check constraint in schema.sql) |
| `text` | text | YES | — | Goal description text |
| `checked` | boolean | NOT NULL | `false` | **Legacy column** — no longer read or written by the app; per-day state now lives in `goal_logs` |
| `order_index` | integer | NOT NULL | `0` | Manual sort position within its `type` (dos/donts ordered independently). Set on insert; reordered via HTML5 drag-and-drop on the Commitments page (no arrow buttons). **[Only in `schema_fix.sql` section 13 — must be run against the live DB, see Schema Gaps]** |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by order_index, created_at`, `insert` (add, with `order_index`), `update text` (edit), `update order_index` (drag-to-reorder, one update per affected row), `delete`

---

### `goal_logs`

Daily check-off log for each commitment. One row per `(goal_id, date)`. Drives the daily compliance ring (Home + Commitments) and the Commitments **Day / Week / Month / Year** history views.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `goal_id` | uuid | NOT NULL | — | **FK** → `goals(id)` cascade delete |
| `date` | date | NOT NULL | — | Log date (ISO YYYY-MM-DD) |
| `checked` | boolean | NOT NULL | `false` | Whether the commitment was checked that day |
| UNIQUE | — | — | — | `(goal_id, date)` — one log per goal per day |

**Primary Key:** `id`
**Foreign Keys:**
- `user_id → auth.users(id)` ON DELETE CASCADE
- `goal_id → goals(id)` ON DELETE CASCADE
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId` (bulk load), `upsert (goal_id, date)` on toggle (from both the Commitments page and the Today page preview)
**Status:** **[MISSING FROM SCHEMA FILES]** — entire table absent from `schema.sql`/`schema_fix.sql`. Must be created manually (see Schema Gaps).

---

### `projects`

A project: an objective broken into small tasks with a progress bar and activity heatmap. Replaced the old single-board Focus page.

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
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by created_at`, `insert` (add), `update name/description/status/deadline/updated_at` (edit), `delete` (behind a confirm modal — cascades to `project_tasks`)
**Status:** **[MISSING FROM SCHEMA FILES]** — added to `schema_fix.sql` section 11. Must be run against the live DB (see Schema Gaps).

---

### `project_tasks`

Sub-tasks under a project.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `project_id` | uuid | NOT NULL | — | **FK** → `projects(id)` cascade delete |
| `text` | text | NOT NULL | — | Task title |
| `description` | text | YES | — | Optional long-form description |
| `checked` | boolean | NOT NULL | `false` | Task completion state |
| `completed_at` | timestamptz | YES | — | Set to `now()` when `checked` flips to `true`, cleared to `NULL` on uncheck. Drives the Home "Active project" activity heatmap — a day is "green" if any task in the project has `completed_at` on that date. |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:**
- `user_id → auth.users(id)` ON DELETE CASCADE
- `project_id → projects(id)` ON DELETE CASCADE
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by created_at`, `insert` (add task), `update checked, completed_at` (toggle), `update text/description` (edit), `delete`
**Status:** **[MISSING FROM SCHEMA FILES]** — added to `schema_fix.sql` section 12 (including `completed_at`). Must be run against the live DB — until then, checking off a task fails outright since Postgrest rejects the whole `UPDATE` when `completed_at` is unknown (see Schema Gaps).

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
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by date desc`, `insert` (add), `update date/source/amount` (edit), `delete`

---

### `spending_entries`

Spending/expense log entries.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `date` | date | NOT NULL | — | Spending date |
| `time` | text | YES | `'00:00'` (schema.sql) | Time "HH:MM" (auto-set to now on add) |
| `category` | text | YES | `'Other'` (schema.sql) | One of: Food / Transport / Shopping / Other |
| `note` | text | YES | `''` (schema.sql) | Description |
| `amount` | numeric(18,2) | NOT NULL | `0` | Spending amount |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id, date)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by date desc`, `insert` (add), `update category/amount/note/time` (edit), `delete`

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
| `paid` | boolean | NOT NULL | `false` | Whether debt has been settled |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by due_date`, `insert` (add), `update creditor/amount/due_date` (edit), `update paid` (mark paid / unpaid), `delete`

---

### `notes`

Freeform rich-text notes.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `title` | text | YES | `''` | Note title |
| `content` | text | YES | `''` | Note body as HTML (from contenteditable) |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |
| `updated_at` | timestamptz | YES | — | Last save timestamp (set on every autosave) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**RLS:** Should be enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by updated_at desc`, `insert` (new note), `update title/content/updated_at` (autosave, debounced 1000ms), `delete`
**Status:** **[MISSING FROM SCHEMA FILES]** — queried in code but not defined in any schema file. Must be created manually (see Schema Gaps).

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
  │
  ├──< goals (1:many)
  │       user_id ─────── auth.users.id
  │       │
  │       └──< goal_logs (1:many per goal)
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
  ├──< income_entries (1:many)
  │       user_id ─────── auth.users.id
  │
  ├──< spending_entries (1:many)
  │       user_id ─────── auth.users.id
  │
  ├──< debts (1:many)
  │       user_id ─────── auth.users.id
  │
  └──< notes (1:many)  ← [SCHEMA MISSING]
          user_id ─────── auth.users.id
```

**Cardinality key:**
- `──<` = one-to-many (parent ── child)
- `(1:1)` = enforced by UNIQUE constraint on FK column

---

## Table × Page Usage Matrix

| Table | Home | Schedule | Commitments | Projects | Notes | F:Overview | F:Income | F:Spending | F:Debts |
|---|---|---|---|---|---|---|---|---|---|
| `profiles` | R | — | — | — | — | — | — | — | — |
| `schedule_events` | R | R W | — | — | — | — | — | — | — |
| `goals` | R | — | R W | — | — | — | — | — | — |
| `goal_logs` | R W | — | R W | — | — | — | — | — | — |
| `projects` | R | — | — | R W | — | — | — | — | — |
| `project_tasks` | R | — | — | R W | — | — | — | — | — |
| `income_entries` | — | — | — | — | — | R | R W | — | — |
| `spending_entries` | — | — | — | — | — | R | — | R W | — |
| `debts` | — | — | — | — | — | R | — | — | R W |
| `notes` | — | — | — | — | R W | — | — | — | — |

**R** = Read only, **W** = Read + Write (insert / update / delete)

Home writes to `goal_logs` (Today's commitments preview check-off) and reads `projects`/`project_tasks` for the "Active project" card (progress bar + heatmap + carousel).
All data is bulk-loaded once on login in `loadFromSupabase()` via a single `Promise.all()`.

---

## Schema Gaps to Fix

Run the following in the Supabase SQL Editor (also covered by `schema_fix.sql`) to bring the live DB up to date with what the app code expects:

```sql
-- 1. alarm_time on schedule_events
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS alarm_time text;

-- 2. goals.order_index (Commitments drag-to-reorder)
ALTER TABLE goals ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id, type ORDER BY created_at) - 1 AS rn
  FROM goals
)
UPDATE goals SET order_index = ranked.rn
FROM ranked WHERE goals.id = ranked.id AND goals.order_index = 0;

-- 3. goal_logs table (full creation)
CREATE TABLE IF NOT EXISTS goal_logs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id    uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date       date NOT NULL,
  checked    boolean NOT NULL DEFAULT false,
  UNIQUE (goal_id, date)
);
ALTER TABLE goal_logs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "goal_logs_all" ON goal_logs FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. projects + project_tasks tables — see schema_fix.sql sections 11–12

-- 5. notes table (full creation)
CREATE TABLE IF NOT EXISTS notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL DEFAULT '',
  content    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "notes_all" ON notes FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE INDEX IF NOT EXISTS notes_user_updated ON notes(user_id, updated_at DESC);
```

## Deprecated Tables (no longer referenced by the app)

`habits`, `habit_logs`, `focus_board`, `focus_tasks` — replaced by `goals`+`goal_logs` (Commitments) and `projects`+`project_tasks` (Projects). If these still exist in the live DB or in `schema.sql`/`schema_fix.sql`, they are safe to ignore or drop.
