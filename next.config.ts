import type { NextConfig } from "next";

const NOINDEX = [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/admin", headers: NOINDEX },
      { source: "/admin/:path*", headers: NOINDEX },
      { source: "/ops", headers: NOINDEX },
      { source: "/ops/:path*", headers: NOINDEX },
    ];
  },
  async redirects() {
    return [
      {
        source: "/oh",
        destination: "/",
        permanent: true,
      },
      {
        source: "/oh/:path*",
        destination: "/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
