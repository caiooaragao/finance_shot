import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Carrega `.env.local` e `.env` sem sobrescrever variáveis já definidas. */
export function loadEnv(cwd = process.cwd()): void {
  for (const name of [".env.local", ".env"]) {
    const file = join(cwd, name);
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

export function maxAttempts(): number {
  const parsed = Number(process.env.WORKFLOW_MAX_ATTEMPTS ?? 3);
  if (!Number.isFinite(parsed) || parsed < 1) return 3;
  return Math.floor(parsed);
}

export function requestDelayMs(): number {
  const parsed = Number(process.env.SENATE_REQUEST_DELAY_MS ?? 1000);
  if (!Number.isFinite(parsed) || parsed < 0) return 1000;
  return Math.floor(parsed);
}
