# Forge Summit 2026 — Office Hours

Phone-first booking for the 2026 Forge Summit (13–14 October, America/Chicago) in Ballroom C, Downtown North Little Rock. Attendees scan a QR code, pick a Phoenix 2026 cohort host or a partner agency, and take a 30-minute slot. Each group has a table sign.

Mid-event ops run through a Bearer-authenticated admin API. Flip hosts Active, close booking, or Block a slot without a redeploy.

Brand voice matches [forge.institute/summit](https://www.forge.institute/summit): serious cyber / defense, no carnival copy.

## Stack

- Next.js App Router (TypeScript) + Tailwind
- Neon Postgres (`flat-hat-60967335`, production branch `br-aged-thunder-b5sqlxj2`)
- Vercel Preview only for this work (no production promote, no custom domain)

Public surfaces:

| Path | Purpose |
| --- | --- |
| `/` and `/oh` | Attendee booking |
| `/board` | Venue display (Chicago “today”) |
| `GET /api/getAvailability` | Open slots for active hosts |
| `POST /api/bookSlot` | Race-safe Open → Booked |
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
ADMIN_API_KEY=         # long random secret for /api/admin/*
```

Obtain `DATABASE_URL` from the Neon console (or the Vercel Neon integration) for project `flat-hat-60967335`, database `neondb`, pooled endpoint. Do not paste the full secret into tickets or chat.

```bash
npm install
npm run db:seed        # idempotent; skips slot regen if rows already exist
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Board: [http://localhost:3000/board](http://localhost:3000/board).

`npm run db:seed` creates `agencies`, `settings`, `schedule`, and `slots` if they are missing, upserts the Apps Script host list (partners Active), and rebuilds the 08:00–16:00 / 30-minute grid. Existing Booked rows are left alone.

## Booking rules

- Slot length 30 minutes, back-to-back (`:00` / `:30`), 08:00–16:00 America/Chicago. Meetings are in Ballroom C.
- `POST /api/bookSlot` takes `{ slotId, name, email, org?, topic? }`.
- Email cap comes from Settings `Max Bookings Per Email` (seeded at 2).
- Concurrent bookings for the same email are serialized with `pg_advisory_xact_lock(hashtext(email))`. The Open → Booked update is `WHERE id = $1 AND status = 'Open'` so a double-tap returns `TAKEN`.

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

## Preview deploy

This repository is the source of truth. Link it to the existing Vercel project `forge-summit-office-hours` and set **Preview** env:

- `DATABASE_URL` — Neon pooled string for `br-aged-thunder-b5sqlxj2`
- `ADMIN_API_KEY` — same secret used locally

Do not promote to Production from this work. Do not attach forge.institute DNS.

After Preview is up:

```bash
curl -sS "$HOST/api/getAvailability" | head
```

Expect `"open": true`, the eight Phoenix cohort hosts, and the three partner agencies (SBA, AEDC, ASBTDC). Slots are 30 minutes.
