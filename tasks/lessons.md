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
