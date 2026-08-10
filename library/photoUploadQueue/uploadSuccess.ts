/**
 * §9, §10 — success determination.
 *
 * NOT IMPLEMENTED. The placeholder below reproduces exactly the anti-pattern
 * the design doc rejects (treating the "already exists" duplicate signal as
 * the sole success criterion), so the specification tests fail loudly.
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
  // The duplicate-path signal is intentionally absent here — on its own it can
  // never flip a row to `uploaded` (§9, §10).
  return evidence.apiConfirmed || evidence.bucketObjectExists === true;
}

/**
 * True when the queue must run a direct bucket lookup before deciding: the API
 * did not confirm success, the duplicate signal suggests a previous attempt
 * may have landed, and the bucket has not been checked yet (§10).
 */
export function needsBucketVerification(evidence: UploadEvidence): boolean {
  // Only worth a lookup while the outcome is still open: the API did not
  // confirm, the duplicate signal hints a prior attempt may have landed, and
  // the bucket has not been checked yet (§10).
  return (
    !evidence.apiConfirmed &&
    evidence.duplicatePathSignal &&
    evidence.bucketObjectExists === null
  );
}
