# Lessons

Patterns caught by the builder. Dated. Read at session start.

---

## 2026-07-25 — Dispatching an agent is not the end of a turn

**What happened:** Round 3's two agents were started and prompted, and the turn ended there with
no poller and no wake-up. Both finished, pushed, and sat idle. The builder had to point it out.
Every earlier round had a polling loop; this one silently did not.

**Why it matters:** an orchestrator whose attention ends at dispatch is not orchestrating. The
agents were done in ~9 and ~23 minutes and nothing happened for far longer, purely because
nobody was watching.

**How to apply:** a turn that starts background work does not end until either the work is
watched to completion in that same turn, or a poller / `ScheduleWakeup` is in place to bring it
back. Starting an agent and writing a status summary is not a stopping point — the summary is
not the check. Treat "I dispatched N agents" as an open obligation until each one's output has
been read.

---

## 2026-07-25 — A green test suite is not a look

**What happened:** Phase B merged with 328 passing tests. Opening the app in a browser
immediately showed `date_added is DD/MM/YYYY` printed on the summary slide — a column name and a
date format on a presentation surface, which `CLAUDE.md` forbids and the builder had already
raised twice.

**Why it matters:** the jargon test asserted against `slide.spoken` and `slide.beats[].spoken`
only. Nothing asserted against rendered text, so the suite was green and blind at the same time.
Three agents reported "all gates pass" truthfully and the defect still shipped to the merge.

**How to apply:** when a rule is about what the user *sees*, the test must assert on what is
*rendered*, not on the data behind it. And no slice is verified until the orchestrator has looked
at it in a browser — an agent's green gates prove the code does what the tests say, not that the
product obeys the rule.

---

## 2026-07-26 — Two gates derived from different evidence will punish an honest model

**What happened:** the first real Fireworks prep call was rejected wholesale. Not for the reason
three documents predicted — the model copied every canonical transform verbatim — but because
`transformFor` hands the model a strip transform for every text column and a numeric coercion for
every numeric column *unconditionally*, while `allowedFixes` only permits the matching English
sentence when the samples contain visible dirt. The model described the code it had been told to
copy and lost the entire prep for it. Live prep was dead on every upload, always, and the catch in
`prepareDataset` logged nothing.

**Why it matters:** the predicted failure was the interesting one, so it got all the attention.
The actual failure was in the boring adjacent gate. Two whitelists over the same program, each
derived from its own evidence threshold, will disagree — and the model that behaves correctly is
the one that trips the disagreement.

**How to apply:** when two gates constrain one artifact, derive them from the *same* evidence or
prove they agree. Never let a presentational field invalidate an executed one. And when a path
fails open by design, make it say why — a fail-open with no log is indistinguishable from success
and cost this phase its entire premise. Cheap offline probing first also pays: mapping which
deviations `tokenizePython` actually tolerates took minutes, cost nothing, and told us before the
call that quoting and ordering were never the risk.

---

## 2026-07-26 — A call that returns without error has not necessarily done anything

**What happened:** `sandbox.delete(60)` returned cleanly, and the very next list call still showed
the sandbox as `started`. Reporting "reaped" at that moment would have been false, and the thing
that bills would have kept billing.

**Why it matters:** the Daytona list is eventually consistent. The delete had in fact landed — but
the only way to know that was to poll until the sandbox was **gone from the list**, not to trust
the absence of an exception.

**How to apply:** for anything that costs money or destroys state, the proof is an independent
observation of the new state, not the return value of the call that was supposed to change it.
Poll until the world agrees.

---

## 2026-07-27 — A design doc can be the thing that generates the AI tells

**What happened:** DESIGN.md v3 prescribed uppercase mono micro-labels as *the* label idiom, a 16px
prose size, and two families with mono carrying every figure. Every screen obediently shipped them.
The builder's own `AI Design Tells.md` lists "uppercase mono micro-labels", "mono used as a UI font"
and "type at 11–13px" as three of its top ten reject items. The house style and the house rules were
in direct conflict, and the house style won by default because it was the file in the repo.

**Why it matters:** consistency with a spec is not the same as quality. A rule applied everywhere
produces a page that is uniformly wrong rather than patchily wrong, which is harder to see and
easier to defend.

**How to apply:** when an external reference (the vault) and the in-repo spec disagree about a
*tell*, reconcile at the token layer and update the spec in the same change — one edit to `.v-label`
fixed every call site. And read the reject list before building, not after: `CLAUDE.md` now points
at both vaults so the next agent starts there.

---

## 2026-07-27 — "Fits" is a claim about pixels; assert it with pixels

**What happened:** the deck's `working` slide declared a three-row grid and rendered six children.
The overflow was invisible in code review, invisible to `tsc`, invisible to 413 passing tests, and
completely obvious in a screenshot: the cells table printed straight through the evidence prose.
The `meaning` slide had the mirror bug — two hard-coded rows for one figure, most of the stage empty.

**Why it matters:** layout defects are the one class where the type system and the test suite have
nothing to say. Both slides had been shipped and reviewed.

**How to apply:** for any layout claim, run a real browser and assert geometry, not appearance —
a script that walks every leaf text node, intersects their bounding boxes, and fails on any
overlap found four real defects in one pass across 1440/768/390 and light/dark. Two caveats it
taught: skip `.sr-only` nodes (clipped, but still report rects) and skip closed `<details>`
content (Chrome reports rects for it), or the audit drowns in false positives.

---

## 2026-07-27 — A utility that "merges classes" can be quietly deleting them

**What happened:** `cn()` was `twMerge(clsx(...))` on tailwind-merge's stock config, which has no
knowledge of this repo's design tokens. It cannot tell `text-small` (a size) from `text-danger`
(a colour) — both are `text-*` with an unrecognised name — so it filed them in one group and kept
the last: `cn("text-small text-danger")` → `"text-danger"`. Every element written that way had been
rendering at the browser's default 16px since the token scale was introduced. No error, no warning,
and `tsc`, ESLint, `next build` and 413 tests all pass with it in place.

**Why it matters:** the failure is silent *and* invisible in review — the source reads correctly.
It only shows up if you measure the computed font size in a browser, which nobody does by default.

**How to apply:** any Tailwind project with a custom `@theme` must teach tailwind-merge its token
names via `extendTailwindMerge` — `font-size`, `text-color`, `bg-color`, `border-color` at minimum.
Verify it with a one-liner that prints `cn()` output for a size+colour pair, and keep the token
lists next to a comment pointing back at `@theme`. More generally: when a helper's job is to
*remove* things, test what it removes, not just that it runs.

---

## 2026-07-27 — JSX eats the space when an expression opens a line, and this build shows it

**What happened:** `{facts.questionCount} ordinary questions…` — space present in the source, on the
same line — rendered as **"21ordinary"**. Same for `<span>{count}</span> that needed…` → "11that".
It was invisible in review (the source reads correctly) and invisible in a downscaled screenshot;
it only showed up when the rendered `innerText` was read back. A previous pass hit the identical
bug and worked around it locally without anyone writing down the rule.

**Why it matters:** the copy is the product on a landing page. A glued word reads as a typo made by
whoever wrote it, and there is no lint rule and no test that catches it.

**How to apply:** when an expression container or element is the FIRST token on a JSX line and text
follows it, write the space explicitly as `{" "}` on its own line. And verify copy the only way that
is real — read `document.body.innerText` back from the running page. A one-line regex over that
text (`/\d[a-zA-Z]{3,}/`) catches the whole class across every route in seconds; it is now part of
the landing verification script.

---

## 2026-07-27 — An IntersectionObserver silently loses anything you jump past

**What happened:** scroll reveals were switched from a load animation to an IntersectionObserver.
Scrolling normally, everything appeared. Jumping to the bottom, **12 of 23 blocks never revealed and
stayed at `opacity: 0` permanently** — the element went from below the viewport to above it in one
step, its intersection ratio was 0 before and 0 after, nothing changed, so the callback never ran.
An anchor link, End, or a fast flick reproduces it.

**Why it matters:** the failure mode is a blank page section, and it only appears on the navigation
paths people actually use in a hurry. Testing by scrolling smoothly hides it completely.

**How to apply:** an observer alone is not enough for reveal-on-scroll. Pair it with a
rAF-throttled scroll/resize check that reveals anything whose top has risen above the fold line, and
have both paths remove themselves once shown. Test it by JUMPING — `window.scrollTo(0,
document.body.scrollHeight)` — and asserting the count of revealed elements, not by watching it.
