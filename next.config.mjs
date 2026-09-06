/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // M0 shipped hyphen-free auth routes; M1 renames them to /sign-in and /sign-up.
  // Keep the old paths working so stale links and Supabase redirect URLs don't 404.
  async redirects() {
    return [
      { source: "/signin", destination: "/sign-in", permanent: false },
      { source: "/signup", destination: "/sign-up", permanent: false },
    ];
  },
};

export default nextConfig;
