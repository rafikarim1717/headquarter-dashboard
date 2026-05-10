# IA.md — Information Architecture

## App Overview

**Headquarter (HQ)** is a single-page application with two top-level sections: **Life** and **Finance**. Within each section are sub-pages rendered into a single `<main>` element. Navigation is either via a collapsible left sidebar (desktop) or a bottom tab bar + horizontal pill strip (mobile).

There is no routing library — the app uses a simple `state.activeTab` string (e.g. `'life:home'`, `'finance:spending'`) mapped to render functions. The URL does not change between pages.

---

## Navigation Structure

```
App
├── Life (section)
│   ├── Today          life:home
│   ├── Schedule       life:schedule
│   ├── Goals & Rules  life:goals
│   ├── Habits         life:habits
│   ├── Focus          life:focus
│   └── Notes          life:notes
└── Finance (section)
    ├── Overview        finance:overview
    ├── Income          finance:income
    ├── Spending        finance:spending
    └── Debts           finance:debts
```

### Desktop Navigation (sidebar)
- Left sidebar: 200px expanded, 60px collapsed (icon-only)
- Toggle button (« / ») collapses/expands; state persisted in `localStorage('hq.sidebar')`
- Each nav item has a Heroicons outline SVG + label text
- Active item: `background: rgba(255,255,255,0.08)`
- Collapsed mode: labels hidden, tooltip shown on hover via `#nav-tooltip`
- Section labels ("Life", "Finance") fade out when collapsed
- Footer: Sign out button

### Mobile Navigation (bottom bar + pills)
- `<nav class="bottom-nav">` — 2 buttons: **Life** (home icon) and **Finance** (chart icon)
- Tapping Life → navigates to `life:home`; tapping Finance → `finance:overview`
- Sub-nav: horizontal scrollable pill strip rendered inside `<div class="mobile-sub-nav">` as part of each page's `topbar()` output
- Active pill highlighted with accent background

### Topbar (rendered per page)
Every page renders `topbar()` which outputs:
- Greeting (time-based: Late night / Good morning / Good afternoon / Good evening)
- User name + live clock (seconds tick, cleared on re-render)
- Gear icon → opens Tweaks panel
- Mobile sign-out button
- Horizontal sub-nav pills for current section

---

## Pages

---

### Life: Today (`life:home`)

**Purpose:** At-a-glance overview of the current day.

**Features:**
- Time-based greeting + date + live clock
- Today's schedule preview (up to 5 events from `state.schedule[today]`)
- Current focus statement + first 3 sub-tasks (toggleable)
- Optional quick-navigation pills to Schedule, Goals, Habits, Focus (controlled by Tweaks `showQuickPills`)
- Two layout modes: **Stacked** (schedule first) or **Hero focus** (focus first) — controlled by Tweaks `homeLayout`

**Data reads:** `state.schedule[todayISO()]`, `state.focus.main`, `state.focus.tasks`
**Data writes:** Focus task toggle → `focus_tasks` (update checked)
**Supabase tables:** `focus_tasks`

---

### Life: Schedule (`life:schedule`)

**Purpose:** Full calendar + daily event management.

**Features:**
- Month calendar grid (42 cells, 7 columns) with navigation (‹ / Today / ›)
- Event dots on calendar cells with events
- Selected day highlight (accent background)
- Today highlight (border)
- Event list for selected day: time, title, note/subtitle
- Per-event alarm badge (⏰ HH:MM) if alarm is set
- **Add event:** inline form — time (input[type=time]), title, note, alarm toggle + alarm time
- **Edit event:** inline form per item — same fields as add
- **Delete event:** immediate remove from state + Supabase delete
- Alarm system: Web Notification + AudioContext sine beep, fires ±1 min of alarm_time, checked every 60s

**State managed:** `state.schedule`, `state.selectedDay`, `state.viewMonth`
**UI prefs persisted:** `selectedDay`, `viewMonth` in `localStorage('hq.prefs')`
**Supabase tables:** `schedule_events`
- Read: all events for user, grouped by date
- Write: insert (add), update (edit — time/title/note/alarm_time), delete

---

### Life: Goals & Rules (`life:goals`)

**Purpose:** Behavioral commitments — things to do and not do.

**Features:**
- Progress bar + percentage based on Do's checked today
- Two columns: **Do's** and **Don'ts**
- Each item: checkbox toggle, text label, edit (inline form), delete
- Progress meta: "X done / Y to go"
- **Add goal:** inline form per column — text input
- **Edit goal:** inline form per item — text input
- **Delete goal:** immediate

**Supabase tables:** `goals`
- Read: all goals for user, filtered by `type` ('do' / 'dont')
- Write: insert (add), update (text or checked), delete

---

### Life: Habits (`life:habits`)

**Purpose:** Daily habit tracking with streaks and 7-day history.

**Features:**
- Grid of habit cards (2 col mobile, 3 col desktop)
- Each card:
  - Habit name
  - Streak count (days)
  - 7-day dot grid (filled = done)
  - Checkbox to mark done today
  - Edit button (✎) — shows inline name input
  - Delete button (×) — appears on hover (desktop) or long-press (mobile, triggers "delete mode" shake animation)
- **Add habit:** inline form below grid — name input
- **Toggle:** updates `doneToday`, `streak`, `log` in state; upserts `habit_logs`; updates `habits.streak`
- **Long-press mobile:** enters delete mode (card dims, × visible), cancelled by tapping elsewhere

**Supabase tables:** `habits`, `habit_logs`
- Read: all habits + all habit_logs for user; 7-day log computed client-side
- Write habits: insert (add), update name (edit), update streak (toggle), delete
- Write habit_logs: upsert `(habit_id, date)` on toggle; delete all logs when habit deleted

---

### Life: Focus (`life:focus`)

**Purpose:** Single main focus statement + supporting sub-tasks.

**Features:**
- Large textarea for main focus statement (autosaves debounced 600ms)
- Sub-tasks list with done count
- Each task: checkbox, title, optional description (80 char preview), edit, delete
- **Add sub-task:** inline form — text + optional description textarea
- **Edit sub-task:** inline form — text + description textarea
- **Toggle task:** updates `checked` in `focus_tasks`

**State managed:** `state.focus.main`, `state.focus.tasks`, `focusBoardId` (global UUID)

**Supabase tables:** `focus_board`, `focus_tasks`
- Read: one `focus_board` row (maybeSingle), all `focus_tasks` for user
- Write focus_board: upsert on first login; update `main_focus` on textarea change
- Write focus_tasks: insert (add), update (text/description/checked), delete

---

### Life: Notes (`life:notes`)

**Purpose:** Freeform rich-text note-taking.

**Features (List view):**
- Grid or list layout toggle (▦ / ☰)
- Sort: Newest / Oldest / A–Z (by `updated_at`)
- Filter: All / Today / This week
- Each note card: title, 120-char content preview, relative timestamp (auto-refreshes every 60s)
- Delete from list (× on card)
- New note → creates DB row → opens editor

**Features (Editor view):**
- Full-width title input
- contenteditable rich text area
- Formatting toolbar: Normal / H1 / H2 / H3 / Bold / Italic / Bullet list (using `document.execCommand`)
- Collapsible headings (▼ toggle injected into H1/H2/H3)
- Autosave debounced 1000ms — title + content (HTML from contenteditable)
- "Saved" label flash on save
- Delete from editor
- Back button → returns to list

**State managed:** `state.notes`, `state.activeNoteId`, `state.notesSort`, `state.notesFilter`, `state.notesDisplay`

**Supabase tables:** `notes` *(schema missing — see CLAUDE.md)*
- Read: all notes for user, sorted by `updated_at` desc
- Write: insert (new note), update (title/content/updated_at), delete

---

### Finance: Overview (`finance:overview`)

**Purpose:** Financial health at a glance.

**Features:**
- 3 metric cards with animated number counters:
  - Income · this month (sum of `income_entries` where date starts with current YYYY-MM)
  - Spent · today (sum of `spending_entries` where date = today)
  - Total debt (sum of unpaid `debts`)
- Alert pill: "Debt due in N days" if any unpaid debt is due within 7 days
- 7-day spending bar chart (one bar per day, height proportional to daily total, day-of-week labels)

**Data reads:** `state.income`, `state.spending`, `state.debts`
**Data writes:** None
**Supabase tables:** `income_entries`, `spending_entries`, `debts` (read-only on this page)

---

### Finance: Income (`finance:income`)

**Purpose:** Log and review income entries.

**Features:**
- This-month total + entry count + average per entry (animated number)
- Full log sorted by date descending
- Each entry: date, source, amount (+prefix)
- **Add income:** inline form — source text, amount number, date
- **Edit income:** inline form per item — date, source, amount
- **Delete income:** immediate

**Supabase tables:** `income_entries`
- Read: all for user, sorted by date desc
- Write: insert (add), update (date/source/amount), delete

---

### Finance: Spending (`finance:spending`)

**Purpose:** Log and review spending entries.

**Features:**
- Today's total (animated number)
- Category breakdown pills: Food / Transport / Shopping / Other (with per-category totals)
- Full recent log sorted by date+time desc
- Each entry: time (today) or date (other days), note/category, amount (−prefix), category sub-label
- **Add spending:** inline form — category select, amount, note (time auto-set to now)
- **Edit spending:** inline form per item — category, amount, note, time
- **Delete spending:** immediate

**Supabase tables:** `spending_entries`
- Read: all for user, sorted by date desc
- Write: insert (add), update (category/amount/note/time), delete

---

### Finance: Debts (`finance:debts`)

**Purpose:** Track money owed with due dates.

**Features:**
- Open total (animated number) + open/paid counts
- All debts sorted: unpaid first (by due date), paid last
- Each debt: creditor name, due label (Paid / Due today / Due in Nd / Overdue), amount
- Due ≤7 days and not paid: "soon" styling (danger color)
- Mark paid button (for unpaid debts)
- **Add debt:** inline form — creditor, amount, due date
- **Edit debt:** inline form per item — creditor, amount, due date
- **Delete debt:** immediate

**Supabase tables:** `debts`
- Read: all for user, sorted by due_date
- Write: insert (add), update (creditor/amount/due_date or paid=true), delete

---

## Component Patterns

### Cards
```html
<div class="card" style="animation-delay:Xms">
  <div class="section-title">Title <span class="meta">meta text</span></div>
  <!-- content -->
</div>
```
Cards animate in with `card-in` keyframe (opacity 0→1, translateY 12px→0). Stacked with `margin-top: 16px`.

### Metric Cards
```html
<div class="card metric">
  <div class="label">LABEL</div>
  <div class="num" data-target="12345" data-prefix="Rp ">Rp 0</div>
  <div class="sub">subtitle</div>
</div>
```
Numbers animate from 0 to `data-target` on render.

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

### Inline Forms (Add / Edit)
```html
<button class="add-btn" data-open-form="form-id">+ Add</button>
<div class="inline-form" id="form-id">
  <div class="inner">
    <div class="field"><label>Label</label><input .../></div>
    <div class="form-actions">
      <button class="btn" data-cancel="form-id">Cancel</button>
      <button class="btn primary" id="save-btn">Add</button>
    </div>
  </div>
</div>
```
`max-height` transitions 0→360px on `.open` class. Only one form open at a time. Global click listener closes all open forms.

### Checkboxes
```html
<span class="check [checked]" data-toggle-XXX="id"></span>
<span class="check-label [done]">Label</span>
```
Styled box with CSS checkmark. `pulse` class triggers scale animation on toggle.

### Pills (Navigation)
```html
<button class="mobile-pill [active]" data-go="life:habits">Habits</button>
```

### Pills (Category / Info)
```html
<span class="pill cat">Food<span class="amt">Rp 35.000</span></span>
```

### Tweaks Panel
Global settings panel (`#tweaks-panel`, slide-in from right):
- Your name (text input → updates profile + Supabase)
- Accent color (6 swatches → CSS `--accent` variable)
- Density: Comfortable / Compact (→ `data-density` on body)
- Big number weight: 200 / 300 / 400 (→ `--num-weight`)
- Today layout: Stacked / Hero focus
- Quick pills on Today: On / Off
- Currency prefix (text input, max 3 chars)

Settings stored in `window.__HQ_TWEAKS` object (in-page, not persisted to DB except `name`).

### Toast
```js
showToast('Message text')
```
`#toast` element: appears with `.show` class, auto-hides after 3500ms.

### Alert
```html
<div class="alert"><span class="glyph">⚠</span> Message</div>
```
Danger-colored pill, used for debt due soon warnings.
