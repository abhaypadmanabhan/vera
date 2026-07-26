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
