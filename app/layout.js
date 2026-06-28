import "./globals.css";

export const metadata = {
  title: "Pharadol Booking System",
  description: "Booking Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
