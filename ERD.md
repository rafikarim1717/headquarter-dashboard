# ERD.md — Entity Relationship Document

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
| `alarm_time` | text | YES | — | **[MISSING FROM SCHEMA FILES]** Alarm "HH:MM", nullable |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id, date)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId`, `insert` (add event), `update` (edit — time/title/note/alarm_time), `delete` (by id)

---

### `goals`

Do's and Don'ts — behavioral commitments the user sets for themselves.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `type` | text | YES | — | `'do'` or `'dont'` (check constraint in schema.sql) |
| `text` | text | YES | — | Goal description text |
| `checked` | boolean | NOT NULL | `false` | Whether the goal is done/checked today |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by created_at`, `insert` (add), `update checked` (toggle), `update text` (edit), `delete`

---

### `habits`

Habits tracked by the user. Streak is stored server-side and updated on toggle.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `name` | text | NOT NULL | — | Habit name |
| `streak` | integer | NOT NULL | `0` | Current consecutive-day streak |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Indexes:** `(user_id)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by created_at`, `insert` (add), `update name` (edit), `update streak` (on toggle), `delete` (also deletes habit_logs via cascade)

---

### `habit_logs`

Daily completion log for each habit. One row per habit per day.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `habit_id` | uuid | NOT NULL | — | **FK** → `habits(id)` cascade delete |
| `date` | date | NOT NULL | — | Log date (ISO YYYY-MM-DD) |
| `checked` | boolean | NOT NULL | `false` | Whether habit was done this day |
| UNIQUE | — | — | — | `(habit_id, date)` — one log per habit per day |

**Primary Key:** `id`
**Foreign Keys:**
- `user_id → auth.users(id)` ON DELETE CASCADE
- `habit_id → habits(id)` ON DELETE CASCADE
**Indexes:** `(habit_id, date)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId` (bulk load), `upsert (habit_id, date)` on toggle, `delete where habit_id = id` when habit deleted

---

### `focus_board`

Single row per user storing their current main focus statement.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL UNIQUE | — | **FK** → `auth.users(id)` cascade delete · 1 row per user |
| `main_focus` | text | YES | `''` (schema.sql) | The focus statement text |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp (schema.sql only) |

**Primary Key:** `id`
**Foreign Keys:** `user_id → auth.users(id)` ON DELETE CASCADE
**Unique Constraint:** `user_id` — enforces one row per user
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId` (maybeSingle), `insert` (on first login or if no row exists), `update main_focus` (debounced textarea autosave)

---

### `focus_tasks`

Sub-tasks under the user's focus board.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | NOT NULL | — | **FK** → `auth.users(id)` cascade delete |
| `focus_id` | uuid | YES | — | **FK** → `focus_board(id)` cascade delete |
| `text` | text | YES | — | Task title |
| `checked` | boolean | NOT NULL | `false` | Task completion state |
| `description` | text | YES | — | **[MISSING FROM SCHEMA FILES]** Optional long-form description |
| `created_at` | timestamptz | NOT NULL | `now()` | Row creation timestamp |

**Primary Key:** `id`
**Foreign Keys:**
- `user_id → auth.users(id)` ON DELETE CASCADE
- `focus_id → focus_board(id)` ON DELETE CASCADE
**Indexes:** `(focus_id)`
**RLS:** Enabled — all operations restricted to `auth.uid() = user_id`
**Operations in code:** `select * where user_id = userId order by created_at`, `insert` (add task), `update checked` (toggle), `update text/description` (edit), `delete`

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
**Operations in code:** `select * where user_id = userId order by due_date`, `insert` (add), `update creditor/amount/due_date` (edit), `update paid = true` (mark paid), `delete`

---

### `notes` *(MISSING FROM SCHEMA FILES)*

Freeform rich-text notes. Table is queried in code but not defined in any schema file. Must be created manually.

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
**Operations in code:** `select * where user_id = userId order by updated_at desc`, `insert` (new note), `update title/content/updated_at` (autosave), `delete`

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
  │
  ├──< habits (1:many)
  │       user_id ─────── auth.users.id
  │       │
  │       └──< habit_logs (1:many per habit)
  │               habit_id ─── habits.id
  │               user_id ──── auth.users.id
  │               UNIQUE (habit_id, date)
  │
  ├──< focus_board (1:1)
  │       user_id ─────── auth.users.id  [UNIQUE]
  │       │
  │       └──< focus_tasks (1:many)
  │               focus_id ─── focus_board.id
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

| Table | Today | Schedule | Goals | Habits | Focus | Notes | F:Overview | F:Income | F:Spending | F:Debts |
|---|---|---|---|---|---|---|---|---|---|---|
| `profiles` | R | — | — | — | — | — | — | — | — | — |
| `schedule_events` | R | R W | — | — | — | — | — | — | — | — |
| `goals` | — | — | R W | — | — | — | — | — | — | — |
| `habits` | — | — | — | R W | — | — | — | — | — | — |
| `habit_logs` | — | — | — | R W | — | — | — | — | — | — |
| `focus_board` | R | — | — | — | R W | — | — | — | — | — |
| `focus_tasks` | R W | — | — | — | R W | — | — | — | — | — |
| `income_entries` | — | — | — | — | — | — | R | R W | — | — |
| `spending_entries` | — | — | — | — | — | — | R | — | R W | — |
| `debts` | — | — | — | — | — | — | R | — | — | R W |
| `notes` | — | — | — | — | — | R W | — | — | — | — |

**R** = Read only, **W** = Read + Write (insert / update / delete)

Today page writes to `focus_tasks` (toggle checkbox) even though it only renders a 3-item preview.
All data is bulk-loaded once on login in `loadFromSupabase()`.

---

## Schema Gaps to Fix

Run the following in Supabase SQL Editor to add missing columns and table:

```sql
-- 1. alarm_time on schedule_events
ALTER TABLE schedule_events ADD COLUMN IF NOT EXISTS alarm_time text;

-- 2. description on focus_tasks
ALTER TABLE focus_tasks ADD COLUMN IF NOT EXISTS description text;

-- 3. notes table (full creation)
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
