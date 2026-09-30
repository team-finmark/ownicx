import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ownicx for salons",
  description: "End-to-end loyalty program suite for salons — powered by Osiq Solutions",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
