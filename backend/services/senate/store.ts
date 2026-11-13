import type pg from "pg";

import { getPool } from "../../db/pool";
import type { StoredTrade } from "./normalize";

export type ScrapeState = {
  backfillCompletedAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastStartedAt: Date | null;
};

let inflight = 0;

export function scrapesInFlight(): number {
  return inflight;
}

export async function withScrape<T>(fn: () => Promise<T>): Promise<T> {
  inflight += 1;
  try {
    return await fn();
  } finally {
    inflight -= 1;
  }
}

async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function filingExists(id: string): Promise<boolean> {
  const result = await getPool().query("SELECT 1 FROM senate_filings WHERE id = $1", [id]);
  return result.rowCount !== null && result.rowCount > 0;
}

export async function countFilings(): Promise<number> {
  const result = await getPool().query<{ count: string }>("SELECT count(*)::text AS count FROM senate_filings");
  return Number(result.rows[0]?.count ?? 0);
}

export async function countTrades(): Promise<number> {
  const result = await getPool().query<{ count: string }>("SELECT count(*)::text AS count FROM senate_trades");
  return Number(result.rows[0]?.count ?? 0);
}

export async function saveFiling(
  filing: { id: string; member: string; disclosed: string; link: string },
  trades: StoredTrade[],
): Promise<boolean> {
  return transaction(async (client) => {
    const inserted = await client.query(
      `INSERT INTO senate_filings (id, member_name, disclosed, link)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      [filing.id, filing.member, filing.disclosed, filing.link],
    );
    if (inserted.rowCount === 0) return false;
    for (const trade of trades) {
      await client.query(
        `INSERT INTO senate_trades
          (id, filing_id, member, chamber, ticker, trade_type, amount, tx_date, disclosed, asset, link)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (id) DO NOTHING`,
        [
          trade.id,
          trade.filingId,
          trade.member,
          trade.chamber,
          trade.ticker,
          trade.tradeType,
          trade.amount,
          trade.txDate,
          trade.disclosed,
          trade.asset,
          trade.link,
        ],
      );
    }
    return true;
  });
}

export async function markScrapeStarted(): Promise<void> {
  await getPool().query("UPDATE scrape_state SET last_started_at = now(), last_error = NULL WHERE id = 1");
}

export async function markScrapeSuccess(): Promise<void> {
  await getPool().query(
    "UPDATE scrape_state SET last_success_at = now(), last_error = NULL WHERE id = 1",
  );
}

export async function markScrapeError(message: string): Promise<void> {
  await getPool().query("UPDATE scrape_state SET last_error = $1 WHERE id = 1", [message]);
}

export async function markBackfillComplete(): Promise<void> {
  await getPool().query(
    `UPDATE scrape_state
     SET backfill_completed_at = COALESCE(backfill_completed_at, now()),
         last_success_at = now(),
         last_error = NULL
     WHERE id = 1`,
  );
}

export async function readScrapeState(): Promise<ScrapeState> {
  const result = await getPool().query<{
    backfill_completed_at: Date | null;
    last_success_at: Date | null;
    last_error: string | null;
    last_started_at: Date | null;
  }>("SELECT backfill_completed_at, last_success_at, last_error, last_started_at FROM scrape_state WHERE id = 1");
  const row = result.rows[0];
  return {
    backfillCompletedAt: row?.backfill_completed_at ?? null,
    lastSuccessAt: row?.last_success_at ?? null,
    lastError: row?.last_error ?? null,
    lastStartedAt: row?.last_started_at ?? null,
  };
}
