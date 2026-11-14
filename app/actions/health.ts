"use server";

import { getHealth } from "@/server/services/gateway";

export async function loadHealthStatus() {
  return getHealth();
}
