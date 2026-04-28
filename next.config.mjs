/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // typescript.ignoreBuildErrors removed — strict checks re-enabled.
  // eslint warnings still disabled at build time; clean up in Phase 2.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
