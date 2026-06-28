/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: process.cwd(),
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
