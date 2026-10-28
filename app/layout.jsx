import "./globals.css";

export const metadata = {
  title: "Inovix cofounder",
  description: "A voice AI cofounder that checks the gaps before you build. Runs on Gemma.",
};

export const viewport = { themeColor: "#15183f" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,400..800&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
