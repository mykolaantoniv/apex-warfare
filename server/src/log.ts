import { LOG_BATCH_MAX, LOG_BUFFER_CAP, isClientLogEvent, type ClientLogEvent } from "../../shared/telemetry";

/** A stored client error event, stamped with server-observed metadata. */
export interface StoredLogEntry extends ClientLogEvent {
  readonly receivedAt: number;
  readonly ip: string;
}

// In-memory ring buffer only — no DB, no external service (D5). Capped so a noisy/malicious
// client can't grow this unbounded; oldest entries are dropped first.
const buffer: StoredLogEntry[] = [];

/**
 * Validate and append a batch of raw (untrusted) events. Malformed entries are dropped
 * silently; only well-formed `ClientLogEvent`s are stored. Returns the number accepted.
 */
export function appendLogEvents(events: readonly unknown[], ip: string): number {
  let accepted = 0;
  const receivedAt = Date.now();
  for (const raw of events.slice(0, LOG_BATCH_MAX)) {
    if (!isClientLogEvent(raw)) continue;
    buffer.push({ ...raw, receivedAt, ip });
    accepted++;
  }
  if (buffer.length > LOG_BUFFER_CAP) buffer.splice(0, buffer.length - LOG_BUFFER_CAP);
  return accepted;
}

/** Read the full ring buffer (oldest first). For a quick ops check via GET /log. */
export function readLogEvents(): readonly StoredLogEntry[] {
  return buffer;
}
