# Setup walkthrough

Top-to-bottom. About 30–45 minutes the first time. Have a coffee.

## Part 1 — Google Cloud OAuth client (15 min)

You need an OAuth client so the webapp can sign you in with Google and read Gmail + Calendar on your behalf.

### 1.1 Create a Google Cloud project

1. Go to https://console.cloud.google.com
2. Top bar → project dropdown → "New Project"
3. Name: `Daily Dashboard` · Organization: (leave blank) · Location: (no organization)
4. Click Create. Wait ~10 seconds. Make sure the new project is selected in the top bar.

### 1.2 Enable the APIs

1. Left sidebar → "APIs & Services" → "Library"
2. Search for **Gmail API** → Enable
3. Search for **Google Calendar API** → Enable

### 1.3 Configure the OAuth consent screen (now called "Google Auth Platform")

Google redesigned this UI in 2025. The new sidebar splits the old flow into separate pages:

| Old name | New name |
|---|---|
| OAuth consent screen → App info | **Branding** |
| Scopes | **Data Access** |
| Test users | **Audience** |
| Credentials → OAuth client | **Clients** |

Walk through them in this order:

1. Left sidebar → "APIs & Services" → "Google Auth Platform"
2. If prompted, choose User type: **External** → Create
3. **Branding**:
   - App name: `Daily Dashboard`
   - User support email: your email
   - Developer contact email: your email
   - Save
4. **Data Access** → Add or Remove Scopes → check these three:
   - `.../auth/userinfo.email`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/calendar.readonly`
   - Update / Save
5. **Audience** → Test users → Add Users → add `jjb94941@gmail.com` (and any other allowlist emails). Save.

Note: while the app is in "Testing" mode (shown in Audience), only the test users you added can sign in. You don't need to publish to production unless you want non-allowlisted people to log in (you don't).

### 1.4 Create the OAuth client

1. Left sidebar → "Google Auth Platform" → "**Clients**" → "+ Create Client"
2. Application type: **Web application**
3. Name: `Daily Dashboard Webapp`
4. Authorized JavaScript origins:
   - `https://YOUR-SUBDOMAIN.pages.dev` (you'll fill this in after Part 2; come back and add it)
   - For local testing: `http://localhost:8788`
5. Authorized redirect URIs:
   - `https://YOUR-SUBDOMAIN.pages.dev/api/auth/callback`
   - `http://localhost:8788/api/auth/callback`
6. Create.
7. **Save the Client ID and Client Secret** that pop up. You'll need them in Part 3.

## Part 2 — Cloudflare account + Pages project (10 min)

### 2.1 Create a Cloudflare account

1. Go to https://dash.cloudflare.com/sign-up
2. Sign up with the email of your choice. Verify it.

### 2.2 Create the KV namespaces

KV is Cloudflare's simple key-value store. We need two namespaces.

1. From the Cloudflare dashboard left sidebar → "Storage & Databases" → "KV"
2. Create namespace `SESSIONS` → Add
3. Create namespace `CACHE` → Add
4. **Copy the namespace ID** for each. You'll need them in Part 3.

### 2.3 Create a GitHub repo for the project

1. Go to https://github.com/new
2. Name: `daily-dashboard` (private is fine)
3. Don't initialize with README — we'll push our own.
4. Create.

### 2.4 Push the project to GitHub

From a terminal in this folder (`dashboard-webapp/`):

```
git init
git add .
git commit -m "Initial scaffold"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/daily-dashboard.git
git push -u origin main
```

### 2.5 Connect the repo to Cloudflare Pages

1. Cloudflare dashboard → "Workers & Pages" → "Create application" → "Pages" → "Connect to Git"
2. Authorize GitHub → pick the `daily-dashboard` repo
3. Build settings:
   - Framework preset: **None**
   - Build command: (leave empty)
   - Build output directory: `public`
4. Save and Deploy
5. After deploy finishes, note your URL: `https://daily-dashboard-XXX.pages.dev`. Go back to Part 1.4 and add this URL to your OAuth client's Authorized JavaScript Origins and Authorized Redirect URIs (with `/api/auth/callback` for the redirect).

## Part 3 — Configure environment variables + KV bindings (5 min)

The webapp needs to know your Google client credentials, allowlist, and how to find your KV namespaces. These all live in Cloudflare Pages settings, not in code.

1. Cloudflare dashboard → Pages → `daily-dashboard` → "Settings" → "Functions"
2. **KV namespace bindings** → Add binding:
   - Variable name: `SESSIONS` · KV namespace: `SESSIONS`
   - Variable name: `CACHE` · KV namespace: `CACHE`
3. **Environment variables** (Production) → Add:
   - `GOOGLE_CLIENT_ID` = (from Part 1.4)
   - `GOOGLE_CLIENT_SECRET` = (from Part 1.4) — click "Encrypt" so it's stored as a secret
   - `ALLOWED_EMAILS` = `jjb94941@gmail.com` (comma-separated if more)
   - `SESSION_SECRET` = a random 64-character hex string — click "Encrypt". To generate one, open any browser, hit F12 → Console tab, and run:
     ```
     Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')
     ```
     Copy the resulting string (no quotes) and paste it as the value.
   - `APP_URL` = `https://daily-dashboard-XXX.pages.dev` (your exact deploy URL)
4. Save.
5. Trigger a new deploy: Pages → Deployments → "..." on the latest → "Retry deployment" (so the new env vars get picked up).

## Part 4 — First sign-in (1 min)

1. Open `https://daily-dashboard-XXX.pages.dev` in your phone's browser.
2. You'll see the sign-in page → tap "Sign in with Google" → pick your account.
3. Google will warn the app is unverified — that's expected, click Advanced → Continue.
4. Grant Gmail + Calendar read permissions.
5. You should land on the dashboard with live email + calendar.

## Part 5 — Install as PWA on your phone (30 sec)

**iOS Safari:**
- Open the page → tap Share → "Add to Home Screen" → Add.
- Now you have a "Daily" icon on your home screen that opens full-screen.

**Android Chrome:**
- A "Add to Home Screen" banner appears, or use the menu → Install app.

## Troubleshooting

- **"redirect_uri_mismatch" on sign-in:** the URL in OAuth Authorized Redirect URIs has to exactly match `https://YOUR-DOMAIN/api/auth/callback`. Check trailing slashes, http vs https.
- **"Access blocked: this app's request is invalid":** check the OAuth consent screen scopes match Part 1.3.
- **Sign-in succeeds but dashboard says "Couldn't load email":** open browser devtools → Network → check the failing request. Almost always a missing env var or KV binding.
- **Need to re-deploy after changing env vars:** Pages doesn't auto-redeploy on env changes; trigger a manual redeploy (Part 3 step 5).
- **Want to test locally before deploying:** see "Local development" in README.md.

## After it's working

- Tell Claude in your next session that the webapp is live and what URL it's at.
- Iterate: change colors, layout, what's displayed, add new widget types. Each change is `git push` and Pages auto-deploys.
