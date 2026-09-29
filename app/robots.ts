import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// /admin and /ops are intentionally not listed (listing them advertises them).
// They are auth/secret-protected and send noindex via meta + X-Robots-Tag.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
