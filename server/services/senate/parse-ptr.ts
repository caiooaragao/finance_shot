import * as cheerio from "cheerio";

export type ParsedRow = {
  txDate: string;
  ticker: string;
  asset: string;
  assetType: string;
  amount: string;
  orderType: string;
};

const FALLBACK_INDEX: Record<number, keyof ParsedRow> = {
  1: "txDate",
  3: "ticker",
  4: "asset",
  5: "assetType",
  6: "orderType",
  7: "amount",
};

function cells(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function headerField(text: string): keyof ParsedRow | null {
  const normalized = cells(text).toLowerCase();
  if (normalized.includes("transaction date") || normalized === "date") return "txDate";
  if (normalized === "ticker") return "ticker";
  if (normalized.includes("asset name")) return "asset";
  if (normalized.includes("asset type")) return "assetType";
  if (normalized === "type" || (normalized.includes("transaction") && normalized.includes("type"))) {
    return "orderType";
  }
  if (normalized.includes("amount")) return "amount";
  return null;
}

function emptyRow(): ParsedRow {
  return { txDate: "", ticker: "", asset: "", assetType: "", amount: "", orderType: "" };
}

function rowFromMap(texts: string[], fields: Array<keyof ParsedRow | null>): ParsedRow | null {
  const row = emptyRow();
  let filled = 0;
  fields.forEach((field, index) => {
    if (!field) return;
    row[field] = texts[index] ?? "";
    if (row[field]) filled += 1;
  });
  if (!row.txDate && !row.asset && !row.amount) return null;
  if (filled === 0) return null;
  return row;
}

export function parsePtrHtml(html: string): ParsedRow[] {
  const $ = cheerio.load(html);
  let best: ParsedRow[] = [];

  $("table").each((_, table) => {
    const trs = $(table).find("tr").toArray();
    if (trs.length === 0) return;

    const headerTexts = $(trs[0]).find("th, td").toArray().map((cell) => cells($(cell).text()));
    const headerFields = headerTexts.map((text) => headerField(text));
    const headerMode = headerFields.includes("txDate") && headerFields.includes("amount");
    const fields = headerMode ? headerFields : null;
    const body = headerMode ? trs.slice(1) : trs;
    const parsed: ParsedRow[] = [];

    for (const tr of body) {
      const texts = $(tr).find("td").toArray().map((cell) => cells($(cell).text()));
      if (texts.length < 4) continue;
      const row = fields
        ? rowFromMap(texts, fields)
        : rowFromMap(
            texts,
            texts.map((_, index) => FALLBACK_INDEX[index] ?? null),
          );
      if (row) parsed.push(row);
    }

    if (parsed.length > best.length) best = parsed;
  });

  return best;
}
