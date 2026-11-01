import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the isolated screen test build separate from the running store.
  distDir: process.env.STORELAUNCH_SCREEN_TEST === "1" ? ".next-screen-test" : ".next",
  cacheComponents: true,
  partialPrefetching: true,
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: "32mb" },
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
    ];
    if (process.env.NODE_ENV === "production") {
      securityHeaders.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
    }
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    // HRM moved out of the admin shell into the shared /hrm portal.
    return [
      { source: "/admin/hrm", destination: "/hrm", permanent: false },
      { source: "/admin/hrm/:path*", destination: "/hrm/:path*", permanent: false },
    ];
  },
  turbopack: {
    root: process.cwd(),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
