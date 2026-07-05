import { LOG_BATCH_MAX, type ClientLogEvent, type LogBatch } from "../../shared/telemetry";

declare global {
  // Injected by Vite's `define` (vite.config.ts) from package.json's `version` field.
  const __APP_VERSION__: string;
}

/**
 * D5 error telemetry: hooks `window.onerror` + `window.onunhandledrejection`, ring-buffers
 * the events client-side, and flushes them in batches to the Colyseus server's `/log`
 * endpoint. No external service, no DB — just a quick ops signal.
 *
 * Hard rules (per BACKLOG §D5):
 * - Never throw from inside telemetry — a bug in the reporter must not create new errors.
 * - If the user opted out, or the browser is offline, the queue drops silently: no retry,
 *   no backoff, no reconnection storm.
 */

const OPT_OUT_KEY = "apex.telemetryOptOut";
// Keep the client ring buffer at or under the server's per-request cap so a single flush
// always fits in one POST (no chunking needed).
const MAX_BUFFER = LOG_BATCH_MAX;
const FLUSH_INTERVAL_MS = 8000;

let buffer: ClientLogEvent[] = [];
let installed = false;

function isOptedOut(): boolean {
  try {
    return localStorage.getItem(OPT_OUT_KEY) === "1";
  } catch {
    return false; // localStorage unavailable (e.g. locked-down privacy mode) — fail open
  }
}

/** Exposed for a future settings toggle; not wired into any UI yet. */
export function setTelemetryOptOut(optOut: boolean): void {
  try {
    if (optOut) localStorage.setItem(OPT_OUT_KEY, "1");
    else localStorage.removeItem(OPT_OUT_KEY);
  } catch {
    /* ignore — best effort only */
  }
}

function safeStringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    try {
      return String(value);
    } catch {
      return "unknown rejection reason";
    }
  }
}

function resolveLogEndpoint(): string {
  // Mirrors App.ts's serverUrl() + Lobby.ts's ws->http rewrite so telemetry hits the same
  // Colyseus server the game connects to, without importing App (telemetry must be able to
  // install before App even exists).
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  const explicit = env.VITE_SERVER_URL;
  const httpBase = explicit
    ? explicit.replace(/^ws/, "http")
    : location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? `http://${location.hostname}:2567`
      : `${location.protocol === "https:" ? "https" : "http"}://${location.host}`;
  return `${httpBase}/log`;
}

function sendBatch(endpoint: string, body: string): void {
  // sendBeacon survives page-hide/navigation better than fetch; fall back to a keepalive
  // fetch when it's unavailable or rejects the payload.
  if (typeof navigator.sendBeacon === "function") {
    try {
      if (navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }))) return;
    } catch {
      /* fall through to fetch */
    }
  }
  fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(
    () => {
      /* network failure — drop the batch. No retry: an offline queue must not grow forever. */
    },
  );
}

function push(event: ClientLogEvent): void {
  try {
    if (isOptedOut()) return;
    buffer.push(event);
    if (buffer.length > MAX_BUFFER) buffer.splice(0, buffer.length - MAX_BUFFER);
  } catch {
    /* never throw from telemetry */
  }
}

function flush(): void {
  try {
    if (buffer.length === 0) return;
    if (isOptedOut() || !navigator.onLine) {
      buffer = []; // offline/opted-out: drop silently, no retry
      return;
    }
    const batch = buffer;
    buffer = [];
    const body: LogBatch = { events: batch };
    sendBatch(resolveLogEndpoint(), JSON.stringify(body));
  } catch {
    /* never throw from telemetry */
  }
}

/** Install the global error hooks. Idempotent. Call once, as early as possible in boot. */
export function installErrorTelemetry(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (e: ErrorEvent) => {
    try {
      const err: unknown = e.error;
      push({
        kind: "error",
        message: e.message || "window error",
        stack: err instanceof Error ? err.stack ?? null : null,
        source: e.filename || null,
        line: e.lineno || null,
        col: e.colno || null,
        ts: Date.now(),
        ua: navigator.userAgent,
        version: __APP_VERSION__,
        url: location.href,
      });
    } catch {
      /* never throw from the handler itself */
    }
  });

  window.addEventListener("unhandledrejection", (e: PromiseRejectionEvent) => {
    try {
      const reason: unknown = e.reason;
      push({
        kind: "unhandledrejection",
        message: reason instanceof Error ? reason.message : safeStringify(reason),
        stack: reason instanceof Error ? reason.stack ?? null : null,
        source: null,
        line: null,
        col: null,
        ts: Date.now(),
        ua: navigator.userAgent,
        version: __APP_VERSION__,
        url: location.href,
      });
    } catch {
      /* never throw from the handler itself */
    }
  });

  window.setInterval(flush, FLUSH_INTERVAL_MS);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}
