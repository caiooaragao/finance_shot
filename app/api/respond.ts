import type { ServiceResult } from "@/server/services/gateway";

export function toResponse(result: ServiceResult<unknown>): Response {
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result.data, { status: result.status });
}
