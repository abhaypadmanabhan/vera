import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";

/*
 * Two families, no more (DESIGN.md v3 "Typography"). Inter carries every word;
 * Geist Mono carries every figure, column name, code line and timing.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Vera — the analyst who shows her work",
  description:
    "Vera writes the analysis code, runs it in an isolated sandbox, and files the code and the exact cells it read next to the number. She releases no number she cannot trace.",
};

/**
 * Applies the stored theme before first paint so a dark-mode reader never sees
 * a white flash. Inline because a module would run after the first frame.
 */
// Vera's design is light (DESIGN.md v3). We default to light regardless of the OS
// preference so the demo looks the same on any machine; the toggle still works and
// an explicit choice is remembered.
const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("vera-theme");document.documentElement.dataset.theme=(t==="dark"||t==="light")?t:"light"}catch(e){document.documentElement.dataset.theme="light"}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${geistMono.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="min-h-full bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
