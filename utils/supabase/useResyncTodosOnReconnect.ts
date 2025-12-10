import { todos$ } from "@/utils/supabase/supaLegend";
import { syncState } from "@legendapp/state";
import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";

export function useResyncTodosOnReconnect() {
  const sync$ = syncState(todos$); // ObservableSyncState for this synced observable

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true &&
        (state.isInternetReachable === null || state.isInternetReachable === true);

      if (online) {
        // Optionally guard to avoid spamming:
        // const { numPendingRemoteLoads } = sync$.get();
        // if (numPendingRemoteLoads === 0) {
        console.log("[useResyncTodosOnReconnect] Network reconnected, triggering todos resync");
        sync$.sync(); // 🔑 trigger a fresh sync from Supabase
        // }
      }
    });

    return () => sub();
  }, [sync$]);
}
