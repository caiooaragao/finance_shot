import { unzipSync } from "fflate";

import { toIsoDate } from "../../lib/dates";
import { fetchViaProxy } from "../../lib/fetch-via-proxy";

const INDEX_URL = "https://disclosures-clerk.house.gov/public_disc/financial-pdfs";
const PDF_URL = "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs";

export const HOUSE_START_YEAR = 2013;

export type HouseFilingRef = {
  id: string;
  member: string;
  disclosed: string;
  link: string;
};

function tag(block: string, name: string): string {
  return block.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() ?? "";
}

export function parseHouseIndex(xml: string): HouseFilingRef[] {
  const filings: HouseFilingRef[] = [];
  for (const match of xml.matchAll(/<Member>([\s\S]*?)<\/Member>/g)) {
    const block = match[1] ?? "";
    if (tag(block, "FilingType") !== "P") continue;
    const id = tag(block, "DocID");
    const year = tag(block, "Year");
    const disclosed = toIsoDate(tag(block, "FilingDate"));
    if (!id || !year || !disclosed) continue;
    const member = [tag(block, "First"), tag(block, "Last"), tag(block, "Suffix")].filter(Boolean).join(" ");
    filings.push({
      id,
      member,
      disclosed,
      link: `${PDF_URL}/${year}/${id}.pdf`,
    });
  }
  return filings;
}

export async function listHouseYear(year: number): Promise<HouseFilingRef[]> {
  const response = await fetchViaProxy(`${INDEX_URL}/${year}FD.zip`);
  if (!response.ok) {
    throw new Error(`índice da Câmara ${year} respondeu HTTP ${response.status}`);
  }
  const files = unzipSync(new Uint8Array(await response.arrayBuffer()));
  const xmlName = Object.keys(files).find((name) => name.toLowerCase().endsWith(".xml"));
  if (!xmlName) throw new Error(`índice da Câmara ${year} não trouxe XML`);
  return parseHouseIndex(new TextDecoder().decode(files[xmlName]));
}
