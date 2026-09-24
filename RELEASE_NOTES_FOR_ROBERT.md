# Forge Summit 2026 Office Hours — release notes

## URLs

- **Production:** https://forge-summit-oh-robert-baker-s-projects.vercel.app
- **Production (short alias):** https://forge-summit-oh.vercel.app
- **Preview (branch):** https://forge-summit-oh-git-cursor-summi-c5ad69-robert-baker-s-projects.vercel.app

## What changed

- Phone-first booking app promoted toward Production with SSR landing facts (dates, Ballroom C / Downtown North Little Rock), Open Graph / Twitter / canonical / JSON-LD Event, and a public sitemap (`/ops` stays disallowed in robots).
- Ops access is **path-token only**: `/ops/<OPS_SECRET>`. Query `?key=` is disabled. New `OPS_SECRET` rotated on Preview + Production.
- Booking hardening: agency must be active, past slots rejected, org length capped, bad JSON → 400, coarse IP rate limit, admin slot PATCH uses expected-status CAS, admin Bearer uses timing-safe compare.
- Partner “You will meet” / empty website blanks hidden; confirmation screen notes email when mail is configured; confirmation code survives refresh via sessionStorage.
- Brand logos/lockup/curtain served from `/public` (data-URI bloat removed from client JS). UI copy uses US “defense”.
- Seed: one transaction; preserves Booked **and** Blocked; does not overwrite existing agency `active` / rep fields.
- CI: `tsc --noEmit` + bookSlot unit tests (TAKEN, LIMIT, CLOSED, INACTIVE, PAST, INVALID).

## What you should test (5–8 bullets)

1. Open **Production** `/` on your phone — H1, Oct 13–14, Ballroom C / Downtown North Little Rock appear even before/without heavy JS.
2. Book a real Open slot end-to-end; confirmation code shows; refresh keeps the Done screen.
3. Try booking the same slot twice / concurrent — second should say taken.
4. Support agencies with TBC/empty rep — no blank “You will meet” or empty website link.
5. `/oh` redirects to `/`.
6. Ops list loads only with the private path URL (ask admin / see local ops file) — wrong token → 404.
7. Board page `/board` still loads for floor display.
8. After you add Resend (below), book again and confirm attendee + notify emails arrive.

## Still needs you

### Resend (email)

`RESEND_API_KEY` is **not** set. Booking still succeeds without mail.

1. Create/get an API key at https://resend.com
2. Vercel → project `forge-summit-oh` → Settings → Environment Variables
3. Add `RESEND_API_KEY` for **Preview** and **Production**
4. Confirm `FROM_EMAIL` / `NOTIFY_EMAIL` (already set) — replace `FROM_EMAIL` with a verified domain sender when ready
5. Redeploy Production after adding the key

### Ops URL

The live ops URL is **not** in this file (secret). It lives only in the gitignored local file `.local-ops-url.txt` on the Agent Computer. Ask the agent/parent chat to relay it privately once — do not paste it into GitHub, Slack, or email.

## Env vars on Production (names only)

`DATABASE_URL`, `ADMIN_API_KEY`, `OPS_SECRET`, `NOTIFY_EMAIL`, `FROM_EMAIL`  
Missing optional: `RESEND_API_KEY`
