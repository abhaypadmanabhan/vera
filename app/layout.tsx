import type { Metadata } from "next";
import { Geist_Mono, Newsreader } from "next/font/google";
import "./globals.css";

/*
 * Two families, nothing else: Newsreader carries the editorial voice, Geist Mono
 * carries every number, column name, cell, code line and timestamp. There is no
 * sans-serif on this page — that pairing is the brand (DESIGN.md "Typography").
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Vera — the analyst who shows her work",
  description:
    "Vera writes the analysis code, runs it in an isolated sandbox, and files the code and the exact cells it read next to the number. She releases no number she cannot trace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Light only. No `dark` class, no theme switcher — DESIGN.md v2.
  return (
    <html lang="en" className={`${newsreader.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
