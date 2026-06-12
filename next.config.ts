import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["recharts"],
  experimental: {
    optimizePackageImports: ["recharts", "framer-motion"],
  },
};

export default nextConfig;
