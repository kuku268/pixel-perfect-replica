/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: { ignoreBuildErrors: true },
  // pdfkit loads its font metrics from node_modules at runtime; keep it out of
  // the server bundle so Vercel's file tracing ships the whole package.
  serverExternalPackages: ["pdfkit"],
  // The embedded Noto Sans TC subset the .pdf export reads with fs.
  outputFileTracingIncludes: {
    "/api/jobs/[id]/export": ["./public/fonts/**/*"],
  },
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
