import { classifyQuestion } from "../guardrails/classify";
import type { Analyst, StageEvent } from "../types";

/** Places the free, deterministic question check in front of every analyst. */
export function createGuardedAnalyst(downstream: Analyst): Analyst {
  return {
    async *run(request): AsyncIterable<StageEvent> {
      const decision = classifyQuestion(request.question, request.dataset.profile);
      if (!decision.allowed) {
        yield {
          type: "finding",
          finding: {
            verdict: "unverified",
            reason: "question_not_answerable",
            detail: decision.detail,
            code: null,
            attempts: 0,
          },
          elapsedMs: 0,
        };
        return;
      }

      yield* downstream.run(request);
    },
  };
}
