import { Console } from "@/components/vera/console";
import type { DeckBenchmark } from "@/components/vera/deck-player";
import benchmarkResults from "@/eval/results.json";
import { MOCK_MODE } from "@/lib/config";
import { DEFAULT_DATASET_ID, resolveDataset, toSummary } from "@/lib/datasets";
import { suggestedQuestions } from "./suggested-questions";

/**
 * Server component. The demo CSV is 2.3 MB and stays on the server: the client
 * receives only a `DatasetSummary` (schema, profiler notes, an 8-row preview),
 * and sends back a `datasetId`. `lib/datasets.ts` never enters the client bundle.
 */
export default async function Ask() {
  const [dataset, suggestions] = await Promise.all([
    resolveDataset(DEFAULT_DATASET_ID).then(toSummary),
    suggestedQuestions(),
  ]);

  // Honesty rule: when the mock engine is driving, the page says so. No copy may
  // let a scripted run read as a real sandbox execution.
  const questions = new Map(benchmarkResults.questions.map((question) => [question.id, question.input]));
  const benchmark: DeckBenchmark = {
    veraPercent: benchmarkResults.headline.veraPercent,
    baselinePercent: benchmarkResults.headline.baselinePercent,
    dashboardUrl: benchmarkResults.dashboardUrl,
    baselineMisses: benchmarkResults.baselineMisses.map(
      (id) => questions.get(id) ?? id.replaceAll("_", " "),
    ),
  };

  return (
    <Console
      dataset={dataset}
      suggestions={suggestions}
      benchmark={benchmark}
      isMock={MOCK_MODE}
    />
  );
}
