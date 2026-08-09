import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // The home page prerenders from the arXiv API. Its own request budget keeps it
  // well under this, which exists only so a slow upstream cannot fail a deploy.
  staticPageGenerationTimeout: 180,
};

export default nextConfig;
