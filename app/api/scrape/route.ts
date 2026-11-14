import { connection } from "next/server";

import { runScrape } from "@/server/services/gateway";
import { toResponse } from "../respond";

export async function POST() {
  await connection();
  return toResponse(await runScrape());
}
