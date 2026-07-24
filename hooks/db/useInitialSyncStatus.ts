import { useStatus } from "@powersync/react-native";

/**
 * Matches PowerSync auth/JWT failures that indicate the sync connection was
 * rejected for authorization reasons (expired/invalid token) rather than a
 * plain network problem. Kept in sync with the reconnect trigger in
 * SystemProvider.
 */
const AUTH_ERROR_PATTERN = /PSYNC_S21\d\d|JWT/i;

export type InitialSyncStatus = {
  /** True once the first full sync of the local DB has ever completed. */
  hasSynced: boolean;
  /** True while connected to the PowerSync service. */
  connected: boolean;
  /** True when the current download error looks like an auth/token failure. */
  authError: boolean;
  /** Download progress in [0, 1] while downloading, else null. */
  progress: number | null;
};

/**
 * Thin wrapper over PowerSync's reactive status, exposing only the fields the
 * driver gate cares about. Isolating the subscription here keeps the frequent
 * status re-renders out of the heavy tab tree.
 */
export function useInitialSyncStatus(): InitialSyncStatus {
  const status = useStatus();

  const downloadErrorMessage = status.dataFlowStatus?.downloadError?.message;

  return {
    hasSynced: status.hasSynced === true,
    connected: status.connected,
    authError: downloadErrorMessage
      ? AUTH_ERROR_PATTERN.test(downloadErrorMessage)
      : false,
    progress: status.downloadProgress?.downloadedFraction ?? null,
  };
}
