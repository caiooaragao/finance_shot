import { backfillStart, incrementalStart } from "../../lib/dates";
import { SenateClient } from "./client";
import { scrapeFilings, type ScrapeProgress } from "./job";
import {
  countFilings,
  filingExists,
  markBackfillComplete,
  markScrapeError,
  markScrapeStarted,
  markScrapeSuccess,
  readScrapeState,
  saveFiling,
  withScrape,
} from "./store";

function clientDeps(client: SenateClient) {
  return {
    exists: filingExists,
    download: (filing: { link: string }) => client.fetchReport(filing.link),
    save: saveFiling,
  };
}

export async function runWindow(start: Date, end = new Date()): Promise<ScrapeProgress> {
  return withScrape(async () => {
    await markScrapeStarted();
    try {
      const client = new SenateClient();
      const filings = await client.filings(start, end);
      const progress = await scrapeFilings(filings, clientDeps(client));
      await markScrapeSuccess();
      return progress;
    } catch (error) {
      await markScrapeError(error instanceof Error ? error.message : "falha no scrape");
      throw error;
    }
  });
}

export async function runBackfill(now = new Date()): Promise<{
  first: ScrapeProgress;
  duplicatePassAdded: number;
  filingsBefore: number;
  filingsAfter: number;
}> {
  const filingsBefore = await countFilings();
  const first = await runWindow(backfillStart(now), now);
  const filingsAfter = await countFilings();
  const second = await runWindow(backfillStart(now), now);
  await markBackfillComplete();
  return {
    first,
    duplicatePassAdded: second.added,
    filingsBefore,
    filingsAfter,
  };
}

export async function runIncremental(now = new Date()): Promise<ScrapeProgress> {
  const state = await readScrapeState();
  return runWindow(incrementalStart(state.lastSuccessAt, now), now);
}

let timer: NodeJS.Timeout | undefined;

export function armIncrementalSchedule(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runIncremental().catch((error: unknown) => {
      console.error("scrape incremental falhou", error instanceof Error ? error.message : error);
    });
  }, 6 * 60 * 60 * 1000);
  timer.unref();
}
