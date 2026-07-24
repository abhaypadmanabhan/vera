import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  buildCodegenPrompt,
  generatePandasCode,
  parseCodegenResponse,
} from "@/lib/codegen/generate";
import { profileDataset } from "@/lib/profile/profiler";
import type { DatasetProfile } from "@/lib/types";

const profile: DatasetProfile = {
  datasetId: "superstore",
  filename: "superstore.csv",
  rowCount: 9_994,
  duplicateRowCount: 1,
  crossChecks: [],
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

    const attributeBypass = JSON.stringify({
      code: validCode.replace(
        'df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")',
        "dates = pd.to_datetime(df.OrderDate)",
      ),
      explanation: "naive attribute access",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(attributeBypass, profile, "/workspace/data.csv"),
    ).toThrow(/%d\/%m\/%Y/);

    const aliasBypass = JSON.stringify({
      code: validCode.replace(
        'df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")',
        'dates = df.loc[:, "OrderDate"]\ndates = pd.to_datetime(dates)',
      ),
      explanation: "naive alias access",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(aliasBypass, profile, "/workspace/data.csv"),
    ).toThrow(/%d\/%m\/%Y/);

    const dummyConversionBypass = JSON.stringify({
      code: validCode.replace(
        'df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")',
        'dummy = pd.to_datetime(["01/01/2020"], format="%d/%m/%Y")\ndates = pd.to_datetime(df.OrderDate)',
      ),
      explanation: "formats a dummy but parses the real column naively",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(
        dummyConversionBypass,
        profile,
        "/workspace/data.csv",
      ),
    ).toThrow(/OrderDate.*%d\/%m\/%Y/);
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

    const spacedPrint = JSON.stringify({
      code: validCode.replace(
        'print("VERA_RESULT:',
        'print ("debug")\nprint("VERA_RESULT:',
      ),
      explanation: "noisy",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(spacedPrint, profile, "/workspace/data.csv"),
    ).toThrow(/exactly one print/);

    const indirectNetwork = JSON.stringify({
      code: validCode.replace("import json", "import json\nimport subprocess"),
      explanation: "unsafe",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(indirectNetwork, profile, "/workspace/data.csv"),
    ).toThrow(/not import/);
  });

  it("requires one exact pandas CSV read rather than a path in a comment", () => {
    const wrongRead = JSON.stringify({
      code: validCode.replace(
        'df = pd.read_csv("/workspace/data.csv")',
        'df = pd.read_csv("https://example.com/data.csv")\n# /workspace/data.csv',
      ),
      explanation: "reads the wrong source",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(wrongRead, profile, "/workspace/data.csv"),
    ).toThrow(/exactly once/);

    const commentOnlyRead = JSON.stringify({
      code: validCode.replace(
        'df = pd.read_csv("/workspace/data.csv")',
        '# pd.read_csv("/workspace/data.csv")\ndf = pd.read_pickle("/tmp/other.pkl")',
      ),
      explanation: "puts the required source in a comment",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(commentOnlyRead, profile, "/workspace/data.csv"),
    ).toThrow(/exactly once/);
  });

  it("rejects extra pandas I/O that could emit another result or access files", () => {
    const extraIo = JSON.stringify({
      code: validCode.replace(
        'print("VERA_RESULT:',
        'df.to_csv("/dev/stdout")\nprint("VERA_RESULT:',
      ),
      explanation: "writes extra output",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(extraIo, profile, "/workspace/data.csv"),
    ).toThrow(/I\/O/);
  });

  it("rejects a paid prompt whose bounded context would still be too large", () => {
    expect(() =>
      buildCodegenPrompt({
        question: "x".repeat(70_000),
        profile,
        sampleRows: [],
        sandboxPath: "/workspace/data.csv",
      }),
    ).toThrow(/prompt.*limit/i);
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
    expect(result).toMatchInlineSnapshot(`
      {
        "code": "import json
      import pandas as pd

      df = pd.read_csv("/workspace/data.csv")
      df["OrderDate"] = pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")
      df["Sales"] = pd.to_numeric(df["Sales"].astype(str).str.replace(r"[$,%]", "", regex=True), errors="coerce")
      result = round(float(df["Sales"].sum()), 2)
      print("VERA_RESULT:" + json.dumps(result, separators=(",", ":")))",
        "columnsUsed": [
          "OrderDate",
          "Sales",
        ],
        "explanation": "Sums Sales after applying the profiled schema constraints.",
      }
    `);
  });

  it("uses the proven Superstore date format in mock mode with no key", async () => {
    const csv = readFileSync("data/superstore.csv", "utf8");
    const superstoreProfile = profileDataset(
      "superstore",
      "superstore.csv",
      csv,
    );
    const originalKey = process.env.FIREWORKS_API_KEY;
    delete process.env.FIREWORKS_API_KEY;

    try {
      const result = await generatePandasCode(
        {
          question: "What were 2018 sales?",
          profile: superstoreProfile,
          sampleRows: [["CA-2016-152156", "08/11/2017"]],
          sandboxPath: "/workspace/data.csv",
        },
        { mockMode: true },
      );

      expect(result.code).toContain(
        'pd.to_datetime(df["OrderDate"], format="%d/%m/%Y")',
      );
    } finally {
      if (originalKey === undefined) delete process.env.FIREWORKS_API_KEY;
      else process.env.FIREWORKS_API_KEY = originalKey;
    }
  });
});
