import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Дневник пикфлоуметрии — Simple PFM Diary",
  description: "Простой дневник пикфлоуметрии для ежедневного контроля пиковой скорости выдоха. PWA, работает офлайн.",
  keywords: ["пикфлоуметрия", "ПСВ", "астма", "дневник", "здоровье", "peak flow", "PFM"],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Дневник ПФМ",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#059669" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* PWA manifest — manual link to bypass Next.js basePath bug */}
        <link rel="manifest" href="/simplepfmdiary/manifest.json" />
        <link rel="apple-touch-icon" href="/simplepfmdiary/icon-192.png" />
        <meta name="apple-mobile-web-app-title" content="Дневник ПФМ" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#059669" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  const reg = navigator.serviceWorker.register('/simplepfmdiary/sw.js');
                  reg.then(function(swReg) {
                    swReg.addEventListener('updatefound', function() {
                      var newSW = swReg.installing;
                      newSW.addEventListener('statechange', function() {
                        if (newSW.state === 'installed' && navigator.serviceWorker.controller) {
                          window.dispatchEvent(new CustomEvent('sw-update-available'));
                        }
                      });
                    });
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
