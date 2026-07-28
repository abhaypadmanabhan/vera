# Handover — 2026-07-28

Read `PRD.md` and `CLAUDE.md` first. This file covers the state of the branch and what is open.

## State of the repo

`feat/p2-fireworks` is the tip of all work. **PR #35 is closed**, superseded by four stacked review
PRs that carry exactly its range.

| PR | head → base | files | commits | review |
|----|------|-------|---------|--------|
| [#40](https://github.com/abhaypadmanabhan/vera/pull/40) | `review/01-voice-orb-followups` → `dev` | 50 | 14 | CodeRabbit, 8 findings |
| [#41](https://github.com/abhaypadmanabhan/vera/pull/41) | `review/02-prep-gate-upload-live` → 01 | 50 | 45 | Macroscope, 12 findings |
| [#42](https://github.com/abhaypadmanabhan/vera/pull/42) | `review/03-design-v4-codegen-retry` → 02 | 38 | 15 | Macroscope, 11 findings |
| [#43](https://github.com/abhaypadmanabhan/vera/pull/43) | `feat/p2-fireworks` → 03 | — | 12+ | Macroscope, 3 findings |

14 + 45 + 15 + 12 = 86 = `origin/dev..origin/feat/p2-fireworks`, zero unreachable commits. Nothing
was rewritten: each review branch is a pointer at a commit already on `feat/p2-fireworks`, and
batch 4's head **is** the branch, so late commits stay included.

### Why the split exists

PR #35 was 125 files, over CodeRabbit's 100-file limit, so it was never reviewed. An earlier
six-batch plan was unexecutable: it had been measured against a **local `dev` that was 95 commits
stale**, and three of its six tips were already merged. Measure against `origin/<base>`.

### CodeRabbit and stacked PRs — read before merging

`.coderabbit.yaml` auto-reviews only base branches `dev` and `main`. A stacked PR whose base is a
`review/*` branch comes back **"Review skipped"** — for the base branch, **not** for its size. Do
not read that as the file limit biting again. Trigger by hand:

```bash
gh pr comment <N> --body "@coderabbitai review"
```

**Every push to `feat/p2-fireworks` re-fires auto-review on #43, which re-skips and overwrites the
manual result.** So #43's trigger must be the last action after the final commit lands. Do not
merge #43 believing it was reviewed — check for a real review first.

To make this automatic for future stacks, add `review/.*` to `base_branches`. Deliberately not done
mid-review: it means a commit on a review branch, which breaks the byte-identical guarantee.

## Merge order — bottom-up, one at a time

### The stack is merged — this is what actually happened

All four merged into `dev` on 2026-07-28; `dev` is byte-identical to
`feat/p2-fireworks`. PR #44 takes `dev` → `main`.

**`--delete-branch` closes the next PR in the stack. It does not retarget it.**
Deleting a branch that is still another PR's base closes that PR outright — #41 was
closed this way and had to be recovered by pushing the branch back, reopening, and
retargeting. GitHub's auto-retarget did not fire. The order that works:

```bash
gh pr merge 40 --merge                      # no --delete-branch
gh pr edit 41 --base dev && gh pr merge 41 --merge
gh pr edit 42 --base dev && gh pr merge 42 --merge
gh pr edit 43 --base dev && gh pr merge 43 --merge
# only once nothing bases on them:
git push origin --delete review/01-... review/02-... review/03-...
```

Retarget first, merge second, delete last.

## What landed on 2026-07-28

**README** rewritten around the argument (one question, one file, three answers), every figure
re-derived from `data/superstore.csv` rather than copied forward. Screenshots in `docs/screenshots/`.

**34 review findings worked** — 8 from CodeRabbit, 26 from Macroscope, across six parallel agents
partitioned so no two wrote the same file. Tests went 413 → 463.

The ones that mattered:

- **Braintrust logged raw prompts and completions by default.** The codegen prompt embeds sample
  rows of the user's file, so tracing shipped their data to a third party. Now opt-in via
  `VERA_TRACE_PAYLOADS=1`; spans still carry model, tokens, finish reason and sizes.
- **Prep destroyed real records.** `drop_duplicates()` ran on the coerced frame, so `$1000` and
  `1000` merged and one was deleted, reported as an exact repeat.
- **A number attributed to a file it never touched.** Asking against the demo file while an upload
  prepped rendered the result with the uploaded file's identity.
- **A context figure could be presented as grounded in a column the code never read** — closed in
  both `lib/codegen/generate.ts` and `lib/verify.ts`.
- **The landing page was blank without JavaScript.** 0/23 blocks visible; now 23/23, including when
  the bundle fails to load with JS on.
- **"Every row agrees" was false.** 5,952 supporting / 0 contradicting on 9,994 rows leaves 4,042
  saying nothing either way. Consolidated into one `agreementLine()` so it cannot diverge again.
- **A prep run could bill ~180s of sandbox time against a documented 90s budget** — the whole-run
  budget was being passed as the per-call timeout.

## What is genuinely still open

**A live honesty bug, not yet fixed.** On the Netflix fixture Vera states *"This file does not
record comedies"* — the file has 8. `fileVocabulary` treats `sampleValues` as the complete
vocabulary, but `lib/profile/profiler.ts:112` slices it to 5. The in-slice workaround was rejected
because it silently disables the refusal entirely while existing tests stay green. Needs a product
call: widen the sample for low-cardinality columns, or add a `valuesComplete` flag to
`ColumnProfile` and gate the refusal on it.

Smaller, all deliberate:

- The mock's code panel prints only the headline total; the breakdown subtotals in `contextValues`
  come from no displayed line, and mock stdout is a bare number rather than the real path's
  `VERA_RESULT:` envelope.
- `lib/mock/engine.ts` builds `ContextFigure`s directly, bypassing `verifyContextFigures`, so the
  mock deck is unguarded by the fix above.
- `lib/analyst/guarded.ts` classifies every question against the raw profile, so a follow-up naming
  a prep-invented column can be refused on the healthy prepared path.
- In `assertSafeCode`, two adjacent checks now throw different classes — one retryable, one fatal.
- `evidenceHeadline` in `lib/deck.ts` is exported with zero call sites.
- **No DOM test environment.** `usePrepare` and the deck's narration re-entrancy fix are covered by
  hand-rolled stand-ins, not a rendered component; one deck assertion is explicitly known not to
  discriminate. Adding jsdom is a `package.json` change nobody has owned.
- The geometry sweep still lives in a scratchpad rather than `tests/` (issue #37).

`.env.local` is `VERA_MOCK=1`. **The live path spends real money and needs the builder's explicit go
every single time.**
