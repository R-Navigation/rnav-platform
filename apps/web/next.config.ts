import type { NextConfig } from "next";
import { labAssetsRedirects } from "./features/console/lab-assets/model";
import { adminRedirects } from "./features/console/site/model";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [...adminRedirects, ...labAssetsRedirects];
  },
};

export default nextConfig;
