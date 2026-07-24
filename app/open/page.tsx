import type { Metadata } from "next";
import { ColdOpen } from "@/components/vera/cold-open";

export const metadata: Metadata = {
  title: "Cold open — Vera",
  description:
    "The same question answered two ways: a typical AI reporting $50,517.26 after silently dropping 5,952 rows, and Vera reporting $143,787.36 with the date-trap evidence shown.",
};

/**
 * Deterministic and dependency-free on purpose: this route reads nothing off
 * disk, calls nothing, and plays identically every time. It cannot fail on stage.
 */
export default function ColdOpenPage() {
  return <ColdOpen />;
}
