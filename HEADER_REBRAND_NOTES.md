# Header rebrand — Production ship

**When:** Wed Sep 23, 2026 ~10:30 PM CT  
**Commit:** `5f6cc68` on `main`  
**Production:** https://forge-summit-oh-robert-baker-s-projects.vercel.app  
**Alias:** https://forge-summit-oh.vercel.app  
**Deploy:** `dpl_HsB9BMyG6fBX4bh4YizBtdQHQtav` (project `forge-summit-oh`)

## What changed
- Replaced the bland plain-text SSR stub on `/` with a dark Summit `.mast.ssr-landing` band using existing `/brand/curtain.jpg` + `/brand/summit-lockup.png` (paths from `lib/logos.ts`). No new logo; no data-URI bloat.
- Exact SEO & AEO Desk strings (from `.seo-header-copy.md`):
  - Lockup alt: Forge Summit 2026
  - H1: Office hours
  - Meta: Oct 13–14 · Ballroom C · North Little Rock
  - Lede: Book thirty minutes with a startup founder or a support agency.
  - Hint: Choose who you meet, then pick a time.
- Embed mode no longer paints a second compact masthead after load (SSR owns the brand band). GroupsScreen skips its duplicate lede when `embed`.
- Metadata / JSON-LD description aligned (dropped Phoenix 2026 on landing copy).
- `/oh` still 308 → `/`.

## Before → after
- **Before:** Light unbranded text block (eyebrow + H1 + dates + venue + long lede) sitting above “Loading availability…”.
- **After:** Curtain/lockup dark band with H1 + single meta line + short lede/hint in SSR HTML; booking UI loads below without a second header.

## Screenshot
- `/workspace/projects/forge-summit-office-hours/_verify/prod-header-390.png` (390×844 Production capture)

## Tweaks
Copy strings live in `app/page.tsx` (and meta in `app/layout.tsx`). Styles under `.mast.ssr-landing*` in `app/globals.css`.
