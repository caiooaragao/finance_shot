import { HOUSE_START_YEAR, listHouseYear } from "./index";
import { emptyHouseProgress, mergeHouseProgress, scrapeHouseFilings, type HouseProgress } from "./job";
import { countHouseFilings, countHouseTrades } from "./store";

export async function runHouseBackfill(now = new Date(), onlyYear?: number): Promise<{
  progress: HouseProgress;
  filingsBefore: number;
  filingsAfter: number;
  tradesBefore: number;
  tradesAfter: number;
}> {
  const filingsBefore = await countHouseFilings();
  const tradesBefore = await countHouseTrades();
  const start = onlyYear ?? HOUSE_START_YEAR;
  const end = onlyYear ?? now.getFullYear();
  let progress = emptyHouseProgress();
  for (let year = start; year <= end; year += 1) {
    console.info(`house ${year}`);
    const filings = await listHouseYear(year);
    const yearProgress = await scrapeHouseFilings(filings);
    console.info(
      `house ${year} vistos ${yearProgress.seen} novos ${yearProgress.added} trades ${yearProgress.trades} papel ${yearProgress.paper} sem leitura ${yearProgress.unparsed}`,
    );
    progress = mergeHouseProgress(progress, yearProgress);
  }
  return {
    progress,
    filingsBefore,
    filingsAfter: await countHouseFilings(),
    tradesBefore,
    tradesAfter: await countHouseTrades(),
  };
}
