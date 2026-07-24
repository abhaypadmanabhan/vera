import { Console } from "@/components/vera/console";
import { MOCK_MODE } from "@/lib/config";
import { DEFAULT_DATASET_ID, resolveDataset, toSummary } from "@/lib/datasets";
import { suggestedQuestions } from "./suggested-questions";

/**
 * Server component. The demo CSV is 2.3 MB and stays on the server: the client
 * receives only a `DatasetSummary` (schema, profiler notes, an 8-row preview),
 * and sends back a `datasetId`. `lib/datasets.ts` never enters the client bundle.
 */
export default async function Home() {
  const [dataset, suggestions] = await Promise.all([
    resolveDataset(DEFAULT_DATASET_ID).then(toSummary),
    suggestedQuestions(),
  ]);

  // Honesty rule: when the mock engine is driving, the page says so. No copy may
  // let a scripted run read as a real sandbox execution.
  return <Console dataset={dataset} suggestions={suggestions} isMock={MOCK_MODE} />;
}
