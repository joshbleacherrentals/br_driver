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
  // TODO(photo-queue): implement — placeholder is the documented anti-pattern.
  return evidence.duplicatePathSignal;
}

/**
 * True when the queue must run a direct bucket lookup before deciding: the API
 * did not confirm success, the duplicate signal suggests a previous attempt
 * may have landed, and the bucket has not been checked yet (§10).
 */
export function needsBucketVerification(evidence: UploadEvidence): boolean {
  // TODO(photo-queue): implement — placeholder never verifies.
  void evidence;
  return false;
}
