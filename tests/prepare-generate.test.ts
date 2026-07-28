import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseCsv } from "@/lib/csv";
import { classifyQuestion } from "@/lib/guardrails/classify";
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

function responseWith(
  prepCode: string,
  fixes = ["Missing values will be left empty rather than guessed."],
): string {
  return JSON.stringify({
    prepCode,
    fixes,
    questions: ["What is the total revenue?"],
  });
}

const validPrepCode = `import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df.to_csv("/workspace/clean.csv", index=False)`;

function profileWithColumn(
  column: DatasetProfile["columns"][number],
): DatasetProfile {
  return {
    ...profile,
    duplicateRowCount: 0,
    columns: [column],
    notes: [],
  };
}

async function runPrepLocally(
  csv: string,
  localProfile: DatasetProfile,
): Promise<{ code: string; rows: string[][] }> {
  const directory = await mkdtemp(join(tmpdir(), "vera-prep-transform-"));
  const sourcePath = join(directory, "source.csv");
  const cleanPath = join(directory, "clean.csv");

  try {
    await writeFile(sourcePath, csv, "utf8");
    const output = await generatePrep(
      {
        profile: localProfile,
        sampleRows: parseCsv(csv).slice(1, 6),
        sourcePath,
        cleanPath,
      },
      { mockMode: true },
    );
    await new Promise<void>((resolve, reject) => {
      execFile("python3", ["-c", output.prepCode], (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    return {
      code: output.prepCode,
      rows: parseCsv(await readFile(cleanPath, "utf8")),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

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
    expect(output.prepCode).not.toContain("drop_duplicates");
    expect(output.fixes).toHaveLength(3);
    expect(output.questions).toHaveLength(5);
    expect(output.questions.join(" ")).not.toMatch(/Revenue|Region/);
    expect(
      output.questions.every(
        (question) => classifyQuestion(question, profile).allowed,
      ),
    ).toBe(true);
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
    expect(output.questions.join(" ")).not.toMatch(/Region|CustomerSegment/);
    expect(output.questions.join(" ")).toMatch(/\btype\b/i);
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
    expect(output.questions.join(" ")).not.toContain("Region");
    expect(output.questions.join(" ")).toMatch(/\btype\b/i);
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

  it("never exposes raw column names in mock questions", async () => {
    const uglyProfile: DatasetProfile = {
      ...profile,
      columns: [
        {
          name: "release_year",
          kind: "integer",
          nullCount: 0,
          distinctCount: 2,
          sampleValues: ["2025", "2026"],
          dateFormat: null,
          evidence: null,
        },
        {
          name: "show_type",
          kind: "category",
          nullCount: 0,
          distinctCount: 2,
          sampleValues: ["Movie", "Series"],
          dateFormat: null,
          evidence: null,
        },
      ],
    };

    const output = await generatePrep(
      { ...request, profile: uglyProfile },
      { mockMode: true },
    );

    expect(output.questions.join(" ")).not.toMatch(
      /release_year|show_type|_/,
    );
    expect(output.questions).toContain(
      "How many records are there of each type?",
    );
    expect(
      output.questions.every(
        (question) => classifyQuestion(question, uglyProfile).allowed,
      ),
    ).toBe(true);
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
      validPrepCode,
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

    expect(() => parsePrepResponse(raw, request)).toThrow();
  });

  it("rejects a fix that names a profiled column", () => {
    expect(() =>
      parsePrepResponse(
        responseWith(validPrepCode, ["Revenue values were tidied."]),
        request,
      ),
    ).toThrow();
  });

  it("rejects arbitrary prose outside the fixed fix vocabulary", () => {
    expect(() =>
      parsePrepResponse(
        responseWith(validPrepCode, ["Completely polished the file."]),
        request,
      ),
    ).toThrow();
  });

  it("drops an evidence-specific fix the profile does not support", () => {
    const unsupportedProfile: DatasetProfile = {
      ...profile,
      duplicateRowCount: 0,
      columns: [
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
      notes: [],
    };

    const output = parsePrepResponse(
      responseWith(validPrepCode, [
        "Dates with a proven order will be made consistent.",
        "Missing values will be left empty rather than guessed.",
      ]),
      { ...request, profile: unsupportedProfile },
    );

    expect(output.fixes).toEqual([
      "Missing values will be left empty rather than guessed.",
    ]);
  });

  /**
   * Caught by the first real Fireworks prep call (2026-07-26). The model copied
   * every transform verbatim and was still rejected wholesale, because it chose
   * two fix sentences describing transforms the menu had handed it that the
   * evidence test did not permit. Prep then failed open on every upload.
   */
  it("never lets an unsupported fix sentence discard a whitelisted program", () => {
    const cleanProfile: DatasetProfile = {
      ...profile,
      duplicateRowCount: 0,
      columns: [
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
      notes: [],
    };

    const output = parsePrepResponse(
      responseWith(validPrepCode, [
        "Symbols and separators around amounts will be removed.",
        "Extra spaces around text will be removed.",
      ]),
      { ...request, profile: cleanProfile },
    );

    expect(output.prepCode).toContain("df.to_csv");
    expect(output.fixes.length).toBeGreaterThan(0);
    expect(output.fixes).not.toContain(
      "Symbols and separators around amounts will be removed.",
    );
    expect(output.fixes).not.toContain(
      "Extra spaces around text will be removed.",
    );
  });

  it("offers the model only the fix sentences this profile supports", () => {
    const cleanProfile: DatasetProfile = {
      ...profile,
      duplicateRowCount: 0,
      columns: [
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
      notes: [],
    };

    const prompt = buildPrepPrompt({ ...request, profile: cleanProfile });

    expect(prompt).not.toContain(
      "Symbols and separators around amounts will be removed.",
    );
    expect(prompt).not.toContain("Extra spaces around text will be removed.");
    expect(prompt).toContain(
      "Missing values will be left empty rather than guessed.",
    );
  });

  it.each([
    ["a", "a was tidied"],
    ["id", "the id was tidied"],
    ["date", "date was tidied"],
  ])(
    "matches column %j as a whole phrase without rejecting canned prose",
    async (columnName, namedFix) => {
    const shortNameProfile: DatasetProfile = {
      ...profile,
      columns: [
        {
          name: columnName,
          kind: "text",
          nullCount: 0,
          distinctCount: 2,
          sampleValues: ["One", "Two"],
          dateFormat: null,
          evidence: null,
        },
      ],
      notes: [],
    };

    await expect(
      generatePrep(
        { ...request, profile: shortNameProfile },
        { mockMode: true },
      ),
    ).resolves.toMatchObject({
      prepCode: expect.stringContaining(
        `df[${JSON.stringify(columnName)}]`,
      ),
    });
    expect(
      parsePrepResponse(
        responseWith(validPrepCode, [
          "Missing values will be left empty rather than guessed.",
        ]),
        { ...request, profile: shortNameProfile },
      ).fixes,
    ).toEqual([
      "Missing values will be left empty rather than guessed.",
    ]);
    expect(() =>
      parsePrepResponse(
        responseWith(validPrepCode, [namedFix]),
        { ...request, profile: shortNameProfile },
      ),
    ).toThrow();
  },
  );

  it.each([
    ['df = pd.DataFrame({"Revenue": [1]})', "dataframe replacement"],
    ['df["Revenue"] = df["Revenue"].fillna(0)', "fillna"],
    ['df["Revenue"] = df["Revenue"].interpolate()', "interpolate"],
    ['df = df[df["Revenue"] < 1000000]', "row filter"],
    ['df["Revenue"] = 7', "constant assignment"],
    [
      'df = getattr(pd, "read_csv")("/workspace/data.csv")',
      "dynamic read",
    ],
    [
      'df = pd.read_csv(chr(47) + "workspace/data.csv")',
      "constructed resource",
    ],
    ['print("prepared")', "extra statement"],
    ["df = df.drop_duplicates()", "model deduplication"],
  ])("rejects non-whitelisted prep code: %s (%s)", (statement) => {
    const raw = responseWith(`import pandas as pd
df = pd.read_csv("/workspace/data.csv")
${statement}
df.to_csv("/workspace/clean.csv", index=False)`);

    expect(() => parsePrepResponse(raw, request)).toThrow(
      /allowed|statement|prep code|read_csv/i,
    );
  });

  it.each(["Used pd.", "Cleaned df[ values.", "Used %d/%m/%Y."])(
    "rejects the isolated jargon token in %j",
    (fix) => {
      expect(() =>
        parsePrepResponse(responseWith(validPrepCode, [fix]), request),
      ).toThrow();
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

describe("the canonical transform menu", () => {
  const mixedUnitProfile = profileWithColumn({
    name: "duration",
    kind: "text",
    nullCount: 0,
    distinctCount: 3,
    sampleValues: ["90 min", "2 Seasons", "Unknown"],
    dateFormat: null,
    evidence: null,
  });

  it("splits a mixed-unit column into an amount and unit without replacing it", async () => {
    const output = await generatePrep(
      { ...request, profile: mixedUnitProfile },
      { mockMode: true },
    );

    expect(output.prepCode).toContain('df[["duration_amount","duration_unit"]]');
    expect(output.prepCode).toContain('df["duration"]');
    expect(output.prepCode).not.toContain("drop");
  });

  it("splits consistent multi-value cells into a list without exploding rows", async () => {
    const multiValueProfile = profileWithColumn({
      name: "listed_in",
      kind: "category",
      nullCount: 0,
      distinctCount: 3,
      sampleValues: [
        "Drama, Comedy",
        "Action, Drama",
        "Comedy, Documentaries",
      ],
      dateFormat: null,
      evidence: null,
    });

    const output = await generatePrep(
      { ...request, profile: multiValueProfile },
      { mockMode: true },
    );

    expect(output.prepCode).toContain('df["listed_in_list"]');
    expect(output.prepCode).toContain('.split(",")');
    expect(output.prepCode).not.toContain("explode");
  });

  it("does not advertise a category transform shadowed by list splitting", async () => {
    const multiValueProfile = profileWithColumn({
      name: "listed_in",
      kind: "category",
      nullCount: 0,
      distinctCount: 3,
      sampleValues: [
        "Drama,  Sci   Fi",
        "Action, Drama",
        "Comedy, Documentaries",
      ],
      dateFormat: null,
      evidence: null,
    });

    const output = await generatePrep(
      { ...request, profile: multiValueProfile },
      { mockMode: true },
    );

    expect(output.fixes).toContain(
      "Several values stored together will be separated without adding records.",
    );
    expect(output.fixes).not.toContain(
      "Stray spaces within category values will be made consistent.",
    );
  });

  it("normalises category whitespace without lowercasing or merging values", async () => {
    const raggedCategoryProfile = profileWithColumn({
      name: "genre",
      kind: "category",
      nullCount: 0,
      distinctCount: 3,
      sampleValues: [" Sci Fi", "SCI   FI ", "Drama"],
      dateFormat: null,
      evidence: null,
    });

    const output = await generatePrep(
      { ...request, profile: raggedCategoryProfile },
      { mockMode: true },
    );

    expect(output.prepCode).toContain(".str.strip()");
    expect(output.prepCode).toContain('.str.replace(r"\\s+", " ", regex=True)');
    expect(output.prepCode).not.toContain(".str.lower()");
  });

  it("normalises a fully profiled boolean-ish set and empties unknown values", async () => {
    const booleanProfile = profileWithColumn({
      name: "active",
      kind: "category",
      nullCount: 0,
      distinctCount: 4,
      sampleValues: ["yes", "No", "TRUE", "0"],
      dateFormat: null,
      evidence: null,
    });

    const output = await generatePrep(
      { ...request, profile: booleanProfile },
      { mockMode: true },
    );

    expect(output.prepCode).toContain('df["active"]');
    expect(output.prepCode).toContain('"yes":True');
    expect(output.prepCode).toContain('pd.NA');
    expect(output.prepCode).toContain('.astype("boolean")');
  });

  it("refuses a harmless-looking transform the model invented", () => {
    const raw = responseWith(`import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df["Revenue"] = df["Revenue"].fillna(0)
df.to_csv("/workspace/clean.csv", index=False)`);

    expect(() => parsePrepResponse(raw, request)).toThrow(
      /allowed|statement|prep code/i,
    );
  });

  it("refuses a row-dropping statement outright", () => {
    const raw = responseWith(`import pandas as pd
df = pd.read_csv("/workspace/data.csv")
df = df[df["Revenue"] > 0]
df.to_csv("/workspace/clean.csv", index=False)`);

    expect(() => parsePrepResponse(raw, request)).toThrow(
      /allowed|statement|prep code/i,
    );
  });

  it("offers unit splitting only when more than one sampled unit justifies it", async () => {
    const cleanNumericProfile = profileWithColumn({
      name: "duration",
      kind: "number",
      nullCount: 0,
      distinctCount: 2,
      sampleValues: ["90", "120"],
      dateFormat: null,
      evidence: null,
    });
    const singleUnitProfile = profileWithColumn({
      name: "duration",
      kind: "text",
      nullCount: 0,
      distinctCount: 2,
      sampleValues: ["90 min", "120 min"],
      dateFormat: null,
      evidence: null,
    });

    const [numeric, singleUnit] = await Promise.all([
      generatePrep(
        { ...request, profile: cleanNumericProfile },
        { mockMode: true },
      ),
      generatePrep(
        { ...request, profile: singleUnitProfile },
        { mockMode: true },
      ),
    ]);

    expect(numeric.prepCode).not.toContain("duration_unit");
    expect(singleUnit.prepCode).not.toContain("duration_unit");
  });

  it("leaves unmatched unit cells empty and preserves every row", async () => {
    const transformed = await runPrepLocally(
      'duration\n"90 min"\n"2 Seasons"\nUnknown\n',
      mixedUnitProfile,
    );

    expect(transformed.rows).toEqual([
      ["duration", "duration_amount", "duration_unit"],
      ["90 min", "90", "min"],
      ["2 Seasons", "2", "Seasons"],
      ["Unknown", "", ""],
    ]);
  });

  it("describes the widened fixed menu in the prompt", () => {
    const prompt = buildPrepPrompt({
      ...request,
      profile: mixedUnitProfile,
    });

    expect(prompt).toMatch(/amounts?.*units?.*separat/i);
    expect(prompt).toMatch(/multiple|several|list/i);
    expect(prompt).toMatch(/yes-or-no|boolean|true or false/i);
    expect(prompt).toMatch(/internal.*spaces|spaces.*within/i);
    expect(prompt).toContain(
      'df[["duration_amount","duration_unit"]] = df["duration"]',
    );
    expect(prompt).toMatch(/copy.*exact|exact.*cop/i);
  });
});
