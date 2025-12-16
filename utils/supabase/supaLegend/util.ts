import { syncState } from "@legendapp/state";
import { v4 as uuidv4 } from "uuid";
// Provide a function to generate ids locally
export const generateId = () => uuidv4();

// ---- GLOBAL REGISTRY FOR MONITORING SYNCED STORES IN SyncStatusIndicator.tsx ---------------------------------
type SyncEntry = {
  name: string;
  store: any;
  state$: ReturnType<typeof syncState>;
};

const syncEntries: SyncEntry[] = [];

export function registerSyncedStore(name: string, store: any) {
  // Only register once per store name
  if (syncEntries.find((e) => e.name === name)) return;
  syncEntries.push({
    name,
    store,
    state$: syncState(store),
  });
}

export function getAllSyncEntries() {
  return syncEntries;
}
