import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/admin", destination: "/console/site", permanent: true },
      { source: "/admin/dashboard", destination: "/console/site", permanent: true },
      { source: "/lab-assets", destination: "/console/lab-assets", permanent: true },
    ];
  },
};

export default nextConfig;
