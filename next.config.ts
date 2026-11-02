import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

/**
 * Security headers applied to all responses.
 * CSP is stricter in production; allows eval in dev for HMR.
 */
const securityHeaders = [
  // Prevent MIME type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Block iframes (clickjacking protection)
  { key: "X-Frame-Options", value: "DENY" },
  // Stop old browsers from leaking referrer to third parties
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permissions policy: lock down powerful browser APIs not needed by SECURIA
  {
    key: "Permissions-Policy",
    value: [
      "camera=(self)", // Capture des pièces d'identité (secrétariat)
      "microphone=()",
      "payment=()",
      "usb=()",
      "geolocation=(self)", // Required for GPS alert positioning
    ].join(", "),
  },
  // Content Security Policy
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: eval needed for dev HMR only
      isDev
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline'",
      // Styles: inline needed for Tailwind CSS
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com",
      // Images: data URIs + Supabase storage + Leaflet tile servers (CartoDB, OpenStreetMap, ESRI ArcGIS)
      "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org https://*.tile.openstreetmap.fr https://*.basemaps.cartocdn.com https://*.arcgisonline.com https://server.arcgisonline.com https://services.arcgisonline.com https://unpkg.com https://cdnjs.cloudflare.com",
      // API + Supabase Realtime WebSocket + Geocoding
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.supabase.in https://nominatim.openstreetmap.org",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Force HTTPS for sub-resource requests in production
      ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ].join("; "),
  },
  // Cross-Origin headers
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // NOTE: 'require-corp' breaks Leaflet CDN tiles; keep 'unsafe-none'
  { key: "Cross-Origin-Embedder-Policy", value: "unsafe-none" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // Enforce HTTPS for 2 years (production only)
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
];

const nextConfig: NextConfig = {
  // ── Performance ──────────────────────────────────────────────────────────────
  reactStrictMode: true,
  compress: true,

  // Remove the X-Powered-By header to avoid revealing framework details
  poweredByHeader: false,

  // ── Images ───────────────────────────────────────────────────────────────────
  images: {
    // Ensure all static assets and remote patterns are loaded directly without requiring server IPX runtime
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
    // Enable modern formats for better performance
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 3600,
    dangerouslyAllowSVG: false,
    contentSecurityPolicy: "default-src 'none'; sandbox",
  },

  // ── Security Headers ─────────────────────────────────────────────────────────
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
      {
        // No-cache for all API routes
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },

  // ── Redirects ────────────────────────────────────────────────────────────────
  async redirects() {
    return [
      // Aliases ergonomiques
      {
        source: "/client/portal",
        destination: "/client-portal",
        permanent: false,
      },
      {
        source: "/client/portal/:path*",
        destination: "/client-portal/:path*",
        permanent: false,
      },
      {
        source: "/portail-client",
        destination: "/client-portal",
        permanent: false,
      },
      {
        source: "/portail-client/:path*",
        destination: "/client-portal/:path*",
        permanent: false,
      },
      {
        source: "/client",
        destination: "/dashboard",
        permanent: false,
      },
      {
        source: "/client/:path*",
        destination: "/dashboard/:path*",
        permanent: false,
      },
      {
        source: "/soc",
        destination: "/dispatch",
        permanent: false,
      },
      {
        source: "/soc/:path*",
        destination: "/dispatch/:path*",
        permanent: false,
      },
    ];
  },

  // ── Development Logging ───────────────────────────────────────────────────────
  ...(isDev
    ? {
        logging: {
          fetches: {
            fullUrl: true,
          },
          // Suppress health check noise in dev logs
          incomingRequests: {
            ignore: [/\/api\/health/],
          },
        },
      }
    : {}),

  // ── Build Output ──────────────────────────────────────────────────────────────
  // Uncomment for Docker / self-hosted deployments:
  // output: "standalone",
};

export default nextConfig;
