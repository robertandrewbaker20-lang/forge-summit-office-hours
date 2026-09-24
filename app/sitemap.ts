import type { MetadataRoute } from "next";

const BASE =
  process.env.NEXT_PUBLIC_SITE_URL ||
  "https://forge-summit-oh-robert-baker-s-projects.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${BASE}/`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${BASE}/board`,
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.5,
    },
  ];
}
