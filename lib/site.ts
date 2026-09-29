/** Canonical public origin (short Vercel alias). Override with NEXT_PUBLIC_SITE_URL for a custom domain. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://forge-summit-oh.vercel.app").replace(/\/+$/, "");
