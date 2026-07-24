import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The chips on the ask screen are the benchmark questions — the same set the
 * measured-accuracy run is scored against, so what the demo asks and what the
 * score covers are the same questions.
 *
 * Read defensively and server-side: `eval/questions.json` is owned by another
 * agent and its shape may move under us. Anything unexpected falls back to the
 * list below rather than breaking the ask screen.
 */

const FALLBACK: string[] = [
  "What were total sales in Q3 2018?",
  "What was the overall profit margin percentage?",
  "Which sub-category lost the most money?",
  "Which region had the highest sales?",
  "How many unique orders are in this file?",
];

/** The one the cold open is built on — always offered first when it is present. */
const HEADLINE_ID = "q18_sales_2018_q3";

const MAX_CHIPS = 5;
const MAX_CHIP_LENGTH = 72;

interface LooseQuestion {
  id?: unknown;
  input?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function suggestedQuestions(): Promise<string[]> {
  try {
    const raw = await readFile(path.join(process.cwd(), "eval", "questions.json"), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed) || !Array.isArray(parsed.questions)) return FALLBACK;

    const entries = (parsed.questions as LooseQuestion[]).filter(isRecord);
    const usable = entries.filter(
      (entry): entry is { id?: string; input: string } =>
        typeof entry.input === "string" &&
        entry.input.trim().length > 0 &&
        entry.input.trim().length <= MAX_CHIP_LENGTH,
    );
    if (usable.length === 0) return FALLBACK;

    const headline = usable.find((entry) => entry.id === HEADLINE_ID);
    const rest = usable.filter((entry) => entry !== headline);

    // Spread the picks across the file so the chips are not five variations of
    // "total sales" — the benchmark is ordered easy to hard.
    const stride = Math.max(1, Math.floor(rest.length / MAX_CHIPS));
    const spread = rest.filter((_, index) => index % stride === 0);

    const chosen = [...(headline ? [headline] : []), ...spread]
      .map((entry) => entry.input.trim())
      .filter((input, index, all) => all.indexOf(input) === index)
      .slice(0, MAX_CHIPS);

    return chosen.length > 0 ? chosen : FALLBACK;
  } catch {
    return FALLBACK;
  }
}
