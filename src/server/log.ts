/**
 * Structured production logging and alerting, without extra dependencies.
 *
 * - Every line is one JSON object on stdout/stderr, which hosting platforms
 *   (Vercel, Fly, Render, Docker) collect and make searchable.
 * - Values under keys that look secret (cookies, tokens, signatures, keys,
 *   passwords, authorization) are replaced with "[redacted]".
 * - `alert()` also POSTs a small JSON message to ALERT_WEBHOOK_URL when it is
 *   set (an https URL from Slack, Discord, PagerDuty, or similar). Alerts never
 *   include request headers or bodies.
 */
type Level = "info" | "warn" | "error";
type Fields = Record<string, unknown>;

const secretKey = /secret|token|cookie|signature|password|passwd|authorization|private|mnemonic|seed|api[-_]?key|session/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== "object") {
    return typeof value === "bigint" ? value.toString() : value;
  }
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, secretKey.test(key) ? "[redacted]" : redact(item, depth + 1)]),
  );
}

export function log(level: Level, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...(redact(fields) as Fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Logs an error and, when ALERT_WEBHOOK_URL is configured, notifies operators. Never throws. */
export async function alert(event: string, error: unknown, fields: Fields = {}) {
  const message = error instanceof Error ? error.message : String(error);
  log("error", event, { ...fields, message, ...(error instanceof Error && error.stack ? { stack: error.stack.split("\n").slice(0, 6).join("\n") } : {}) });
  const url = process.env.ALERT_WEBHOOK_URL?.trim();
  if (!url || !url.startsWith("https://")) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // `text` is what Slack and Discord-compatible webhooks display.
      body: JSON.stringify({ text: `[chog-world-order] ${event}: ${message}`.slice(0, 1_000), event, message, ...(redact(fields) as Fields) }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    log("warn", "alert.delivery_failed", { event });
  }
}
