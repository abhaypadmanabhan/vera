import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { contentHash } from "@/lib/datasets";
import { CLEAN_CSV_PATH, SANDBOX_CSV_PATH } from "@/lib/daytona/sandbox";
import { createFireworksClient } from "@/lib/fireworks/client";
import {
  generatePrep,
  parsePrepResponse,
  PREP_FIXES,
  type PrepRequest,
} from "@/lib/prepare/generate";
import { profileDataset } from "@/lib/profile/profiler";

/**
 * LIVE — spends ONE Fireworks call. No Daytona, no sandbox, no narration.
 * Skipped unless VERA_LIVE=1 so a normal `pnpm test` can never cost money.
 *   set -a; . ./.env.local; set +a; VERA_LIVE=1 VERA_MOCK=0 \
 *     VERA_PREP_DUMP=/tmp/prep-raw.json pnpm vitest run tests/live-prep.test.ts
 *
 * Why it exists: `canonicalizePrepCode` accepts a prep program only if every
 * statement between the read and the write matches a profile-derived transform
 * token for token. Mock generates exactly that form by construction, so mock
 * proves nothing. This is the only way to learn whether a real model COPIES the
 * menu or PARAPHRASES it — and a paraphrase means every upload's prep silently
 * fails open. See tasks/phase-11-scope.md P0.
 */
const live = process.env.VERA_LIVE === "1";

function buildRequest(): PrepRequest {
  const content = readFileSync("tests/fixtures/netflix-titles.csv", "utf8");
  const rows = parseCsv(content);
  return {
    profile: profileDataset("netflix", "netflix-titles.csv", content),
    sampleRows: rows.slice(1, 6),
    sourcePath: SANDBOX_CSV_PATH,
    cleanPath: CLEAN_CSV_PATH.replace(
      /\.csv$/,
      `-${contentHash(content)}.csv`,
    ),
  };
}

/**
 * The canonical menu the prompt offers, obtained the honest way: mock mode
 * returns exactly the profile-derived transforms, canonicalized.
 */
async function canonicalMenu(request: PrepRequest): Promise<string[]> {
  const mock = await generatePrep(request, { mockMode: true });
  return mock.prepCode.split("\n").slice(2, -1);
}

/** Does this single statement survive the whitelist on its own? */
function statementAccepted(
  statement: string,
  request: PrepRequest,
): boolean {
  const program = [
    "import pandas as pd",
    `df = pd.read_csv(${JSON.stringify(request.sourcePath)})`,
    statement,
    `df.to_csv(${JSON.stringify(request.cleanPath)}, index=False)`,
  ].join("\n");
  try {
    parsePrepResponse(
      JSON.stringify({
        prepCode: program,
        fixes: [PREP_FIXES[8]],
        questions: ["How many records are in this file?"],
      }),
      request,
    );
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!live)("LIVE fireworks prep", () => {
  it("writes a prep program that survives the canonical whitelist", async () => {
    const request = buildRequest();
    const menu = await canonicalMenu(request);

    const client = createFireworksClient({ mockMode: false });
    let raw = "";
    const capturing = {
      async createChatCompletion(
        chatRequest: Parameters<typeof client.createChatCompletion>[0],
      ) {
        const result = await client.createChatCompletion(chatRequest);
        raw = result.content;
        return result;
      },
    };

    let rejection: string | null = null;
    let accepted: Awaited<ReturnType<typeof generatePrep>> | null = null;
    try {
      accepted = await generatePrep(request, {
        mockMode: false,
        client: capturing,
      });
    } catch (error) {
      rejection = (error as Error).message;
    }

    const dumpPath = process.env.VERA_PREP_DUMP;
    if (dumpPath && raw) {
      mkdirSync(dirname(dumpPath), { recursive: true });
      writeFileSync(dumpPath, raw, "utf8");
    }

    console.log("=== RAW MODEL RESPONSE ===");
    console.log(raw || "(no response captured)");

    let modelCode = "";
    let modelQuestions: unknown = null;
    try {
      const parsed = JSON.parse(raw) as {
        prepCode?: string;
        fixes?: string[];
        questions?: string[];
      };
      modelCode = parsed.prepCode ?? "";
      modelQuestions = parsed.questions ?? null;
    } catch {
      modelCode = "";
    }

    console.log("=== VERDICT ===");
    console.log(rejection ? `REJECTED — ${rejection}` : "ACCEPTED");

    if (modelCode) {
      const statements = modelCode
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
      console.log("=== PER-STATEMENT VERDICT ===");
      for (const statement of statements) {
        const structural =
          statement.startsWith("import ") ||
          statement.startsWith("df = pd.read_csv") ||
          statement.startsWith("df.to_csv");
        const verdict = structural
          ? "structural"
          : statementAccepted(statement, request)
            ? "copied  "
            : "AUTHORED";
        console.log(`${verdict} | ${statement}`);
      }
    }

    console.log("=== MENU THE MODEL WAS OFFERED ===");
    for (const line of menu) console.log(line);
    console.log("=== PROPOSED QUESTIONS ===");
    console.log(JSON.stringify(modelQuestions, null, 2));

    expect(raw.length).toBeGreaterThan(0);
    expect(rejection, `prep was rejected: ${rejection}`).toBeNull();
    expect(accepted?.questions.length ?? 0).toBeGreaterThan(0);
  }, 120_000);
});
