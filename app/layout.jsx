import "./globals.css";
import "./inoverse-black.css";
import "./landing.css";

export const metadata = {
  title: "Inoverse",
  description: "Inoverse: talk with Inovo, the AI cofounder that checks the gaps before you build. Runs on Gemma.",
};

export const viewport = { themeColor: "#000000" };

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
