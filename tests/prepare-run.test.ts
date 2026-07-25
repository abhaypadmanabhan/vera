import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAuditProgram,
  parseAuditOutput,
} from "@/lib/prepare/audit";

async function executeAudit(
  sourceCsv: string,
  cleanCsv: string,
): Promise<ReturnType<typeof parseAuditOutput>> {
  const directory = await mkdtemp(join(tmpdir(), "vera-audit-"));
  const sourcePath = join(directory, "source.csv");
  const cleanPath = join(directory, "clean.csv");

  try {
    await Promise.all([
      writeFile(sourcePath, sourceCsv, "utf8"),
      writeFile(cleanPath, cleanCsv, "utf8"),
    ]);
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile(
        "python3",
        ["-c", buildAuditProgram(sourcePath, cleanPath)],
        { encoding: "utf8" },
        (error, output) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(output);
        },
      );
    });
    return parseAuditOutput(stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

describe("the audit program", () => {
  it("reads both files and emits the audit prefix", () => {
    const program = buildAuditProgram(
      "/workspace/data.csv",
      "/workspace/clean.csv",
    );

    expect(program).toContain("/workspace/data.csv");
    expect(program).toContain("/workspace/clean.csv");
    expect(program).toContain("VERA_AUDIT:");
  });

  it("parses the counts from the last audit line", () => {
    const stdout = [
      'VERA_AUDIT:{"rowsBefore":1,"rowsAfter":1,"duplicatesDropped":0,"cellsCoerced":0}',
      "some unrelated output",
      'VERA_AUDIT:{"rowsBefore":9994,"rowsAfter":9990,"duplicatesDropped":4,"cellsCoerced":12}',
    ].join("\n");

    expect(parseAuditOutput(stdout)).toEqual({
      rowsBefore: 9994,
      rowsAfter: 9990,
      duplicatesDropped: 4,
      cellsCoerced: 12,
    });
  });

  it("does not report an unchanged duplicate as dropped", async () => {
    const csv = "name,amount\nAlpha,10\nAlpha,10\nBeta,20\n";

    await expect(executeAudit(csv, csv)).resolves.toEqual({
      rowsBefore: 3,
      rowsAfter: 3,
      duplicatesDropped: 0,
      cellsCoerced: 0,
    });
  });

  it("withholds counts when an exact duplicate disappears", async () => {
    const source = "name,amount\nAlpha,10\nBeta,20\nBeta,20\nGamma,30\n";
    const clean = "name,amount\nAlpha,10\nBeta,20\nGamma,30\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when deletion can hide coercion then deduplication", async () => {
    const source = "value\nA\nA\nB\n";
    const clean = "value\nA\nB\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("does not count reordered rows as coercion", async () => {
    const source = "name,amount\nAlpha,10\nBeta,20\nGamma,30\n";
    const clean = "name,amount\nGamma,30\nAlpha,10\nBeta,20\n";

    await expect(executeAudit(source, clean)).resolves.toEqual({
      rowsBefore: 3,
      rowsAfter: 3,
      duplicatesDropped: 0,
      cellsCoerced: 0,
    });
  });

  it("withholds counts for whitespace normalization without immutable identity", async () => {
    const source = "id,name,amount\n1, Alpha ,10\n2,Beta,20\n";
    const clean = "id,name,amount\n1,Alpha,10\n2,Beta,20\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when normalization and duplicate removal are ambiguous", async () => {
    const source = "group,amount\n1,$1\n1,1\n";
    const clean = "group,amount\n1,1\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when values swap between ID-looking rows", async () => {
    const source = "id,value\n1,Alpha\n2,Beta\n";
    const clean = "id,value\n1,Beta\n2,Alpha\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when deletion and coercion need row identity", async () => {
    const source = "id,value\n1,Alpha\n2,Beta\n3,Gamma\n";
    const clean = "id,value\n1,Alpha\n3,Delta\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts when trimmed IDs collide before deduplication", async () => {
    const source = "id,value\n 1,Alpha\n1,Alpha\n";
    const clean = "id,value\n1,Alpha\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it("withholds counts for changed rows without stable identity", async () => {
    const source = "group,value\nA,10\nA,20\n";
    const clean = "group,value\nA,11\nA,20\n";

    await expect(executeAudit(source, clean)).resolves.toBeNull();
  });

  it.each([
    ["missing prefix", "boom"],
    ["malformed JSON", "VERA_AUDIT:{oops"],
    [
      "partial counts",
      'VERA_AUDIT:{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":1}',
    ],
    [
      "wrong value type",
      'VERA_AUDIT:{"rowsBefore":"lots","rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":2}',
    ],
    ["non-object JSON", "VERA_AUDIT:null"],
    [
      "non-finite value",
      'VERA_AUDIT:{"rowsBefore":1e999,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":2}',
    ],
  ])("returns null for %s", (_case, stdout) => {
    expect(parseAuditOutput(stdout)).toBeNull();
  });

  it.each([
    [
      "negative counts",
      '{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":-1}',
    ],
    [
      "fractional counts",
      '{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":1.5}',
    ],
    [
      "unsafe integers",
      '{"rowsBefore":9007199254740992,"rowsAfter":9,"duplicatesDropped":1,"cellsCoerced":1}',
    ],
    [
      "more rows after than before",
      '{"rowsBefore":9,"rowsAfter":10,"duplicatesDropped":0,"cellsCoerced":1}',
    ],
    [
      "more duplicates dropped than rows removed",
      '{"rowsBefore":10,"rowsAfter":9,"duplicatesDropped":2,"cellsCoerced":1}',
    ],
  ])("rejects %s", (_case, payload) => {
    expect(parseAuditOutput(`VERA_AUDIT:${payload}`)).toBeNull();
  });
});
