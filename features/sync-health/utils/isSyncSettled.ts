/** The slice of PowerSync's `SyncStatus` this reads. */
export type SyncStatusLike = {
  connected?: boolean;
  hasSynced?: boolean;
  dataFlowStatus?: { downloading?: boolean; downloadError?: Error };
};

/**
 * Connected, completed a full sync at least once, and not mid-download or
 * failed — the only state in which the device's bucket count is the real one.
 */
export function isSyncSettled(status: SyncStatusLike | undefined): boolean {
  if (!status?.connected || status.hasSynced !== true) return false;
  const flow = status.dataFlowStatus;
  return !flow?.downloading && !flow?.downloadError;
}
