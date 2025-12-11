import {
  cleanupTodosSync,
  clearStalePendingChanges,
  forceSyncTodos,
  initTodosSync,
  reconcileTodosWithRemote,
} from "@/utils/supabase/supaLegend";
import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";

export function useResyncTodosOnReconnect() {
  const wasOffline = useRef(false);

  useEffect(() => {
    // Initialize the stale pending changes auto-detection
    initTodosSync();

    const sub = NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true &&
        (state.isInternetReachable === null || state.isInternetReachable === true);

      if (!online) {
        wasOffline.current = true;
      } else if (online && wasOffline.current) {
        // Only sync when transitioning from offline to online
        wasOffline.current = false;
        console.log("[useResyncTodosOnReconnect] Network reconnected, triggering todos resync");

        // IMPORTANT: Clear stale pending changes FIRST - this fetches remote state
        // and clears any pending changes that are older than remote
        clearStalePendingChanges().then((clearedCount) => {
          console.log(`[useResyncTodosOnReconnect] Cleared ${clearedCount} stale pending changes`);
          // Then do a full sync
          forceSyncTodos().then(() => {
            // Run clearStalePendingChanges again after sync in case new conflicts emerged
            clearStalePendingChanges().then(() => {
              // After syncing, reconcile to detect hard-deleted items
              reconcileTodosWithRemote();
            });
          });
        });
      }
    });

    // Also sync on mount (app open) if online
    NetInfo.fetch().then((state) => {
      if (state.isConnected) {
        console.log("[useResyncTodosOnReconnect] App started online, triggering initial sync");
        clearStalePendingChanges().then((clearedCount) => {
          console.log(
            `[useResyncTodosOnReconnect] Cleared ${clearedCount} stale pending changes on startup`
          );
          forceSyncTodos().then(() => {
            clearStalePendingChanges().then(() => {
              reconcileTodosWithRemote();
            });
          });
        });
      }
    });

    return () => {
      sub();
      cleanupTodosSync();
    };
  }, []);
}
