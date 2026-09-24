import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

// Il font viene scaricato in fase di build e servito dal nostro dominio: nessuna
// richiesta ai server Google dal browser (GDPR: niente IP del cliente a Google).
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: "Gestionale di Marinelli Stefano",
  description: "Cassa, clienti e magazzino per Viterbo e Gran Sasso.",
  manifest: "/manifest.webmanifest",
  applicationName: "Gestionale Stefano Marinelli",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Gestionale SM" },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/pwa-icon-192.png",
    shortcut: "/pwa-icon-192.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#05090c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={manrope.variable}>
      <head>
        {/* Material Symbols è self-hosted (public/fonts) via @font-face in globals.css: icone garantite anche offline. */}
      </head>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
