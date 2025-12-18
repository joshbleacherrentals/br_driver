import NetInfo from "@react-native-community/netinfo";
import { useEffect, useRef } from "react";
import { getAllSyncEntries } from "./supaLegend/util";
import { syncAllStoresOrdered } from "./syncAllStoresOrdered";

export function useResyncOnReconnect() {
  const wasOffline = useRef(false);
  const syncing = useRef(false);
  // const sync$ = syncState(todos$); // ObservableSyncState for this synced observable
  // const entries = getAllSyncEntries();

  const observableSyncStates = getAllSyncEntries().map((entry) => entry.state$);

  useEffect(() => {
    const sub = NetInfo.addEventListener(async (state) => {
      const online =
        state.isConnected === true &&
        (state.isInternetReachable === null || state.isInternetReachable === true);
      if (!online) {
        wasOffline.current = true;
        return;
      }

      if (!wasOffline.current) return;
      wasOffline.current = false;

      if (syncing.current) return;
      syncing.current = true;

      try {
        await syncAllStoresOrdered();
      } finally {
        syncing.current = false;
      }
    });

    return () => sub();
  }, []);
}
