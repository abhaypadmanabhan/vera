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

  it("allows a ready-made margin without separately requiring profit", () => {
    const profile = profileDataset(
      "margin",
      "margin.csv",
      "month,Margin\n2025-07,0.4\n",
    );

    expect(classifyQuestion("What was profit margin?", profile)).toEqual({ allowed: true });
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
