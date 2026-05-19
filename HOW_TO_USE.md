# How to request changes to your Daily Dashboard

The webapp lives at https://daily-dashboard-57o.pages.dev. To change anything about it — new feature, layout tweak, fix a bug — open a fresh chat with Claude (in Cowork or the Claude desktop app) and ask. The notes below are how to get good results quickly.

## The two-line opener

Paste this at the top of any new chat, then add your actual request below it:

> I have a hosted personal webapp called Daily Dashboard. The repo is https://github.com/jjb94941/Daily-Dashboard. Before making changes, read SETUP.md in the repo for the architecture and deployed state.
>
> What I want: \<your ask here\>

That's enough to orient Claude. SETUP.md (in the repo) contains the architecture, deploy state, env vars, file layout, and the gotchas already worked through — so Claude doesn't have to rediscover them.

## What to say in the "what I want" line

Be specific about the visible behavior, not the implementation. Claude can figure out the implementation. Some examples:

| Vague (don't) | Specific (do) |
| --- | --- |
| "Make the dashboard nicer." | "Make the weather cards 50% taller and show the next 3 hours of forecast under each one." |
| "Add a thing for my todos." | "Add a custom widget type called 'Todo list' that lets me check items off. Saves like the note widget." |
| "Fix the email." | "Email subjects are getting cut off on mobile. Wrap them or shrink the font on narrow screens." |
| "Change the colors." | "Switch the whole UI to a dark theme. Keep the accent blue." |

## Examples of asks that work well

- "Add a 'Reminders' widget that lets me type a list of items, and each item has a delete button."
- "Currently the news headlines section has 3 columns. Make it a single scrolling list ordered by publish time instead."
- "Show me the weekly weather forecast (next 5 days) under each city's current temperature."
- "When I'm not signed in, I want the login page to say my name in the welcome message — read it from the URL param if present."
- "Add a keyboard shortcut: 'r' refreshes data, 'g e' jumps to email, 'g c' jumps to calendar."
- "The stock prices don't refresh as fast as I'd like. Cut the cache TTL from 6 hours to 30 minutes."

## What Claude will do, roughly

For most asks Claude will:

1. Read the relevant source files from your GitHub repo.
2. Edit them (Claude can drive your Chrome to commit on GitHub directly, with your permission, OR give you the patch to apply yourself).
3. Wait for Cloudflare to auto-deploy (~1–2 min).
4. Verify the change worked, either by checking the deployed URL itself or asking you to.

You'll need to sign in / approve OAuth / type passwords yourself when those come up — Claude can't do that for you.

## Things Claude needs from you

- When the change is destructive (delete a file, drop a feature, revoke a credential) Claude will ask before doing it.
- When the change touches secrets, Claude will tell you the values to paste rather than ever pasting them into chat. They land in a file in your Cowork folder, or Claude tells you a console one-liner to run.
- If you're seeing an error and want help debugging:
  1. Open the dashboard URL and reproduce the error.
  2. Paste the error message (or a screenshot) into chat.
  3. If it's a network error, F12 → Network tab → click the failing request → screenshot the response.

## Bigger asks

For something larger — like "I want a totally new section that pulls in my Notion tasks" — start the chat the same way, but expect a back-and-forth where Claude asks clarifying questions before writing any code. Be ready to:

- Decide on data sources (which Notion DB? which OAuth scopes?).
- Pick a UI direction (a separate card vs. inline in an existing one).
- Confirm trade-offs (live fetch on every page load vs. cached every N minutes).

## Quick reference

- **Live URL:** https://daily-dashboard-57o.pages.dev
- **Repo:** https://github.com/jjb94941/Daily-Dashboard
- **Hosted on:** Cloudflare Pages (auto-deploys on push to `main`)
- **Auth:** Google OAuth (only jjb94941@gmail.com allowlisted)
- **To bypass the unverified-app warning the first time:** Advanced → Continue
