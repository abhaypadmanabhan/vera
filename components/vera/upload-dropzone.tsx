"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { LIMITS } from "@/lib/config";
import { cn } from "@/lib/utils";

/**
 * The front door. A drop surface over the ask column and one quiet trigger
 * beside the file on record — no dashed rectangle sits on the page until the
 * reader is actually dragging something (DESIGN.md v3: nothing decorative,
 * this screen should feel like it is waiting).
 *
 * Every guard here runs in the BROWSER, before a byte is posted: `/api/prepare`
 * spends credits, so a wrong extension or an oversized file must never reach it
 * (CLAUDE.md, the money rule).
 */

export interface FileVerdict {
  ok: boolean;
  /** Plain English, safe to show. Empty when the file is fine. */
  reason?: string;
}

const MEGABYTE = 1_000_000;

/** Client-side gate. Extension, then emptiness, then size — cheapest first. */
export function acceptFile(file: File): FileVerdict {
  if (!/\.csv$/i.test(file.name)) {
    return { ok: false, reason: "Vera reads CSV files. Choose one ending in .csv." };
  }
  if (file.size === 0) {
    return { ok: false, reason: "That file is empty. Vera needs a header row and at least one row." };
  }
  if (file.size > LIMITS.maxCsvBytes) {
    return {
      ok: false,
      reason: `That file is over ${LIMITS.maxCsvBytes / MEGABYTE} MB. Send a smaller one and Vera will prepare it.`,
    };
  }
  return { ok: true };
}

/**
 * Wraps the ask column so a file can be dropped anywhere on it. The ring only
 * exists while a drag is over the column; it is a border and an opacity, so
 * reduced motion has nothing to suppress.
 */
export function UploadDropzone({
  onFile,
  busy,
  children,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  children: ReactNode;
}) {
  const [dragging, setDragging] = useState(false);
  // dragenter/dragleave fire for every child element; count them or the ring flickers.
  const depth = useRef(0);

  const end = useCallback(() => {
    depth.current = 0;
    setDragging(false);
  }, []);

  return (
    <div
      className="relative flex w-full flex-1 flex-col"
      onDragEnter={(event) => {
        if (busy || !event.dataTransfer.types.includes("Files")) return;
        event.preventDefault();
        depth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (dragging) event.preventDefault();
      }}
      onDragLeave={() => {
        depth.current -= 1;
        if (depth.current <= 0) end();
      }}
      onDrop={(event) => {
        if (!dragging) return;
        event.preventDefault();
        end();
        const file = event.dataTransfer.files.item(0);
        if (file) onFile(file);
      }}
    >
      {children}

      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-4 flex items-center justify-center rounded-[20px] border border-dashed border-accent bg-accent-wash/60 transition-opacity duration-150",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <p className="text-body font-medium text-accent">Drop your CSV here</p>
      </div>
    </div>
  );
}

/** The keyboard path to the same thing. Owns its own input; the drop surface owns none. */
export function UploadButton({
  onFile,
  busy,
}: {
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.item(0);
          // Clear it, or picking the same file twice fires no change event.
          event.target.value = "";
          if (file) onFile(file);
        }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1 text-small text-ink-muted transition-[color,border-color] duration-150 hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-line disabled:hover:text-ink-muted"
      >
        <Upload className="size-3.5" aria-hidden />
        {busy ? "Preparing your file" : "Use your own file"}
      </button>
    </>
  );
}
