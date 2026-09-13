import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  devIndicators: false,
  images: {
    formats: ["image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "r-navigation-1326672316.cos.ap-beijing.myqcloud.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "liesmars.whu.edu.cn",
        pathname: "/images/**",
      },
    ],
  },
  async redirects() {
    return [
      { source: "/admin", destination: "/console/site", permanent: true },
      {
        source: "/admin/dashboard",
        destination: "/console/site",
        permanent: true,
      },
      {
        source: "/lab-assets",
        destination: "/console/lab-assets",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
