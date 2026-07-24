import { describe, expect, it, vi } from "vitest";
import {
  buildCodegenPrompt,
  generatePandasCode,
  parseCodegenResponse,
} from "@/lib/codegen/generate";
import type { DatasetProfile } from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "superstore",
  filename: "superstore.csv",
  rowCount: 9_994,
  duplicateRowCount: 1,
  columns: [
    {
      name: "OrderDate",
      kind: "date",
      nullCount: 0,
      distinctCount: 1_238,
      sampleValues: ["08/11/2017", "15/04/2019"],
      dateFormat: "%d/%m/%Y",
      evidence: {
        claim: "OrderDate is DD/MM/YYYY",
        supportingRows: 5_952,
        contradictingRows: 0,
        examples: ["15/04/2019"],
        method:
          "5,952 values have a first component above 12, which cannot be a month.",
      },
    },
    {
      name: "Sales",
      kind: "number",
      nullCount: 2,
      distinctCount: 5_829,
      sampleValues: ["261.96", "731.94"],
      dateFormat: null,
      evidence: null,
    },
  ],
  notes: [
    'Parse "OrderDate" with format="%d/%m/%Y" — 5,952 values prove day-first.',
    '"Sales" has 2 empty cells.',
  ],
};

const validCode = `import json
import pandas as pd

df = pd.read_csv("/workspace/data.csv")
df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")
result = round(float(df.loc[df["OrderDate"].dt.year == 2018, "Sales"].sum()), 2)
print("VERA_RESULT:" + json.dumps(result, separators=(",", ":")))`;

const validResponse = JSON.stringify({
  code: validCode,
  explanation: "Parses the proven day-first date and sums 2018 sales.",
  columnsUsed: ["OrderDate", "Sales"],
});

describe("structured pandas codegen", () => {
  it("builds a bounded prompt from the profile, notes, sample rows, and question", () => {
    const prompt = buildCodegenPrompt({
      question: "What were 2018 sales?",
      profile,
      sampleRows: [
        ["08/11/2017", "261.96"],
        ["15/04/2019", "731.94"],
      ],
      sandboxPath: "/workspace/data.csv",
    });

    expect(prompt).toContain("What were 2018 sales?");
    expect(prompt).toContain('"rowCount": 9994');
    expect(prompt).toContain('format=\\"%d/%m/%Y\\"');
    expect(prompt).toContain('"08/11/2017"');
    expect(prompt).toContain("/workspace/data.csv");
    expect(prompt).toContain("pd.to_numeric");
    expect(prompt).toContain("currency");
    expect(prompt).toContain("blank");
    expect(prompt).not.toContain("NEVER_SEND_THE_WHOLE_CSV");
  });

  it("parses the structured contract with zod and preserves pandas verbatim", () => {
    expect(
      parseCodegenResponse(validResponse, profile, "/workspace/data.csv"),
    ).toMatchInlineSnapshot(`
      {
        "code": "import json
      import pandas as pd

      df = pd.read_csv("/workspace/data.csv")
      df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")
      result = round(float(df.loc[df["OrderDate"].dt.year == 2018, "Sales"].sum()), 2)
      print("VERA_RESULT:" + json.dumps(result, separators=(",", ":")))",
        "columnsUsed": [
          "OrderDate",
          "Sales",
        ],
        "explanation": "Parses the proven day-first date and sums 2018 sales.",
      }
    `);
  });

  it("rejects code that touches a proven date without its exact format", () => {
    const unsafe = validResponse.replace(
      'pd.to_datetime(df[\\"OrderDate\\"], format=\\"%d/%m/%Y\\")',
      'pd.to_datetime(df[\\"OrderDate\\"])',
    );
    expect(() =>
      parseCodegenResponse(unsafe, profile, "/workspace/data.csv"),
    ).toThrow(/%d\/%m\/%Y/);

    const formatTokenWithoutParsing = JSON.stringify({
      code: validCode.replace(
        'df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")',
        'date_format = "%d/%m/%Y"',
      ),
      explanation: "mentions but does not apply the format",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(
        formatTokenWithoutParsing,
        profile,
        "/workspace/data.csv",
      ),
    ).toThrow(/pd\.to_datetime/);
  });

  it("rejects network imports and output that is not one result line", () => {
    const networked = JSON.stringify({
      code: validCode.replace(
        "import pandas as pd",
        "import requests\nimport pandas as pd",
      ),
      explanation: "unsafe",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(networked, profile, "/workspace/data.csv"),
    ).toThrow(/network/);

    const extraPrint = JSON.stringify({
      code: validCode.replace(
        'print("VERA_RESULT:',
        'print("debug")\nprint("VERA_RESULT:',
      ),
      explanation: "noisy",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(extraPrint, profile, "/workspace/data.csv"),
    ).toThrow(/exactly one print/);
  });

  it("returns the golden response in mock mode without calling Fireworks", async () => {
    const createChatCompletion = vi.fn();
    const result = await generatePandasCode(
      {
        question: "What were 2018 sales?",
        profile,
        sampleRows: [["08/11/2017", "261.96"]],
        sandboxPath: "/workspace/data.csv",
      },
      {
        mockMode: true,
        client: { createChatCompletion },
      },
    );

    expect(createChatCompletion).not.toHaveBeenCalled();
    expect(result.code).toContain('format="%d/%m/%Y"');
    expect(result.code).toContain('pd.read_csv("/workspace/data.csv")');
    expect(result.columnsUsed).toEqual(["OrderDate", "Sales"]);
  });
});
