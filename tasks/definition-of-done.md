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
- [ ] Asking something the data cannot answer produces a **clean refusal with a reason**, not
      a raw stderr. *(in flight — `p9/guard`)*
- [ ] A refusal is presented as a deliberate choice, and offers what she *can* answer.
      *(in flight — `p9/guard`)*
- [x] No code jargon on any presentation surface. Column names, date formats and pandas terms
      live on the code slide only.

## 2. The pipeline works, live

- [x] Fireworks writes pandas from the profiled schema.
- [x] Daytona executes it in an isolated sandbox; warm singleton reused across queries.
- [x] `lib/verify.ts` gates the result before any figure reaches the screen.
- [x] Proven end to end on the real 9,994-row file: **143,787.36**, exit 0.
- [x] The retry loop is visible in the UI when code fails once.
- [x] Every money-spending endpoint has a rate limit.
- [ ] `/api/transcribe` has a rate limit and a size cap. *(in flight — `p9/mic`)*

## 3. Voice

- [x] Vera narrates the deck through ElevenLabs, one beat at a time.
- [x] Narration can be **interrupted** — the STOP button kills it immediately.
- [x] Narration is written in an analyst's voice, not the slide text read aloud.
- [ ] The speaking indicator is the real ElevenLabs orb, retinted to our tokens.
      *(in flight — `p9/orb`)*
- [ ] The user can **speak** a question instead of typing it. *(in flight — `p9/mic`)*
- [ ] Transcribed speech lands in the box for confirmation and is **never auto-submitted**.
      *(in flight — `p9/mic`)*

## 4. Observability

- [x] Braintrust **experiments** hold the benchmark: 21 questions, Vera 100% vs baseline 47.6%.
- [~] Braintrust **logs** receive one trace per live analysis. *Root event lands in
      `Vera Accuracy Benchmark`; the model call is not yet a child span, and `My Project` is
      empty. In flight — `p9/bt`.*
- [ ] Opening one trace shows the whole run: question in, model call with tokens and latency,
      verdict out. *(in flight — `p9/bt`)*
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
- [x] `pnpm test` — 87 passing, 5 skipped. Live tests gated behind `VERA_LIVE=1` and never
      spend on a normal `pnpm test`.
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
