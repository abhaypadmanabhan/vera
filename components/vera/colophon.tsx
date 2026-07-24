/**
 * How do we know.
 *
 * PRD §6 is binding on every string in here: the live claim is exactly
 * *computed, and traceable*, the accuracy number is a separate pre-computed
 * benchmark, and neither may be worded so it implies the other. The "what this
 * is not" paragraph is not optional and is never softened.
 */
export function Colophon({ isMock }: { isMock: boolean }) {
  return (
    <section id="colophon" className="scroll-mt-8">
      <div className="border-b border-rule pb-2">
        <h2 className="v-label text-ink">How do we know · two claims, kept apart</h2>
      </div>

      <div className="mt-6 grid gap-8 sm:grid-cols-2">
        <article>
          <h3 className="v-label text-ink">Live, on this answer</h3>
          <p className="mt-2 max-w-[46ch] font-serif text-body">
            The number above was produced by code that ran on the real cells of your file. Exhibit A
            is that code, byte for byte. Exhibit B is the cells it read. The whole live claim is
            this: computed, and traceable.
          </p>
        </article>
        <article>
          <h3 className="v-label text-ink">Aggregate, measured offline</h3>
          <p className="mt-2 max-w-[46ch] font-serif text-body">
            How often Vera is right is a separate, pre-computed number: a fixed benchmark scored
            offline and published as a dashboard. It is a measurement of past runs, not a check that
            runs on your question.
          </p>
        </article>
      </div>

      {isMock ? (
        <div className="mt-8 border-l-2 border-mark pl-4">
          <h3 className="v-label text-ink">What is running right now</h3>
          <p className="mt-2 max-w-[62ch] font-serif text-body">
            The mock engine is driving this build: the stages, the code and the finding are a
            scripted stand-in, and no sandbox has been called. The schema evidence in Exhibit C is
            the exception — it is counted from the real file on record, by the profiler, on this
            machine.
          </p>
        </div>
      ) : null}

      <div className="mt-8 border-l-2 border-mark pl-4">
        <h3 className="v-label text-ink">What this is not</h3>
        <p className="mt-2 max-w-[62ch] font-serif text-body">
          Vera cannot tell you that a number which ran cleanly is subtly wrong for the question you
          asked. There is no answer key at the moment you ask. What she can do is refuse: when a
          result cannot be traced back to real cells, she releases no number at all, and says so.
        </p>
      </div>
    </section>
  );
}
