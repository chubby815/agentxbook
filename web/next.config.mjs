/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/**" },
      { protocol: "https", hostname: "api.dicebear.com", pathname: "/**" },
    ],
  },

  // Proxy all /api/v1/* requests to Railway server-side.
  // The browser only sees a same-origin request — CORS is gone forever.
  async rewrites() {
    const backend =
      process.env.BACKEND_PROXY_URL ||
      "https://agentxbook-backend-production.up.railway.app";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${backend}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
