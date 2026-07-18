/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https://drive.google.com https://*.googleusercontent.com https://*.supabase.co",
      "media-src 'self' data: blob: https://*.googleusercontent.com https://*.supabase.co",
      "connect-src 'self' https://*.supabase.co https://*.googleapis.com https://oauth2.googleapis.com https://api.resend.com",
      "frame-src 'self' https://drive.google.com https://accounts.google.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
      "frame-ancestors 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/dashboard", destination: "/adisorn/dashboard" },
      { source: "/customers", destination: "/adisorn/customers" },
      { source: "/booking", destination: "/adisorn/booking" },
      { source: "/booking-view", destination: "/adisorn/booking-view" },
      { source: "/archives", destination: "/adisorn/archives" },
      { source: "/calendar", destination: "/adisorn/calendar" },
      { source: "/income", destination: "/adisorn/income" },
      { source: "/notifications", destination: "/adisorn/notifications" },
      { source: "/reports", destination: "/adisorn/reports" },
      { source: "/settings", destination: "/adisorn/settings" },
      { source: "/trash", destination: "/adisorn/trash" },
    ];
  },
};

export default nextConfig;
