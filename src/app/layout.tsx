import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Keeper",
  description: "Your companion app",
  applicationName: "Keeper",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Keeper",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/keeper-logo.png",
    apple: "/keeper-logo.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f4f0",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${dmSerif.variable}`}>
      <body className="min-h-dvh bg-surface font-sans antialiased text-ink">
        {children}
      </body>
    </html>
  );
}
