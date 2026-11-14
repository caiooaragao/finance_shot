import { connection } from "next/server";

import { advanceWorkflow } from "@/server/services/gateway";
import { toResponse } from "../../respond";

export async function POST() {
  await connection();
  return toResponse(await advanceWorkflow());
}
