import type { Metadata } from "next";
import { Geist_Mono, Inter, Newsreader } from "next/font/google";
import "./globals.css";

/*
 * Three families, one job each (DESIGN.md v4 "Typography").
 *
 * Newsreader is the voice: headlines, slide titles, and the headline figure. An
 * analyst who cites her sources should read like a paper, not like a dashboard.
 * Inter carries every other word. Geist Mono is confined to code, cell values,
 * column names, filenames and timings — the technical surfaces, and nowhere
 * else. Mono as a general UI font is the loudest AI tell in the vault, and it
 * used to be Vera's default label idiom.
 */
const newsreader = Newsreader({
  variable: "--font-newsreader",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600"],
});

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
    <html
      lang="en"
      className={`${newsreader.variable} ${inter.variable} ${geistMono.variable} h-full`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      {/*
        No background on `body`. `html` already paints the canvas, and a body
        background would sit ON TOP of the `z-index: -1` field below and hide it
        completely — the grain was invisible until this came off.
      */}
      <body className="min-h-full font-sans text-ink antialiased">
        {/* The page has a background. Decorative, behind everything, inert. */}
        <div aria-hidden className="v-field">
          <div className="v-field-two" />
        </div>
        {children}
      </body>
    </html>
  );
}
