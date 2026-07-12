import type { NextConfig } from "next";
import { adminRedirects } from "./features/console/site/model";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return adminRedirects;
  },
};

export default nextConfig;
