import "./globals.css";
import "./inoverse-black.css";
import "./landing.css";

export const metadata = {
  title: "Inoverse",
  description: "Inoverse: talk with Inovo, the AI cofounder that checks the gaps before you build. Runs on Gemma.",
  // "?v=2" makes browsers fetch the icon fresh instead of reusing a cached "no icon"
  icons: {
    icon: [
      { url: "/favicon.ico?v=2", sizes: "any" },
      { url: "/icon-32.png?v=2", type: "image/png", sizes: "32x32" },
      { url: "/icon-192.png?v=2", type: "image/png", sizes: "192x192" },
    ],
    apple: { url: "/apple-icon.png?v=2", sizes: "180x180" },
  },
};

// viewportFit "cover": the page fills the whole screen on phones with a notch;
// the CSS keeps buttons clear of it with env(safe-area-inset-*).
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Anton&family=Jost:wght@300..700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
