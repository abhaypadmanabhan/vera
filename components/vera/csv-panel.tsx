"use client";

import { useId, useMemo, useState } from "react";
import { AlertTriangle, Database, RotateCcw, Table2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader } from "@/components/ui/card";
import { Panel, SectionLabel } from "./panel";
import { csvSchema } from "@/lib/csv";
import { cn } from "@/lib/utils";
import type { CsvPayload } from "@/lib/types";

/**
 * The data half of the input rail (issue #4).
 *
 * The demo dataset is loaded before anyone touches anything, so the demo never
 * waits on a file picker. Uploading is the alternate path, not the entry point.
 */
export function CsvPanel({
  csv,
  isDemo,
  disabled,
  onLoad,
  onResetToDemo,
}: {
  csv: CsvPayload;
  isDemo: boolean;
  disabled: boolean;
  onLoad: (payload: CsvPayload) => void;
  onResetToDemo: () => void;
}) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schema = useMemo(() => csvSchema(csv.content), [csv.content]);

  async function accept(file: File | undefined) {
    if (!file) return;
    const isCsv = file.name.toLowerCase().endsWith(".csv") || file.type === "text/csv";
    if (!isCsv) {
      setError(`${file.name} isn't a CSV. Vera reads .csv files.`);
      return;
    }
    const content = await file.text();
    if (csvSchema(content).columns.length === 0) {
      setError(`${file.name} has no header row, so there are no columns to analyse.`);
      return;
    }
    setError(null);
    onLoad({ filename: file.name, content });
  }

  return (
    <Panel>
      <CardHeader className="grid-cols-[1fr_auto] items-center">
        <SectionLabel icon={<Database className="size-3.5" aria-hidden />}>Data</SectionLabel>
        {isDemo ? (
          <Badge
            variant="outline"
            className="border-primary/30 bg-primary/10 text-primary"
            title="Loaded on arrival so the demo never waits on an upload"
          >
            Demo dataset
          </Badge>
        ) : (
          <Button variant="ghost" size="xs" onClick={onResetToDemo} disabled={disabled}>
            <RotateCcw data-icon="inline-start" aria-hidden />
            Back to demo data
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        <div
          onDragOver={(event) => {
            if (disabled) return;
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            if (disabled) return;
            void accept(event.dataTransfer.files[0]);
          }}
          className={cn(
            "rounded-md border border-dashed border-border transition-colors duration-150",
            "focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/40",
            !disabled && "hover:border-primary/50",
            isDragging && "border-primary bg-primary/5",
            disabled && "opacity-60",
          )}
        >
          <input
            id={inputId}
            type="file"
            accept=".csv,text/csv"
            disabled={disabled}
            className="sr-only"
            onChange={(event) => {
              void accept(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <label
            htmlFor={inputId}
            className={cn(
              "flex items-center gap-3 p-4",
              disabled ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-raised ring-1 ring-border">
              <Table2 className="size-4 text-primary" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-sm text-foreground">
                {csv.filename}
              </span>
              <span className="vera-nums block text-xs text-muted-foreground">
                {schema.rowCount.toLocaleString("en-US")} rows ·{" "}
                {schema.columns.length.toLocaleString("en-US")} columns
              </span>
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {isDragging ? "Drop to load" : "Drop a .csv or browse"}
            </span>
          </label>
        </div>

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-xs text-warning">
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            {error}
          </p>
        ) : null}

        <div className="space-y-2">
          <SectionLabel className="text-[0.6875rem]">Columns</SectionLabel>
          <ul className="flex flex-wrap gap-1.5">
            {schema.columns.map((column) => (
              <li key={column}>
                <Badge variant="outline" className="font-mono text-muted-foreground">
                  {column}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Panel>
  );
}
