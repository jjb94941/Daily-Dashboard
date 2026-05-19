# Daily Dashboard — operator reference

This doc is the source of truth for the deployed state of this webapp. It is intended for Claude (or anyone) coming in fresh to make changes without re-discovering the setup. The original first-time setup walkthrough is preserved at the bottom under "Original setup walkthrough" — that section is historical; the project is already deployed.

## TL;DR for a fresh session

- **Live URL:** https://daily-dashboard-57o.pages.dev
- **Repo:** https://github.com/jjb94941/Daily-Dashboard (private, single branch `main`)
- **Hosting:** Cloudflare Pages project named `daily-dashboard`, auto-deploys from GitHub on every push to `main`.
- **Auth:** Google OAuth (Web application client). Allowlist is one email: `jjb94941@gmail.com`. The app is in "Testing" mode in Google Cloud — that's intentional, no need to publish.
- **Owner:** Julian Brandes (jjb94941@gmail.com).

Your job in a new session is usually a code change. Pull the relevant file from `https://raw.githubusercontent.com/jjb94941/Daily-Dashboard/main/<path>`, edit, commit via the GitHub web UI (Claude can drive Chrome for this) or the GitHub Contents API with a fine-grained PAT, and Cloudflare redeploys automatically.

## Architecture

```
public/                       Static assets served directly by Pages
  index.html                  Dashboard UI (CSS + DOM scaffold)
  login.html                  Sign-in page
  app.js                      Dashboard client logic (no framework, vanilla JS)
  manifest.json               PWA manifest
functions/                    Cloudflare Pages Functions (server-side)
  _middleware.js              Attaches `session` to context for all /api routes
  _utils/
    google.js                 OAuth helpers + Gmail/Calendar API calls
    session.js                Signed-cookie sessions backed by KV
    helpers.js                json(), errorJson(), isAllowed()
  api/auth/
    login.js                  GET → 302 to Google OAuth + sets oauth_state cookie
    callback.js               GET → exchanges code, creates session, redirects to /
    me.js                     GET → returns { email } if signed in, else 401
    logout.js                 POST → clears session cookie + KV entry
  api/calendar/today.js       GET → today's events (live from Google)
  api/email/unread.js         GET → unread Gmail subjects from last 24h (live)
  api/data/index.js           GET → weather + stocks + news. Caches in CACHE KV for 6h.
  api/config/index.js         GET/PUT → user's cities/stocks/news sources/widgets, stored per-email in KV
wrangler.toml                 ALL config lives here (see below)
```

## wrangler.toml is the source of truth for config

Cloudflare Pages treats `wrangler.toml` as the source of truth. When it's present, dashboard env-var entries for plaintext become inert; only encrypted Secret dashboard entries are read at runtime.

Current `wrangler.toml`:

```toml
name = "daily-dashboard"
pages_build_output_dir = "public"

[vars]
GOOGLE_CLIENT_ID = "1008686543160-t4nvq2rdrcfdqo3v9jcgct1akgelhn67.apps.googleusercontent.com"
ALLOWED_EMAILS = "jjb94941@gmail.com"
APP_URL = "https://daily-dashboard-57o.pages.dev"

[[kv_namespaces]]
binding = "SESSIONS"
id = "d91319b1210642a980c3be1ecb770559"

[[kv_namespaces]]
binding = "CACHE"
id = "34a5df51e6614dda97570ce58ae9562d"
```

Both `pages_build_output_dir` AND `name` are required — without them, Cloudflare Pages refuses to parse the file at all (silent skip, no warning during build). The lesson: when in doubt, check the build log for the line `Successfully read the Wrangler configuration file.` — if it says `Skipping file and continuing`, the file is being ignored.

## Secrets (Cloudflare dashboard, encrypted)

Two values, both marked Secret type in Cloudflare Pages → Settings → Variables and Secrets:

- `GOOGLE_CLIENT_SECRET` — the Google OAuth client secret (rotated; only `****qtbm` is active in Google Cloud).
- `SESSION_SECRET` — 64-char hex used to sign session cookies.

## Google Cloud setup (current state)

- Project: "Daily Dashboard"
- OAuth client: "Daily Dashboard Webapp" (Web application type) — this is the only client; the Desktop one was deleted.
- Client ID: `1008686543160-t4nvq2rdrcfdqo3v9jcgct1akgelhn67.apps.googleusercontent.com`
- Active client secret: `****qtbm` (the old `****Rp5X` was disabled and deleted).
- Authorized JavaScript origins: `https://daily-dashboard-57o.pages.dev`
- Authorized redirect URIs: `https://daily-dashboard-57o.pages.dev/api/auth/callback`
- Audience / publishing status: Testing.
- Test users: `jjb94941@gmail.com`.
- Scopes: `userinfo.email`, `gmail.readonly`, `calendar.readonly`.

## Gotchas already burned through (do NOT re-discover)

1. **`wrangler.toml` needs `name` and `pages_build_output_dir`.** Without both, Pages silently skips the file. KV bindings + `[vars]` will appear to "not work" with no clear error. Always grep build log for "Successfully read the Wrangler configuration file."
2. **Dashboard env vars don't override `wrangler.toml` `[vars]`.** Once `[vars]` exists in wrangler.toml, dashboard plaintext entries are inert — Cloudflare blocks deletion with a tooltip. To change a plaintext var, edit `wrangler.toml`.
3. **Multiple `Set-Cookie` headers can't be joined with commas.** The original callback.js did `headers: { 'Set-Cookie': [cookie, clearCookie('oauth_state')].join(', ') }`, which silently dropped the session cookie (because cookie values contain commas inside `Expires=`). Always use `const h = new Headers(); h.append('Set-Cookie', cookie); h.append('Set-Cookie', other);`.
4. **The unverified-app warning** ("Google hasn't verified this app") is expected and not a bug. Allowlisted test users click Advanced → Continue. Do not try to "fix" it by submitting for verification — the scopes are restricted and verification is heavy.
5. **Static HTML/JS cannot read Cloudflare env vars.** Anything that needs server config goes through a Pages Function. The login page should hit `/api/auth/login` and let the server build the OAuth URL.

## How to make code changes (the standard playbook)

1. Open a Chrome tab to the target file via `https://github.com/jjb94941/Daily-Dashboard/edit/main/<path>` (or `/blob/` to view first).
2. Replace content. For small edits: in-place. For big edits: select all, paste new version. (For very large pastes, the GitHub web editor can time out — fall back to the Contents API with a fine-grained PAT.)
3. Commit with a clear message. Commit directly to `main`.
4. Cloudflare auto-deploys. Watch `https://dash.cloudflare.com/?to=/:account/workers-and-pages` or just wait ~90 seconds.
5. Smoke test: hit the live URL, verify the change, screenshot for the user.

If Claude has Chrome access in the session, it can do all of the above. If not, write the file content into the user's workspace and have the user paste-and-commit.

## Configuration users can set (no code change needed)

Stored in KV under `config:<email>`:

- `cities` — weather cards.
- `stocks` and `indices` — markets list.
- `newsSources` — RSS feeds for the news section.
- `customWidgets` — user-added note / link-list widgets.

The dashboard UI has `+ Add` buttons for each of these. No need to edit code to add a city.

## Where things live, summarized

| Concern | Where |
| --- | --- |
| Visual layout / CSS | `public/index.html` (single `<style>` block at top) |
| Client behavior | `public/app.js` |
| New backend endpoint | `functions/api/<area>/<name>.js`, exported as `onRequestGet` / `onRequestPost` etc. |
| New env var (non-secret) | `wrangler.toml` `[vars]` |
| New secret | Cloudflare dashboard → Variables and Secrets, type Secret. Not in `wrangler.toml`. |
| New KV namespace | Create in Cloudflare → KV, add to `wrangler.toml` `[[kv_namespaces]]`, redeploy. |

## Quick-reference scratchpad for the user

- Repo edit URL pattern: `https://github.com/jjb94941/Daily-Dashboard/edit/main/<path>`
- Raw URL pattern: `https://raw.githubusercontent.com/jjb94941/Daily-Dashboard/main/<path>`
- Cloudflare project: `dash.cloudflare.com` → Workers & Pages → `daily-dashboard`
- Google Cloud project: `console.cloud.google.com` → Daily Dashboard

---

## Original setup walkthrough (historical, kept for reference)

The sections below describe the original first-time setup that was already completed in May 2026. Useful only if rebuilding from scratch or replicating to another account.

### Part 1 — Google Cloud OAuth client

You need an OAuth client so the webapp can sign you in with Google and read Gmail + Calendar on your behalf.

**1.1 Create a Google Cloud project**

1. Go to https://console.cloud.google.com
2. Top bar → project dropdown → "New Project"
3. Name: `Daily Dashboard` · Organization: (leave blank) · Location: (no organization)
4. Click Create. Wait ~10 seconds.

**1.2 Enable the APIs**

1. Left sidebar → "APIs & Services" → "Library"
2. Search for `Gmail API` → Enable
3. Search for `Google Calendar API` → Enable

**1.3 Configure the OAuth consent screen ("Google Auth Platform")**

Note that Google renamed several pages in 2025+. Mapping:

| Old name | New name (2025+) |
| --- | --- |
| OAuth consent screen → App info | Branding |
| Scopes | Data Access |
| Test users | Audience |
| Credentials → OAuth client | Clients |

Steps:

1. Sidebar → "APIs & Services" → "Google Auth Platform"
2. User type: External → Create
3. Branding: App name `Daily Dashboard`, support + dev contact emails. Save.
4. Data Access → Add scopes: `userinfo.email`, `gmail.readonly`, `calendar.readonly`. Save.
5. Audience → Test users → Add `jjb94941@gmail.com`. Save.

**1.4 Create the OAuth client**

1. "Clients" → "+ Create Client"
2. Type: Web application, name `Daily Dashboard Webapp`
3. Authorized JS origins: `https://daily-dashboard-57o.pages.dev`
4. Authorized redirect URIs: `https://daily-dashboard-57o.pages.dev/api/auth/callback`
5. Save the Client ID and Client Secret.

### Part 2 — Cloudflare account + Pages project

1. Sign up at `cloudflare.com`.
2. KV → create namespaces `SESSIONS` and `CACHE`, save their IDs.
3. GitHub → create repo, push code.
4. Cloudflare → Workers & Pages → Connect to Git → pick the repo. Build output: `public`. Deploy.

### Part 3 — Configure wrangler.toml + secrets

Put the namespace IDs, OAuth client ID, allowlist email, and `APP_URL` in `wrangler.toml`. Put `GOOGLE_CLIENT_SECRET` and `SESSION_SECRET` in Cloudflare dashboard → Variables and Secrets as encrypted Secret type.

### Part 4 — First sign-in

Open the URL → Sign in with Google → "Google hasn't verified" → Advanced → Continue → Grant scopes → Dashboard loads.

### Part 5 — Install as PWA on phone

- iOS Safari: Share → Add to Home Screen.
- Android Chrome: install banner / menu → Install app.
