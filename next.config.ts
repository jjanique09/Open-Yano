import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [
    '@browserbasehq/stagehand',
    '@browserbasehq/sdk',
    'playwright',
    'playwright-core',
  ],
};

export default nextConfig;
