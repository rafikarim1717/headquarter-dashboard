# HQ Dashboard

Personal life + finance dashboard (installable PWA) with a Supabase backend and Google / email login.

**Life:** Today overview · Schedule (reminders, recurring events) · Commitments (yes/no, counted and timed habits with streaks, reminders and a compliance history) · Projects · Notes (rich text)
**Finance:** Overview · Income · Spending · Debts

Docs: [`CLAUDE.md`](CLAUDE.md) (architecture + feature reference) · [`IA.md`](IA.md) (pages & navigation) · [`ERD.md`](ERD.md) (database tables)

---

## Setup

### 1. Run the database schema

1. Go to your [Supabase dashboard](https://supabase.com/dashboard)
2. Select your project → **SQL Editor** → **New query**
3. Paste the contents of **`schema_fix.sql`** and click **Run**

`schema_fix.sql` is idempotent (safe to re-run) and creates every table the app uses on a fresh project **and** backfills newer columns onto an existing database — run it again whenever the schema changes. (`schema.sql` is an older fresh-project script; it lacks the `projects` / `project_tasks` tables and isn't safe to re-run, so prefer `schema_fix.sql`.)

### 2. Enable Google Auth

1. In your Supabase dashboard go to **Authentication → Providers**
2. Find **Google** and toggle it **on**
3. You need a Google OAuth client:
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
   - Create an **OAuth 2.0 Client ID** (Web application)
   - Add your site URL to **Authorised JavaScript origins**  
     e.g. `https://your-app.vercel.app` (and `http://localhost:8080` for local dev)
   - Add to **Authorised redirect URIs**:  
     `https://ffleqouktwanayuidyaf.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret** into the Supabase Google provider fields
5. Save

Email + password sign-in also works (Supabase → Authentication → Providers → Email).

### 3. Open or deploy

**Local:** the app is plain static files (no build step), but Google OAuth needs a real URL rather than `file://`, so serve the folder:
```
npx serve .
# or
python -m http.server 8080
```
Then add `http://localhost:8080` to your Google OAuth **Authorised JavaScript origins** (and to Supabase → Authentication → URL Configuration if needed).

The Supabase project URL and public (anon) key are set in `js/supabase.js`; point them at your own project if you fork this.

---

## Deploy to Vercel

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import the repo
3. No build settings needed — Vercel serves static files automatically
4. After deploy, add your `https://your-project.vercel.app` URL to:
   - Google Cloud Console → Authorised JavaScript origins + redirect URIs
   - Supabase → **Authentication → URL Configuration → Site URL**

## Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) → **Add new site → Deploy manually**
2. Drag and drop this folder onto the deploy area
3. After deploy, add your `https://your-project.netlify.app` URL to:
   - Google Cloud Console → Authorised JavaScript origins + redirect URIs
   - Supabase → **Authentication → URL Configuration → Site URL**

---

## How it works

- **Auth**: Google OAuth or email/password via Supabase. A login screen is shown until the user authenticates. Session persists across page loads.
- **Data**: All data lives in Supabase (Postgres) with row-level security, so each user only sees their own rows. On login, everything is fetched in parallel and held in memory. Every create/update/delete immediately updates the in-memory state (so the UI stays snappy) and syncs to Supabase in the background. If the tab has been hidden for more than 5 minutes, data is re-fetched when you come back.
- **Errors**: If a sync fails, a toast appears at the bottom of the screen and the call is retried once automatically.
- **First login**: Sample data is auto-inserted so the dashboard isn't empty on first use.
- **Commitments**: each commitment is Yes/No, a Count (e.g. 33× dzikir) or a Duration (e.g. 10 menit) that is logged only with a Start timer. Compliance uses partial credit, and the daily ring turns red below 10% and green from 70%.
- **Reminders & timers**: schedule alarms, commitment reminders and running duration timers work while the app is open in a browser tab (Web Notification permission is requested on first login). They are not push notifications, so nothing fires when the tab/PWA is closed — a timer that was running when you closed the app completes the next time you open it.
- **PWA**: `manifest.json` + a network-first service worker (`sw.js`) make it installable to the home screen.
- **UI preferences** (active tab, selected day, sidebar state, running timers, custom YouTube stations) are stored in `localStorage` per device — they don't sync across devices. The Tweaks panel (density, Today layout, currency prefix, …) resets to the defaults in `index.html` on reload; only your name (Supabase) and custom music stations (localStorage) persist.
