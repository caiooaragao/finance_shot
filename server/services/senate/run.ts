import { backfillWindows, incrementalStart } from "../../lib/dates";
import { processSlot } from "../../lib/singleton";
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

function mergeProgress(left: ScrapeProgress, right: ScrapeProgress): ScrapeProgress {
  return {
    seen: left.seen + right.seen,
    added: left.added + right.added,
    paper: left.paper + right.paper,
    skipped: left.skipped + right.skipped,
  };
}

async function runAllYears(now: Date): Promise<ScrapeProgress> {
  let total: ScrapeProgress = { seen: 0, added: 0, paper: 0, skipped: 0 };
  for (const window of backfillWindows(now)) {
    const year = window.start.getFullYear();
    console.info(`scrape ${year}`);
    total = mergeProgress(total, await runWindow(window.start, window.end));
  }
  return total;
}

export async function runBackfill(now = new Date()): Promise<{
  first: ScrapeProgress;
  duplicatePassAdded: number;
  filingsBefore: number;
  filingsAfter: number;
}> {
  const filingsBefore = await countFilings();
  const first = await runAllYears(now);
  const filingsAfter = await countFilings();
  const second = await runAllYears(now);
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

const timer = processSlot<NodeJS.Timeout | undefined>("finance-shot.incremental.timer", undefined);

export function armIncrementalSchedule(): void {
  if (timer.value) return;
  timer.value = setInterval(() => {
    void runIncremental().catch((error: unknown) => {
      console.error("scrape incremental falhou", error instanceof Error ? error.message : error);
    });
  }, 6 * 60 * 60 * 1000);
  timer.value.unref();
}
