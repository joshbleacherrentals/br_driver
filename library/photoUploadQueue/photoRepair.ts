/**
 * Repairing photo rows the bucket says never arrived.
 *
 * The queue guarantees a row is never deleted or archived behind the driver's
 * back (§3), which leaves one case it cannot resolve on its own: the local file
 * is gone (parked with {@link MISSING_LOCAL_FILE_ERROR}) *and* the object never
 * reached the bucket. Retrying is physically impossible; the only fix is a new
 * photo. This module decides what the driver may be offered, and how a set of
 * freshly picked photos maps onto the rows that need repairing.
 *
 * Pure by design — the DB reads, file writes and bucket verification all live in
 * the runtime layer, and only their results are handed here.
 *
 * ## The safety gate
 *
 * A row becomes replaceable **only** once a direct bucket lookup confirmed its
 * object is genuinely absent (`confirmedMissingPhotoIds`, published by the §6
 * recovery pass). A local `failed` status alone is ambiguous: the upload may
 * have succeeded server-side with only the confirmation lost on the way back.
 * Offering "replace" on that ambiguity would overwrite a photo that did arrive —
 * silently destroying the very evidence this queue exists to protect. Local file
 * presence is likewise no evidence either way, so it never opens the gate on its
 * own; it only decides whether plain Retry is still worth showing.
 */

import { MISSING_LOCAL_FILE_ERROR } from "./types";

/** The subset of a photo row this module reasons about, table-agnostic. */
export type RepairPhotoRow = {
  id: string;
  /** `upload_status` as stored — anything but `uploaded` is unresolved. */
  uploadStatus: string | null;
  /** `last_error`; {@link MISSING_LOCAL_FILE_ERROR} means the file is gone. */
  lastError: string | null;
  /** `created_at`; drives the stable oldest-first pairing order. */
  createdAt: string | null;
};

/** What the repair UI may offer for one report / inspection / document. */
export type PhotoRepairActions = {
  /**
   * Rows the bucket confirmed are missing, oldest first — the rows a picked
   * photo may overwrite. Empty means the gate is shut.
   */
  replaceableRows: RepairPhotoRow[];
  /**
   * Show the plain Retry affordance: at least one unresolved row still has a
   * local file to retry *with*. Parked rows can never satisfy this.
   */
  canRetry: boolean;
  /** Show the "Choose Photo" affordance (gate open *and* the parent editable). */
  canReplace: boolean;
};

/** Terminal state — a row here is done and must never be touched by repair. */
function isUnresolved(row: RepairPhotoRow): boolean {
  return row.uploadStatus !== "uploaded";
}

/**
 * Oldest first, tie-broken by id so the pairing is deterministic even when
 * `created_at` is null (rows written locally take their timestamp from the
 * server default, so it is null until the first sync round-trip).
 */
export function sortForRepair(rows: readonly RepairPhotoRow[]): RepairPhotoRow[] {
  return [...rows].sort((a, b) => {
    const byCreated = (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
    return byCreated !== 0 ? byCreated : a.id.localeCompare(b.id);
  });
}

/**
 * Decides which repair affordances apply to one parent's photos.
 *
 * `editable` is the caller's edit boundary (a resolved damage report, a closed
 * trip): replacement is a content edit, so it stops when the parent closes.
 * Retry is not an edit — it only finishes delivering what the driver already
 * submitted — so it stays available regardless.
 */
export function derivePhotoRepairActions(
  rows: readonly RepairPhotoRow[],
  confirmedMissingPhotoIds: ReadonlySet<string>,
  options: { editable: boolean },
): PhotoRepairActions {
  const unresolved = rows.filter(isUnresolved);

  const replaceableRows = sortForRepair(
    unresolved.filter((row) => confirmedMissingPhotoIds.has(row.id)),
  );

  // A parked row has no local file, so Retry would do nothing for it. Only a
  // row that still has something to send justifies showing the button.
  const canRetry = unresolved.some(
    (row) => row.lastError !== MISSING_LOCAL_FILE_ERROR,
  );

  return {
    replaceableRows,
    canRetry,
    canReplace: options.editable && replaceableRows.length > 0,
  };
}

/** One reused row paired with the picked photo that overwrites it. */
export type PhotoReplacementPairing = {
  rowId: string;
  /** Index into the picked-photo list. */
  pickedIndex: number;
};

export type PhotoReplacementPlan = {
  /** Confirmed-missing rows that get a new local file (row id is kept). */
  reuse: PhotoReplacementPairing[];
  /** Picked photos with no row to fill — they become brand-new rows. */
  extras: number[];
  /**
   * Confirmed-missing rows left unpaired. Deleting them is safe *because* they
   * are confirmed missing: such a row never reached `uploaded`, so there is no
   * bucket object to orphan. It is the one deletion the queue design permits.
   */
  deletions: string[];
  /** Photos the parent will hold once the plan is applied. */
  resultingPhotoCount: number;
  /**
   * The plan would empty the report/inspection. Callers must block it — a
   * damage report with no photo is not a damage report, and the driver would
   * have destroyed the record while trying to fix it.
   */
  violatesMinimum: boolean;
};

/**
 * Pairs picked photos 1:1 onto the confirmed-missing rows, oldest row first.
 *
 * Surplus picks become new rows; surplus rows are deleted. Both are reported
 * separately so the caller can confirm the destructive half with the driver
 * before anything is written.
 */
export function planPhotoReplacement(input: {
  replaceableRows: readonly RepairPhotoRow[];
  pickedCount: number;
  /** Every photo currently attached to the parent, repairable or not. */
  existingPhotoCount: number;
}): PhotoReplacementPlan {
  const ordered = sortForRepair(input.replaceableRows);
  const paired = Math.min(ordered.length, Math.max(input.pickedCount, 0));

  const reuse = ordered
    .slice(0, paired)
    .map((row, index) => ({ rowId: row.id, pickedIndex: index }));

  const extras: number[] = [];
  for (let index = paired; index < input.pickedCount; index++) {
    extras.push(index);
  }

  const deletions = ordered.slice(paired).map((row) => row.id);

  // Reused rows keep their identity, so only the surplus on either side moves
  // the total.
  const resultingPhotoCount =
    input.existingPhotoCount - deletions.length + extras.length;

  return {
    reuse,
    extras,
    deletions,
    resultingPhotoCount,
    violatesMinimum: resultingPhotoCount < 1,
  };
}

/**
 * Smallest number of photos the driver must pick for the plan to stay legal —
 * what the picker's "keep at least one" message is built from. Zero means any
 * selection is fine (there are other photos to carry the parent).
 */
export function minimumPicksToKeepOnePhoto(input: {
  replaceableCount: number;
  existingPhotoCount: number;
}): number {
  const survivors = input.existingPhotoCount - input.replaceableCount;
  return survivors >= 1 ? 0 : 1;
}
