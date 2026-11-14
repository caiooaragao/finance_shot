import { applySchema, databaseUrl, disconnectPrisma } from "../db/prisma";
import { readEnv } from "../lib/env";
import { runHouseBackfill } from "../services/house/run";
import { runBackfill, runIncremental } from "../services/senate/run";

async function main(): Promise<void> {
  if (!databaseUrl()) {
    throw new Error("DATABASE_URL ausente. Copie example.env para .env.local.");
  }
  if (!readEnv("OUTBOUND_PROXY_URL")) {
    console.warn("OUTBOUND_PROXY_URL vazio: o eFD costuma responder 403 fora de IP residencial nos EUA.");
  }

  await applySchema();
  if (process.argv.includes("--house")) {
    const yearFlag = process.argv.indexOf("--year");
    const onlyYear = yearFlag >= 0 ? Number(process.argv[yearFlag + 1]) : undefined;
    const result = await runHouseBackfill(new Date(), onlyYear);
    console.info(
      JSON.stringify(
        {
          mode: "house",
          filingsBefore: result.filingsBefore,
          filingsAfter: result.filingsAfter,
          tradesBefore: result.tradesBefore,
          tradesAfter: result.tradesAfter,
          ...result.progress,
        },
        null,
        2,
      ),
    );
    return;
  }
  const incremental = process.argv.includes("--incremental");
  if (incremental) {
    const progress = await runIncremental();
    console.info(JSON.stringify({ mode: "incremental", ...progress }, null, 2));
    return;
  }

  const result = await runBackfill();
  console.info(
    JSON.stringify(
      {
        mode: "backfill",
        filingsBefore: result.filingsBefore,
        filingsAfter: result.filingsAfter,
        first: result.first,
        duplicatePassAdded: result.duplicatePassAdded,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectPrisma());
