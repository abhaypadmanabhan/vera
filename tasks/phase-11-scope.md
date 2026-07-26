# Phase 11 — any file, any question, a presentation that holds up

Scoped 2026-07-26 by the outgoing orchestrator. Approved by the builder as the next phase.

**The ask, in his words:** the user uploads their own CSV, Vera does the work on the back end, the
user asks anything, and a presentation comes out of it.

Most of the machinery for that already exists and is merged. **What does not exist is proof that
it works against real services on a file that is not Superstore.** That is the spine of this
phase, and it must come first — everything else built on top of an unproven pipeline is guesswork.

---

## What is already true (do not rebuild any of this)

Merged on `feat/p2-fireworks` at `0a8b5c6`, 344 tests, lint/tsc/build clean.

- **Upload works.** Dropzone on `/ask`, client-side guards on extension and size, `resolveUpload`
  server-side. Proven in a browser on a 40-row Netflix file.
- **Prep works.** `POST /api/prepare`, rate limited, memoised by content hash. One Fireworks call
  writes the cleaning script and proposes questions; one Daytona run executes it; a fixed audit
  program *we* wrote measures what changed. **Proven in mock only.**
- **The model cannot author cleaning code.** `canonicalizePrepCode` rebuilds the program from
  canonical transforms derived from the profile; anything else is rejected. Imputation and row
  deletion are structurally impossible, not merely forbidden by a prompt.
- **Answers come from the prepared file.** `/api/analyze` looks up the prep report by content hash
  and sets `analysisPath`, falling back to raw when prep is missing, evicted or stale.
- **The deck sounds like an analyst.** Opener → finding → meaning → caveat → working. Valence-driven
  openings, consequence-not-method caveats, no jargon on any narrated or rendered surface.
- **Context figures are grounded or dropped.** Never hedged, never shown as pending.
- **Live pipeline works.** 3 real analyses in ~6s each; 26 ElevenLabs narration calls; the orb's
  speaking state driven by real audio for the first time.

---

## P0 — Prove the upload path live. Nothing else starts until this is done.

**This is the single largest untested surface in the product, and it is exactly what the builder
asked for.** During the 2026-07-26 live session there were **zero** `POST /api/prepare` calls. The
Netflix file has never been through a real Fireworks cleaning call.

Specific unknowns that only a live run can answer:

1. **Will the model's prep code survive `canonicalizePrepCode` at all?** The whitelist demands
   token-for-token matches against canonical transforms. If the real model formats its pandas even
   slightly differently — different quoting, an extra intermediate variable — every prep will be
   rejected and prep will silently fail open on every upload. **This is the highest-risk unknown
   in the codebase.** Mock cannot test it, because the mock generates the canonical form by
   construction.
2. **Are the model's proposed questions any good?** Mock questions are template-built. Nobody has
   seen five real questions proposed for a real file.
3. **Do the widened transforms fire on a real file?** `duration` → `duration_amount` / `duration_unit`
   has never been executed by pandas, only asserted in tests.
4. **Does the audit report usable counts after a widened transform?** It withholds counts whenever
   row identity is ambiguous — correct, but it may withhold far more often than expected in
   practice, leaving "she could not measure this file" as the normal case.
5. **Does codegen actually use the derived columns?** The prepared profile is threaded through, but
   no real model has been asked a question that needs `duration_amount`.

**How to do it:** one supervised live run, builder's explicit go, on the Netflix CSV at
`/private/tmp/.../scratchpad/netflix_titles.csv` or one of his own. Upload, watch prep, ask two or
three questions including one that needs a derived column. Then **delete the Daytona sandbox and
confirm it is gone from the list** — the delete call returning is not proof (see `tasks/lessons.md`).

Budget: ~2 Fireworks calls and ~3 sandbox runs for prep, plus one Fireworks + one sandbox per
question, plus narration.

**Expect P0 to generate the real work of this phase.** Do not plan P1 in detail until its results
are in.

---

## P1 — "Ask anything" is not yet true for an arbitrary file

`lib/guardrails/classify.ts` builds an `AvailableInformation` map over hardcoded business concepts
— sales, profit, cost, margin, customer, discount, shipDate, orderDate, orderId, quantity, region,
category, product. That is a Superstore vocabulary.

On a Netflix file it degrades quietly rather than loudly: unrecognised subjects fall through to
"allowed", so the guardrail neither refuses wrongly nor helps. The refusal quality the product is
built on — "she declines what the file cannot answer, and says why" — is therefore **only real for
retail-shaped data**.

Make the concept map derive from the profile instead of from a fixed list, so a refusal on an
arbitrary upload is as specific as one on Superstore. Keep the existing conservatism: ambiguous
wording passes, execution stays the final arbiter.

---

## P2 — Demo resilience

Both found in the live session, both would show on stage.

1. **The rate limiter fired on a single local user.** One `POST /api/analyze 429` while the
   builder clicked through at ordinary speed. The limit must stay — it is the money guard — but the
   window needs to fit a human presenting. Consider a separate, looser allowance for localhost, or
   a clearer in-UI "give me a second" state rather than an error.
2. **26 ElevenLabs calls for 3 questions.** One round trip per beat, so cost scales with how
   talkative the deck is. Consider synthesising a slide's beats in one call, or pre-fetching the
   next beat during the current one. Do not degrade the interrupt behaviour — STOP must still kill
   narration immediately.

---

## P3 — A presentation, not a slideshow of one number

The builder's original phrasing was "multiple findings composed into a narrative". Today a deck
presents **one** finding plus its grounded context figures. That is a big improvement on one bare
figure, and it may already be enough — **look at P0's output before deciding.**

If it is not enough, the honest shape is: several questions answered in one run, each independently
grounded, composed into one deck with a through-line. Every figure still executed, still traceable.
The cost is linear in findings, so this needs the builder's explicit sign-off on spend per deck.

---

## Standing rules that do not change

- **Money.** No Fireworks, Daytona, Braintrust or ElevenLabs call without the builder's explicit
  go for that specific piece of work. Mock mode must keep running the whole app with zero keys.
  Never read, print, `cat`, `grep` or commit `.env.local`.
- **After any live run, delete the Daytona sandbox and verify it is gone from the list.**
- **Honesty (PRD §6).** Live grounding and the aggregate benchmark are two different claims and are
  never blurred. A figure renders only when `verdict === "verified"`.
- **No code jargon on any presentation surface** — narrated *or* rendered.
- **Never merge to `main` without the builder's explicit approval.**
- Verify in a real browser yourself. An agent's green gates are not proof, and `herdr agent get`
  reporting `idle` can be a lie — always read the pane.
