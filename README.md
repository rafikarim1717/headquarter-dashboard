# HQ Dashboard

Personal life + finance dashboard with Supabase backend and Google login.

---

## Setup

### 1. Run the database schema

1. Go to your [Supabase dashboard](https://supabase.com/dashboard)
2. Select your project → **SQL Editor** → **New query**
3. Paste the contents of `schema.sql` and click **Run**

### 2. Enable Google Auth

1. In your Supabase dashboard go to **Authentication → Providers**
2. Find **Google** and toggle it **on**
3. You need a Google OAuth client:
   - Go to [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services → Credentials**
   - Create an **OAuth 2.0 Client ID** (Web application)
   - Add your site URL to **Authorised JavaScript origins**  
     e.g. `https://your-app.vercel.app` (and `http://localhost` for local dev)
   - Add to **Authorised redirect URIs**:  
     `https://ffleqouktwanayuidyaf.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret** into the Supabase Google provider fields
5. Save

### 3. Open or deploy

**Local:** just open `HQ Standalone.html` in a browser. Google OAuth requires a real URL, so use a simple server:
```
npx serve .
# or
python -m http.server 8080
```
Then add `http://localhost:8080` to your Google OAuth **Authorised JavaScript origins**.

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

- **Auth**: Google OAuth via Supabase. A login screen is shown until the user authenticates. Session persists across page loads.
- **Data**: All data lives in Supabase (Postgres). On login, everything is fetched in parallel and held in memory. Every create/update/delete immediately updates the in-memory state (so the UI stays snappy) and syncs to Supabase in the background.
- **Errors**: If a sync fails, a toast appears at the bottom of the screen and the call is retried once automatically.
- **First login**: Sample data is auto-inserted so the dashboard isn't empty on first use.
- **UI preferences** (active tab, selected day, tweaks) are stored in `localStorage` per device — they don't need to sync across devices.
