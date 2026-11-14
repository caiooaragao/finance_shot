import { execute, getPrisma, query } from "../../db/prisma";
import { processSlot } from "../../lib/singleton";
import type { StoredTrade } from "./normalize";

export type ScrapeState = {
  backfillCompletedAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastStartedAt: Date | null;
};

const inflight = processSlot("finance-shot.scrape.inflight", 0);

export function scrapesInFlight(): number {
  return inflight.value;
}

export async function withScrape<T>(fn: () => Promise<T>): Promise<T> {
  inflight.value += 1;
  try {
    return await fn();
  } finally {
    inflight.value -= 1;
  }
}

export async function filingExists(id: string): Promise<boolean> {
  const row = await getPrisma().senateFiling.findUnique({ where: { id }, select: { id: true } });
  return row !== null;
}

export async function countFilings(): Promise<number> {
  return getPrisma().senateFiling.count();
}

export async function countTrades(): Promise<number> {
  return getPrisma().senateTrade.count();
}

export async function saveFiling(
  filing: { id: string; member: string; disclosed: string; link: string },
  trades: StoredTrade[],
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const inserted = await tx.senateFiling.createMany({
      data: [
        {
          id: filing.id,
          memberName: filing.member,
          disclosed: new Date(filing.disclosed),
          link: filing.link,
        },
      ],
      skipDuplicates: true,
    });
    if (inserted.count === 0) return false;
    if (trades.length > 0) {
      await tx.senateTrade.createMany({
        data: trades.map((trade) => ({
          id: trade.id,
          filingId: trade.filingId,
          member: trade.member,
          chamber: trade.chamber,
          ticker: trade.ticker,
          tradeType: trade.tradeType,
          amount: trade.amount,
          txDate: trade.txDate ? new Date(trade.txDate) : null,
          disclosed: new Date(trade.disclosed),
          asset: trade.asset,
          link: trade.link,
        })),
        skipDuplicates: true,
      });
    }
    return true;
  });
}

export async function markScrapeStarted(): Promise<void> {
  await execute("UPDATE scrape_state SET last_started_at = now(), last_error = NULL WHERE id = 1");
}

export async function markScrapeSuccess(): Promise<void> {
  await execute("UPDATE scrape_state SET last_success_at = now(), last_error = NULL WHERE id = 1");
}

export async function markScrapeError(message: string): Promise<void> {
  await execute("UPDATE scrape_state SET last_error = $1 WHERE id = 1", [message]);
}

export async function markBackfillComplete(): Promise<void> {
  await execute(
    `UPDATE scrape_state
     SET backfill_completed_at = COALESCE(backfill_completed_at, now()),
         last_success_at = now(),
         last_error = NULL
     WHERE id = 1`,
  );
}

export async function readScrapeState(): Promise<ScrapeState> {
  const rows = await query<{
    backfill_completed_at: Date | null;
    last_success_at: Date | null;
    last_error: string | null;
    last_started_at: Date | null;
  }>("SELECT backfill_completed_at, last_success_at, last_error, last_started_at FROM scrape_state WHERE id = 1");
  const row = rows[0];
  return {
    backfillCompletedAt: row?.backfill_completed_at ?? null,
    lastSuccessAt: row?.last_success_at ?? null,
    lastError: row?.last_error ?? null,
    lastStartedAt: row?.last_started_at ?? null,
  };
}
