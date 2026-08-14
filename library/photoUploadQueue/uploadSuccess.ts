/**
 * §9, §10, §5.1 — success determination.
 *
 * Two kinds of signal, kept strictly apart: signals that *confirm* an upload
 * (an explicit API success, or a direct bucket lookup that found the object),
 * and signals that merely make the outcome *ambiguous* and therefore worth a
 * lookup (the insert-only bucket's "already exists", and — since the storage
 * SDK never actually cancels the request — a client-side timeout). An
 * ambiguous signal can only ever trigger verification, never decide it.
 */

import type { UploadEvidence } from "./types";

/**
 * A row may only move to `uploaded` when success is explicitly confirmed:
 * either the upload API reported success, or a direct bucket lookup found the
 * object. The insert-only-bucket duplicate signal is a secondary hint that
 * *triggers* verification — never a success criterion on its own (§10).
 */
export function isUploadSuccessful(evidence: UploadEvidence): boolean {
  // Success is either an explicit API confirmation or a positive bucket lookup.
  // The duplicate-path and timed-out signals are intentionally absent here — on
  // their own neither can ever flip a row to `uploaded` (§9, §10, §5.1).
  return evidence.apiConfirmed || evidence.bucketObjectExists === true;
}

/**
 * True when the queue must run a direct bucket lookup before deciding: the API
 * did not confirm success, something suggests a previous attempt may have
 * landed anyway, and the bucket has not been checked yet (§10, §5.1).
 *
 * Two signals qualify as "may have landed anyway", and they are the same shape
 * of evidence:
 *   - `duplicatePathSignal` — the insert-only bucket says an object is already
 *     at this path, so some earlier attempt got there;
 *   - `timedOutSignal` — our deadline fired, but the request itself was never
 *     really cancelled, so *this* attempt may be landing right now.
 */
export function needsBucketVerification(evidence: UploadEvidence): boolean {
  // Only worth a lookup while the outcome is still open: the API did not
  // confirm, an ambiguous signal hints an attempt may have landed, and the
  // bucket has not been checked yet (§10, §5.1).
  return (
    !evidence.apiConfirmed &&
    (evidence.duplicatePathSignal || evidence.timedOutSignal) &&
    evidence.bucketObjectExists === null
  );
}
