# Vera — analyst voice, and any dataset

**Date:** 2026-07-24 · **Branch base:** `feat/p2-fireworks` · **Status:** approved by the builder

Two product changes, one spec, because they share a contract change.

1. **Vera sounds like an analyst, not a parser.** She leads with the finding and what it means.
   Provenance stays available and stays true, but stops being the opening line.
2. **Vera takes any file.** Upload anything, she prepares it the way an analyst would, then
   offers the questions worth asking of *that* file.

Neither change may weaken PRD §6. Every figure she speaks is still one that executed.

---

## 1. What is wrong today

- `lib/deck.ts:76-83` — `analystEvidenceLine()` hardcodes "written day first, not month first"
  and a row count in thousands. It is jargon, and it is Superstore-specific: on an arbitrary
  upload it is either absent or false.
- `lib/deck.ts:117,122` — the first thing she says is how many rows she read.
- `buildDeck(question, finding, profile)` takes a single `Finding`. A finding carries one number
  and no context, so there is nothing to compare against and no "so what" available to say.
- There is no upload UI anywhere in `components/` or `app/`. `resolveUpload` exists in
  `lib/datasets.ts:58` and is wired into `/api/dataset` and `/api/analyze`, but nothing in the
  browser can reach it.
- Suggested questions come from `eval/questions.json` — the Superstore benchmark set. They are
  meaningless for an uploaded file.

## 2. The execution protocol change

Everything else depends on this, so it lands first.

Today the generated Python prints one line, `VERA_RESULT:<bare JSON scalar>`, and
`python-policy.ts:253` enforces **exactly one print call**. That invariant is a security
property — it is what stops generated code printing arbitrary extra output — and it does not
change.

Instead the payload gains an optional structured form. The sandbox parser accepts either:

```
VERA_RESULT:143787.36                                     # today's form, still valid
VERA_RESULT:{"value":143787.36,"context":{...}}           # new form
```

`context` is an object of at most three named figures the *same script* computed while it was
already touching the data — a prior period, a share of the total, a top or bottom contributor.
Each entry carries its own value and the columns it read.

**Grounding rule.** `verifyGrounding` continues to gate the primary value exactly as it does
now, and its verdict is unchanged in meaning. Each context figure is then checked
independently against the same column-provenance rules. **A context figure that fails is
dropped, silently and without affecting the verdict.** She says less rather than more. A
dropped context figure is never mentioned, never hedged, never shown as pending.

**Back-compat.** A bare scalar parses exactly as today, so every existing test, the mock engine,
and the benchmark path keep working untouched.

### Codegen contract

`CodegenOutput` gains two fields:

- `context: Array<{ name, description, columnsUsed }>` — declared before execution, empty is
  legal and common. The prompt asks for context only when it is genuinely informative.
- `valence: "good" | "bad" | "neutral"` — a tone hint, prose only.

**`valence` may never contain or imply a specific figure**, and the schema enforces it as an
enum, not free text. It selects an opening line; it does not assert anything numeric.

The headline keeps its `{value}` slot and `lib/claim.ts` keeps discarding any sentence that
quotes a figure the code did not produce. Context values get the same treatment: each is
substituted from the executed payload, never written by the model.

## 3. The deck (job 2)

New narrated order:

| Slide | Narration |
|---|---|
| opener | Valence-driven framing: *"Right, I dug into this, and here's what I found"* · *"You're not going to like this one"* · *"Here's the good news."* |
| finding | The figure and the plain-English claim. |
| meaning | The comparison and the so-what, built from grounded context figures. Omitted entirely when no context figure survived verification. |
| caveat | **Only when the caveat changed the answer.** Spoken as consequence, never method. |
| the working | Code and cells merged into one slide. In the deck, clickable, **not narrated** unless the viewer asks for it. |

Changes this forces:

- `analystEvidenceLine()` is deleted. Its replacement builds a consequence sentence from the
  `SchemaEvidence` it is given — *"the dates in this file read backwards, and taken at face value
  the total comes out wrong by ninety thousand"* — with no format name, no column name, no row
  count. It must work for any evidence a schema-driven profiler can produce, not just dates.
- The question slide stops leading with the row count.
- `matchSlide` gains `covers` entries for the merged working slide and the new meaning slide,
  and keeps the `DEICTIC_WORD_LIMIT` guard exactly as it is.
- `/open`, the cold open, is **untouched**. The date trap is its drama and it stays.

`buildDeck` still takes one `Finding`. Composition into a narrative comes from the context
figures inside that finding, not from multiple analysis runs.

## 4. Preparing an uploaded file (job 3)

New route: **`POST /api/prepare`**, rate limited, memoised by content hash so re-uploading the
same file is free.

1. **Profile deterministically.** The existing profiler runs first — dates, duplicates, nulls,
   mixed types, currency strings, ragged categories. No model, no spend.
2. **One Fireworks call** returns three things at once, because the model already holds the
   full profile:
   - `prepCode` — a pandas script that cleans the file. Same python-policy rules apply.
   - `fixes[]` — plain English, what it intends to fix and why.
   - `questions[]` — five questions worth asking of **this** file.
3. **One Daytona run** executes `prepCode`. The cleaned frame is written back into the sandbox
   and is what every later question reads.
4. **We compute the before/after counts, not the model.** Rows in, rows out, duplicates dropped,
   cells coerced. A claim about what changed is only ever a number we measured.
5. **Every candidate question passes `lib/guardrails/classify.ts`** before it can become a chip.
   An unanswerable chip never renders.

This closes the gap named in `tasks/definition-of-done.md` §8: suggested questions stop being
schema-shaped.

**Failure path.** If prep fails, the file is still usable — the raw upload remains askable and
Vera says plainly that she could not prepare it and what that means for the answers. Prep is an
improvement, never a gate.

## 5. Upload UX

- A dropzone on `/ask`. `resolveUpload` is already server-side; only the front door is new.
- Prep streams **real** stage events, on the existing `StageEvent` channel:
  `profiling → cleaning → checking → ready`. No decorative spinner standing in for work.
- She reports what she fixed in plain English, then: **"Ready — ask me anything."** The file's
  own chips appear.
- The screen stays interactive against the demo dataset while prep runs.

## 6. Money

| | spend |
|---|---|
| Prep | 1 Fireworks + 1 sandbox run, **once per file**, memoised |
| A question | unchanged: 1 Fireworks + 1 sandbox run |
| Context figures | none — same script, same execution |

- `/api/prepare` ships with a rate limit, per the money rule. It does not ship without one.
- Mock mode returns a canned prep, canned fixes and canned questions. The whole flow must run
  with **zero keys**, and that is a test.
- All work is built and proven in mock mode. Exactly one live run is requested from the builder
  at the end, to prove it. The Daytona sandbox is reaped immediately after.

## 7. Honesty checklist for this change

- [ ] A context figure that fails grounding is dropped, never hedged and never displayed.
- [ ] `valence` is an enum and cannot carry a number.
- [ ] Prep never invents a value. It drops, coerces and dedupes; every mutation is reported as a
      count we computed, not one the model claimed.
- [ ] The meaning slide disappears entirely when nothing survived verification.
- [ ] No jargon reaches the opener, finding, meaning or caveat slides. Column names, formats and
      pandas terms live on the working slide only.
- [ ] The distinction between live grounding and the aggregate benchmark is unchanged.

## 8. Slices, and who owns which files

Phase A, parallel, no shared files:

| Agent | Owns | Task |
|---|---|---|
| **contract** | `lib/types.ts`, `lib/codegen/*`, `lib/verify.ts`, `lib/daytona/sandbox.ts`, `lib/claim.ts` | Structured payload, context grounding, `valence`, policy update |
| **prep** | `app/api/prepare/route.ts`, `lib/prepare/*`, `lib/datasets.ts`, `lib/rate-limit.ts` | Prep pipeline, memoisation, guardrail-filtered questions |

`lib/types.ts` is owned by **contract** alone. Prep imports; it does not edit.

Phase B, after the contract lands:

| Agent | Owns | Task |
|---|---|---|
| **voice** | `lib/deck.ts` and its tests | New slide order, consequence lines, valence openers |
| **upload** | `components/vera/*`, `app/ask/page.tsx` | Dropzone, prep stages, ready state, per-file chips |

The orchestrator is the merge gate and verifies every slice in a real browser before merge.

## 9. Definition of done for this spec

- `pnpm lint`, `npx tsc --noEmit`, `pnpm build`, `pnpm test` all clean, exit zero.
- Mock mode runs the entire upload → prep → ask → deck flow with zero keys.
- An arbitrary non-Superstore CSV uploads, prepares, and produces a verified finding whose
  narration mentions no column name, no date format and no row count.
- A context figure that cannot be grounded is provably absent from the narration.
- One live run proves it end to end, and the sandbox is reaped afterwards.
