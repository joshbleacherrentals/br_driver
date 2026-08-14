/**
 * Shared types for the custom photo upload queue.
 *
 * Source of truth: docs/custom-photo-upload-queue.en.md (§3, §6, §10).
 * This file is a CONTRACT ONLY — no behaviour lives here.
 */

/**
 * §3 — `upload_status` already carries `pending`/`uploaded`/`failed`;
 * the custom queue extends the same field with `uploading`.
 *
 * Deliberately closed: there is no `archived`/`deleted` member, because §3
 * requires that a row is never deleted or archived as a side effect.
 */
export const UPLOAD_STATUSES = [
  "pending",
  "uploading",
  "uploaded",
  "failed",
] as const;

export type UploadStatus = (typeof UPLOAD_STATUSES)[number];

/**
 * `last_error` sentinel meaning the local file is gone: the background worker
 * physically cannot upload it, so the row is *parked* — excluded from claims and
 * from the "actionable" count — until the user re-adds the photo (§6). It still
 * counts as unresolved, and it is still never deleted or archived (§3).
 *
 * Lives here rather than beside the table adapters so the pure repair logic can
 * recognise a parked row without pulling in the PowerSync runtime.
 */
export const MISSING_LOCAL_FILE_ERROR = "LOCAL_FILE_MISSING";

/**
 * Events that the upload logic — and only the upload logic (§3) — may apply
 * to a row. There is intentionally no "give up" / "archive" event (§5).
 *
 * `local_file_recovered` is the automatic counterpart of `retry_requested`
 * (§12): the parked-row sweep found the local file present after all, so the
 * row is un-parked with no driver involvement. Same shape as a manual retry —
 * back to `pending`, `last_error` cleared, backoff history preserved.
 */
export type UploadEvent =
  | "attempt_started"
  | "upload_confirmed"
  | "attempt_failed"
  | "attempt_timed_out"
  | "retry_requested"
  | "local_file_recovered";

/**
 * §3 — the queue is a set of columns on the photo row itself
 * (`DamageReportPhotos`, `InspectionPhotos`, `DriverDocuments`), not a
 * separate table. `photo_path` doubles as the bucket path.
 */
export type PhotoUploadRow = {
  id: string;
  photo_path: string;
  upload_status: UploadStatus;
  gallery_asset_id: string | null;
  attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
};

/**
 * §9, §10 — everything the queue is allowed to weigh when deciding whether an
 * upload actually succeeded. Modelled as separate signals precisely so that
 * the "already exists" text match can never be the sole criterion.
 */
export type UploadEvidence = {
  /** Explicit success from the upload API response — the primary signal. */
  apiConfirmed: boolean;
  /**
   * Secondary, probable-duplicate signal: the insert-only bucket rejected the
   * write because an object already sits at this path (§10).
   */
  duplicatePathSignal: boolean;
  /**
   * §5.1 — the attempt hit the client-side deadline. The storage SDK does not
   * forward our `AbortSignal` to the underlying request, so the upload may
   * still be in flight (and may still land) server-side. That makes a timeout
   * exactly as ambiguous as a duplicate-path signal, and therefore equally
   * grounds for a direct bucket lookup — never, on its own, grounds for
   * success.
   */
  timedOutSignal: boolean;
  /**
   * Result of a direct bucket lookup. `null` means "not checked yet".
   */
  bucketObjectExists: boolean | null;
};

/** §6 — one entry per report that still has a photo which failed to upload. */
export type ProblemReport = {
  reportUuid: string;
  /** ISO timestamp used to order newest → oldest. */
  createdAt: string;
};

/** §6 — everything the non-dismissible top banner needs to render. */
export type BannerState = {
  visible: boolean;
  /** Number of reports with a problem photo. */
  count: number;
  title: string;
  subtitle: string;
  /** Report opened when the banner is tapped — the newest problem report. */
  targetReportUuid: string | null;
};

/** §6 — inputs to the "1 minute of fast retries → verify → banner" rule. */
export type ForegroundRecoveryState = {
  /** Milliseconds since the app was opened / came to the foreground. */
  elapsedMs: number;
  /** Photos still not `uploaded` from a previous session. */
  unresolvedPhotoCount: number;
  /** Outcome of the direct bucket verification, if it has run yet. */
  bucketVerification: "not_run" | "confirmed_missing" | "confirmed_present";
};

/** §6 — what the recovery pass should do right now. */
export type RecoveryDecision = {
  /** `fast` = no backoff pauses; `backoff` = §6 30s → 1min → 5min schedule. */
  retryMode: "fast" | "backoff" | "idle";
  /** Run the direct bucket check before showing anything to the driver. */
  verifyBucket: boolean;
  /** Show the non-dismissible red banner. */
  showBanner: boolean;
};
