-- ============================================================
-- HQ Dashboard — schema_fix.sql
-- Derived from all Supabase .from() calls in index.html
-- Safe to re-run: uses CREATE TABLE IF NOT EXISTS +
--                 DO $$ EXCEPTION WHEN duplicate_object blocks
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. profiles
--    Operations: select/upsert/update  (key = id = auth.uid())
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id   uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "profiles_select" ON profiles
    FOR SELECT USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_insert" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_update" ON profiles
    FOR UPDATE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "profiles_delete" ON profiles
    FOR DELETE USING (auth.uid() = id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 2. schedule_events
--    Operations: select / insert / delete
--    Columns: date, time, title, note
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date       date NOT NULL,
  time       text,
  title      text,
  note       text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE schedule_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "schedule_events_select" ON schedule_events
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "schedule_events_insert" ON schedule_events
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "schedule_events_update" ON schedule_events
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "schedule_events_delete" ON schedule_events
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 3. goals
--    Operations: select / insert / update(checked) / delete
--    Columns: type, text, checked
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS goals (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       text,
  text       text,
  checked    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE goals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "goals_select" ON goals
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "goals_insert" ON goals
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "goals_update" ON goals
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "goals_delete" ON goals
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 4. habits
--    Operations: select / insert / update(streak)
--    Columns: name, streak
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habits (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  streak     integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE habits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "habits_select" ON habits
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "habits_insert" ON habits
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "habits_update" ON habits
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "habits_delete" ON habits
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 5. habit_logs
--    Operations: select / insert / upsert(habit_id,date)
--    Columns: habit_id, date, checked
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS habit_logs (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date     date NOT NULL,
  checked  boolean NOT NULL DEFAULT false,
  UNIQUE (habit_id, date)
);

ALTER TABLE habit_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "habit_logs_select" ON habit_logs
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "habit_logs_insert" ON habit_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "habit_logs_update" ON habit_logs
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "habit_logs_delete" ON habit_logs
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 6. focus_board
--    Operations: select / insert / update(main_focus)
--    Columns: main_focus
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_board (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  main_focus text
);

ALTER TABLE focus_board ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "focus_board_select" ON focus_board
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "focus_board_insert" ON focus_board
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "focus_board_update" ON focus_board
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "focus_board_delete" ON focus_board
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 7. focus_tasks
--    Operations: select / insert / update(checked) / delete
--    Columns: focus_id, text, checked
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS focus_tasks (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  focus_id   uuid REFERENCES focus_board(id) ON DELETE CASCADE,
  text       text,
  checked    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE focus_tasks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "focus_tasks_select" ON focus_tasks
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "focus_tasks_insert" ON focus_tasks
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "focus_tasks_update" ON focus_tasks
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "focus_tasks_delete" ON focus_tasks
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 8. income_entries
--    Operations: select / insert / delete
--    Columns: date, source, amount
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS income_entries (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date    date NOT NULL,
  source  text,
  amount  numeric NOT NULL DEFAULT 0
);

ALTER TABLE income_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "income_entries_select" ON income_entries
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "income_entries_insert" ON income_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "income_entries_update" ON income_entries
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "income_entries_delete" ON income_entries
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 9. spending_entries
--    Operations: select / insert / delete
--    Columns: date, time, category, note, amount
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spending_entries (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date     date NOT NULL,
  time     text,
  category text,
  note     text,
  amount   numeric NOT NULL DEFAULT 0
);

ALTER TABLE spending_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "spending_entries_select" ON spending_entries
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "spending_entries_insert" ON spending_entries
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "spending_entries_update" ON spending_entries
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "spending_entries_delete" ON spending_entries
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ────────────────────────────────────────────────────────────
-- 10. debts
--     Operations: select / insert / update(paid)
--     Columns: creditor, amount, due_date, paid
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debts (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  creditor  text,
  amount    numeric NOT NULL DEFAULT 0,
  due_date  date,
  paid      boolean NOT NULL DEFAULT false
);

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "debts_select" ON debts
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "debts_insert" ON debts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "debts_update" ON debts
    FOR UPDATE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "debts_delete" ON debts
    FOR DELETE USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
