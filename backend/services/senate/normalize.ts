import { createHash } from "node:crypto";

import { toIsoDate } from "../../lib/dates";
import type { ParsedRow } from "./parse-ptr";

export type StoredTrade = {
  id: string;
  filingId: string;
  member: string;
  chamber: "Senate";
  ticker: string;
  tradeType: string;
  amount: string;
  txDate: string | null;
  disclosed: string;
  asset: string;
  link: string;
};

export function tradeId(filingId: string, rowIndex: number): string {
  return createHash("sha256").update(`${filingId}|${rowIndex}`).digest("hex");
}

export function cleanTicker(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "--" || trimmed === "-" || trimmed.toUpperCase() === "N/A") return "";
  return trimmed;
}

export function normalizeOrderType(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("purchase")) return "buy";
  if (normalized.startsWith("sale")) return "sell";
  if (normalized.startsWith("exchange")) return "exchange";
  return normalized;
}

export function toTrade(
  row: ParsedRow,
  filing: { id: string; member: string; disclosed: string; link: string },
  index: number,
): StoredTrade {
  return {
    id: tradeId(filing.id, index),
    filingId: filing.id,
    member: filing.member,
    chamber: "Senate",
    ticker: cleanTicker(row.ticker),
    tradeType: normalizeOrderType(row.orderType),
    amount: row.amount.trim(),
    txDate: toIsoDate(row.txDate),
    disclosed: filing.disclosed,
    asset: row.asset.trim(),
    link: filing.link,
  };
}
