import { describe, expect, it } from "vitest";
import { classifyQuestion } from "@/lib/guardrails/classify";
import { profileDataset } from "@/lib/profile/profiler";

const completeProfile = profileDataset(
  "complete",
  "complete.csv",
  [
    "OrderID,OrderDate,ShipDate,Sales,Profit,Discount,Region,Sub-Category",
    "A-1,15/04/2019,20/04/2019,100,20,0.10,West,Tables",
    "A-2,03/02/2018,05/02/2018,50,-10,0.30,East,Chairs",
  ].join("\n"),
);

const salesOnlyProfile = profileDataset(
  "sales-only",
  "sales-only.csv",
  "OrderDate,Sales\n15/04/2019,100\n03/02/2018,50\n",
);

describe("classifyQuestion", () => {
  const refusals = [
    {
      question: "Who are you?",
      profile: completeProfile,
      category: "not_about_dataset",
    },
    {
      question: "Tell me a joke.",
      profile: completeProfile,
      category: "not_about_dataset",
    },
    {
      question: "What is the capital of France?",
      profile: completeProfile,
      category: "not_about_dataset",
    },
    {
      question: "What's happening in the news today?",
      profile: completeProfile,
      category: "not_about_dataset",
    },
    {
      question: "What was our profit margin?",
      profile: salesOnlyProfile,
      category: "missing_information",
    },
    {
      question: "How many customers placed orders?",
      profile: salesOnlyProfile,
      category: "missing_information",
    },
    {
      question: "What was the average discount?",
      profile: salesOnlyProfile,
      category: "missing_information",
    },
    {
      question: "What percentage of orders shipped more than 5 days late?",
      profile: salesOnlyProfile,
      category: "missing_information",
    },
    {
      question: "Why did sales drop?",
      profile: completeProfile,
      category: "not_computable",
    },
    {
      question: "Will Q4 be good?",
      profile: completeProfile,
      category: "not_computable",
    },
    {
      question: "Should we fire the West team?",
      profile: completeProfile,
      category: "not_computable",
    },
    {
      question: "Predict sales next year.",
      profile: completeProfile,
      category: "not_computable",
    },
    {
      question: "Just estimate next quarter's sales.",
      profile: completeProfile,
      category: "ungrounded_number",
    },
    {
      question: "Give me a rough figure for profit.",
      profile: completeProfile,
      category: "ungrounded_number",
    },
    {
      question: "Guess if you have to: what were sales?",
      profile: completeProfile,
      category: "ungrounded_number",
    },
  ] as const;

  it.each(refusals)("refuses '$question' for the specific reason", (testCase) => {
    const result = classifyQuestion(testCase.question, testCase.profile);

    expect(result).toMatchObject({
      allowed: false,
      category: testCase.category,
    });
    if (result.allowed) throw new Error("Expected the question to be refused");
    expect(result.detail).not.toMatch(/\b(?:column|pandas|schema|dataframe)\b/i);
  });

  const mustNotRefuse = [
    "What were total sales in Q3 2018?",
    "What was the overall profit margin percentage?",
    "Which sub-category lost the most money?",
    "Which region had the highest sales?",
    "How many unique orders are in this file?",
    "Are our discounts actually making us money?",
    "What percentage of orders shipped more than 5 days after they were ordered?",
  ] as const;

  it.each(mustNotRefuse)("allows the demo question '$question'", (question) => {
    expect(classifyQuestion(question, completeProfile)).toEqual({ allowed: true });
  });

  it.each([
    "How is the West doing?",
    "Tell me about sales.",
    "What changed?",
    "Is there anything interesting here?",
    "Which project had the highest sales?",
    "Would you total sales by region?",
  ])("allows genuinely ambiguous wording: '$question'", (question) => {
    expect(classifyQuestion(question, completeProfile)).toEqual({ allowed: true });
  });

  it("allows a derived margin when the file has revenue and costs", () => {
    const profile = profileDataset(
      "revenue-and-costs",
      "revenue-and-costs.csv",
      "month,revenue,cogs\n2025-07,100,60\n",
    );

    expect(classifyQuestion("What was gross margin?", profile)).toEqual({ allowed: true });
  });

  /*
   * CodeRabbit on PR #40: `availableInformation()` matched a column word against
   * the exact singular alias, while `missingInformation()`'s patterns accept
   * plural phrasing. A file whose column is `Discounts` therefore had the
   * question allowed by one half of the guardrail and refused by the other.
   */
  it("recognises a plural column name as the information being asked for", () => {
    const profile = profileDataset(
      "plural-columns",
      "plural-columns.csv",
      "OrderDate,Discounts,Costs\n15/04/2019,0.10,60\n",
    );

    expect(classifyQuestion("What was the average discount?", profile)).toEqual({
      allowed: true,
    });
    expect(classifyQuestion("What were total costs?", profile)).toEqual({
      allowed: true,
    });
  });

  /*
   * Macroscope on PR #43, reviewing the fix above: the first version appended a
   * bare "s", so `category` pluralised to `categorys` and a `Categories` column
   * was still reported as missing — the same bug the helper was added to close.
   */
  it("handles consonant-plus-y plurals in both directions", () => {
    const plural = profileDataset(
      "ies",
      "ies.csv",
      "OrderDate,Categories,Quantities\n15/04/2019,Tables,3\n",
    );
    expect(classifyQuestion("Which category sold the most?", plural).allowed).toBe(true);
    expect(classifyQuestion("How many units were sold?", plural).allowed).toBe(true);

    const singular = profileDataset(
      "y",
      "y.csv",
      "OrderDate,Category,Quantity\n15/04/2019,Tables,3\n",
    );
    expect(classifyQuestion("Which category sold the most?", singular).allowed).toBe(true);
  });

  it("still refuses when the file genuinely lacks the information", () => {
    expect(classifyQuestion("What was the average discount?", salesOnlyProfile).allowed).toBe(
      false,
    );
  });

  it("allows a ready-made margin without separately requiring profit", () => {
    const profile = profileDataset(
      "margin",
      "margin.csv",
      "month,Margin\n2025-07,0.4\n",
    );

    expect(classifyQuestion("What was profit margin?", profile)).toEqual({ allowed: true });
  });

  /*
   * `phase-11-scope.md` P1. The concept map was a Superstore vocabulary, so on an
   * arbitrary upload the guardrail neither refused wrongly nor helped — every
   * unrecognised subject fell through to "allowed". The refusal quality the
   * product is built on was only real for retail-shaped data.
   */
  describe("an arbitrary file, not a retail one", () => {
    const netflix = profileDataset(
      "netflix",
      "netflix-titles.csv",
      [
        "show_id,type,title,country,release_year,rating,duration",
        "s1,Movie,Dick Johnson Is Dead,United States,2020,PG-13,90 min",
        "s2,TV Show,Blood & Water,South Africa,2021,TV-MA,2 Seasons",
        "s3,Movie,Ganglands,France,2021,TV-MA,110 min",
      ].join("\n"),
    );

    it.each([
      "How many directors are there?",
      "How many episodes are there?",
      "How many subscribers watched it?",
    ])("refuses '%s' because the file does not record it", (question) => {
      const result = classifyQuestion(question, netflix);

      expect(result).toMatchObject({
        allowed: false,
        category: "missing_information",
      });
      if (result.allowed) throw new Error("Expected the question to be refused");
      expect(result.detail).not.toMatch(
        /\b(?:column|pandas|schema|dataframe)\b/i,
      );
    });

    it.each([
      "How many titles are in the catalogue?",
      "How many movies are there?",
      "How many records are in this file?",
      "How many exact duplicate records are there?",
      "How many countries are represented?",
      "Which country has the most titles?",
      "What is the average duration in minutes for movies?",
    ])("allows '%s'", (question) => {
      expect(classifyQuestion(question, netflix)).toEqual({ allowed: true });
    });
  });

  it("still answers a question phrased with a synonym the file proves it has", () => {
    expect(classifyQuestion("How much revenue did we make?", completeProfile)).toEqual({
      allowed: true,
    });
  });

  it("does not combine words from unrelated fields when checking for unique orders", () => {
    const profile = profileDataset(
      "unrelated-fields",
      "unrelated-fields.csv",
      "OrderDate,CustomerID,Sales\n15/04/2019,C-1,100\n",
    );

    expect(classifyQuestion("How many unique orders are in this file?", profile)).toMatchObject({
      allowed: false,
      category: "missing_information",
    });
  });
});
