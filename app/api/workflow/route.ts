import { connection } from "next/server";

import { readWorkflow } from "@/server/services/gateway";
import { toResponse } from "../respond";

export async function GET() {
  await connection();
  return toResponse(await readWorkflow());
}
