import { getPrisma } from "../../db/prisma";
import { tradeId, type StoredTrade } from "../senate/normalize";
import type { HouseRow } from "./parse-ptr";

export async function houseFilingExists(id: string): Promise<boolean> {
  const row = await getPrisma().houseFiling.findUnique({ where: { id }, select: { id: true } });
  return row !== null;
}

export async function countHouseFilings(): Promise<number> {
  return getPrisma().houseFiling.count();
}

export async function countHouseTrades(): Promise<number> {
  return getPrisma().houseTrade.count();
}

export function toHouseTrades(
  rows: HouseRow[],
  filing: { id: string; member: string; disclosed: string; link: string },
): StoredTrade[] {
  return rows.map((row, index) => ({
    id: tradeId(filing.id, index),
    filingId: filing.id,
    member: filing.member,
    chamber: "House",
    ticker: row.ticker,
    tradeType: row.tradeType,
    amount: row.amount,
    txDate: row.txDate,
    disclosed: filing.disclosed,
    asset: row.asset,
    link: filing.link,
  }));
}

export async function saveHouseFiling(
  filing: { id: string; member: string; disclosed: string; link: string },
  trades: StoredTrade[],
): Promise<boolean> {
  return getPrisma().$transaction(async (tx) => {
    const inserted = await tx.houseFiling.createMany({
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
      await tx.houseTrade.createMany({
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
  }, { timeout: 20_000 });
}
