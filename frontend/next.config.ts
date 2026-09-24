import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone build for optimized Vercel deployment
  output: "standalone",

  // Environment variables available at build time
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  },

  // Disable TypeScript errors blocking production builds
  typescript: {
    ignoreBuildErrors: true,
  },

  // Image optimization config
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
