/*
 * "Her working" — what is behind the one click in the hero.
 *
 * This used to sit open on the fold, which put a pandas program in front of a
 * reader who has no reason to know what pandas is. It is still here, unchanged
 * and in full, because the whole product is that the proof exists and is
 * inspectable. It is just no longer the price of admission.
 *
 * Because it is now opened deliberately, it can explain itself: the one line
 * that matters is called out in plain English underneath, so a reader who does
 * not write code still leaves knowing WHY the code is on the page.
 *
 * Static and honest — a recorded run, every value from `./recorded`, no
 * request-time call. Mono is confined to what mono is for: the code, the column
 * names and the cell values.
 */
import { CODE, CELLS, DAY_FIRST, VERIFIED } from "./recorded";

export function VerifiedRun() {
  return (
    <div className="grid gap-x-16 gap-y-10 px-6 py-8 sm:px-8 lg:grid-cols-2">
      <div className="min-w-0">
        <h3 className="text-small font-medium text-ink">The program she wrote</h3>
        {/* Wide content scrolls inside its own container; the page never does. */}
        <div className="mt-3 overflow-x-auto">
          <pre className="w-max min-w-full font-mono text-micro leading-[1.75]">
            <code>
              {CODE.map((line, i) => (
                <span
                  key={i}
                  className={`block ${line.startsWith("#") ? "text-ink-muted" : "text-ink"}`}
                >
                  {line === "" ? " " : line}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>

      <div className="min-w-0">
        <h3 className="text-small font-medium text-ink">The cells it read</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[17rem] max-w-[30rem] border-collapse text-left font-mono text-micro">
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="pb-2 pr-6 font-normal">
                  line
                </th>
                <th scope="col" className="pb-2 pr-6 font-normal">
                  OrderDate
                </th>
                <th scope="col" className="pb-2 text-right font-normal">
                  Sales
                </th>
              </tr>
            </thead>
            <tbody className="v-nums">
              {CELLS.map((cell) => (
                <tr key={cell.line} className="border-t border-line text-ink">
                  <td className="py-2 pr-6 text-ink-muted">{cell.line}</td>
                  <td className="py-2 pr-6">{cell.date}</td>
                  <td className="py-2 text-right">{cell.sales}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/*
        The translation. One paragraph, no jargon, explaining the single line of
        the program that decides whether the answer is right — which is the only
        part of it a non-technical reader needs.
      */}
      <p className="max-w-[68ch] text-small text-ink-muted lg:col-span-2">
        The line that matters is the date one. In this file{" "}
        <span className="v-nums font-mono text-ink">17/07/2018</span> means the 17th of July, not
        the 7th of the 17th month &mdash; and she can prove it, because{" "}
        <span className="v-nums font-mono text-ink">
          {DAY_FIRST.supporting.toLocaleString("en-US")}
        </span>{" "}
        dates in the file start with a number above 12, which no month can be, and{" "}
        <span className="v-nums font-mono text-ink">{DAY_FIRST.contradicting}</span> argue
        otherwise. Read the other way round, most of the quarter disappears and nothing warns you.
        Three of the {VERIFIED.matchedRows.toLocaleString("en-US")} rows she counted are above, by
        line number in the file.
      </p>
    </div>
  );
}
