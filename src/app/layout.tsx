import type { Metadata, Viewport } from "next";

import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

import "./globals.css";

export const metadata: Metadata = {
  title: "JARVIS",
  description: "Assistant IA personnel",
  applicationName: "JARVIS",
  appleWebApp: {
    capable: true,
    title: "JARVIS",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false, email: false, address: false },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020407",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
