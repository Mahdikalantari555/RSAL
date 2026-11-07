import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Slim self-contained server bundle for the Docker image (BUILD_STANDALONE=1).
  // Local `npm run build && npm start` keeps the standard layout.
  output: process.env.BUILD_STANDALONE === '1' ? 'standalone' : undefined,
};

export default nextConfig;
