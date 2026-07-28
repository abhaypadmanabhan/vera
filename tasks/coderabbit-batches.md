# CodeRabbit review plan — six stacked PRs

PR #35 was skipped: 120 files, over CodeRabbit's 100-file limit. The cause is that `dev`
was never kept current, so one PR carries all of phases 2-11.

Splitting the SAME commits into stacked batches gets every slice under the limit. Nothing is
rewritten, rebased or cherry-picked — each branch is a plain pointer at an existing commit that is
already on `feat/p2-fireworks`. The history that lands on `dev` is byte-identical to PR #35's.

Measured: batches of 30 commits give **6 PRs, worst slice 75 files**. Batches of 40 give 5 PRs but
one slice is 104 — still over. Batches of 20 give 9 PRs and no benefit over 30.

## The batches

| PR | branch | base | tip | files (after CodeRabbit's path filters) |
|----|--------|------|-----|------|
| 1 | `review/01-scaffold-fireworks-daytona` | `dev` | `ac2dc6d` | 79 (75) |
| 2 | `review/02-safeguard-cold-open` | `review/01-scaffold-fireworks-daytona` | `92b45d2` | 66 (65) |
| 3 | `review/03-braintrust-voice-landing` | `review/02-safeguard-cold-open` | `50e452a` | 59 (58) |
| 4 | `review/04-prepare-upload-routes` | `review/03-braintrust-voice-landing` | `6c685b9` | 70 (69) |
| 5 | `review/05-phase11-narration` | `review/04-prepare-upload-routes` | `2f57cd5` | 43 (42) |
| 6 | `review/06-v4-redesign` | `review/05-phase11-narration` | `9c7f9ea` | 68 (67) |

Tip commit subjects:

- **1** `ac2dc6d` — merge(p2): Superstore benchmark rebuild, date traps, profiler tests
- **2** `92b45d2` — feat(ui): cold open at /open — the date trap, scripted and deterministic
- **3** `50e452a` — feat(landing): add official sponsor logos
- **4** `6c685b9` — feat(api): rate-limited prepare route, streaming real prep stages
- **5** `2f57cd5` — docs: CP-9, phase 11 P0 step A results, and the lesson it earned
- **6** `9c7f9ea` — docs: handover for the next session

## Create and push the branches

Read-only on history. Safe to re-run.

```bash
git branch -f review/01-scaffold-fireworks-daytona ac2dc6d
git branch -f review/02-safeguard-cold-open 92b45d2
git branch -f review/03-braintrust-voice-landing 50e452a
git branch -f review/04-prepare-upload-routes 6c685b9
git branch -f review/05-phase11-narration 2f57cd5
git branch -f review/06-v4-redesign 9c7f9ea
git push -u origin review/01-scaffold-fireworks-daytona review/02-safeguard-cold-open review/03-braintrust-voice-landing review/04-prepare-upload-routes review/05-phase11-narration review/06-v4-redesign
```

## Open the six PRs, stacked

Each PR's base is the PREVIOUS batch's branch, so its diff is only that batch. Open them all at
once — CodeRabbit then reviews all six in parallel instead of you waiting six times.

```bash
gh pr create --base dev --head review/01-scaffold-fireworks-daytona \
  --title "review 1/6: merge(p2): Superstore benchmark rebuild, date traps, profile" \
  --body "Batch 1 of 6, split out of #35 so CodeRabbit can review it (75 files after path filters, under the 100 limit). Same commits, same order, nothing rewritten. Merge this one first." 
gh pr create --base review/01-scaffold-fireworks-daytona --head review/02-safeguard-cold-open \
  --title "review 2/6: feat(ui): cold open at /open — the date trap, scripted and d" \
  --body "Batch 2 of 6, split out of #35 so CodeRabbit can review it (65 files after path filters, under the 100 limit). Same commits, same order, nothing rewritten. Merge bottom-up: this one lands only after PR 1 does." 
gh pr create --base review/02-safeguard-cold-open --head review/03-braintrust-voice-landing \
  --title "review 3/6: feat(landing): add official sponsor logos" \
  --body "Batch 3 of 6, split out of #35 so CodeRabbit can review it (58 files after path filters, under the 100 limit). Same commits, same order, nothing rewritten. Merge bottom-up: this one lands only after PR 2 does." 
gh pr create --base review/03-braintrust-voice-landing --head review/04-prepare-upload-routes \
  --title "review 4/6: feat(api): rate-limited prepare route, streaming real prep s" \
  --body "Batch 4 of 6, split out of #35 so CodeRabbit can review it (69 files after path filters, under the 100 limit). Same commits, same order, nothing rewritten. Merge bottom-up: this one lands only after PR 3 does." 
gh pr create --base review/04-prepare-upload-routes --head review/05-phase11-narration \
  --title "review 5/6: docs: CP-9, phase 11 P0 step A results, and the lesson it ea" \
  --body "Batch 5 of 6, split out of #35 so CodeRabbit can review it (42 files after path filters, under the 100 limit). Same commits, same order, nothing rewritten. Merge bottom-up: this one lands only after PR 4 does." 
gh pr create --base review/05-phase11-narration --head review/06-v4-redesign \
  --title "review 6/6: docs: handover for the next session" \
  --body "Batch 6 of 6, split out of #35 so CodeRabbit can review it (67 files after path filters, under the 100 limit). Same commits, same order, nothing rewritten. Merge bottom-up: this one lands only after PR 5 does." 
```

## Merge order — bottom-up, one at a time

`review/01` into `dev` first. GitHub then auto-retargets `review/02`'s base to `dev`, and so on.
Do not merge out of order; each batch's diff assumes its predecessor has landed.

After batch 6 lands, `dev` contains everything on `feat/p2-fireworks`. Then:
- close #35 with a comment pointing at the six review PRs
- open the final `dev` -> `main` PR
- close #36

## If a command is blocked

The agent session may be denied `gh pr merge` and similar by its permission classifier. When that
happens it must NOT route around it — it should print the exact command for the builder to paste
and run, then carry on with what it can do.

