import type { Metadata } from "next";
import "./globals.css";
import MobileBlocker from "../components/ui/MobileBlocker";

export const metadata: Metadata = {
  title: "PolySwap - Conditional DeFi Swaps",
  description: "Automated DeFi swaps triggered by prediction market outcomes on Polygon",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MobileBlocker />
        {children}
      </body>
    </html>
  );
}
