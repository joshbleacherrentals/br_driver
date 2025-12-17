import { AppState } from "react-native";
import { getAllSyncEntries } from "./util";

let currentState = AppState.currentState;

export function resyncOnForground() {
  AppState.addEventListener("change", async (next) => {
    const wasBackground = currentState !== "active" && next === "active";
    currentState = next;

    if (!wasBackground) return;

    const observableSyncStates = getAllSyncEntries().map((entry) => entry.state$);

    await new Promise((r) => setTimeout(r, 250));

    // observableSyncStates.forEach(async (s$) =>
    for (const s$ of observableSyncStates) {
      try {
        await s$.sync();
      } catch (e) {
        console.warn("[supaLegend] foreground refresh error", e);
      }
    }
  });
}
