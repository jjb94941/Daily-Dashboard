# Daily Dashboard — Hosted Webapp

A personal, cross-device version of Julian's daily dashboard. Hosted on Cloudflare Pages, signs in with Google, refreshes Gmail + Calendar live and weather/markets/news daily.

## What's in here

```
dashboard-webapp/
├── README.md           ← you are here
├── SETUP.md            ← start here when you're ready to deploy
├── package.json
├── wrangler.toml       ← Cloudflare project config
├── .gitignore
├── public/             ← static frontend
│   ├── index.html      ← the dashboard
│   ├── login.html      ← sign-in page
│   ├── app.js          ← client-side logic (calls /api/*)
│   ├── styles.css
│   └── manifest.json   ← PWA: 'Add to Home Screen' on iOS gives an app icon
└── functions/          ← Cloudflare Pages Functions (Workers under the hood)
    ├── _middleware.js  ← session check for protected routes
    ├── _utils/
    │   ├── session.js  ← signed cookies + KV-backed sessions
    │   ├── google.js   ← Gmail/Calendar/OAuth helpers
    │   └── cors.js
    └── api/
        ├── auth/login,callback,me,logout
        ├── calendar/today
        ├── email/unread
        ├── data/index,refresh   ← weather, stocks, news
        └── config/index         ← user-added cities/stocks/sources
```

## Architecture (1-minute version)

- **Frontend**: static HTML/JS, served from Cloudflare Pages.
- **Backend**: Cloudflare Pages Functions (lightweight serverless, runs at the edge).
- **Auth**: Google OAuth 2.0. Restricted to the Gmail addresses you allowlist. Session is a signed cookie pointing to a session record in Cloudflare KV that holds the Google refresh token.
- **Live data**: `/api/calendar/today` and `/api/email/unread` call Google APIs with the session's access token on each request.
- **Daily data**: `/api/data` returns cached weather/stocks/news from Cloudflare KV. If the cache is more than 6 hours old when you load the page, it refreshes inline. No cron needed.
- **Storage**: two Cloudflare KV namespaces — `SESSIONS` (auth) and `CACHE` (daily data + your custom config).
- **PWA**: a manifest.json + service worker so iOS/Android can install it to the home screen as a real-feeling app.

## What you need to deploy

- A Google account (you've got this — jjb94941@gmail.com)
- A Cloudflare account (free)
- A GitHub account (free) — for git-based auto-deploys
- About 30–45 minutes for the first deploy. Subsequent deploys are `git push` and done.

## Next step

Open **SETUP.md** and follow it top to bottom.
