# Phase B addendum — Tasks 11 and 12

> Extends `docs/superpowers/plans/2026-07-24-analyst-voice-and-any-dataset.md`.
> Tasks 9 and 10 are unchanged and live in that file. Tasks 11 and 12 are new, and exist because
> of what the prep slice discovered while building Task 5.

## Why these tasks exist

The prep slice found that validating file paths does not stop the generated cleaning code from
imputing or dropping rows. A prompt forbidding it is not enforcement. Its fix
(`lib/prepare/generate.ts:313`, `canonicalizePrepCode`) does not scan the model's code — it
**rebuilds** it. Every statement must match, token for token, a canonical transform derived from
the profile, or the whole program is rejected.

That is the right shape and it stays. Imputation is now structurally impossible rather than
merely discouraged.

But the repertoire is three transforms — parse a proven date, strip `$ , %` and coerce a number,
trim whitespace. On a genuinely messy file that is close to nothing. A Netflix export leaves
`duration` mixing `"90 min"` and `"2 Seasons"` in one column, and `listed_in` holding several
categories in one string. Those are the first two things a real analyst fixes, and Vera currently
cannot touch either.

**Task 11 widens the menu without weakening the gate.** Every new transform is still a fixed
program *we* wrote, which the model may only select, never author.

---

### Task 11: A wider repertoire, same whitelist

**Files:**
- Modify: `lib/prepare/generate.ts` — `transformFor`, `PREP_FIXES`, `allowedFixes`, and the prompt
- Test: `tests/prepare-generate.test.ts` (extend)

**Interfaces:**
- Consumes: `DatasetProfile` from `lib/types.ts`.
- Produces: no signature change. `transformFor` returns more shapes; `canonicalizePrepCode` is
  untouched in structure.

**The rule that governs every transform you add:** it may reshape or reinterpret a value that is
already in the file. It may never invent one, and it may never remove a row. If a transform
cannot produce its output for a given cell, that cell becomes empty and the row survives.

- [ ] **Step 1: Write the failing tests**

```ts
// append to tests/prepare-generate.test.ts
describe("the canonical transform menu", () => {
  it("splits a mixed unit column into a number and a unit", () => {
    // profile column "duration", kind "text", sampleValues ["90 min", "2 Seasons"]
    const code = canonicalPrepFor(MIXED_UNIT_PROFILE);
    expect(code).toContain('df["duration_amount"]');
    expect(code).toContain('df["duration_unit"]');
    expect(code).toContain("df[\"duration\"]"); // the original column survives untouched
  });

  it("normalises category casing and stray whitespace without merging distinct values", () => {
    const code = canonicalPrepFor(RAGGED_CATEGORY_PROFILE);
    expect(code).toContain(".str.strip()");
  });

  it("refuses a transform the model invented, even a harmless-looking one", () => {
    const raw = prepResponseWith('df["x"] = df["x"].fillna(0)');
    expect(() => parsePrepResponse(raw, REQUEST)).toThrow();
  });

  it("refuses a row-dropping statement outright", () => {
    const raw = prepResponseWith('df = df[df["Sales"] > 0]');
    expect(() => parsePrepResponse(raw, REQUEST)).toThrow();
  });

  it("offers a transform only when the profile justifies it", () => {
    // a clean numeric-only file gets no unit-splitting transform on the menu
    expect(canonicalPrepFor(CLEAN_PROFILE)).not.toContain("_unit");
  });

  it("leaves a cell empty rather than guessing when a transform cannot apply", () => {
    // "Unknown" in a mixed unit column yields an empty amount, and the row survives
    expect(runTransformLocally("Unknown", UNIT_SPLIT)).toEqual({ amount: null, unit: null });
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm vitest run tests/prepare-generate.test.ts`

- [ ] **Step 3: Add the transforms**

Extend `transformFor` with these, each offered **only** when the profile justifies it:

1. **Mixed unit split** — a text column whose sample values match `^\s*\d+(\.\d+)?\s+\S+` in more
   than one distinct unit. Emits two **new** columns, `<name>_amount` and `<name>_unit`, and
   leaves the original column exactly as it was. A value that does not match yields empty in both,
   and the row stays.
2. **Multi-value split** — a text or category column whose values contain a consistent separator
   (`,` or `;`) across most rows. Emits `<name>_list` holding the split list, original untouched.
   Do **not** explode rows — an exploded frame would change the row count and break every count
   downstream.
3. **Category normalisation** — strip whitespace and collapse internal runs of spaces. **Do not
   lowercase and do not merge near-duplicates**; two spellings that differ are two values, and
   deciding they are one is an analytical judgement, not a cleaning step.
4. **Boolean-ish normalisation** — a column whose distinct values are a small set drawn from
   `yes/no/true/false/y/n/0/1` maps to a real boolean, with anything else left empty.

Add a matching `PREP_FIXES` entry for each, worded in plain English with no column name and no
pandas term, and gate each in `allowedFixes` on the same profile condition that offers the
transform. Extend the prompt's menu description to match — the model must know what it may pick.

- [ ] **Step 4: Green**

Run: `pnpm vitest run tests/prepare-generate.test.ts tests/prepare-run.test.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/prepare/generate.ts tests/prepare-generate.test.ts
git commit -m "feat(prepare): widen the cleaning repertoire without widening what the model may author"
```

---

### Task 12: Analysis reads the prepared file

**Files:**
- Modify: `lib/types.ts` (`AnalysisRequest` gains an optional prepared path)
- Modify: `lib/real-analyst.ts`, `lib/prepare/run.ts`, `lib/daytona/sandbox.ts` (own `CLEAN_CSV_PATH`)
- Test: `tests/prepare-run.test.ts`, `tests/analyze-route.test.ts` (extend)

**Interfaces:**
- Consumes: `PrepReport.analysisPath` from Task 7.
- Produces: `AnalysisRequest` gains `analysisPath?: string`. When absent, behaviour is exactly
  today's — the raw path.

**Why:** prep currently writes a cleaned file that **nothing reads**. `lib/real-analyst.ts:80`
still passes `SANDBOX_CSV_PATH` to codegen unconditionally, so every question is answered from
the raw file and the whole prep step is decorative. The prep slice reported this itself.

Two further gaps it named, both of which this task closes:

- `CLEAN_CSV_PATH` is currently defined in `lib/prepare/run.ts` because that slice did not own
  `lib/daytona/sandbox.ts`. Move it beside `SANDBOX_CSV_PATH` and import it.
- The memoised prep survives a Daytona sandbox restart, after which the cached clean path points
  at a file that no longer exists. Invalidate the store when the sandbox identity changes, and
  fall back to the raw path rather than failing the question.

- [ ] **Step 1: Write the failing tests**

```ts
it("answers from the prepared file when prep succeeded", async () => {
  const request = { question: "q", dataset: DATASET, analysisPath: "/workspace/clean-abc.csv" };
  const { codegenRequest } = await runAnalystCapturingCodegen(request);
  expect(codegenRequest.sandboxPath).toBe("/workspace/clean-abc.csv");
});

it("answers from the raw file when prep never ran", async () => {
  const { codegenRequest } = await runAnalystCapturingCodegen({ question: "q", dataset: DATASET });
  expect(codegenRequest.sandboxPath).toBe(SANDBOX_CSV_PATH);
});

it("falls back to the raw file when the prepared file is gone after a sandbox restart", async () => {
  const report = await prepareDataset(DATASET, { mockMode: true, executor: OK_EXECUTOR });
  restartSandboxIdentity();
  expect(getPrep(contentHash(DATASET.content))).toBeUndefined();
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `pnpm vitest run tests/analyze-route.test.ts tests/prepare-run.test.ts`

- [ ] **Step 3: Implement**

Thread `analysisPath` from `AnalysisRequest` into the `sandboxPath` that `runCodegenWithRetries`
receives at `lib/real-analyst.ts:76-85`, defaulting to `SANDBOX_CSV_PATH`. Key the prep store on
sandbox identity as well as content hash, so a restart misses rather than returning a dead path.

- [ ] **Step 4: Green, then commit**

Run: `pnpm test && npx tsc --noEmit && pnpm lint && pnpm build`

```bash
git add lib/types.ts lib/real-analyst.ts lib/prepare/run.ts lib/daytona/sandbox.ts tests/
git commit -m "feat(analyst): answer from the prepared file, and fall back cleanly when it is gone"
```
