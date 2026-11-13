import { requestDelayMs } from "../../lib/env";
import type { FilingRef } from "./client";
import { parsePtrHtml } from "./parse-ptr";
import { toTrade, type StoredTrade } from "./normalize";

export type ScrapeDeps = {
  exists: (id: string) => Promise<boolean>;
  download: (filing: FilingRef) => Promise<string>;
  save: (filing: { id: string; member: string; disclosed: string; link: string }, trades: StoredTrade[]) => Promise<boolean>;
  delayMs?: number;
};

export type ScrapeProgress = {
  seen: number;
  added: number;
  paper: number;
  skipped: number;
};

export function shouldDownload(filing: FilingRef, alreadyStored: boolean): boolean {
  return Boolean(filing.id && filing.disclosed && !filing.paper && !alreadyStored);
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeFilings(source: FilingRef[], deps: ScrapeDeps): Promise<ScrapeProgress> {
  const progress: ScrapeProgress = { seen: 0, added: 0, paper: 0, skipped: 0 };
  const seenIds = new Set<string>();
  const delay = deps.delayMs ?? requestDelayMs();

  for (const filing of source) {
    progress.seen += 1;
    if (filing.paper) {
      progress.paper += 1;
      continue;
    }
    if (!filing.id || !filing.disclosed || seenIds.has(filing.id)) {
      progress.skipped += 1;
      continue;
    }
    if (await deps.exists(filing.id)) {
      progress.skipped += 1;
      continue;
    }
    const html = await deps.download(filing);
    const trades = parsePtrHtml(html).map((row, index) =>
      toTrade(row, { id: filing.id!, member: filing.member, disclosed: filing.disclosed!, link: filing.link }, index),
    );
    const inserted = await deps.save(
      { id: filing.id, member: filing.member, disclosed: filing.disclosed, link: filing.link },
      trades,
    );
    if (inserted) {
      progress.added += 1;
      seenIds.add(filing.id);
    }
    await sleep(delay);
  }

  return progress;
}
