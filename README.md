# Forge Summit 2026 — Office Hours

Phone-first booking for the 2026 Forge Summit (13–14 October, America/Chicago) in Ballroom C, Downtown North Little Rock. Attendees scan a QR code, pick a Phoenix 2026 cohort host or a partner agency, and take a 15-minute slot. Each group has a table sign.

Mid-event ops run through a Bearer-authenticated admin API. Flip hosts Active, close booking, or Block a slot without a redeploy.

Brand voice matches [forge.institute/summit](https://www.forge.institute/summit): serious cyber / defense, no carnival copy.

## Stack

- Next.js App Router (TypeScript) + Tailwind
- Neon Postgres (`flat-hat-60967335`, production branch `br-aged-thunder-b5sqlxj2`)
- Vercel project `forge-summit-oh` (Production: https://forge-summit-oh.vercel.app)

Public surfaces:

| Path | Purpose |
| --- | --- |
| `/` and `/oh` | Attendee booking |
| `/board` | Venue display (Chicago “today”) |
| `/admin` | Password-protected admin (agencies, notification emails, bookings, email log) |
| `/ops/<OPS_SECRET>` | Unlisted ops list of Booked slots |
| `GET /api/getAvailability` | Open slots for active hosts |
| `POST /api/bookSlot` | Race-safe Open → Booked; then confirmation + host + admin mail via Gmail SMTP |
| `GET /api/getBoard` | Board grid |

Partner agencies (SBA, AEDC, ASBTDC) and Phoenix cohort hosts are Active in seed. Max **2 bookings per email**.

## Local setup

```bash
git clone https://github.com/robertandrewbaker20-lang/forge-summit-office-hours.git
cd forge-summit-office-hours
cp .env.example .env.local
```

Set in `.env.local` (never commit these):

```
DATABASE_URL=          # Neon pooled connection string
ADMIN_PASSWORD=        # password for the /admin page (min 12 chars)
ADMIN_API_KEY=         # long random secret for /api/admin/*
OPS_SECRET=            # long random URL-safe secret for /ops
GMAIL_USER=            # Gmail account that sends mail (same as NOTIFY_EMAIL)
GMAIL_APP_PASSWORD=    # Google app password (not the account password); booking still works if unset
NOTIFY_EMAIL=          # robertandrewbaker20@gmail.com
```

Obtain `DATABASE_URL` from the Neon console (or the Vercel Neon integration) for project `flat-hat-60967335`, database `neondb`, pooled endpoint. Do not paste the full secret into tickets or chat.

```bash
npm install
npm run db:seed        # idempotent; skips slot regen if rows already exist
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Board: [http://localhost:3000/board](http://localhost:3000/board).

`npm run db:seed` creates `agencies`, `settings`, `schedule`, and `slots` if they are missing, upserts the Apps Script host list (partners Active), and rebuilds the 08:00–16:00 / 15-minute grid via `lib/regrid.ts`. Existing Booked rows are left alone.

## Booking rules

- Slot length 15 minutes (Settings `Slot Minutes`), back-to-back (`:00` / `:15` / `:30` / `:45`), 08:00–16:00 America/Chicago. Meetings are in Ballroom C.
- Bookings made on the old 30-minute grid keep their original start/end. The 15-minute slot they overlap is stored as `Blocked` with `covered_by = <booking slot id>` (shown to attendees as taken); cancelling the booking trims it to 15 minutes and re-opens the covered slot.
- A Postgres exclusion constraint (`slots_booked_no_overlap`, btree_gist) makes overlapping Booked rows for one host impossible; `bookSlot` also checks for overlap.
- Per-host "N times open" counts only future, Open slots of active hosts.
- Changing the slot length: `POST /api/admin/regrid` `{ "slotMinutes": 15, "dryRun": true }` (admin session or `Bearer ADMIN_API_KEY`) reports what would change and rolls back; send `"dryRun": false, "backupTable": "slots_backup_YYYYMMDD"` to apply. `GET /api/admin/export` returns a JSON backup of agencies, slots, settings and schedule.
- `POST /api/bookSlot` takes `{ slotId, name, email, org?, topic? }`.
- Email cap comes from Settings `Max Bookings Per Email` (seeded at 2).
- Concurrent bookings for the same email are serialized with `pg_advisory_xact_lock(hashtext(email))`. The Open → Booked update is `WHERE id = $1 AND status = 'Open'` so a double-tap returns `TAKEN`.

## Admin page (`/admin`)

Sign in with `ADMIN_PASSWORD`. The session is an httpOnly, HMAC-signed cookie (7 days); changing `ADMIN_PASSWORD` in Vercel and redeploying signs everyone out. The password never reaches the browser bundle.

On the page you can:

- **Add an agency/host** (name, Support agency or Startup, contact name, notification emails, description, location, website, logo). A full 15-minute grid for Oct 13–14 is created automatically from the `schedule` table.
- **Edit** any agency, including renaming it (existing bookings stay attached by id) and changing the notification email list (one per line or comma-separated, up to 10).
- **Deactivate / Activate** (hidden from attendees; bookings kept). **Delete** only appears when an agency has no bookings.
- **See and cancel bookings** (cancel re-opens the slot; the attendee is not emailed).
- **Open / close booking**, send a **test email**, and view the **email delivery log** (`mail_log` table).

Agencies live in the `agencies` table (the DB is the source of truth). `scripts/seed.ts` only bootstraps missing hosts and never overwrites edits; do not re-run it against production once `/admin` is in use (it would re-add deleted hosts).

## Migrations

`lib/schema.ts` holds idempotent, additive migrations (logo_url/created_at/updated_at columns, `mail_log`, a unique index on `(agency_id, start_at)`, a unique confirmation index, and a status CHECK). They run automatically on the first request per server instance, or manually with `npm run db:migrate`.

## Admin API

All routes under `/api/admin/*` require:

```
Authorization: Bearer $ADMIN_API_KEY
```

Every write returns the updated row (and, for agencies/settings, the full list) so ops can confirm without a second round trip.

Replace `$HOST` with the Preview origin (no trailing slash).

### Agencies — Active, rep, Partner | Cohort

```bash
# Read
curl -sS -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$HOST/api/admin/agencies"

# Activate a partner and set the rep (read-back in the JSON)
curl -sS -X PATCH "$HOST/api/admin/agencies" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"SBA","active":true,"type":"Partner","repName":"Jane Doe","repEmails":"jane@sba.gov"}'

# Hide a host mid-event
curl -sS -X PATCH "$HOST/api/admin/agencies" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"SBA","active":false}'
```

Identify by `id` or `name`. `type` must be `Partner` or `Cohort`.

### Settings — Booking Open

```bash
curl -sS -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$HOST/api/admin/settings"

# Close booking (walk-ups still happen at the tables)
curl -sS -X PATCH "$HOST/api/admin/settings" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"bookingOpen":false}'

# Re-open
curl -sS -X PATCH "$HOST/api/admin/settings" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"key":"Booking Open","value":"true"}'
```

### Slots — Open | Booked | Blocked

```bash
# Filter: agency, day, status
curl -sS -H "Authorization: Bearer $ADMIN_API_KEY" \
  "$HOST/api/admin/slots?agency=August%20Interactive&status=Open"

# Block a time (keynote, no-show buffer, etc.)
curl -sS -X PATCH "$HOST/api/admin/slots" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"augustinteract-20261013-0800","status":"Blocked"}'

# Re-open
curl -sS -X PATCH "$HOST/api/admin/slots" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"augustinteract-20261013-0800","status":"Open"}'

# Mark booked at the table
curl -sS -X PATCH "$HOST/api/admin/slots" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"augustinteract-20261013-0800","status":"Booked","attendeeName":"Walk-up","attendeeEmail":"ops@forge.institute"}'
```

Setting a slot back to `Open` or `Blocked` clears attendee fields.

## Ops bookings (unlisted)

No password form. The path segment or `key` query must match `OPS_SECRET`. Wrong or missing secret returns the same 404 as an unknown page.

URL pattern (bookmark the full URL):

```
https://<preview-host>/ops/<OPS_SECRET>
https://<preview-host>/ops/<OPS_SECRET>
```

Example secret: `openssl rand -hex 24`, then prefix `oh-` if you want it obvious in the path.

The page lists every **Booked** slot: attendee name, email, org, topic, host/agency (startup or support agency), day/time, confirmation code.

If `OPS_SECRET` is not set on that deployment, `/ops` is 404 for every token.

## Booking email

On a successful `POST /api/bookSlot` the app sends (via Gmail SMTP, smtp.gmail.com:465, after the response):

1. **Confirmation** to the attendee.
2. **Host notification** to the booked agency's notification emails (set in `/admin`), with Reply-To set to the attendee.
3. **Admin copy** to `NOTIFY_EMAIL` (default `robertandrewbaker20@gmail.com`; skipped if it's already one of the host addresses).

Every send is logged to the `mail_log` table (visible at `/admin#mail`) and to the function log. If `GMAIL_USER` / `GMAIL_APP_PASSWORD` are missing or Gmail errors, **the booking still succeeds**.

Mail is sent as `"Forge Summit Office Hours" <GMAIL_USER>`. Create the app password at https://myaccount.google.com/apppasswords (2-Step Verification required). Gmail limits personal accounts to roughly 500 recipients/day, well above summit volume.

## Preview deploy

This repository is the source of truth. Link it to the existing Vercel project `forge-summit-oh` and set **Preview** and **Production** env (Project → Settings → Environment Variables). Mail vars are optional — booking works without mail:

| Variable | Required for | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Booking + ops list | Neon pooled string for `br-aged-thunder-b5sqlxj2` |
| `ADMIN_PASSWORD` | `/admin` page | Min 12 chars. Set as a Sensitive env var |
| `ADMIN_API_KEY` | `/api/admin/*` | Bearer secret |
| `OPS_SECRET` | Unlisted `/ops` page | Long random, URL-safe. Bookmark `$HOST/ops/$OPS_SECRET` |
| `GMAIL_USER` | Mail | Sending Gmail address |
| `GMAIL_APP_PASSWORD` | Mail | Sensitive. If absent, book still succeeds; mail is skipped and logged |
| `NOTIFY_EMAIL` | Mail | `robertandrewbaker20@gmail.com` |

After changing Preview env, redeploy the Preview (or push a commit) so the new values load.


After Preview is up:

```bash
curl -sS "$HOST/api/getAvailability" | head
```

Expect `"open": true`, the eight Phoenix cohort hosts, and the three partner agencies (SBA, AEDC, ASBTDC). Slots are 15 minutes.


## Ops URL

Use `/ops/<OPS_SECRET>` only (path token). Query `?key=` is disabled. Keep the ops URL offline — do not paste it into GitHub or chat.
