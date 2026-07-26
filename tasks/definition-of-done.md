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

## 3. Voice and follow-through

- [x] Vera narrates the deck through ElevenLabs, one beat at a time.
- [x] Narration can be **interrupted** — the STOP button kills it immediately.
- [x] Narration is written in an analyst's voice, not the slide text read aloud.
- [x] The speaking indicator is the real ElevenLabs orb, retinted to our tokens. The registry
      was behind bot protection (429), so the component was verified byte-identical by sha256
      against the published `elevenlabs/ui` copy and installed from that — nothing hand-written
      standing in for it.
- [x] The user can **speak** a question instead of typing it. One live Scribe call returned
      the spoken words verbatim.
- [x] Transcribed speech lands in the box for confirmation and is **never auto-submitted**.
- [x] Vera **proposes the next question** after a finding, derived from the columns the code
      actually read and filtered through the guardrail so every suggestion is answerable.
- [x] A follow-up only routes back to an existing slide when it is genuinely deictic — one
      stray keyword no longer hijacks a new question.

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
- [x] **The Daytona sandbox is reaped after every live session.** Standing operational rule,
      not a one-off — it bills while it sits. Honoured after the 2026-07-26 live run: the sandbox
      was deleted and **confirmed gone from the list**, because `delete()` returned cleanly while
      the sandbox still showed `started` (see `tasks/lessons.md`).

## 6. Craft

- [x] Light is the default theme; the design does not follow the OS into dark.
- [x] Figures display at 2 decimal places everywhere — screen and voice agree.
- [x] Suggestion chips run the question on click.
- [x] Evidence examples are deduped; no duplicate React keys.
- [x] The hero carries a plain-English headline, not the technical line.
- [x] `prefers-reduced-motion` is honoured by every animation: reveals, marquee, benchmark
      bars, count-ups, background drift.
- [x] The voice orb honours `prefers-reduced-motion` — no canvas in any state, static ring
      still legible and still distinct between idle, speaking and stopped.
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
- [x] All four `p9/*` branches merged, verified in a browser, and their worktrees torn down.
- [ ] `dev` merged to `main` — **requires the builder's explicit approval.**

## 8. Known gaps, deliberately not done

Named here so nobody mistakes them for oversights.

- **Interrupt and follow-up by voice** — out of scope by decision, not by accident. You can
  now *ask* by voice, but you cannot interrupt her by voice.
- ~~**The orb's speaking state has never been driven by real audio.**~~ **CLOSED 2026-07-26.**
  A live session made 26 successful `/api/speak` calls across 3 analyses; the orb entered its
  speaking state on real audio.
- ~~**Suggested follow-ups are schema-shaped, not insight-shaped.**~~ **CLOSED 2026-07-25.**
  An uploaded file's chips now come from the prep call, which already holds the full profile, so
  they cost nothing extra and every one is guardrail-filtered. **Seen against two real Fireworks
  responses on 2026-07-26**: all five proposed questions were domain-specific to the file and all
  five passed the guardrail on a Netflix profile.
- **Not deployed.** The static surfaces (`/`, `/open`, and the deck) could ship to Vercel for
  a shareable link at zero cost. The live `/ask` route must not be public without auth: a
  stranger clicking a chip spends real Fireworks, Daytona and ElevenLabs credit. PRD §5's
  stated reason (serverless timeouts) is stale — the real reason is money.

---

## 9. Upload any dataset (added 2026-07-25/26)

The any-file path. **Everything here is proven in mock only unless it says otherwise** — see
`tasks/phase-11-scope.md` P0, which exists to close exactly that gap.

- [x] A user can upload their own CSV from the browser. Dropzone plus file picker, guarded on
      extension and size **before** any request reaches a route that spends money.
- [x] Prep runs once per file, memoised by content hash, and is rate limited.
- [x] The model cannot author cleaning code. `canonicalizePrepCode` rebuilds the program from
      canonical transforms derived from the profile; anything else is rejected, so imputation and
      row deletion are structurally impossible rather than merely forbidden.
- [x] What changed is **measured**, never claimed — a fixed audit program we wrote compares the two
      files. Ambiguous row identity yields `null`, not a plausible guess.
- [x] Prep fails open. A failed prep leaves the raw file askable and says so in plain English.
- [x] Answers are computed from the prepared file, falling back to raw when prep is missing,
      evicted or stale. A question is never failed because prep was unavailable.
- [x] The columns prep creates are visible to codegen — the prepared profile travels with the
      prepared path.
- [x] Chips for an uploaded file come from that file, and every one passes the guardrail.
- [x] The mock analyst answers from the file on screen, not from a hardcoded Superstore figure.
- [x] **A real model's prep code survives the canonical whitelist.** Two live Fireworks prep calls
      on the Netflix file (2026-07-26): the model copied all nine profile-derived transforms
      **verbatim**, including the mixed-unit extract and the multi-value split. The feared
      token-for-token brittleness is not real. Reproduce with `tests/live-prep.test.ts`.
- [x] **An unsupported fix sentence can no longer discard a valid prep.** The first live call was
      rejected wholesale because `transformFor` offers the strip and numeric transforms
      unconditionally while `allowedFixes` gated the matching sentences on evidence — so the model
      honestly described the code it was handed and lost the entire prep, silently, on every
      upload. The schema's fix enum is now narrowed per profile and unsupported sentences are
      filtered, never fatal. Proven live: second call ACCEPTED.
- [~] **Prep has still never run against real Daytona.** Fireworks half proven above; no
      `/api/prepare` has yet executed a prep program in a sandbox. Step B of `phase-11-scope.md` P0.
- [ ] **The widened transforms have never been executed by pandas** — the model now demonstrably
      writes them, but no sandbox has run them.
- [ ] **"Ask anything" is only true for retail-shaped data.** `lib/guardrails/classify.ts` maps a
      hardcoded business vocabulary; an arbitrary file degrades quietly to "allowed".

## 10. Found in the live session, not yet fixed

- [ ] **The rate limiter fired on a single local user** during ordinary demo clicking
      (`POST /api/analyze 429`). The limit must stay; the window needs to fit a human presenting.
- [ ] **26 ElevenLabs calls served 3 questions** — one round trip per narration beat. Cost scales
      with how talkative the deck is, not with questions asked.
