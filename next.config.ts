import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ignore ESLint errors during builds (useful for CI/Vercel until rules are fully addressed)
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep typechecking on; set to true only if you need to unblock temporarily
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
