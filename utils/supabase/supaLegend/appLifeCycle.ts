import { AppState } from "react-native";
import { getAllSyncEntries } from "./util";

let currentState = AppState.currentState;

async function resync() {
  const observableSyncStates = getAllSyncEntries().map((entry) => entry.state$);
  const value = observableSyncStates[0].get();

  console.log("[resyncOnForground] waiting briefly before resyncing", value);
  //   await new Promise((r) => setTimeout(r, 250));

  console.log(
    "[resyncOnForground] App has come to the foreground, triggering resync for all stores",
    observableSyncStates[0]
  );

  // observableSyncStates.forEach(async (s$) =>
  for (const s$ of observableSyncStates) {
    console.log("[resyncOnForground] syncing store");
    try {
      await s$.sync();
      console.log("[resyncOnForground] sunk store");
    } catch (e) {
      console.warn("[resyncOnForground] foreground refresh error", e);
    }
  }
}

export async function resyncOnForground() {
  AppState.addEventListener("change", async (next) => {
    console.log("[resyncOnForground] AppState change", currentState, "->", next);
    const wasBackground = currentState !== "active" && next === "active";
    console.log("[resyncOnForground] wasBackground =", wasBackground);
    currentState = next;

    if (!wasBackground) return;
    console.log("[resyncOnForground] App moved to foreground, starting resync");
    await resync();
  });
}
