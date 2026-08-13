/**
 * §6 — the gate between "a photo is unresolved" and "tell the driver".
 *
 * The result of the "60s of fast retries → direct bucket check" sequence lives
 * here rather than in the database, and that is deliberate: §6 scopes the rule
 * to a single app open / foreground transition, so a per-session store has
 * exactly the right lifetime and needs no schema change. It also keeps the
 * verdict out of `last_error`, which the worker already uses for parking.
 *
 * A plain external store (rather than context) so the banner can subscribe from
 * any screen with `useSyncExternalStore`, without the provider tree having to
 * thread it down.
 */

export type PhotoUploadRecoveryState = {
  /**
   * Photo row ids whose object a direct bucket lookup confirmed is genuinely
   * missing. Empty means the §6 gate is shut and no banner may show — whether
   * because nothing is wrong, because the fast-retry window has not elapsed, or
   * because the check could not run (offline).
   */
  confirmedMissingPhotoIds: ReadonlySet<string>;
};

const EMPTY_STATE: PhotoUploadRecoveryState = {
  confirmedMissingPhotoIds: new Set(),
};

let state: PhotoUploadRecoveryState = EMPTY_STATE;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** `useSyncExternalStore` subscribe half. */
export function subscribeRecoveryState(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * `useSyncExternalStore` snapshot half. The reference is stable between real
 * changes, which is what stops React from re-rendering on every read.
 */
export function getRecoveryState(): PhotoUploadRecoveryState {
  return state;
}

/**
 * Publishes the outcome of a verification pass. Replaces rather than merges:
 * each foreground pass re-derives the whole picture from the bucket, so a photo
 * that has since uploaded must not linger from an earlier verdict.
 */
export function setConfirmedMissingPhotoIds(ids: ReadonlySet<string>): void {
  if (ids.size === 0) {
    clearRecoveryState();
    return;
  }
  state = { confirmedMissingPhotoIds: new Set(ids) };
  emit();
}

/** Shuts the gate — nothing verified missing, so no banner. */
export function clearRecoveryState(): void {
  if (state.confirmedMissingPhotoIds.size === 0) {
    return;
  }
  state = EMPTY_STATE;
  emit();
}

/**
 * Retires the verdict for specific rows.
 *
 * A verdict is a statement about the object that *was* at a row's path. Once the
 * driver replaces that photo — a new local file, or the row deleted outright —
 * the statement no longer describes anything real, and leaving it in place would
 * keep telling them a photo is lost immediately after they fixed it.
 *
 * Deliberately not called for a plain retry: re-sending the same file does not
 * make the earlier lookup wrong, and §6 wants the warning to stand until the
 * photo actually lands.
 */
export function forgetConfirmedMissingPhotoIds(ids: Iterable<string>): void {
  const next = new Set(state.confirmedMissingPhotoIds);
  let removed = false;
  for (const id of ids) {
    if (next.delete(id)) removed = true;
  }
  if (!removed) return;

  state = next.size === 0 ? EMPTY_STATE : { confirmedMissingPhotoIds: next };
  emit();
}
