"use client";

import { useCallback, useState } from "react";
import type { CSSProperties } from "react";
import { Ask } from "./ask";
import { Colophon } from "./colophon";
import { DatasetRecord } from "./dataset-record";
import { FindingError, FindingIdle, FindingRunning } from "./finding-pending";
import { FindingRefused } from "./finding-refused";
import { FindingVerified } from "./finding-verified";
import { formatCount } from "./format";
import { MarginRail } from "./margin-rail";
import { useAnalysis } from "@/hooks/use-analysis";
import type { CsvPayload, DatasetSummary } from "@/lib/types";

/**
 * The document.
 *
 * One column of evidence with the live trace running down a margin rail — not a
 * grid of cards. Everything the client knows about the data arrives as a
 * `DatasetSummary` from the server component; the 2.3 MB demo CSV never crosses
 * the wire, and `lib/datasets.ts` never enters this bundle.
 */

/** Mirrors LIMITS.maxCsvBytes in lib/config.ts, which is server-only by design. */
const MAX_CSV_BYTES = 5_000_000;

const EXAMPLES = [
  "Which sub-category lost the most money?",
  "What were total sales in Q3 2018?",
  "Which region gives the deepest average discount?",
];

/** The mock engine blocks any question containing "fail" — PRD §4.1's refusal path. */
const FAIL_EXAMPLE = "Total profit by region — and fail on purpose so I can see the refusal";

const stagger = (index: number) => ({ ["--stagger"]: index }) as CSSProperties;

export function EvidenceDocument({
  demoDataset,
  isMock,
}: {
  demoDataset: DatasetSummary;
  /** True while the mock engine is driving — stated on screen, never implied away. */
  isMock: boolean;
}) {
  const { stages, finding, error, isRunning, start, reset } = useAnalysis();

  const [dataset, setDataset] = useState<DatasetSummary>(demoDataset);
  const [upload, setUpload] = useState<CsvPayload | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isProfiling, setIsProfiling] = useState(false);

  const [draft, setDraft] = useState("");
  const [asked, setAsked] = useState("");
  const [run, setRun] = useState({ id: 0, startedAt: 0 });

  const isDemo = upload === null;

  const ask = useCallback(
    (question: string) => {
      setAsked(question);
      setRun((previous) => ({ id: previous.id + 1, startedAt: Date.now() }));
      void start(question, isDemo ? dataset.id : "upload", upload ?? undefined);
    },
    [dataset.id, isDemo, start, upload],
  );

  const putOnRecord = useCallback(
    async (file: File) => {
      setUploadError(null);

      if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
        setUploadError("Vera reads CSV files. Export the sheet as CSV and drop it again.");
        return;
      }
      if (file.size > MAX_CSV_BYTES) {
        setUploadError(
          `That file is ${formatCount(Math.round(file.size / 1000))} KB. The limit is 5,000 KB.`,
        );
        return;
      }

      setIsProfiling(true);
      try {
        const content = await file.text();
        const response = await fetch("/api/dataset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, content }),
        });
        const payload = (await response.json()) as DatasetSummary | { error?: string };

        if (!response.ok || !("columns" in payload)) {
          const message = "error" in payload ? payload.error : undefined;
          setUploadError(message ?? "That file could not be read.");
          return;
        }

        reset();
        setAsked("");
        setRun({ id: 0, startedAt: 0 });
        setDataset(payload);
        setUpload({ filename: file.name, content });
      } catch {
        setUploadError("That file could not be read in this browser.");
      } finally {
        setIsProfiling(false);
      }
    },
    [reset],
  );

  const returnToDemo = useCallback(() => {
    reset();
    setAsked("");
    setRun({ id: 0, startedAt: 0 });
    setUploadError(null);
    setUpload(null);
    setDataset(demoDataset);
  }, [demoDataset, reset]);

  return (
    <div className="mx-auto w-full max-w-[78rem] px-6 pb-32 sm:px-8">
      <header
        className="v-rise flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-b border-ink pt-8 pb-3"
        style={stagger(0)}
      >
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <p className="font-serif text-claim leading-none font-semibold tracking-[-0.03em]">
            Vera
          </p>
          <p className="v-label">The analyst who shows her work</p>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {isMock ? (
            <p className="v-label text-mark-ink">Mock engine · no sandbox call</p>
          ) : null}
          <p className="v-label">
            <span className="v-nums">{formatCount(dataset.rowCount)}</span> rows on record
          </p>
          <a href="#colophon" className="v-pen v-label text-ink">
            How do we know
          </a>
        </div>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12">
        <div className="v-rise lg:self-start" style={stagger(1)}>
          <MarginRail
            stages={stages}
            isRunning={isRunning}
            runId={run.id}
            startedAt={run.startedAt}
            settled={finding !== null || error !== null}
          />
        </div>

        <article className="min-w-0 space-y-16 lg:border-l lg:border-rule lg:pl-12">
          <div className="v-rise" style={stagger(2)}>
            <Ask
              value={draft}
              onChange={setDraft}
              onSubmit={ask}
              isRunning={isRunning}
              examples={EXAMPLES}
              failExample={FAIL_EXAMPLE}
            />
          </div>

          <div className="v-rise" style={stagger(3)}>
            {finding ? (
              finding.verdict === "verified" ? (
                <FindingVerified finding={finding} question={asked} dataset={dataset} />
              ) : (
                <FindingRefused finding={finding} question={asked} dataset={dataset} />
              )
            ) : error ? (
              <FindingError
                message={error}
                onRetry={() => ask(asked || EXAMPLES[0])}
                disabled={isRunning}
              />
            ) : isRunning ? (
              <FindingRunning question={asked} />
            ) : (
              <FindingIdle />
            )}
          </div>

          <div className="v-rise" style={stagger(4)}>
            <DatasetRecord
              dataset={dataset}
              isDemo={isDemo}
              disabled={isRunning}
              isProfiling={isProfiling}
              error={uploadError}
              onFile={(file) => void putOnRecord(file)}
              onResetToDemo={returnToDemo}
            />
          </div>

          <div className="v-rise" style={stagger(5)}>
            <Colophon isMock={isMock} />
          </div>
        </article>
      </div>
    </div>
  );
}
