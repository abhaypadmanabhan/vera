# Vera — Product Requirements Doc (Hackathon Bible)

> Drop this at the repo root as `PRD.md` (and reference it from `CLAUDE.md` / `AGENTS.md`).
> Every build agent reads this first. It is the single source of truth for scope, stack, and the honest definition of "verified."

**Event:** Daytona HackSprint w/ Braintrust — SF, Fri Jul 24 2026. Build time ~10:00am–3:30pm (~5.5h, budget for ~4.5h coding + demo video + Devpost writeup).
**Goal:** Win the MAIN prize (top 3), judged on Impact 25 / Technical 25 / Creativity 25 / Presentation 25, + Sponsor Tool Usage (bonus).
**Builder:** solo, commanding parallel agents via Herdr.

---

## 1. One-liner
**Vera is an AI business analyst that proves every number before she says it.** You point her at your business data, she writes analysis code, runs it in an isolated Daytona sandbox, grounds every figure in the real source cells, and presents the finding out loud. She will not state a number she can't show the work for.

## 2. Why this wins (hold every decision against this)
- **Impact:** every founder / ops lead / small team drowns in spreadsheets and can't trust AI to touch them. Vera is the trustworthy one.
- **Technical:** an agent that writes code, executes it in a sandbox, and gates its own output is obviously hard and can't be faked.
- **Creativity:** everyone else at a Daytona event brings a code-fixer. We bring the analyst that refuses to lie. Different genre.
- **Presentation:** cold open — show a normal AI confidently stating a WRONG number, then Vera pulls the data, runs code, and proves the real one, out loud. (Winning Patterns: win the first 30 seconds; demo-ability beats scope.)
- **Sponsor fit (deep, not shallow):** Daytona is the hero (safe compute), Braintrust is the proof, Fireworks is the brain, ElevenLabs is the voice.

## 3. Architecture (the "thinks" shape — Live Digital Twin family)
Our whole app is **TypeScript / Next.js**. The **only Python** is the analysis code that runs **inside Daytona**. The app just orchestrates four API calls.

```
Upload CSV ─► Fireworks writes pandas code ─► Daytona sandbox runs it ─► result
                                                                          │
     Verify: code executed + value grounded in real cells? ──────────────┤
        pass ─► show number + code + source cells ─► ElevenLabs speaks it │
        fail ─► feed error back to Fireworks, retry (max 2) ──────────────┘

(Separately, offline:) Braintrust benchmark of ~15 Q&A ─► "91% vs 55% baseline" shown live
```

Reasoning trace (the 4 stages: *writing code → running in sandbox → verifying → done*) streams to the UI live so the demo never goes silent (Computer-Use Agent note: silence kills the demo).

## 4. Scope — build in this order, verify before advancing

**MVP SPINE (this is the win — build first, protect at all costs):**
1. **Scaffold + mocked end-to-end UI.** No APIs. CSV dropzone, question box, live 4-stage timeline, result card (number + collapsible code + source line), plus an "unverified" state preview. All mock data in one swappable file. *(money-free)*
2. **Fireworks:** CSV schema + question → pandas code (structured output). Retry loop on error. *(spends credits)*
3. **Daytona:** one warm sandbox (pandas preinstalled). Write the CSV in, run the generated code, return `response.result`. *(spends credits)*
4. **The safeguard:** render number + executed code + which columns/rows it used. Block + retry when code fails or returns null. Define "verified" per §6.

**STRETCH (only if spine is solid):**
5. **Braintrust:** the ~15-question benchmark + baseline (Fireworks answering with NO code execution) → the headline accuracy stat + dashboard link. *(spends credits)*
6. **ElevenLabs:** speak the finding. Engineer the cold-open (wrong-AI vs Vera).
7. **Polish + record backup demo clip + Devpost writeup + CodeRabbit review pass.**

**Demo dataset:** one baked-in realistic business CSV (e.g. monthly sales/revenue/costs, ~2 yrs, some messy rows). "Upload your own" is a bonus path, not the primary demo.

## 5. Tech stack (locked — from Winning Tech Stack note)
- **App + backend:** Next.js (App Router) + TypeScript + Tailwind + shadcn/ui. One repo. API routes = backend.
- **Run locally for the demo (`next dev`)** — do NOT deploy to Vercel (serverless timeouts kill the sandbox call).
- **Brain:** Fireworks, OpenAI-compatible SDK. Base URL `https://api.fireworks.ai/inference/v1`. Pick a strong code model from the recommended-models page (do not hardcode a guess).
- **Compute:** Daytona TS SDK `@daytona/sdk`. One reused warm sandbox held as a server-side singleton.
- **Proof:** Braintrust TS SDK (`braintrust` + `autoevals`). Offline eval, dashboard shown.
- **Voice:** ElevenLabs TS SDK, `textToSpeech.convert`.
- **No DB** for MVP (in-memory). No CopilotKit, no LangGraph (cut for time).
- **Secrets server-side only.** Rate-limit every endpoint that spends money (Security Checklist).

## 6. The honest definition of "verified" (DO NOT BLUR THESE — a judge will probe it)
- **Live grounding (per answer, real):** the number was produced by code that actually executed on the real CSV cells, not guessed. If code runs and returns a value traceable to columns/rows → grounded. This is what we show live on any input.
- **Measured accuracy (aggregate, from Braintrust):** on our fixed ~15-question benchmark, Vera scores X% vs Y% for a no-code baseline. This is a pre-computed number, shown as a dashboard.
- **What we do NOT claim:** catching a subtly wrong-but-runnable answer on an arbitrary CSV live. There is no answer key at demo time. On stage: *"every number is computed and traceable, and on our benchmark it's X% vs Y%."*

## 7. Key implementation notes / resolved gaps
- **Warm sandbox:** create once on server boot / first request, store the handle in a module-level singleton, reuse across queries. Pre-install pandas.
- **CSV → sandbox:** on upload, write the file into the sandbox filesystem (or pass as a string the generated code loads). Generated pandas reads that path.
- **Streaming trace:** stream the 4 stage events to the UI (SSE or simple polling). Each stage flips the timeline.
- **Retry loop:** on code error, feed stderr back to Fireworks once or twice, then surface a clean "couldn't verify" state.
- **Baseline path (for Braintrust):** same questions answered by Fireworks with the CSV in-context and NO execution — that's the "dumb AI" comparison.

## 8. Dev workflow
- **Herdr** (https://herdr.dev/docs/quick-start/) spawns the parallel agents. Keep to **2–3 agents on cleanly separated slices**: (a) UI shell + timeline, (b) orchestration API + Fireworks/Daytona wiring, (c) demo CSV + Braintrust benchmark. You are the merge gate.
- Every coding prompt: **use the `superpowers` skill.** Anything touching UI: **also use the `frontend-design` skill + the `shadcn` MCP.**
- **CodeRabbit** reviews the PRs of THIS repo before submit (dev-time only, not a product feature). List it in the Devpost as a tool used.
- **Money rule:** NO paid API run (Fireworks / Daytona / Braintrust / ElevenLabs) without the builder's explicit go. Steps 2+ spend hackathon credits.

## 9. Step 0 — before any coding (do at 9am)
Create accounts, get API keys, redeem coupons, set env vars:
- Daytona — key at app.daytona.io/dashboard/keys · coupon `DAYTONA_HACKSPRINT_07_24_639EXIRT`
- Braintrust — coupon `BT-DISCOUNT-HACKATHON`
- Fireworks — coupon `DEVREL-WEBINAR1`
- ElevenLabs — free access via the event Discord `#coupon-codes`
- `.env.local`: `FIREWORKS_API_KEY`, `DAYTONA_API_KEY`, `BRAINTRUST_API_KEY`, `ELEVENLABS_API_KEY` (server-side only).

## 10. Submission checklist (due 3:30pm via Devpost)
Unique team name · demo video <2 min · problem + impact · technical architecture · **list of sponsor tools + how integrated** · public GitHub repo. Reserve ~45 min for this.

---

## Appendix — Doc links (agents: read these for exact syntax)
- **Daytona:** https://www.daytona.io/docs/ · full LLM text (paste into agent): https://www.daytona.io/docs/llms-full.txt
- **Braintrust:** https://www.braintrust.dev/docs · index: https://www.braintrust.dev/docs/llms.txt (read the evaluation quickstart)
- **Fireworks:** https://docs.fireworks.ai/getting-started/introduction · API ref: https://docs.fireworks.ai/api-reference/introduction · recommended models: https://docs.fireworks.ai/guides/recommended-models · index: https://docs.fireworks.ai/llms.txt · cookbook: https://github.com/fw-ai/cookbook
- **ElevenLabs:** https://elevenlabs.io/docs/eleven-api/quickstart
- **Herdr:** https://herdr.dev/docs/quick-start/
