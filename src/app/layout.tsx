import type { Metadata } from "next";
import { Fraunces, Inter_Tight, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/cn";
import { ConsoleSignature } from "@/components/layout";

const sans = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Polyswap — swaps that wait",
  description:
    "Set a swap on Polygon and let it sit. It only fires when a Polymarket question crosses the threshold you choose. Your funds stay in your wallet until then.",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn(sans.variable, serif.variable, mono.variable)}>
      <body className="bg-paper text-ink antialiased">
        <ConsoleSignature />
        {children}
      </body>
    </html>
  );
}
