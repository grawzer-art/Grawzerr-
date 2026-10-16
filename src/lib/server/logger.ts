import "server-only";

import { redact } from "@/lib/ai/types";

type Level = "info" | "warn" | "error";

/**
 * One JSON line per event, visible in Vercel > Logs. Every string value is
 * passed through redact() so a credential can never reach the logs.
 */
export function logServer(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    safe[k] = typeof v === "string" ? redact(v) : v;
  }
  const line = JSON.stringify({ level, event, ...safe });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}
