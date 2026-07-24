import { Exhibit } from "./exhibit";
import { formatCount } from "./format";
import type { SchemaEvidence } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Exhibit C — what she proved about your data.
 *
 * Deterministic inference with the counts that prove it. Never an assertion on
 * its own: a claim is filed here only with the rows that support it and the rows
 * that argue against it, both counted from the real cells.
 *
 * This is inference with shown evidence. It is NOT a claim that Vera can detect a
 * subtly-wrong-but-runnable answer — PRD §6 disclaims that explicitly.
 */
export function ExhibitSchema({ evidence }: { evidence: SchemaEvidence[] }) {
  if (evidence.length === 0) return null;

  return (
    <Exhibit
      letter="C"
      title="What she proved about your data"
      note={`${evidence.length} ${evidence.length === 1 ? "claim" : "claims"} · counted, not assumed`}
      weight="primary"
    >
      <div className="divide-y divide-rule">
        {evidence.map((item) => {
          const contested = item.contradictingRows > 0;
          return (
            <article key={item.claim} className="px-5 py-6 sm:px-7">
              <h4 className="max-w-[34ch] font-serif text-claim font-medium tracking-[-0.02em]">
                {item.claim}
              </h4>
              <p className="mt-3 max-w-[62ch] font-serif text-body text-ink">{item.method}</p>

              <dl className="mt-6 flex flex-wrap gap-x-14 gap-y-6">
                <div>
                  <dt className="v-label">Rows that prove it</dt>
                  <dd className="v-nums mt-1 font-mono text-claim">
                    {formatCount(item.supportingRows)}
                  </dd>
                </div>
                <div>
                  <dt className="v-label">Rows that argue otherwise</dt>
                  <dd
                    className={cn(
                      "v-nums mt-1 font-mono text-claim",
                      contested && "text-mark-ink",
                    )}
                  >
                    {formatCount(item.contradictingRows)}
                  </dd>
                </div>
              </dl>

              {item.examples.length > 0 ? (
                <p className="mt-6">
                  <span className="v-label">Values quoted </span>
                  <span className="ml-1 font-mono text-meta">
                    {item.examples.map((example, index) => (
                      <span key={`${example}-${index}`}>
                        <span className="v-marked px-1">{example}</span>
                        {index < item.examples.length - 1 ? (
                          <span aria-hidden className="px-1.5 text-ink-muted">
                            ·
                          </span>
                        ) : null}
                      </span>
                    ))}
                  </span>
                </p>
              ) : null}

              {contested ? (
                <p className="mt-5 border-l-2 border-mark pl-3 font-serif text-body text-ink">
                  Contested. Vera does not act on a claim the data argues with.
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
    </Exhibit>
  );
}
