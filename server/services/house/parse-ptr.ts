import { toIsoDate } from "../../lib/dates";

export type HouseRow = {
  txDate: string;
  ticker: string;
  asset: string;
  amount: string;
  tradeType: "buy" | "sell" | "exchange";
};

const TRADE_SOURCE =
  "(?:(?:SP|DC|JT)\\s+)?([A-Za-z0-9][^$]{2,220}?)\\s*(P|S(?:\\s*\\(partial\\))?|E)\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+(\\d{1,2}\\/\\d{1,2}\\/\\d{4})\\s+(\\$[\\d,]+(?:\\s*-\\s*\\$[\\d,]+)?|Over\\s+\\$[\\d,]+|\\$[\\d,]+\\s*\\+)";

const TICKER_RE = /\(([A-Za-z][A-Za-z0-9.]{0,7})\)/g;

function tradeType(code: string): HouseRow["tradeType"] {
  const normalized = code.toUpperCase();
  if (normalized.startsWith("P")) return "buy";
  if (normalized.startsWith("S")) return "sell";
  return "exchange";
}

export function parseHousePtrText(raw: string): HouseRow[] {
  const text = raw.replace(/\u0000/g, " ").replace(/\s+/g, " ").trim();
  const rows: HouseRow[] = [];
  for (const match of text.matchAll(new RegExp(TRADE_SOURCE, "gi"))) {
    const assetRaw = (match[1] ?? "").replace(/^(?:SP|DC|JT)\s+/i, "").trim();
    const txDate = toIsoDate(match[3] ?? "");
    const amount = (match[5] ?? "").replace(/\s*-\s*/g, " - ").replace(/\s+/g, " ").trim();
    if (!txDate || !assetRaw || !amount) continue;
    const ticker = [...assetRaw.matchAll(TICKER_RE)]
      .map((item) => item[1]?.toUpperCase() ?? "")
      .filter((value) => value && value !== "PARTIAL")
      .at(-1) ?? "";
    const asset = assetRaw
      .replace(/\s*\[[A-Za-z]{2,4}\]\s*$/g, "")
      .replace(/\s*\([A-Za-z][A-Za-z0-9.]{0,7}\)\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (asset.length < 2 || /certify|asset type abbreviations/i.test(asset)) continue;
    rows.push({ txDate, ticker, asset, amount, tradeType: tradeType(match[2] ?? "") });
  }
  return rows;
}
