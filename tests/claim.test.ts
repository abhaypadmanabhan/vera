import { describe, expect, it } from "vitest";
import { reconcileClaim, VALUE_SLOT } from "../lib/claim";

/*
 * The rule under test: Vera never says a number the code did not produce.
 *
 * The live failure that motivated this — the sandbox returned 143787.36 while
 * the model's headline read "281,420 dollars" — is the first case below.
 */
describe("reconcileClaim", () => {
  const question = "What were total sales in Q3 2018?";

  it("places the executed value into the model's slot", () => {
    const result = reconcileClaim({
      headline: `Sales in the third quarter of 2018 came to ${VALUE_SLOT} dollars.`,
      question,
      value: 143787.36,
      fallback: "Sums Sales over Q3 2018.",
    });

    expect(result.source).toBe("substituted");
    expect(result.claim).toBe(
      "Sales in the third quarter of 2018 came to 143,787.36 dollars.",
    );
  });

  it("discards a headline quoting a figure the code never produced", () => {
    const result = reconcileClaim({
      headline: "Sales in the third quarter of 2018 came to 281,420 dollars.",
      question,
      value: 143787.36,
      fallback: "Sums Sales over Q3 2018.",
    });

    expect(result.source).toBe("rebuilt");
    expect(result.claim).not.toContain("281,420");
    expect(result.claim).toBe("Sums Sales over Q3 2018.");
  });

  it("keeps a headline whose figure does match the executed value", () => {
    const result = reconcileClaim({
      headline: "Sales in the third quarter of 2018 came to 143,787.36 dollars.",
      question,
      value: 143787.36,
      fallback: "Sums Sales over Q3 2018.",
    });

    expect(result.source).toBe("verified-literal");
    expect(result.claim).toContain("143,787.36");
  });

  it("does not mistake a year the user asked about for a wrong answer", () => {
    const result = reconcileClaim({
      headline: `Sales across 2018 came to ${VALUE_SLOT} dollars.`,
      question: "What were total sales in 2018?",
      value: 484247.5,
      fallback: "Sums Sales over 2018.",
    });

    expect(result.source).toBe("substituted");
    expect(result.claim).toBe("Sales across 2018 came to 484,247.50 dollars.");
  });

  it("keeps a sentence carrying only numbers the user themselves wrote", () => {
    const result = reconcileClaim({
      headline: "Orders placed in 2018 shipped later than in 2017.",
      question: "Did orders ship slower in 2018 than 2017?",
      value: "2018",
      fallback: "Compares ship lag by year.",
    });

    expect(result.source).toBe("verified-literal");
  });

  it("accepts a sentence with no figures at all", () => {
    const result = reconcileClaim({
      headline: "The West region came out lowest.",
      question: "Which region had the lowest sales?",
      value: "West",
      fallback: "Groups Sales by Region.",
    });

    expect(result.source).toBe("verified-literal");
    expect(result.claim).toBe("The West region came out lowest.");
  });

  it("rebuilds when the model returns an empty headline", () => {
    const result = reconcileClaim({
      headline: "   ",
      question,
      value: 143787.36,
      fallback: "Sums Sales over Q3 2018.",
    });

    expect(result.source).toBe("rebuilt");
    expect(result.claim).toBe("Sums Sales over Q3 2018.");
  });

  it("still states the value when even the fallback is empty", () => {
    const result = reconcileClaim({
      headline: "It came to 99 dollars.",
      question,
      value: 143787.36,
      fallback: "",
    });

    expect(result.claim).toBe("The answer is 143,787.36.");
    expect(result.claim).not.toContain("99");
  });

  it("formats whole numbers without inventing decimals", () => {
    const result = reconcileClaim({
      headline: `The file holds ${VALUE_SLOT} records.`,
      question: "How many rows are there?",
      value: 9994,
      fallback: "Counts rows.",
    });

    expect(result.claim).toBe("The file holds 9,994 records.");
  });

  it("matches a rounded quote of a precise value", () => {
    const result = reconcileClaim({
      headline: "Sales came to 143,787 dollars.",
      question,
      value: 143787.36,
      fallback: "Sums Sales.",
    });

    expect(result.source).toBe("verified-literal");
  });
});
