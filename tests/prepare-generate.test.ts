import { describe, expect, it, vi } from "vitest";
import {
  buildPrepPrompt,
  generatePrep,
  parsePrepResponse,
} from "@/lib/prepare/generate";
import type { DatasetProfile } from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "orders",
  filename: "orders.csv",
  rowCount: 3,
  duplicateRowCount: 1,
  crossChecks: [],
  columns: [
    {
      name: "OrderDate",
      kind: "date",
      nullCount: 0,
      distinctCount: 2,
      sampleValues: ["24/07/2026", "23/07/2026"],
      dateFormat: "%d/%m/%Y",
      evidence: {
        claim: "OrderDate is day-first",
        supportingRows: 2,
        contradictingRows: 0,
        examples: ["24/07/2026", "23/07/2026"],
        method: "Both values begin with a number above twelve.",
      },
    },
    {
      name: "Revenue",
      kind: "number",
      nullCount: 0,
      distinctCount: 2,
      sampleValues: ["$1,250.00", "$750.00"],
      dateFormat: null,
      evidence: null,
    },
    {
      name: "Region",
      kind: "category",
      nullCount: 0,
      distinctCount: 2,
      sampleValues: ["West", "East"],
      dateFormat: null,
      evidence: null,
    },
  ],
  notes: [
    'Parse "OrderDate" with format="%d/%m/%Y".',
    '"Revenue" contains currency symbols and thousands separators.',
  ],
};

const request = {
  profile,
  sampleRows: [
    ["24/07/2026", "$1,250.00", "West"],
    ["23/07/2026", "$750.00", "East"],
  ],
  sourcePath: "/workspace/data.csv",
  cleanPath: "/workspace/clean.csv",
};

function responseWith(prepCode: string, fixes = ["Tidied the file."]): string {
  return JSON.stringify({
    prepCode,
    fixes,
    questions: ["What is the total revenue?"],
  });
}

const validPrepCode = `import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df.to_csv("/workspace/clean.csv", index=False)`;

describe("prep generation", () => {
  it("mock mode returns a usable prep with zero external calls", async () => {
    const createChatCompletion = vi.fn();

    const output = await generatePrep(request, {
      mockMode: true,
      client: { createChatCompletion },
    });

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(output.prepCode).toContain(
      'pd.read_csv("/workspace/data.csv")',
    );
    expect(output.prepCode).toContain(
      'df.to_csv("/workspace/clean.csv", index=False)',
    );
    expect(output.fixes).toHaveLength(3);
    expect(output.questions).toHaveLength(5);
    expect(output.questions.join(" ")).toMatch(/Revenue|Region/);
  });

  it("preserves numeric percent samples instead of coercing them to missing", async () => {
    const percentProfile: DatasetProfile = {
      ...profile,
      duplicateRowCount: 0,
      columns: [
        {
          name: "ConversionRate",
          kind: "number",
          nullCount: 0,
          distinctCount: 2,
          sampleValues: ["10%", "25%"],
          dateFormat: null,
          evidence: null,
        },
      ],
      notes: [],
    };

    const output = await generatePrep(
      { ...request, profile: percentProfile },
      { mockMode: true },
    );

    expect(output.prepCode).toContain(
      'df["ConversionRate"].astype(str).str.replace(r"[$,%]", "", regex=True)',
    );
    expect(output.prepCode).toContain('errors="coerce"');
  });

  it("trims surrounding whitespace from identifier columns", async () => {
    const idProfile: DatasetProfile = {
      ...profile,
      duplicateRowCount: 0,
      columns: [
        {
          name: "CustomerId",
          kind: "id",
          nullCount: 0,
          distinctCount: 2,
          sampleValues: [" A-1 ", "B-2"],
          dateFormat: null,
          evidence: null,
        },
      ],
      notes: [],
    };

    const output = await generatePrep(
      { ...request, profile: idProfile },
      { mockMode: true },
    );

    expect(output.prepCode).toContain(
      'df["CustomerId"] = df["CustomerId"].apply(lambda value: value.strip()',
    );
    expect(output.fixes.join(" ")).toMatch(/spaces/i);
  });

  it("describes only evidenced cleanup as an intention", async () => {
    const plainNumericProfile: DatasetProfile = {
      ...profile,
      duplicateRowCount: 0,
      columns: [
        {
          name: "Score",
          kind: "number",
          nullCount: 0,
          distinctCount: 2,
          sampleValues: ["10", "20"],
          dateFormat: null,
          evidence: null,
        },
      ],
      notes: [],
    };

    const output = await generatePrep(
      { ...request, profile: plainNumericProfile },
      { mockMode: true },
    );

    expect(output.fixes).toHaveLength(3);
    expect(output.fixes.join(" ")).not.toMatch(
      /\b(currency|symbols|separators|dates|spaces)\b/i,
    );
    expect(
      output.fixes.every((fix) => /\b(will|eligible)\b/i.test(fix)),
    ).toBe(true);
  });

  it("keeps every mock question computable for an all-text file", async () => {
    const textProfile: DatasetProfile = {
      ...profile,
      datasetId: "contacts",
      filename: "contacts.csv",
      columns: [
        {
          name: "Region",
          kind: "category",
          nullCount: 1,
          distinctCount: 3,
          sampleValues: ["West", "East"],
          dateFormat: null,
          evidence: null,
        },
        {
          name: "CustomerSegment",
          kind: "text",
          nullCount: 0,
          distinctCount: 2,
          sampleValues: ["Business", "Consumer"],
          dateFormat: null,
          evidence: null,
        },
      ],
      notes: [],
    };

    const output = await generatePrep(
      { ...request, profile: textProfile },
      { mockMode: true },
    );

    expect(output.questions).toHaveLength(5);
    expect(output.questions.join(" ")).not.toMatch(
      /\b(total|average|highest)\b/i,
    );
    expect(output.questions.some((question) => question.includes("Region"))).toBe(
      true,
    );
    expect(output.questions.every((question) => question.length <= 72)).toBe(
      true,
    );
    expect(output.fixes.join(" ")).not.toMatch(/\b(date|currency|amount)\b/i);
    expect(output.fixes.join(" ")).not.toMatch(/extra spaces.*removed/i);
  });

  it("keeps one-column mock questions unique and profile-relevant", async () => {
    const oneColumnProfile: DatasetProfile = {
      ...profile,
      columns: [
        {
          name: "Region",
          kind: "category",
          nullCount: 1,
          distinctCount: 3,
          sampleValues: ["West", "East"],
          dateFormat: null,
          evidence: null,
        },
      ],
      notes: [],
    };

    const output = await generatePrep(
      { ...request, profile: oneColumnProfile },
      { mockMode: true },
    );

    expect(new Set(output.questions).size).toBe(output.questions.length);
    expect(output.questions.join(" ")).toContain("Region");
    expect(output.questions.join(" ")).not.toMatch(/\brecord values\b/i);
    expect(output.questions.every((question) => question.length <= 72)).toBe(
      true,
    );
  });

  it("uses only file-level computable questions for an empty profile", async () => {
    const emptyProfile: DatasetProfile = {
      ...profile,
      columns: [],
      notes: [],
    };

    const output = await generatePrep(
      { ...request, profile: emptyProfile },
      { mockMode: true },
    );

    expect(output.questions).toHaveLength(5);
    expect(new Set(output.questions).size).toBe(5);
    expect(output.questions.join(" ")).not.toMatch(/\brecord values\b/i);
    expect(output.questions.every((question) => question.length <= 72)).toBe(
      true,
    );
  });

  it("builds a bounded prompt with the careful prep rules", () => {
    const prompt = buildPrepPrompt(request);

    expect(prompt).toContain("careful analyst");
    expect(prompt).toContain("Return JSON only");
    expect(prompt).toContain("/workspace/data.csv");
    expect(prompt).toContain("/workspace/clean.csv");
    expect(prompt).toContain("NEVER fill, impute, interpolate or invent");
    expect(prompt).toContain("NEVER drop a row for being an outlier");
    expect(prompt).toContain('"Revenue"');
    expect(prompt).toContain('"maxLength": 16000');
    expect(prompt).toContain("percent signs");
    expect(() =>
      buildPrepPrompt({ ...request, sampleRows: [["x".repeat(70_000)]] }),
    ).toThrow(/prompt.*limit/i);
  });

  it("requires the source path inside the exact pandas read call", () => {
    const commentOnly = `import pandas as pd
# pd.read_csv("/workspace/data.csv")
df = pd.DataFrame()
df.to_csv("/workspace/clean.csv", index=False)`;
    const unusedAssignment = `import pandas as pd
source = "/workspace/data.csv"
df = pd.read_csv(source)
df.to_csv("/workspace/clean.csv", index=False)`;

    expect(() => parsePrepResponse(responseWith(commentOnly), request)).toThrow(
      /read_csv/i,
    );
    expect(() =>
      parsePrepResponse(responseWith(unusedAssignment), request),
    ).toThrow(/read_csv/i);
  });

  it("requires the exact clean write call with index disabled", () => {
    const unusedAssignment = `import pandas as pd
df = pd.read_csv("/workspace/data.csv")
clean = "/workspace/clean.csv"`;
    const missingIndex = `import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df.to_csv("/workspace/clean.csv")`;
    const wrongIndex = `import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df.to_csv("/workspace/clean.csv", index=True)`;

    expect(() =>
      parsePrepResponse(responseWith(unusedAssignment), request),
    ).toThrow(/to_csv|clean/i);
    expect(() =>
      parsePrepResponse(responseWith(missingIndex), request),
    ).toThrow(/index/i);
    expect(() =>
      parsePrepResponse(responseWith(wrongIndex), request),
    ).toThrow(/index/i);
  });

  it("accepts the exact read and write calls with normal multiline whitespace", () => {
    const multiline = `import pandas as pd
df = pd.read_csv(
  "/workspace/data.csv"
)
df.to_csv(
  "/workspace/clean.csv",
  index = False
)`;

    expect(parsePrepResponse(responseWith(multiline), request).prepCode).toBe(
      multiline,
    );
  });

  it("rejects prep code that does not write the clean file", () => {
    const raw = responseWith(
      'import pandas as pd\ndf = pd.read_csv("/workspace/data.csv")',
    );

    expect(() => parsePrepResponse(raw, request)).toThrow(/clean/i);
  });

  it("rejects prep code touching an absolute path outside the two files", () => {
    const raw = responseWith(`import pandas as pd
df = pd.read_csv("/workspace/data.csv")
secret = "/etc/passwd"
df.to_csv("/workspace/clean.csv", index=False)`);

    expect(() => parsePrepResponse(raw, request)).toThrow(/path/i);
  });

  it.each([
    ['secret = "../secret.csv"', "relative traversal"],
    ['endpoint = "https://example.com/data.csv"', "URL"],
    ['secret = "\\x2fetc/passwd"', "escaped absolute path"],
  ])("rejects a %s resource literal (%s)", (line) => {
    const raw = responseWith(`${validPrepCode}\n${line}`);

    expect(() => parsePrepResponse(raw, request)).toThrow(/path|resource/i);
  });

  it.each([
    ["import os", "filesystem import"],
    ["import requests", "network import"],
    ['open("notes.txt")', "filesystem call"],
    ['df.to_pickle("secret.pkl")', "pandas filesystem call"],
  ])("rejects forbidden code `%s` (%s)", (line) => {
    const raw = responseWith(`${line}\n${validPrepCode}`);

    expect(() => parsePrepResponse(raw, request)).toThrow(/import|call|open/i);
  });

  it.each([
    ["opener = open", "forbidden built-in alias"],
    ["reader = pd.read_csv", "pandas I/O alias"],
  ])("rejects direct alias `%s` (%s)", (line) => {
    const raw = responseWith(`${line}\n${validPrepCode}`);

    expect(() => parsePrepResponse(raw, request)).toThrow(/alias|call|open/i);
  });

  it("rejects a fix line naming a pandas concept", () => {
    const raw = responseWith(
      `import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df.to_csv("/workspace/clean.csv", index=False)`,
      ["Ran pd.to_datetime with format %d/%m/%Y."],
    );

    expect(() => parsePrepResponse(raw, request)).toThrow(/plain english/i);
  });

  it.each(["Used pd.", "Cleaned df[ values.", "Used %d/%m/%Y."])(
    "rejects the isolated jargon token in %j",
    (fix) => {
      expect(() =>
        parsePrepResponse(responseWith(validPrepCode, [fix]), request),
      ).toThrow(/plain english/i);
    },
  );

  it("strictly rejects extra fields and more than five questions", () => {
    const prepCode = `import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df.to_csv("/workspace/clean.csv", index=False)`;
    const extraField = JSON.stringify({
      prepCode,
      fixes: ["Tidied the file."],
      questions: ["What is the total revenue?"],
      commentary: "extra",
    });
    const tooManyQuestions = JSON.stringify({
      prepCode,
      fixes: ["Tidied the file."],
      questions: Array.from({ length: 6 }, (_, index) => `Question ${index}?`),
    });

    expect(() => parsePrepResponse(extraField, request)).toThrow();
    expect(() => parsePrepResponse(tooManyQuestions, request)).toThrow();
  });
});
