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

import type { BucketPresence, UploadEvidence } from "./types";

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

/**
 * What an attempt is allowed to record about itself.
 *
 * `inconclusive` is the third answer the queue used to lack, and the reason a
 * healthy row could be reported to the driver as failing: the insert-only
 * bucket rejects the write because an object is *already* at the path, and the
 * verifying lookup then cannot answer at all. Both halves are missing evidence
 * — the duplicate says some attempt landed, the `unknown` says we could not
 * check which — and the queue had no way to say so, so it wrote the one thing
 * it definitely did not know: that the attempt failed.
 */
export type AttemptVerdict = "confirmed" | "inconclusive" | "failed";

/**
 * §5.1/§9/§10 — the verdict for one attempt, from its evidence plus the real
 * tri-state result of the bucket lookup (`null` when no lookup was warranted).
 *
 * `presence` is deliberately a separate argument rather than a boolean folded
 * into the evidence: `absent` and `unknown` are interchangeable for deciding
 * *success*, and are opposites for deciding *failure*.
 */
export function attemptVerdict(
  evidence: UploadEvidence,
  presence: BucketPresence | null,
): AttemptVerdict {
  // Confirmation still needs explicit evidence, and `present` is the only
  // lookup answer that provides it (§9, §10).
  if (isUploadSuccessful(evidence)) {
    return "confirmed";
  }
  // The object is already in the bucket and we could not find out whose write
  // put it there. Absence of evidence, not evidence of failure — so nothing is
  // charged to the row and it stays retryable (§5.1).
  if (evidence.duplicatePathSignal && presence === "unknown") {
    return "inconclusive";
  }
  return "failed";
}
