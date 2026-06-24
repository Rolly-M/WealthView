import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  // Preload only the weights we actually use
  weight: ["400", "500", "600", "700"],
  // fallback prevents layout shift if the font fails to load
  fallback: ["system-ui", "-apple-system", "sans-serif"],
});

export const metadata: Metadata = {
  title: {
    default: "WealthView Duo — Couples Financial Intelligence",
    template: "%s | WealthView Duo",
  },
  description:
    "Beautifully simple budgeting, spending insights, and investment research for couples.",
  keywords: ["budgeting", "couples finance", "financial planning", "spending tracker"],
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://wealthviewduo.vercel.app"
  ),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0d9488",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
