-- HQ Dashboard — Supabase Schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ============================================================
-- PROFILES
-- ============================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default 'Friend',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select using (auth.uid() = id);

create policy "Users can insert own profile"
  on profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on profiles for update using (auth.uid() = id);

-- ============================================================
-- SCHEDULE EVENTS
-- ============================================================
create table if not exists schedule_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  time text not null default '09:00',
  title text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

alter table schedule_events enable row level security;

create policy "Users can manage own schedule_events"
  on schedule_events for all using (auth.uid() = user_id);

create index if not exists schedule_events_user_date on schedule_events(user_id, date);

-- ============================================================
-- GOALS
-- ============================================================
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('do', 'dont')),
  text text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table goals enable row level security;

create policy "Users can manage own goals"
  on goals for all using (auth.uid() = user_id);

create index if not exists goals_user_id on goals(user_id);

-- ============================================================
-- HABITS
-- ============================================================
create table if not exists habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  streak int not null default 0,
  created_at timestamptz not null default now()
);

alter table habits enable row level security;

create policy "Users can manage own habits"
  on habits for all using (auth.uid() = user_id);

create index if not exists habits_user_id on habits(user_id);

-- ============================================================
-- HABIT LOGS
-- ============================================================
create table if not exists habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references habits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  checked boolean not null default false,
  unique(habit_id, date)
);

alter table habit_logs enable row level security;

create policy "Users can manage own habit_logs"
  on habit_logs for all using (auth.uid() = user_id);

create index if not exists habit_logs_habit_date on habit_logs(habit_id, date);

-- ============================================================
-- FOCUS BOARD  (one row per user — upserted)
-- ============================================================
create table if not exists focus_board (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  main_focus text not null default '',
  created_at timestamptz not null default now()
);

alter table focus_board enable row level security;

create policy "Users can manage own focus_board"
  on focus_board for all using (auth.uid() = user_id);

-- ============================================================
-- FOCUS TASKS
-- ============================================================
create table if not exists focus_tasks (
  id uuid primary key default gen_random_uuid(),
  focus_id uuid not null references focus_board(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  checked boolean not null default false,
  created_at timestamptz not null default now()
);

alter table focus_tasks enable row level security;

create policy "Users can manage own focus_tasks"
  on focus_tasks for all using (auth.uid() = user_id);

create index if not exists focus_tasks_focus_id on focus_tasks(focus_id);

-- ============================================================
-- INCOME ENTRIES
-- ============================================================
create table if not exists income_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  source text not null,
  amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table income_entries enable row level security;

create policy "Users can manage own income_entries"
  on income_entries for all using (auth.uid() = user_id);

create index if not exists income_entries_user_id on income_entries(user_id, date);

-- ============================================================
-- SPENDING ENTRIES
-- ============================================================
create table if not exists spending_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  time text not null default '00:00',
  category text not null default 'Other',
  note text not null default '',
  amount numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table spending_entries enable row level security;

create policy "Users can manage own spending_entries"
  on spending_entries for all using (auth.uid() = user_id);

create index if not exists spending_entries_user_id on spending_entries(user_id, date);

-- ============================================================
-- DEBTS
-- ============================================================
create table if not exists debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  creditor text not null,
  amount numeric(18,2) not null default 0,
  due_date date not null,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);

alter table debts enable row level security;

create policy "Users can manage own debts"
  on debts for all using (auth.uid() = user_id);

create index if not exists debts_user_id on debts(user_id);
