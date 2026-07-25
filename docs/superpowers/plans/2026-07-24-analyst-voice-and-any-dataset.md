# Analyst Voice and Any Dataset — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vera leads with the finding and what it means, and can take any uploaded file, prepare it like an analyst, and offer the questions worth asking of it.

**Architecture:** The generated Python may now return grounded *context figures* alongside the answer, inside the existing single `VERA_RESULT` line — so Vera has something true to compare against. A new prep pipeline runs once per uploaded file: the profiler detects problems deterministically, one Fireworks call writes the cleaning script and proposes questions, one Daytona run executes it, and a fixed audit script *we* wrote measures what changed. The deck is reordered around finding → meaning → caveat → the working.

**Tech Stack:** Next.js App Router · TypeScript strict · Vitest · Zod · Fireworks (raw fetch client) · Daytona TS SDK · Tailwind + shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-07-24-analyst-voice-and-any-dataset-design.md`

## Global Constraints

- **Money rule (CLAUDE.md):** no Fireworks, Daytona, Braintrust or ElevenLabs call without the builder's explicit go. Build and prove everything in mock mode. Never read, print, `cat`, `grep` or commit `.env.local`.
- **Mock mode is permanent:** `VERA_MOCK` must run the entire flow with zero keys and zero external calls, after every change. This is a test, not a courtesy.
- **Honesty rule (PRD §6):** a figure renders only when `verdict === "verified"`. A context figure that fails grounding is **dropped** — never hedged, never shown as pending, never mentioned.
- **No code jargon on any presentation surface.** Column names, date formats and pandas terms appear on the working slide only.
- **TypeScript strict, no `any`.** `pnpm lint`, `npx tsc --noEmit`, `pnpm build`, `pnpm test` must all exit zero.
- **`python-policy.ts` still enforces exactly one `print` call.** Do not relax it.
- **Rate limit before ship:** `/api/prepare` spends money and does not merge without `checkRateLimit`.
- Test command is `pnpm vitest run <path>` for one file, `pnpm test` for all. Tests live in `tests/`, import via the `@/` alias.
- Branch per slice off `feat/p2-fireworks`. No PR from the agent — push only. The orchestrator is the merge gate.

---

## File Structure

**Created**

| File | Responsibility |
|---|---|
| `lib/prepare/generate.ts` | The one Fireworks call: cleaning script, plain-English fixes, candidate questions |
| `lib/prepare/audit.ts` | A fixed Python string *we* wrote that measures the file before and after. The model never writes it |
| `lib/prepare/run.ts` | Orchestrates prep: generate → execute → audit → guardrail-filter the questions |
| `lib/prepare/store.ts` | Memoises a `PrepReport` by SHA-256 of file content |
| `app/api/prepare/route.ts` | Rate-limited SSE route streaming prep stages |
| `components/vera/upload-dropzone.tsx` | The front door: file picker plus drag-and-drop |
| `components/vera/prep-screen.tsx` | Prep stages and the ready state |
| `tests/result-envelope.test.ts`, `tests/context-grounding.test.ts`, `tests/prepare-generate.test.ts`, `tests/prepare-run.test.ts`, `tests/prepare-route.test.ts`, `tests/deck-voice.test.ts`, `tests/upload-ui.test.ts` | Coverage for each slice |

**Modified**

| File | Change |
|---|---|
| `lib/types.ts` | `ContextFigure`, `Valence`, `ExecutionResult.contextValues`, `Finding.context`, `Finding.valence`, `PrepReport` |
| `lib/daytona/sandbox.ts` | `parseResultPayload` beside the existing `parseResultValue` |
| `lib/codegen/generate.ts` | `context[]` and `valence` in the schema, the prompt, and the mock |
| `lib/verify.ts` | `verifyContextFigures` |
| `lib/real-analyst.ts` | Merge declared context with executed values, ground them, attach to the finding |
| `lib/deck.ts` | New slide order, valence openers, consequence lines, merged working slide |
| `lib/datasets.ts` | Expose the content hash used for prep memoisation |
| `app/ask/page.tsx`, `components/vera/ask-screen.tsx` | Upload entry point, prep flow, per-file chips |

---

# PHASE A — the contract (Tasks 1-4) and prep (Tasks 5-8) run in parallel

Phase A owns two disjoint file sets. `lib/types.ts` belongs to the **contract** slice alone; the prep slice imports from it and never edits it.

---

### Task 1: The structured result envelope

**Files:**
- Modify: `lib/types.ts` (add `ContextFigure`, `Valence`; extend `ExecutionResult`)
- Modify: `lib/daytona/sandbox.ts:141-161` (add `parseResultPayload`)
- Test: `tests/result-envelope.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type Valence = "good" | "bad" | "neutral";

  export interface ContextFigure {
    /** Machine key, matching the executed payload. e.g. "prior_period" */
    name: string;
    /** Plain English, spoken aloud. e.g. "the same quarter a year earlier" */
    description: string;
    value: number | string;
    /** Columns this figure was computed from. Grounded exactly like the primary value. */
    columnsUsed: string[];
  }

  // lib/daytona/sandbox.ts
  export interface ResultPayload {
    value: number | string | null;
    /** Raw executed context values, keyed by name. Empty when none. */
    contextValues: Record<string, number | string>;
  }
  export function parseResultPayload(output: string): ResultPayload;
  ```
  `ExecutionResult` gains `contextValues: Record<string, number | string>`.

**Why it is one print, not two:** `lib/codegen/python-policy.ts:253` throws unless the generated code contains exactly one `print` call. That is what stops generated code emitting arbitrary output, and it stays. The context therefore rides inside the existing marker.

- [ ] **Step 1: Write the failing test**

```ts
// tests/result-envelope.test.ts
import { describe, expect, it } from "vitest";
import { parseResultPayload, parseResultValue } from "@/lib/daytona/sandbox";

describe("parseResultPayload — the widened contract with generated code", () => {
  it("still reads a bare scalar, exactly as before", () => {
    expect(parseResultPayload("VERA_RESULT:143787.36")).toEqual({
      value: 143787.36,
      contextValues: {},
    });
  });

  it("reads the envelope form", () => {
    const line = 'VERA_RESULT:{"value":143787.36,"context":{"prior_period":121004.2,"share_of_total":0.42}}';
    expect(parseResultPayload(line)).toEqual({
      value: 143787.36,
      contextValues: { prior_period: 121004.2, share_of_total: 0.42 },
    });
  });

  it("drops a context entry that is not a usable figure — she says less, never wrong", () => {
    const line = 'VERA_RESULT:{"value":10,"context":{"good":5,"bad":null,"worse":"","awful":[1,2]}}';
    expect(parseResultPayload(line).contextValues).toEqual({ good: 5 });
  });

  it("drops NaN and Infinity from context, as it already does for the primary value", () => {
    const line = 'VERA_RESULT:{"value":10,"context":{"a":"NaN","b":"Infinity"}}';
    expect(parseResultPayload(line).contextValues).toEqual({});
  });

  it("keeps at most three context figures", () => {
    const line = 'VERA_RESULT:{"value":1,"context":{"a":1,"b":2,"c":3,"d":4}}';
    expect(Object.keys(parseResultPayload(line).contextValues)).toHaveLength(3);
  });

  it("a malformed envelope blocks the value rather than half-reading it", () => {
    expect(parseResultPayload('VERA_RESULT:{"context":{"a":1}}').value).toBeNull();
  });

  it("leaves parseResultValue behaving exactly as it did", () => {
    expect(parseResultValue("VERA_RESULT:143787.36")).toBe(143787.36);
    expect(parseResultValue('VERA_RESULT:{"value":10,"context":{"a":1}}')).toBe(10);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run tests/result-envelope.test.ts`
Expected: FAIL — `parseResultPayload` is not exported.

- [ ] **Step 3: Implement**

In `lib/daytona/sandbox.ts`, keep `coerceValue` untouched and add above `parseResultValue`:

```ts
const MAX_CONTEXT_FIGURES = 3;

export interface ResultPayload {
  value: number | string | null;
  contextValues: Record<string, number | string>;
}

function isEnvelope(parsed: unknown): parsed is { value: unknown; context?: unknown } {
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    "value" in parsed
  );
}

/** A context figure is held to the same bar as the primary value: usable, or gone. */
function coerceContext(raw: unknown): Record<string, number | string> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number | string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_CONTEXT_FIGURES) break;
    if (typeof value === "number") {
      if (Number.isFinite(value)) out[name] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    if (/^(nan|-?inf(inity)?|none|null|na|n\/a)$/i.test(trimmed)) continue;
    out[name] = trimmed;
  }
  return out;
}

export function parseResultPayload(output: string): ResultPayload {
  const line = output
    .split("\n")
    .reverse()
    .find((l) => l.trim().startsWith(RESULT_PREFIX));
  if (!line) return { value: null, contextValues: {} };
  const raw = line.trim().slice(RESULT_PREFIX.length).trim();
  if (raw === "") return { value: null, contextValues: {} };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { value: parseResultValue(output), contextValues: {} };
  }

  if (isEnvelope(parsed)) {
    return {
      value: coerceValue(parsed.value),
      contextValues: coerceContext(parsed.context),
    };
  }
  return { value: parseResultValue(output), contextValues: {} };
}
```

Note the one subtlety the test pins: `{"value":10,...}` is an envelope, and a single-key `{"value":10}` reaches the same answer through the same branch, so `parseResultValue` is unchanged in behaviour.

Then set `contextValues` on the `ExecutionResult` that `daytonaExecutor.execute` builds, using `parseResultPayload` instead of `parseResultValue`. Add to `lib/types.ts`:

```ts
export type Valence = "good" | "bad" | "neutral";

export interface ContextFigure {
  name: string;
  description: string;
  value: number | string;
  columnsUsed: string[];
}
```
and to `ExecutionResult`:
```ts
  /** Extra grounded figures the same script computed. Empty when none. */
  contextValues: Record<string, number | string>;
```

- [ ] **Step 4: Fix every construction site**

`npx tsc --noEmit` will name each place an `ExecutionResult` is built (the mock engine, the retry loop, and several test fixtures). Give each `contextValues: {}`. Do not change any existing assertion.

- [ ] **Step 5: Green**

Run: `pnpm vitest run tests/result-envelope.test.ts tests/daytona-parse.test.ts tests/mock-engine.test.ts`
Expected: PASS, and `daytona-parse.test.ts` unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/daytona/sandbox.ts tests/result-envelope.test.ts
git commit -m "feat(contract): let one printed line carry the answer and its context"
```

---

### Task 2: Codegen asks for context and a tone

**Files:**
- Modify: `lib/codegen/generate.ts:24-63` (types and schemas), `:83-109` (prompt), `:161-209` (mock)
- Test: `tests/codegen-structured.test.ts` (extend)

**Interfaces:**
- Consumes: `Valence` from Task 1.
- Produces: `CodegenOutput` gains
  ```ts
    /** Declared before execution. Empty is legal and common. */
    context: Array<{ name: string; description: string; columnsUsed: string[] }>;
    valence: Valence;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// append to tests/codegen-structured.test.ts
it("accepts context figures and a valence", () => {
  const raw = JSON.stringify({
    code: VALID_CODE, // reuse the fixture already in this file
    explanation: "Sums Sales for Q3 2018.",
    headline: "Sales in the third quarter came to {value} dollars.",
    columnsUsed: ["Order Date", "Sales"],
    context: [
      { name: "prior_period", description: "the same quarter a year earlier", columnsUsed: ["Order Date", "Sales"] },
    ],
    valence: "good",
  });
  const parsed = parseCodegenResponse(raw, PROFILE, SANDBOX_PATH);
  expect(parsed.context[0]?.name).toBe("prior_period");
  expect(parsed.valence).toBe("good");
});

it("defaults to no context and a neutral tone when the model omits them", () => {
  const parsed = parseCodegenResponse(MINIMAL_VALID_RESPONSE, PROFILE, SANDBOX_PATH);
  expect(parsed.context).toEqual([]);
  expect(parsed.valence).toBe("neutral");
});

it("rejects a valence that is not one of the three — it may never carry prose", () => {
  const raw = JSON.stringify({ ...MINIMAL_OBJECT, valence: "up 18% on last quarter" });
  expect(() => parseCodegenResponse(raw, PROFILE, SANDBOX_PATH)).toThrow();
});

it("caps context at three figures", () => {
  const four = [1, 2, 3, 4].map((n) => ({ name: `c${n}`, description: `d${n}`, columnsUsed: ["Sales"] }));
  const raw = JSON.stringify({ ...MINIMAL_OBJECT, context: four });
  expect(() => parseCodegenResponse(raw, PROFILE, SANDBOX_PATH)).toThrow();
});

it("rejects a context figure claiming a column this file does not have", () => {
  const raw = JSON.stringify({
    ...MINIMAL_OBJECT,
    context: [{ name: "c", description: "d", columnsUsed: ["NotAColumn"] }],
  });
  expect(() => parseCodegenResponse(raw, PROFILE, SANDBOX_PATH)).toThrow();
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/codegen-structured.test.ts`
Expected: FAIL — `context` is stripped by `.strict()`.

- [ ] **Step 3: Widen both schemas**

In `CODEGEN_JSON_SCHEMA` add, keeping `required` as it is so both fields are optional over the wire:

```ts
    context: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          name: { type: "string", minLength: 1 },
          description: { type: "string", minLength: 1 },
          columnsUsed: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "columnsUsed"],
        additionalProperties: false,
      },
    },
    valence: { type: "string", enum: ["good", "bad", "neutral"] },
```

In `codegenSchema`:

```ts
    context: z
      .array(
        z.object({
          name: z.string().min(1).max(64),
          description: z.string().min(1).max(160),
          columnsUsed: z.array(z.string().max(200)).max(20),
        }),
      )
      .max(3)
      .default([]),
    valence: z.enum(["good", "bad", "neutral"]).default("neutral"),
```

In `assertSafeCode`, after the existing `validatePythonPolicy` call, reject a context figure naming an unknown column:

```ts
  const known = new Set(profile.columns.map((column) => column.name));
  for (const figure of output.context) {
    const unknown = figure.columnsUsed.filter((column) => !known.has(column));
    if (unknown.length > 0) {
      throw new Error(
        `Context figure "${figure.name}" claims columns this file does not have: ${unknown.join(", ")}.`,
      );
    }
  }
```

- [ ] **Step 4: Extend the prompt**

In `buildCodegenPrompt`, replace the rule that begins `- That JSON value MUST be a bare number or a bare string` with:

```
- The printed JSON value MUST be either the bare figure, or an object of exactly this shape:
  {"value": <the figure>, "context": {"<name>": <figure>, ...}}. Nothing else. Still ONE print.
- "context" is optional and holds at most three EXTRA figures the same program already has the
  data to compute, and which a business person would want alongside the answer: the same measure
  for the previous comparable period, this slice's share of the whole, or the largest single
  contributor. Every context figure must be a bare number or bare string. Compute them, never
  estimate them. If nothing genuinely informative is available, return no context at all.
- The "context" field in the JSON you return declares those same figures in the SAME ORDER, with
  a "description" written the way you would say it out loud — "the same quarter a year earlier",
  never "prior_period" and never a column name.
- "valence": "good" if this finding is welcome news for the business, "bad" if it is unwelcome,
  "neutral" otherwise. It selects a tone of voice only. It MUST NOT contain a number, and it MUST
  be exactly one of those three words.
```

Also extend the headline rule with one line: `The headline states the answer only. The comparison belongs in the context figures, not in this sentence.`

- [ ] **Step 5: Teach the mock**

In `mockResponse`, add to the returned object so mock mode exercises the new path end to end:

```ts
    context: numericColumn
      ? [
          {
            name: "row_count",
            description: "the number of records behind it",
            columnsUsed: columnsUsed,
          },
        ]
      : [],
    valence: "neutral",
```
and extend the mock's Python so the printed line is the envelope form:
```ts
    numericColumn
      ? `result = {"value": round(float(df[${JSON.stringify(numericColumn.name)}].sum()), 2), "context": {"row_count": int(len(df))}}`
      : 'result = {"value": int(len(df)), "context": {}}',
```

- [ ] **Step 6: Green**

Run: `pnpm vitest run tests/codegen-structured.test.ts tests/codegen-retry.test.ts tests/mock-engine.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/codegen/generate.ts tests/codegen-structured.test.ts
git commit -m "feat(codegen): ask for grounded context figures and a tone, never a guessed comparison"
```

---

### Task 3: Ground the context, or drop it

**Files:**
- Modify: `lib/verify.ts` (add `verifyContextFigures`)
- Modify: `lib/types.ts` (`Finding` verified branch gains `context` and `valence`)
- Test: `tests/context-grounding.test.ts`

**Interfaces:**
- Consumes: `ContextFigure`, `Valence` (Task 1); `CodegenOutput.context` (Task 2).
- Produces:
  ```ts
  export interface VerifyContextInput {
    declared: Array<{ name: string; description: string; columnsUsed: string[] }>;
    executed: Record<string, number | string>;
    profile: DatasetProfile;
  }
  /** Returns only figures that both executed AND trace to real columns. Never throws. */
  export function verifyContextFigures(input: VerifyContextInput): ContextFigure[];
  ```
  `Finding`'s verified branch gains `context: ContextFigure[]` and `valence: Valence`.

**This is the honesty surface of the whole change. A dropped figure leaves no trace in the UI.**

- [ ] **Step 1: Write the failing test**

```ts
// tests/context-grounding.test.ts
import { describe, expect, it } from "vitest";
import { verifyContextFigures } from "@/lib/verify";
import { PROFILE } from "./fixtures/profile"; // reuse whatever fixture tests/ already exports

const declared = [
  { name: "prior_period", description: "the same quarter a year earlier", columnsUsed: ["Sales"] },
  { name: "share", description: "its share of the year", columnsUsed: ["Sales"] },
];

describe("verifyContextFigures — grounded, or gone", () => {
  it("keeps a figure that executed and traces to a real column", () => {
    const kept = verifyContextFigures({
      declared,
      executed: { prior_period: 121004.2, share: 0.42 },
      profile: PROFILE,
    });
    expect(kept.map((f) => f.name)).toEqual(["prior_period", "share"]);
    expect(kept[0]?.value).toBe(121004.2);
  });

  it("drops a declared figure the code never produced", () => {
    const kept = verifyContextFigures({ declared, executed: { prior_period: 1 }, profile: PROFILE });
    expect(kept.map((f) => f.name)).toEqual(["prior_period"]);
  });

  it("drops an executed figure that was never declared — no undescribed number reaches the voice", () => {
    const kept = verifyContextFigures({
      declared,
      executed: { prior_period: 1, smuggled: 999 },
      profile: PROFILE,
    });
    expect(kept.some((f) => f.name === "smuggled")).toBe(false);
  });

  it("drops a figure claiming a column this file does not have", () => {
    const kept = verifyContextFigures({
      declared: [{ name: "x", description: "d", columnsUsed: ["Ghost"] }],
      executed: { x: 5 },
      profile: PROFILE,
    });
    expect(kept).toEqual([]);
  });

  it("drops a figure that reports no columns at all", () => {
    const kept = verifyContextFigures({
      declared: [{ name: "x", description: "d", columnsUsed: [] }],
      executed: { x: 5 },
      profile: PROFILE,
    });
    expect(kept).toEqual([]);
  });

  it("returns an empty array rather than throwing when nothing was declared", () => {
    expect(verifyContextFigures({ declared: [], executed: {}, profile: PROFILE })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/context-grounding.test.ts`
Expected: FAIL — `verifyContextFigures` is not exported.

- [ ] **Step 3: Implement**

Append to `lib/verify.ts`:

```ts
export interface VerifyContextInput {
  declared: Array<{ name: string; description: string; columnsUsed: string[] }>;
  executed: Record<string, number | string>;
  profile: DatasetProfile;
}

/**
 * A context figure survives only if it was DECLARED, EXECUTED, and every column
 * it claims exists in this file. Anything else is dropped without comment.
 *
 * Dropping is the point. A figure Vera cannot trace is a figure she does not
 * mention — not one she hedges (PRD §6).
 */
export function verifyContextFigures(input: VerifyContextInput): ContextFigure[] {
  const known = new Set(input.profile.columns.map((column) => column.name));
  const kept: ContextFigure[] = [];

  for (const figure of input.declared) {
    const value = input.executed[figure.name];
    if (value === undefined) continue;
    const columns = figure.columnsUsed.filter((column) => column.trim() !== "");
    if (columns.length === 0) continue;
    if (columns.some((column) => !known.has(column))) continue;
    kept.push({
      name: figure.name,
      description: figure.description,
      value,
      columnsUsed: columns,
    });
  }
  return kept;
}
```

Add `ContextFigure` to the type imports at the top of the file. Extend `Finding`'s verified branch in `lib/types.ts`:

```ts
      /** Extra grounded figures for the "what it means" beat. Empty is normal. */
      context: ContextFigure[];
      /** Tone only — selects how Vera opens. Carries no figure. */
      valence: Valence;
```

- [ ] **Step 4: Fix every construction site**

`npx tsc --noEmit` names each place a verified `Finding` is built. Give each `context: []` and `valence: "neutral"`. Existing assertions do not change.

- [ ] **Step 5: Green**

Run: `pnpm vitest run tests/context-grounding.test.ts tests/deck.test.ts tests/guarded-analyst.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/verify.ts lib/types.ts tests/context-grounding.test.ts
git commit -m "feat(verify): ground every context figure, and drop the ones that fail"
```

---

### Task 4: Wire it through the real analyst

**Files:**
- Modify: `lib/real-analyst.ts:143-176`
- Modify: `lib/codegen/retry.ts` (carry `context` and `valence` out of the loop)
- Test: `tests/analyze-route.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: a verified `Finding` whose `context` holds only grounded figures.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/analyze-route.test.ts
it("attaches only grounded context figures to the finding", async () => {
  // Drive the analyst with a stub generator declaring two context figures and a
  // stub executor returning only one of them, plus one that was never declared.
  const finding = await runAnalystWithStubs({
    context: [
      { name: "prior", description: "the quarter before", columnsUsed: ["Sales"] },
      { name: "ghost", description: "never computed", columnsUsed: ["Sales"] },
    ],
    valence: "bad",
    executedContext: { prior: 99, smuggled: 1234 },
  });
  expect(finding.verdict).toBe("verified");
  if (finding.verdict !== "verified") return;
  expect(finding.context.map((f) => f.name)).toEqual(["prior"]);
  expect(finding.valence).toBe("bad");
});
```

Follow the stub pattern already used in this file. If no such helper exists, build `runAnalystWithStubs` locally in the test from the injectable `generator` and `executor` that `runCodegenWithRetries` already accepts (`lib/real-analyst.ts:76-85`).

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/analyze-route.test.ts`
Expected: FAIL — `finding.context` is undefined.

- [ ] **Step 3: Implement**

Have `runCodegenWithRetries` return `context` and `valence` alongside `headline`, then in `lib/real-analyst.ts`, inside the verified `finding` object:

```ts
        context: verifyContextFigures({
          declared: result.context,
          executed: result.execution.contextValues,
          profile: dataset.profile,
        }),
        valence: result.valence,
```

- [ ] **Step 4: Green**

Run: `pnpm test`
Expected: PASS, all of it. This is the phase-A contract gate.

- [ ] **Step 5: Prove mock mode still runs with zero keys**

Run: `VERA_MOCK=1 pnpm build && VERA_MOCK=1 pnpm dev`, ask one question in the browser, confirm a figure renders.
Expected: a verified finding, no network calls to any vendor.

- [ ] **Step 6: Commit and push**

```bash
git add lib/real-analyst.ts lib/codegen/retry.ts tests/analyze-route.test.ts
git commit -m "feat(analyst): carry grounded context and tone onto the finding"
git push -u origin <branch>
```

---

### Task 5: The prep call

**Files:**
- Create: `lib/prepare/generate.ts`
- Test: `tests/prepare-generate.test.ts`

**Interfaces:**
- Consumes: `DatasetProfile` from `lib/types.ts`. Does not edit `lib/types.ts`.
- Produces:
  ```ts
  export interface PrepRequest {
    profile: DatasetProfile;
    sampleRows: string[][];
    /** Where the raw file sits in the sandbox. */
    sourcePath: string;
    /** Where the cleaned file must be written. */
    cleanPath: string;
    signal?: AbortSignal;
  }
  export interface PrepOutput {
    prepCode: string;
    /** Plain English, what it intends to fix. No column names, no pandas terms. */
    fixes: string[];
    /** Candidate questions for THIS file, before the guardrail sees them. */
    questions: string[];
  }
  export function buildPrepPrompt(request: PrepRequest): string;
  export function parsePrepResponse(raw: string, request: PrepRequest): PrepOutput;
  export async function generatePrep(
    request: PrepRequest,
    dependencies?: { mockMode?: boolean; client?: FireworksClient },
  ): Promise<PrepOutput>;
  ```

Mirror `lib/codegen/generate.ts` exactly — same JSON-schema-plus-Zod pairing, same mock-first shape, same `MAX_PROMPT_CHARS` guard.

- [ ] **Step 1: Write the failing test**

```ts
// tests/prepare-generate.test.ts
import { describe, expect, it } from "vitest";
import { generatePrep, parsePrepResponse } from "@/lib/prepare/generate";
import { PROFILE } from "./fixtures/profile";

const REQUEST = {
  profile: PROFILE,
  sampleRows: [],
  sourcePath: "/workspace/data.csv",
  cleanPath: "/workspace/clean.csv",
};

describe("prep generation", () => {
  it("mock mode returns a usable prep with zero external calls", async () => {
    const out = await generatePrep(REQUEST, { mockMode: true });
    expect(out.prepCode).toContain("/workspace/clean.csv");
    expect(out.fixes.length).toBeGreaterThan(0);
    expect(out.questions.length).toBeGreaterThan(0);
  });

  it("rejects prep code that does not write the clean file", () => {
    const raw = JSON.stringify({
      prepCode: "import pandas as pd\ndf = pd.read_csv('/workspace/data.csv')",
      fixes: ["Nothing"],
      questions: ["What is the total?"],
    });
    expect(() => parsePrepResponse(raw, REQUEST)).toThrow(/clean/i);
  });

  it("rejects prep code touching a path outside the sandbox", () => {
    const raw = JSON.stringify({
      prepCode: "open('/etc/passwd')\ndf.to_csv('/workspace/clean.csv')",
      fixes: ["x"],
      questions: ["y"],
    });
    expect(() => parsePrepResponse(raw, REQUEST)).toThrow();
  });

  it("rejects a fix line naming a pandas concept — prep speaks plain English", () => {
    const raw = JSON.stringify({
      prepCode: "df.to_csv('/workspace/clean.csv')",
      fixes: ["Ran pd.to_datetime on OrderDate with format %d/%m/%Y"],
      questions: ["y"],
    });
    expect(() => parsePrepResponse(raw, REQUEST)).toThrow(/plain english/i);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/prepare-generate.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

Build the module on the `lib/codegen/generate.ts` pattern. The prompt states:

```
You prepare a messy business file for analysis, the way a careful analyst would before
they answer any question about it.

Return JSON only, matching this schema exactly: <schema>

Rules for "prepCode":
- Read ONLY from "<sourcePath>" with pandas.read_csv, and write the cleaned frame to
  "<cleanPath>" with df.to_csv(index=False). Touch no other path.
- Fix only what is defensibly wrong: parse dates with the proven format, strip currency
  symbols and thousands separators from numeric columns, coerce numeric columns with
  errors="coerce", trim whitespace, and drop exactly-duplicated rows.
- NEVER fill, impute, interpolate or invent a value. NEVER drop a row for being an outlier.
  Removing real data or inventing missing data would make every later figure a lie.
- Do not import or use network libraries. No environment or filesystem access beyond the
  two paths above.

Rules for "fixes": one short sentence each, the way you would tell a colleague what you
tidied. NEVER name a column, a date format, a pandas function, or any code concept.
Good: "Some amounts were stored as text with dollar signs, so they would not have added up."
Bad: "Applied pd.to_numeric to the Sales column."

Rules for "questions": five questions worth asking of THIS file, the ones a domain expert
would open with. Each must be answerable from these columns alone by computing a single
figure. No opinion, no prediction, no cause. Plain English, under 72 characters.
```

`parsePrepResponse` enforces, after the Zod parse:
1. `prepCode` contains `request.cleanPath` and `request.sourcePath`;
2. no quoted path in `prepCode` other than those two — reuse the path-scanning helper in `lib/codegen/python-policy.ts` rather than writing a second one;
3. every `fixes` entry fails a jargon regex — `/\b(pandas|pd\.|dataframe|df\[|to_datetime|to_numeric|dtype|astype|NaN|regex|%[dmY])\b/i` — throwing `"A fix must be written in plain English."` on a hit;
4. `questions` is 1-5 entries, each ≤ 72 characters.

The mock returns a canned prep that writes `cleanPath`, three plain fixes, and five questions built from the profile's column names.

- [ ] **Step 4: Green**

Run: `pnpm vitest run tests/prepare-generate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/prepare/generate.ts tests/prepare-generate.test.ts
git commit -m "feat(prepare): one call writes the cleaning script and proposes the questions"
```

---

### Task 6: The audit script we wrote ourselves

**Files:**
- Create: `lib/prepare/audit.ts`
- Test: `tests/prepare-run.test.ts` (first half)

**Interfaces:**
- Produces:
  ```ts
  export interface AuditCounts {
    rowsBefore: number;
    rowsAfter: number;
    duplicatesDropped: number;
    cellsCoerced: number;
  }
  /** A FIXED Python program. The model never writes this. */
  export function buildAuditProgram(sourcePath: string, cleanPath: string): string;
  export function parseAuditOutput(stdout: string): AuditCounts | null;
  ```

**Why this exists:** the spec forbids the model claiming what it changed. Counts are measured by a program we control, comparing the two files.

- [ ] **Step 1: Write the failing test**

```ts
// tests/prepare-run.test.ts
import { describe, expect, it } from "vitest";
import { buildAuditProgram, parseAuditOutput } from "@/lib/prepare/audit";

describe("the audit program", () => {
  it("reads both files and only those files", () => {
    const program = buildAuditProgram("/workspace/data.csv", "/workspace/clean.csv");
    expect(program).toContain("/workspace/data.csv");
    expect(program).toContain("/workspace/clean.csv");
    expect(program).toContain("VERA_AUDIT:");
  });

  it("parses the counts it prints", () => {
    const out = 'VERA_AUDIT:{"rowsBefore":9994,"rowsAfter":9990,"duplicatesDropped":4,"cellsCoerced":12}';
    expect(parseAuditOutput(out)).toEqual({
      rowsBefore: 9994, rowsAfter: 9990, duplicatesDropped: 4, cellsCoerced: 12,
    });
  });

  it("returns null on anything it cannot read, rather than guessing a count", () => {
    expect(parseAuditOutput("boom")).toBeNull();
    expect(parseAuditOutput('VERA_AUDIT:{"rowsBefore":"lots"}')).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/prepare-run.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Implement**

```ts
const AUDIT_PREFIX = "VERA_AUDIT:";

export function buildAuditProgram(sourcePath: string, cleanPath: string): string {
  return [
    "import json",
    "import pandas as pd",
    `before = pd.read_csv(${JSON.stringify(sourcePath)}, dtype=str, keep_default_na=False)`,
    `after = pd.read_csv(${JSON.stringify(cleanPath)}, dtype=str, keep_default_na=False)`,
    "shared = [c for c in before.columns if c in after.columns]",
    "coerced = 0",
    "for c in shared:",
    "    a = before[c].astype(str).str.strip().tolist()",
    "    b = after[c].astype(str).str.strip().tolist()",
    "    coerced += sum(1 for x, y in zip(a, b) if x != y)",
    "counts = {",
    '    "rowsBefore": int(len(before)),',
    '    "rowsAfter": int(len(after)),',
    '    "duplicatesDropped": int(max(0, len(before) - len(before.drop_duplicates()))),',
    '    "cellsCoerced": int(coerced),',
    "}",
    `print(${JSON.stringify(AUDIT_PREFIX)} + json.dumps(counts, separators=(",", ":")))`,
  ].join("\n");
}

export function parseAuditOutput(stdout: string): AuditCounts | null {
  const line = stdout.split("\n").reverse().find((l) => l.trim().startsWith(AUDIT_PREFIX));
  if (!line) return null;
  try {
    const parsed: unknown = JSON.parse(line.trim().slice(AUDIT_PREFIX.length));
    if (parsed === null || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    const keys = ["rowsBefore", "rowsAfter", "duplicatesDropped", "cellsCoerced"] as const;
    if (!keys.every((k) => typeof record[k] === "number" && Number.isFinite(record[k]))) return null;
    return {
      rowsBefore: record.rowsBefore as number,
      rowsAfter: record.rowsAfter as number,
      duplicatesDropped: record.duplicatesDropped as number,
      cellsCoerced: record.cellsCoerced as number,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Green, then commit**

Run: `pnpm vitest run tests/prepare-run.test.ts`

```bash
git add lib/prepare/audit.ts tests/prepare-run.test.ts
git commit -m "feat(prepare): measure what changed with a program the model never wrote"
```

---

### Task 7: Run prep, and fail open

**Files:**
- Create: `lib/prepare/run.ts`, `lib/prepare/store.ts`
- Modify: `lib/datasets.ts` (export `contentHash`)
- Test: `tests/prepare-run.test.ts` (second half)

**Interfaces:**
- Consumes: Tasks 5 and 6, `classifyQuestion` from `lib/guardrails/classify.ts`, `daytonaExecutor` and `ensureDatasetLoaded` from `lib/daytona/sandbox.ts`.
- Produces:
  ```ts
  export interface PrepReport {
    ok: boolean;
    /** Where later analysis must read from: the clean file when ok, the raw file when not. */
    analysisPath: string;
    fixes: string[];
    /** Guardrail-approved only. Never shown unfiltered. */
    questions: string[];
    counts: AuditCounts | null;
    /** Plain English, set only when ok is false. */
    detail?: string;
  }
  export async function prepareDataset(
    dataset: ResolvedDataset,
    dependencies?: { executor?: CodeExecutor; mockMode?: boolean },
  ): Promise<PrepReport>;

  // lib/prepare/store.ts
  export function getPrep(hash: string): PrepReport | undefined;
  export function setPrep(hash: string, report: PrepReport): void;
  ```

**Fail open:** prep improves a file, it never gates one. Every failure path returns `ok: false` with `analysisPath` pointing at the raw file and a plain-English `detail`.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/prepare-run.test.ts
import { prepareDataset } from "@/lib/prepare/run";

describe("prepareDataset", () => {
  it("returns the clean path and guardrail-filtered questions on the happy path", async () => {
    const report = await prepareDataset(DATASET, { mockMode: true, executor: OK_EXECUTOR });
    expect(report.ok).toBe(true);
    expect(report.analysisPath).toContain("clean");
    expect(report.questions.length).toBeGreaterThan(0);
    expect(report.counts?.rowsBefore).toBeGreaterThan(0);
  });

  it("drops a proposed question the guardrail refuses", async () => {
    const report = await prepareDataset(DATASET, {
      mockMode: true,
      executor: OK_EXECUTOR,
      // stub generatePrep to propose "Why did sales drop in the West?"
    });
    expect(report.questions.some((q) => /why did/i.test(q))).toBe(false);
  });

  it("fails open when the cleaning code errors — the raw file stays askable", async () => {
    const report = await prepareDataset(DATASET, { mockMode: true, executor: FAILING_EXECUTOR });
    expect(report.ok).toBe(false);
    expect(report.analysisPath).toBe(SANDBOX_CSV_PATH);
    expect(report.detail).toBeTruthy();
    expect(report.detail).not.toMatch(/traceback|pandas|dtype/i);
  });

  it("fails open when the audit cannot be read — no invented counts", async () => {
    const report = await prepareDataset(DATASET, { mockMode: true, executor: NO_AUDIT_EXECUTOR });
    expect(report.counts).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/prepare-run.test.ts`
Expected: FAIL — `lib/prepare/run.ts` does not exist.

- [ ] **Step 3: Implement**

`prepareDataset` in order:
1. `ensureDatasetLoaded(dataset.id, dataset.content)`;
2. `generatePrep({ profile, sampleRows, sourcePath: SANDBOX_CSV_PATH, cleanPath: CLEAN_CSV_PATH })`;
3. `executor.execute({ code: prepCode, timeoutMs: LIMITS.runBudgetMs, signal })` — a non-zero exit returns the fail-open report;
4. `executor.execute({ code: buildAuditProgram(SANDBOX_CSV_PATH, CLEAN_CSV_PATH), ... })`, then `parseAuditOutput`. A null audit sets `counts: null` but keeps `ok: true` — the cleaning worked, only the measurement did not;
5. filter `questions` through `classifyQuestion(question, dataset.profile)`, keeping only `allowed: true`;
6. return the report.

Export `CLEAN_CSV_PATH` from `lib/daytona/sandbox.ts` beside `SANDBOX_CSV_PATH`.

`lib/prepare/store.ts` is a module-level `Map<string, PrepReport>`, capped at 8 entries with oldest-out eviction so a long session cannot grow without bound. `contentHash` in `lib/datasets.ts` is `createHash("sha256").update(content).digest("hex")` from `node:crypto`.

Error detail must be plain English: `"Vera could not tidy this file, so she is working from it as it came."` The stderr goes nowhere near the user.

- [ ] **Step 4: Green, then commit**

Run: `pnpm vitest run tests/prepare-run.test.ts tests/guardrails.test.ts`

```bash
git add lib/prepare/run.ts lib/prepare/store.ts lib/datasets.ts tests/prepare-run.test.ts
git commit -m "feat(prepare): run the cleaning once, filter the questions, and fail open"
```

---

### Task 8: `/api/prepare`, rate limited

**Files:**
- Create: `app/api/prepare/route.ts`
- Test: `tests/prepare-route.test.ts`

**Interfaces:**
- Consumes: Task 7, `checkRateLimit`, `encodeEvent` from `lib/stream.ts`, `resolveUpload`/`toSummary`.
- Produces: an SSE stream of `{ type: "prep-stage", stage, status, detail }` events, terminated by one `{ type: "prep-report", summary, report }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/prepare-route.test.ts
import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/prepare/route";

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(new Request("http://localhost/api/prepare", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }));

describe("POST /api/prepare", () => {
  it("400s on a body that is not JSON", async () => {
    const response = await POST(new Request("http://localhost/api/prepare", { method: "POST", body: "{" }));
    expect(response.status).toBe(400);
  });

  it("400s on a file over the size cap", async () => {
    const response = await post({ upload: { filename: "big.csv", content: "x".repeat(60_000_000) } });
    expect(response.status).toBe(400);
  });

  it("429s past the rate limit — this route spends money", async () => {
    const headers = { "x-forwarded-for": "9.9.9.9" };
    const body = { upload: { filename: "a.csv", content: "a,b\n1,2\n" } };
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) last = await post(body, headers);
    expect(last?.status).toBe(429);
    expect(last?.headers.get("Retry-After")).toBeTruthy();
  });

  it("streams prep stages and ends with a report", async () => {
    const response = await post({ upload: { filename: "a.csv", content: "a,b\n1,2\n" } }, { "x-forwarded-for": "1.1.1.1" });
    const text = await response.text();
    expect(text).toContain("prep-stage");
    expect(text).toContain("prep-report");
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/prepare-route.test.ts`
Expected: FAIL — the route does not exist.

- [ ] **Step 3: Implement**

Copy the guard shape from `app/api/analyze/route.ts:36-73` verbatim: `clientIp`, `checkRateLimit` first with a `Retry-After` header, then a Zod body parse reusing the upload schema from `app/api/dataset/route.ts:20-29`. Then:
1. `resolveUpload(parsed.data.upload)` and `contentHash(content)`;
2. on a `getPrep(hash)` hit, stream a single `ready` stage and the cached report — a re-upload is free;
3. otherwise stream `profiling → cleaning → checking → ready` around the `prepareDataset` steps and `setPrep(hash, report)`;
4. terminate with `{ type: "prep-report", summary: toSummary(dataset), report }`.

`export const runtime = "nodejs";` as in the other routes.

- [ ] **Step 4: Green, then commit and push**

Run: `pnpm vitest run tests/prepare-route.test.ts && pnpm test`

```bash
git add app/api/prepare/route.ts tests/prepare-route.test.ts
git commit -m "feat(api): rate-limited prepare route, streaming real prep stages"
git push -u origin <branch>
```

---

# PHASE B — starts only after Phase A merges

---

### Task 9: The deck sounds like an analyst

**Files:**
- Modify: `lib/deck.ts` — delete `analystEvidenceLine` (`:76-83`), rewrite `buildDeck` (`:101-219`)
- Test: `tests/deck-voice.test.ts`; update `tests/deck.test.ts`, `tests/deck-ui.test.ts`

**Interfaces:**
- Consumes: `Finding.context`, `Finding.valence` (Tasks 3-4).
- Produces: `SlideKind` becomes `"opener" | "finding" | "meaning" | "caveat" | "working" | "summary"`. `buildDeck`'s signature is unchanged.

**Do not simplify the narration back into reading the slides aloud. The analyst voice in this file was written deliberately.**

- [ ] **Step 1: Write the failing test**

```ts
// tests/deck-voice.test.ts
import { describe, expect, it } from "vitest";
import { buildDeck } from "@/lib/deck";

const JARGON = /\b(column|pandas|python|dd\/mm|mm\/dd|day.first|month.first|format|parse[sd]?|row count|dtype|csv)\b/i;

describe("the deck speaks like an analyst", () => {
  it("opens on the finding, never on how many rows were read", () => {
    const deck = buildDeck("What were sales in Q3 2018?", VERIFIED, PROFILE);
    expect(deck.slides[0]?.kind).toBe("opener");
    expect(deck.slides[0]?.spoken).not.toMatch(/\d{1,3}(,\d{3})+ rows/);
    expect(deck.slides[1]?.kind).toBe("finding");
  });

  it("opens differently depending on the tone of the finding", () => {
    const bad = buildDeck("q", { ...VERIFIED, valence: "bad" }, PROFILE).slides[0]?.spoken ?? "";
    const good = buildDeck("q", { ...VERIFIED, valence: "good" }, PROFILE).slides[0]?.spoken ?? "";
    expect(bad).not.toBe(good);
    expect(bad).not.toMatch(/\d/); // a tone never carries a figure
  });

  it("says what it means when a context figure survived", () => {
    const deck = buildDeck("q", { ...VERIFIED, context: [PRIOR_PERIOD] }, PROFILE);
    const meaning = deck.slides.find((s) => s.kind === "meaning");
    expect(meaning?.spoken).toContain("the same quarter a year earlier");
  });

  it("has NO meaning slide when nothing survived grounding", () => {
    const deck = buildDeck("q", { ...VERIFIED, context: [] }, PROFILE);
    expect(deck.slides.some((s) => s.kind === "meaning")).toBe(false);
  });

  it("states a caveat as a consequence, never as a method", () => {
    const deck = buildDeck("q", VERIFIED_WITH_EVIDENCE, PROFILE);
    const caveat = deck.slides.find((s) => s.kind === "caveat");
    expect(caveat?.spoken).toBeTruthy();
    expect(caveat?.spoken ?? "").not.toMatch(JARGON);
  });

  it("keeps every narrated line free of code jargon", () => {
    const deck = buildDeck("q", VERIFIED_WITH_EVIDENCE, PROFILE);
    for (const slide of deck.slides) {
      if (slide.kind === "working") continue;
      expect(slide.spoken, `${slide.id} spoke jargon`).not.toMatch(JARGON);
      for (const beat of slide.beats) expect(beat.spoken, `${slide.id} beat`).not.toMatch(JARGON);
    }
  });

  it("does not narrate the working slide, but keeps it in the deck", () => {
    const deck = buildDeck("q", VERIFIED, PROFILE);
    const working = deck.slides.find((s) => s.kind === "working");
    expect(working).toBeTruthy();
    expect(working?.beats).toEqual([]);
  });

  it("gives an unverified finding no deck at all", () => {
    expect(buildDeck("q", UNVERIFIED, PROFILE).slides).toEqual([]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/deck-voice.test.ts`
Expected: FAIL — no opener slide, jargon present.

- [ ] **Step 3: Implement**

Openers, one per valence, chosen deterministically:

```ts
const OPENERS: Record<Valence, string> = {
  good: "Right — I went through this properly, and there is good news in here.",
  bad: "Right — I went through this properly, and you are not going to like it.",
  neutral: "Right — I went through this properly, and here is what I found.",
};
```

The meaning slide reads its lines from grounded context only:

```ts
function meaningLine(figure: ContextFigure): string {
  return `Set against ${figure.description}, that is ${fmt(figure.value, null)}.`;
}
```

The caveat line states consequence, not method, and is built from whatever `SchemaEvidence` is present rather than assuming dates:

```ts
/**
 * Consequence, never method. The evidence supplies HOW MUCH agreed, which is the
 * only part of it a person cares about out loud — never the format, the column,
 * or the count. Works for any evidence a schema-driven profiler can produce, so
 * it must not assume the fact is about dates.
 */
function caveatLine(evidence: SchemaEvidence): string {
  const unanimous = evidence.contradictingRows === 0;
  return (
    "There is something in this file worth knowing about. " +
    "Taken at face value it would have sent the answer badly wrong, and nothing would have warned you. " +
    (unanimous
      ? "I checked it against every row before I used it, and they all agree."
      : "I checked it against every row before I used it.")
  );
}
```

`evidence.claim` carries the technical wording (`"OrderDate is DD/MM/YYYY"`) and must **not** be spoken. It stays on the working slide.

The caveat slide appears only when `finding.grounding.schemaEvidence.filter(isProven).length > 0`. The working slide merges today's `code` and `cells` slides, carries both `covers` lists, and has `beats: []`.

Update `matchSlide`'s expectations in `tests/deck.test.ts` for the new ids, and `tests/deck-ui.test.ts` for the new kinds. `components/vera/deck-player.tsx` needs its `SlideKind` switch updated to render `opener`, `meaning`, `caveat` and `working`.

- [ ] **Step 4: Green**

Run: `pnpm vitest run tests/deck-voice.test.ts tests/deck.test.ts tests/deck-ui.test.ts`

- [ ] **Step 5: Prove it in the browser**

Run `VERA_MOCK=1 pnpm dev`, ask a question at `/ask`, watch the deck through. Confirm: opener first, no row count spoken, working slide silent but present, `/open` still plays its cold open unchanged.

- [ ] **Step 6: Commit and push**

```bash
git add lib/deck.ts components/vera/deck-player.tsx tests/deck-voice.test.ts tests/deck.test.ts tests/deck-ui.test.ts
git commit -m "feat(deck): lead with the finding and what it means, not with the parsing"
git push -u origin <branch>
```

---

### Task 10: The front door

**Files:**
- Create: `components/vera/upload-dropzone.tsx`, `components/vera/prep-screen.tsx`
- Modify: `components/vera/ask-screen.tsx`, `app/ask/page.tsx`
- Test: `tests/upload-ui.test.ts`

**Interfaces:**
- Consumes: `POST /api/prepare` (Task 8) and its `prep-stage` / `prep-report` events.
- Produces: nothing other tasks depend on.

**Use the `frontend-design` skill and the shadcn MCP. Follow `DESIGN.md`. Light is the default theme and `prefers-reduced-motion` is honoured.**

- [ ] **Step 1: Write the failing test**

```ts
// tests/upload-ui.test.ts
import { describe, expect, it } from "vitest";

describe("upload and prep", () => {
  it("rejects a non-CSV before any request is made", async () => {
    expect(acceptFile(new File(["x"], "a.pdf", { type: "application/pdf" })).ok).toBe(false);
  });

  it("rejects an oversized file before any request is made", async () => {
    expect(acceptFile(fileOfBytes(LIMITS.maxCsvBytes + 1)).ok).toBe(false);
  });

  it("renders the prep stages in order from the stream", async () => {
    const stages = stagesFrom(["profiling", "cleaning", "checking", "ready"]);
    expect(stages.map((s) => s.label)).toEqual(["Profiling", "Cleaning", "Checking", "Ready"]);
  });

  it("shows the file's own questions as chips once ready", async () => {
    expect(chipsFor(REPORT_WITH_QUESTIONS)).toHaveLength(REPORT_WITH_QUESTIONS.questions.length);
  });

  it("still lets the user ask when prep failed", async () => {
    expect(canAsk(FAILED_REPORT)).toBe(true);
  });
});
```

Extract `acceptFile`, `stagesFrom` and `chipsFor` as pure helpers in the component file so they are testable without a DOM, matching how `tests/mic-ui.test.ts` and `tests/working-screen-ui.test.ts` already test this codebase's components.

- [ ] **Step 2: Run and watch it fail**

Run: `pnpm vitest run tests/upload-ui.test.ts`

- [ ] **Step 3: Implement**

- `upload-dropzone.tsx`: a drop target and a file picker. Client-side guards first — extension and `LIMITS.maxCsvBytes` — so a bad file never reaches a paid route. Reads the file with `FileReader` and posts to `/api/prepare`.
- `prep-screen.tsx`: the four stages, driven by real events, honouring `prefers-reduced-motion`. Then the ready state: the fixes in plain English, the measured counts, and **"Ready — ask me anything."**
- `ask-screen.tsx`: the demo dataset stays askable while prep runs. Once a report lands, its questions replace the benchmark chips and subsequent `/api/analyze` calls carry the upload.
- When `report.ok === false`, show the plain-English detail and keep the ask box live.

- [ ] **Step 4: Green**

Run: `pnpm test && pnpm lint && npx tsc --noEmit && pnpm build`

- [ ] **Step 5: Prove it in the browser, with a real non-Superstore file**

Run `VERA_MOCK=1 pnpm dev`. Upload a Netflix-shaped CSV. Confirm: stages run, fixes read as English, chips are about *that* file, a question answers, and nothing in the narration names a column, a date format or a row count.

- [ ] **Step 6: Commit and push**

```bash
git add components/vera/upload-dropzone.tsx components/vera/prep-screen.tsx components/vera/ask-screen.tsx app/ask/page.tsx tests/upload-ui.test.ts
git commit -m "feat(ask): upload any file, watch her prepare it, then ask about it"
git push -u origin <branch>
```

---

## Final gate — the orchestrator, not an agent

- [ ] `pnpm lint`, `npx tsc --noEmit`, `pnpm build`, `pnpm test` all exit zero.
- [ ] `VERA_MOCK=1` runs upload → prep → ask → deck with **zero keys**.
- [ ] Every narrated line on a non-working slide is free of column names, date formats and row counts, verified by reading the deck in a browser.
- [ ] A context figure that fails grounding is provably absent from the UI, not hedged.
- [ ] **Ask the builder for the one live run.** Then: prove an arbitrary uploaded CSV end to end, **delete the Daytona sandbox immediately afterwards**, and record it in `tasks/checkpoints.md`.
- [ ] Update `tasks/definition-of-done.md`.
- [ ] `herdr worktree remove --workspace <id> --force` for every merged slice.
