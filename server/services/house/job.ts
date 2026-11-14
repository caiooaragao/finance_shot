import type { HouseFilingRef } from "./index";
import { downloadHousePdf, housePdfText } from "./pdf";
import { parseHousePtrText } from "./parse-ptr";
import { houseFilingExists, saveHouseFiling, toHouseTrades } from "./store";

export type HouseProgress = {
  seen: number;
  added: number;
  paper: number;
  skipped: number;
  missing: number;
  unparsed: number;
  trades: number;
};

const WORKERS = 6;

export function emptyHouseProgress(): HouseProgress {
  return { seen: 0, added: 0, paper: 0, skipped: 0, missing: 0, unparsed: 0, trades: 0 };
}

export function mergeHouseProgress(left: HouseProgress, right: HouseProgress): HouseProgress {
  return {
    seen: left.seen + right.seen,
    added: left.added + right.added,
    paper: left.paper + right.paper,
    skipped: left.skipped + right.skipped,
    missing: left.missing + right.missing,
    unparsed: left.unparsed + right.unparsed,
    trades: left.trades + right.trades,
  };
}

async function scrapeOne(filing: HouseFilingRef, progress: HouseProgress): Promise<void> {
  progress.seen += 1;
  if (await houseFilingExists(filing.id)) {
    progress.skipped += 1;
    return;
  }
  const pdf = await downloadHousePdf(filing.link);
  if (!pdf) {
    progress.missing += 1;
    return;
  }
  const text = await housePdfText(pdf);
  const rows = parseHousePtrText(text);
  if (rows.length === 0 && text.trim().length < 80) progress.paper += 1;
  else if (rows.length === 0) progress.unparsed += 1;
  const trades = toHouseTrades(rows, filing);
  const inserted = await saveHouseFiling(filing, trades);
  if (!inserted) {
    progress.skipped += 1;
    return;
  }
  progress.added += 1;
  progress.trades += trades.length;
}

export async function scrapeHouseFilings(filings: HouseFilingRef[]): Promise<HouseProgress> {
  const progress = emptyHouseProgress();
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < filings.length) {
      const filing = filings[cursor];
      cursor += 1;
      if (!filing) return;
      try {
        await scrapeOne(filing, progress);
      } catch (error) {
        progress.missing += 1;
        console.error(
          "ptr da Câmara falhou",
          filing.id,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(WORKERS, filings.length) }, () => worker()));
  return progress;
}
