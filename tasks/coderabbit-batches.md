# CodeRabbit review plan — four stacked PRs

PR #35 was skipped: over CodeRabbit's 100-file limit. The cause is that `dev` was never kept
current, so one PR carries several phases at once.

Splitting the SAME commits into stacked batches gets every slice under the limit. Nothing is
rewritten, rebased or cherry-picked — each branch is a plain pointer at an existing commit that is
already on `feat/p2-fireworks`. The history that lands on `dev` is byte-identical to PR #35's.

The last batch is `feat/p2-fireworks` itself, not a frozen SHA, so anything committed to the branch
after this plan was written belongs in the last batch automatically.

## Correction — the first version of this plan was unexecutable

It specified six batches measured against the **local** `dev` ref, which was **95 commits behind
`origin/dev`**. Against the real remote:

- PR #35 is **81 commits / 125 files**, not 172 / 120.
- Three of the six batch tips (`ac2dc6d`, `92b45d2`, `50e452a`) were **already merged into
  `origin/dev`** via PR #22. GitHub refuses those PRs — no commits between base and head.

Recomputed against `origin/dev`, the work splits into four slices, worst case 50 files — better
than the original plan's 75. Lesson recorded in `tasks/lessons.md` (2026-07-27).

**Measure against `origin/<base>`, never a local tracking branch that may be stale.**

## The batches (live)

| PR | branch | base | tip | files | commits |
|----|--------|------|-----|-------|---------|
| [#40](https://github.com/abhaypadmanabhan/vera/pull/40) | `review/01-voice-orb-followups` | `dev` | `d260859` | 50 | 14 |
| [#41](https://github.com/abhaypadmanabhan/vera/pull/41) | `review/02-prep-gate-upload-live` | `review/01-voice-orb-followups` | `fe42578` | 50 | 45 |
| [#42](https://github.com/abhaypadmanabhan/vera/pull/42) | `review/03-design-v4-codegen-retry` | `review/02-prep-gate-upload-live` | `4f8807c` | 38 | 15 |
| [#43](https://github.com/abhaypadmanabhan/vera/pull/43) | `feat/p2-fireworks` | `review/03-design-v4-codegen-retry` | branch tip | 32 | 7 |

14 + 45 + 15 + 7 = 81 commits, exactly PR #35's.

## Auto-review is off for stacked PRs — this is expected, not a refusal

`.coderabbit.yaml` lists `dev` and `main` as `reviews.auto_review.base_branches`. A stacked PR
whose base is a `review/*` branch is therefore **skipped for the base branch, not for its size**:

> Auto reviews are disabled on base/target branches other than the default branch.

Do not read that as the file limit biting again. Trigger each one by hand:

```bash
gh pr comment <N> --body "@coderabbitai review"
```

Only PR 1 (base `dev`) is auto-reviewed. To make this automatic for future stacks, add `review/.*`
to `base_branches` in `.coderabbit.yaml` — deliberately not done mid-review here, because touching
a review branch's history breaks the byte-identical guarantee above.

## Recreating the branches

Read-only on history. Safe to re-run.

```bash
git fetch origin
git branch -f review/01-voice-orb-followups   d260859
git branch -f review/02-prep-gate-upload-live fe42578
git branch -f review/03-design-v4-codegen-retry 4f8807c
git push -u origin review/01-voice-orb-followups review/02-prep-gate-upload-live review/03-design-v4-codegen-retry
```

## Merge order — bottom-up, one at a time

`review/01` into `dev` first. GitHub then auto-retargets `review/02`'s base to `dev`, and so on.
Do not merge out of order; each batch's diff assumes its predecessor has landed.

```bash
gh pr merge 40 --merge   # then wait for the retarget before the next
gh pr merge 41 --merge
gh pr merge 42 --merge
gh pr merge 43 --merge
```

After batch 4 lands, `dev` contains everything on `feat/p2-fireworks`. Then:

- close #35 with a comment pointing at #40–#43
- close #36
- open the final `dev` -> `main` PR and stop for the builder

## If a command is blocked

The agent session may be denied `gh pr merge` and similar by its permission classifier. When that
happens it must NOT route around it — print the exact command for the builder to paste and run,
batched where possible, then carry on with what it can still do.
