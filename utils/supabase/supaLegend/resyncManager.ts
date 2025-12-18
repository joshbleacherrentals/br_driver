// utils/supabase/supaLegend/resyncManager.ts
import NetInfo from "@react-native-community/netinfo";
import { AppState, AppStateStatus } from "react-native";
import { getAllSyncEntries } from "./util";

type Options = {
  // Optional: order stores by dependency (parents first)
  // any stores not listed will sync after these in registration order
  order?: string[];

  // If you want: skip cold-start sync until some app condition is true
  // e.g. wait for Clerk session / driver id
  canSync?: () => boolean;

  // Delay before syncing on foreground/cold start to let hydration/auth settle
  delayMs?: number;

  // Log a bit
  debug?: boolean;
};

let started = false;

export function startResyncManager(opts: Options = {}) {
  if (started) return;
  started = true;

  const { order = [], canSync = () => true, delayMs = 300, debug = false } = opts;

  let currentAppState: AppStateStatus = AppState.currentState;
  let wasOffline = false;

  let syncing = false;
  let pending = false;

  const log = (...args: any[]) => debug && console.log("[resyncManager]", ...args);

  function getOrderedEntries() {
    const entries = getAllSyncEntries();

    if (!order.length) return entries;

    const byName = new Map(entries.map((e) => [e.name, e]));
    const ordered = [
      ...order.map((n) => byName.get(n)).filter(Boolean),
      ...entries.filter((e) => !order.includes(e.name)),
    ] as typeof entries;

    return ordered;
  }

  async function waitForPersistLoadedAll(timeoutMs = 8000) {
    const entries = getOrderedEntries();
    const start = Date.now();

    for (const entry of entries) {
      const s$ = entry.state$;
      // Only wait if persist is enabled
      while (true) {
        const s = s$.get();
        const persistEnabled = !!s?.isPersistEnabled;
        const persistLoaded = !!s?.isPersistLoaded;

        if (!persistEnabled || persistLoaded) break;

        if (Date.now() - start > timeoutMs) {
          log(`persist wait timeout for ${entry.name}`);
          break;
        }

        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  async function runSync(reason: string) {
    if (!canSync()) {
      log("canSync() false, skipping", reason);
      return;
    }

    if (syncing) {
      pending = true;
      log("sync already running, marking pending", reason);
      return;
    }

    syncing = true;
    pending = false;

    try {
      log("sync start:", reason);

      // Let hydration/auth settle a bit
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));

      // Ensure persisted state is hydrated before syncing
      await waitForPersistLoadedAll();

      const entries = getOrderedEntries();

      // One-at-a-time to avoid hammering / racey overwrites
      for (const entry of entries) {
        try {
          log("syncing store:", entry.name);
          await entry.state$.sync({ resetLastSync: true });
          log("synced store:", entry.name);
        } catch (e) {
          console.warn(`[resyncManager] ${entry.name} sync error`, e);
        }
      }

      log("sync done:", reason);
    } finally {
      syncing = false;
      if (pending) {
        pending = false;
        // Run one more pass if something requested while we were syncing
        runSync("pending");
      }
    }
  }

  // --- Cold start: run once ---
  runSync("cold-start");

  // --- Foreground listener ---
  AppState.addEventListener("change", (next) => {
    const wasBackground = currentAppState !== "active" && next === "active";
    currentAppState = next;

    if (wasBackground) {
      runSync("foreground");
    }
  });

  // --- Network listener (offline -> online only) ---
  const netUnsub = NetInfo.addEventListener((state) => {
    const online =
      state.isConnected === true &&
      (state.isInternetReachable == null || state.isInternetReachable === true);

    if (!online) {
      wasOffline = true;
      return;
    }

    if (wasOffline) {
      wasOffline = false;
      runSync("reconnect");
    }
  });

  // If you ever want to stop it later:
  return () => {
    try {
      netUnsub();
    } catch {}
    // AppState listener can’t be removed easily without holding the subscription on older RN,
    // so we leave it. If you need removable, we can store subscription and call .remove().
  };
}
