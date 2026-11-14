import { connection } from "next/server";

import { getHealth } from "@/server/services/gateway";

export async function GET() {
  await connection();
  return Response.json(await getHealth());
}
