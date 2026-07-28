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
  headline: "Sales in the third quarter of 2018 came to 143,787 dollars.",
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

  /*
   * A prepared file's path carries a content hash, and the Braintrust logs for
   * 2026-07-26 show a real model quietly substituting a tidier path — the
   * rejection that cost two live findings. The line it must produce is now
   * given verbatim rather than described in prose.
   */
  it("gives the read line verbatim so a hashed path cannot be tidied away", () => {
    const hashed =
      "/home/daytona/clean-45c436efd9f0240d5bafc80d7b431c849b004da3365f705066f5a43a8f622d6e.csv";
    const prompt = buildCodegenPrompt({
      question: "What is the average duration in minutes for movies?",
      profile,
      sampleRows: [],
      sandboxPath: hashed,
    });

    expect(prompt).toContain(`df = pd.read_csv(${JSON.stringify(hashed)})`);
    expect(prompt).toMatch(/character for character/i);
  });

  /*
   * The comparison Vera speaks has to be a figure the program printed. Nothing
   * downstream may subtract one verified number from another and say the
   * result, so the instruction to compute the change has to live here.
   */
  it("asks the program to compute a change against a comparable, never to state one", () => {
    const prompt = buildCodegenPrompt({
      question: "What were 2018 sales?",
      profile,
      sampleRows: [["08/11/2017", "261.96"]],
      sandboxPath: "/workspace/data.csv",
    });

    expect(prompt).toContain("change against a comparable");
    expect(prompt).toMatch(/compute it in the program/i);
    expect(prompt).toMatch(/never state a change you did not compute/i);
    // The description has to read with the figure in front of it, or the deck
    // falls back to reciting the second number.
    expect(prompt).toContain("higher than the same quarter a year earlier");
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
        "context": [],
        "explanation": "Parses the proven day-first date and sums 2018 sales.",
        "headline": "Sales in the third quarter of 2018 came to 143,787 dollars.",
        "valence": "neutral",
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
      headline: "A figure.",
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
      headline: "A figure.",
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
      headline: "A figure.",
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
      headline: "A figure.",
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
      headline: "Sales came to 143,787 dollars.",
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
      headline: "Sales came to 143,787 dollars.",
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
      headline: "Sales came to 143,787 dollars.",
      columnsUsed: ["OrderDate", "Sales"],
    });
    expect(() =>
      parseCodegenResponse(spacedPrint, profile, "/workspace/data.csv"),
    ).toThrow(/exactly one print/);

    const indirectNetwork = JSON.stringify({
      code: validCode.replace("import json", "import json\nimport subprocess"),
      explanation: "unsafe",
      headline: "Sales came to 143,787 dollars.",
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
      headline: "Sales came to 143,787 dollars.",
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
      headline: "Sales came to 143,787 dollars.",
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
      headline: "Sales came to 143,787 dollars.",
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
      result = {"value": round(float(df["Sales"].sum()), 2), "context": {"row_count": int(len(df))}}
      print("VERA_RESULT:" + json.dumps(result, separators=(",", ":")))",
        "columnsUsed": [
          "OrderDate",
          "Sales",
        ],
        "context": [
          {
            "columnsUsed": [
              "OrderDate",
              "Sales",
            ],
            "description": "the number of records behind it",
            "name": "row_count",
          },
        ],
        "explanation": "Sums Sales after applying the profiled schema constraints.",
        "headline": "The total sales across the file is {value}.",
        "valence": "neutral",
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

  it("accepts context figures and a valence", () => {
    const raw = JSON.stringify({
      code: validCode,
      explanation: "Sums Sales for Q3 2018.",
      headline: "Sales in the third quarter came to {value} dollars.",
      columnsUsed: ["OrderDate", "Sales"],
      context: [
        {
          name: "prior_period",
          description: "the same quarter a year earlier",
          columnsUsed: ["OrderDate", "Sales"],
        },
      ],
      valence: "good",
    });
    const parsed = parseCodegenResponse(raw, profile, "/workspace/data.csv");
    expect(parsed.context[0]?.name).toBe("prior_period");
    expect(parsed.valence).toBe("good");
  });

  it("defaults to no context and a neutral tone when the model omits them", () => {
    const parsed = parseCodegenResponse(
      validResponse,
      profile,
      "/workspace/data.csv",
    );
    expect(parsed.context).toEqual([]);
    expect(parsed.valence).toBe("neutral");
  });

  it("rejects a valence that is not one of the three — it may never carry prose", () => {
    const raw = JSON.stringify({
      ...JSON.parse(validResponse),
      valence: "up 18% on last quarter",
    });
    expect(() =>
      parseCodegenResponse(raw, profile, "/workspace/data.csv"),
    ).toThrow();
  });

  it("caps context at three figures", () => {
    const context = [1, 2, 3, 4].map((number) => ({
      name: `c${number}`,
      description: `d${number}`,
      columnsUsed: ["Sales"],
    }));
    const raw = JSON.stringify({ ...JSON.parse(validResponse), context });
    expect(() =>
      parseCodegenResponse(raw, profile, "/workspace/data.csv"),
    ).toThrow();
  });

  it("rejects a context figure claiming a column this file does not have", () => {
    const raw = JSON.stringify({
      ...JSON.parse(validResponse),
      context: [
        { name: "c", description: "d", columnsUsed: ["NotAColumn"] },
      ],
    });
    expect(() =>
      parseCodegenResponse(raw, profile, "/workspace/data.csv"),
    ).toThrow();
  });
});

/*
 * CodeRabbit on PR #40: the mock path built its headline with
 * `numericColumn.name.toLowerCase()`, which leaves a snake_case identifier
 * intact. The codegen prompt forbids raw schema identifiers in a headline, so
 * the mock was demonstrating a sentence the real path is required to reject.
 */
describe("the mock headline obeys the same rule as the model", () => {
  it("renders a column name as prose, not as an identifier", async () => {
    const snakeProfile = profileDataset(
      "snake",
      "snake.csv",
      "order_date,net_sales_usd\n15/04/2019,100\n03/02/2018,50\n",
    );

    const output = await generatePandasCode({
      question: "What were total sales?",
      profile: snakeProfile,
      sampleRows: [["15/04/2019", "100"]],
      sandboxPath: "/workspace/data.csv",
    });

    expect(output.headline).not.toContain("net_sales_usd");
    expect(output.headline).toContain("net sales usd");
  });
});
