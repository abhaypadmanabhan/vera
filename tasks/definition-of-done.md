# Vera — Definition of Done

What "100% complete" means for this product. Not aspirations — checkable claims, each with
the command or the observation that proves it. A box is ticked only when someone watched it
happen in the real artifact.

Status legend: `[x]` proven · `[ ]` not yet · `[~]` partially, with the gap named.

---

## 1. The honesty contract (PRD §6 — non-negotiable)

This is the product. If any box here is unticked, nothing else matters.

- [x] A number renders **only** when `verdict === "verified"`. No fallback, no hedge.
- [x] The live claim is exactly "computed, and traceable to source cells" — never "correct".
- [x] The 100% is presented as a **separate, pre-computed** aggregate benchmark.
- [x] No UI copy, README, or demo script implies Vera catches a subtly-wrong-but-runnable
      answer live.
- [x] Asking something the data cannot answer produces a **clean refusal with a reason**, not
      a raw stderr. Verified in-browser: "Why did sales drop in the West?" refuses; the
      discount stump question still runs.
- [x] A refusal is presented as a deliberate choice, and offers what she *can* answer.
- [x] No code jargon on any presentation surface. Column names, date formats and pandas terms
      live on the code slide only.
- [x] **Vera never states a figure the code did not produce.** The model writes the headline
      before the code runs, and was authoring guessed figures into it — caught live, sandbox
      returned 143787.36 while the headline read "281,420 dollars". It now emits a `{value}`
      slot and `lib/claim.ts` substitutes the executed value, discarding any sentence quoting
      a number that is neither the computed value nor one the user wrote.

## 2. The pipeline works, live

- [x] Fireworks writes pandas from the profiled schema.
- [x] Daytona executes it in an isolated sandbox; warm singleton reused across queries.
- [x] `lib/verify.ts` gates the result before any figure reaches the screen.
- [x] Proven end to end on the real 9,994-row file: **143,787.36**, exit 0.
- [x] The retry loop is visible in the UI when code fails once.
- [x] Every money-spending endpoint has a rate limit.
- [x] `/api/transcribe` has a rate limit and a size cap. Proven over HTTP: 413 size, 413
      duration, 400 no audio, 415 format, 422 too short, 429 on the 11th request.

## 3. Voice

- [x] Vera narrates the deck through ElevenLabs, one beat at a time.
- [x] Narration can be **interrupted** — the STOP button kills it immediately.
- [x] Narration is written in an analyst's voice, not the slide text read aloud.
- [ ] The speaking indicator is the real ElevenLabs orb, retinted to our tokens.
      *(in flight — `p9/orb`)*
- [x] The user can **speak** a question instead of typing it. One live Scribe call returned
      the spoken words verbatim.
- [x] Transcribed speech lands in the box for confirmation and is **never auto-submitted**.

## 4. Observability

- [x] Braintrust **experiments** hold the benchmark: 21 questions, Vera 100% vs baseline 47.6%.
- [x] Braintrust **logs** receive one trace per live analysis, in `Vera Accuracy Benchmark`
      alongside the experiments.
- [x] Opening one trace shows the whole run. Verified by REST query, not by reading code:
      `analysis` (task) root with a nested `fireworks.chat` (llm) child carrying token counts
      and latency.
- [x] A logging failure can never fail an analysis.

## 5. Money discipline

- [x] Mock mode (`VERA_MOCK`) runs the whole app with **zero keys and zero external calls**.
- [x] Mock runs are labelled as mock in the UI and never read as a real sandbox execution.
- [x] Mock runs emit no telemetry.
- [x] `.env.local`, `.env.braintrust` and `.braintrust.json` are gitignored and untracked.
- [x] No real key appears in any tracked file.
- [ ] **The Daytona sandbox is reaped after every live session.** Standing operational rule,
      not a one-off — it bills while it sits.

## 6. Craft

- [x] Light is the default theme; the design does not follow the OS into dark.
- [x] Figures display at 2 decimal places everywhere — screen and voice agree.
- [x] Suggestion chips run the question on click.
- [x] Evidence examples are deduped; no duplicate React keys.
- [x] The hero carries a plain-English headline, not the technical line.
- [x] `prefers-reduced-motion` is honoured by every animation: reveals, marquee, benchmark
      bars, count-ups, background drift.
- [ ] The voice orb honours `prefers-reduced-motion`. *(in flight — `p9/orb`)*
- [x] Landing at `/`, live demo at `/ask`, cold open at `/open`.
- [x] Official vendor marks in the powered-by strip, all four genuine.

## 7. Engineering hygiene

- [x] `pnpm lint` clean.
- [x] `npx tsc --noEmit` clean. TypeScript strict, no `any`.
- [x] `pnpm build` clean.
- [x] `pnpm test` — 167 passing, 5 skipped. Live tests gated behind `VERA_LIVE=1` and never
      spend on a normal `pnpm test`.
- [x] The gates exit **zero**. `pnpm-workspace.yaml` shipped literal
      `set this to true or false` placeholders, so pnpm's dependency check failed every lint,
      test and build. Three agents each burned time proving it was pre-existing.
- [x] Every branch merged into `dev` via PR so CodeRabbit reviews it.
- [ ] All four `p9/*` branches merged, verified in a browser, and their worktrees torn down.
- [ ] `dev` merged to `main` — **requires the builder's explicit approval.**

## 8. Known gaps, deliberately not done

Named here so nobody mistakes them for oversights.

- **Vera does not propose her own follow-up questions.** The user types them. Building her a
  "you might also ask…" off the columns she just read needs no extra model call.
- **`matchSlide` keyword collision.** The matcher scores single keywords, and the headline
  slide owns "total" while the code slide owns "run". So *"what were total sales by region?"*
  jumps back to an old slide instead of running fresh. Avoid those two words in a follow-up
  you want answered live, or fix the matcher.
- **Interrupt and follow-up by voice** — out of scope by decision, not by accident.
- **Not deployed.** The static surfaces (`/`, `/open`, and the deck) could ship to Vercel for
  a shareable link at zero cost. The live `/ask` route must not be public without auth: a
  stranger clicking a chip spends real Fireworks, Daytona and ElevenLabs credit. PRD §5's
  stated reason (serverless timeouts) is stale — the real reason is money.
