const DOCKET = [
  {
    letter: "A",
    title: "The code that ran",
    line: "The exact source that executed, unedited between run and display.",
  },
  {
    letter: "B",
    title: "The cells she read",
    line: "Real values quoted back, with the columns the code touched marked in red.",
  },
  {
    letter: "C",
    title: "What she proved about your data",
    line: "Schema facts inferred from the file, each with the rows that prove it and the rows that argue against it.",
  },
];

function Docket() {
  return (
    <ol className="mt-8 divide-y divide-rule border-y border-rule">
      {DOCKET.map((item) => (
        <li key={item.letter} className="grid grid-cols-[3.5rem_1fr] gap-x-4 py-4">
          <p className="v-label text-ink-muted">Ex. {item.letter}</p>
          <div>
            <p className="v-label text-ink">{item.title}</p>
            <p className="mt-1 max-w-[62ch] font-serif text-body text-ink-muted">{item.line}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Nothing has been asked yet. The empty state is the explanation. */
export function FindingIdle() {
  return (
    <section>
      <p className="v-label">Nothing on the record yet</p>
      <p className="mt-3 max-w-[30ch] font-serif text-claim tracking-[-0.02em]">
        Ask a question. Vera files the evidence here, in order.
      </p>
      <Docket />
    </section>
  );
}

/** The run is live. The margin rail carries the detail; this stays quiet. */
export function FindingRunning({ question }: { question: string }) {
  return (
    <section aria-busy="true">
      <p className="v-label">On the record now</p>
      <p className="mt-2 max-w-[46ch] font-serif text-claim tracking-[-0.02em] text-ink-muted italic">
        {question}
      </p>
      <hr className="v-draw mt-6 border-0 border-t border-ink" />
      <p className="mt-6 max-w-[62ch] font-serif text-body">
        Vera is writing the code, running it, and tracing the result back to real cells. The trail
        is in the margin. Nothing appears below until it has been traced.
      </p>
      <Docket />
    </section>
  );
}

/** The stream itself failed. Still no number, and still not an apology. */
export function FindingError({
  message,
  onRetry,
  disabled,
}: {
  message: string;
  onRetry: () => void;
  disabled: boolean;
}) {
  return (
    <section>
      <p className="v-label">The run did not complete</p>
      <hr className="v-draw mt-3 border-0 border-t-2 border-mark" />
      <p className="mt-6 max-w-[34ch] font-serif text-claim tracking-[-0.02em]">
        The trail stopped before anything could be traced.
      </p>
      <p className="mt-4 max-w-[68ch] font-mono text-meta text-ink-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        disabled={disabled}
        className="v-pen v-label mt-6 text-ink disabled:cursor-not-allowed"
      >
        Put the question again
      </button>
    </section>
  );
}
