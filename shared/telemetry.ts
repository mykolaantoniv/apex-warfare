/**
 * Shared error-telemetry protocol between the Apex Warfare client and the Colyseus server
 * (D5). The client hooks `window.onerror` / `window.onunhandledrejection`, ring-buffers the
 * events, and POSTs batches to `/log`; the server validates and appends accepted events to
 * its own in-memory ring buffer (see `server/src/log.ts`). Plain types + guards only — no
 * engine/Babylon/Express imports — so both sides can consume this file verbatim.
 */

export type TelemetryKind = "error" | "unhandledrejection";

/** One captured client-side error/rejection, ready to serialize as JSON. */
export interface ClientLogEvent {
  readonly kind: TelemetryKind;
  readonly message: string;
  readonly stack: string | null;
  readonly source: string | null;
  readonly line: number | null;
  readonly col: number | null;
  /** `Date.now()` on the client when the event was captured. */
  readonly ts: number;
  readonly ua: string;
  /** Game version (package.json `version`, injected at build time). */
  readonly version: string;
  readonly url: string;
}

/** Body POSTed to `/log`. */
export interface LogBatch {
  readonly events: readonly ClientLogEvent[];
}

/** Max events accepted per POST /log request — server-side guard against abuse. */
export const LOG_BATCH_MAX = 32;

/** Max events retained by the server's in-memory ring buffer. */
export const LOG_BUFFER_CAP = 500;

/** Runtime guard: is `value` a well-formed `ClientLogEvent`? Used by the server to reject junk. */
export function isClientLogEvent(value: unknown): value is ClientLogEvent {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.kind === "error" || v.kind === "unhandledrejection") &&
    typeof v.message === "string" &&
    (v.stack === null || typeof v.stack === "string") &&
    (v.source === null || typeof v.source === "string") &&
    (v.line === null || typeof v.line === "number") &&
    (v.col === null || typeof v.col === "number") &&
    typeof v.ts === "number" &&
    typeof v.ua === "string" &&
    typeof v.version === "string" &&
    typeof v.url === "string"
  );
}
