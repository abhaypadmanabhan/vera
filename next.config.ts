import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The demo runs on `next dev` (PRD §5 — no Vercel), so the dev overlay badge
  // would sit on top of the hero screen during the presentation. Turning it off
  // is presentation-only; it changes nothing about how the app runs.
  devIndicators: false,
};

export default nextConfig;
