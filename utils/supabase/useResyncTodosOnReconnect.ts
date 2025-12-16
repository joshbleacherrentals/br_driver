// import { getAllSyncEntries } from "@/utils/supabase/supaLegend";
// import NetInfo from "@react-native-community/netinfo";
// import { useEffect, useRef } from "react";

// /**
//  * Hook that triggers a resync for ALL registered synced stores when network reconnects.
//  */
// export function useResyncOnReconnect() {
//   const wasOffline = useRef(false);

//   useEffect(() => {
//     const sub = NetInfo.addEventListener((state) => {
//       const online =
//         state.isConnected === true &&
//         (state.isInternetReachable === null || state.isInternetReachable === true);

//       // Only trigger sync when transitioning from offline to online
//       if (online && wasOffline.current) {
//         console.log("[useResyncOnReconnect] Network reconnected, triggering resync for all stores");

//         const entries = getAllSyncEntries();
//         entries.forEach((entry) => {
//           const syncState = entry.state$.get();
//           if (syncState?.sync) {
//             console.log(`[useResyncOnReconnect] Syncing ${entry.name}`);
//             syncState.sync();
//           }
//         });
//       }

//       wasOffline.current = !online;
//     });

//     return () => sub();
//   }, []);
// }

// // Keep old name as alias for backwards compatibility
// export const useResyncTodosOnReconnect = useResyncOnReconnect;

import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { getAllSyncEntries } from "./supaLegend/util";

export function useResyncTodosOnReconnect() {
  // const sync$ = syncState(todos$); // ObservableSyncState for this synced observable
  // const entries = getAllSyncEntries();

  const observableSyncStates = getAllSyncEntries().map((entry) => entry.state$);

  useEffect(() => {
    const sub = NetInfo.addEventListener((state) => {
      const online =
        state.isConnected === true &&
        (state.isInternetReachable === null || state.isInternetReachable === true);

      if (online) {
        // Optionally guard to avoid spamming:
        // const { numPendingRemoteLoads } = sync$.get();
        // if (numPendingRemoteLoads === 0) {
        // console.log(
        //   "[useResyncTodosOnReconnect] Network reconnected, triggering todos resync",
        //   observableSyncStates
        // );
        // sync$.sync(); // 🔑 trigger a fresh sync from Supabase
        observableSyncStates.forEach((s$) => {
          // console.log("[useResyncTodosOnReconnect] Syncing observable", s$);
          s$.sync();
        });
        // }
      }
    });

    return () => sub();
  }, [observableSyncStates]);
}
