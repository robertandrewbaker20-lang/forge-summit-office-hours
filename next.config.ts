import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
