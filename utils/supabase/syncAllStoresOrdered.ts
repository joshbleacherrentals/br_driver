import { getAllSyncEntries } from "./supaLegend/util";

export async function syncAllStoresOrdered() {
  console.log("[syncAllStoresOrdered] starting ordered sync of all stores");
  const entries = getAllSyncEntries();

  // Topological-ish order: parents first
  const order = ["users", "drivers", "workTrackers", "workTrackerInspections", "inspectionPhotos"];

  const byName = new Map(entries.map((e) => [e.name, e]));
  const ordered = [
    ...order.map((n) => byName.get(n)).filter(Boolean),
    ...entries.filter((e) => !order.includes(e.name)),
  ] as typeof entries;

  // 1) wait for persist hydration BEFORE any sync
  for (const e of ordered) {
    const s = e.state$.get();
    if (s?.isPersistEnabled && !s?.isPersistLoaded) {
      console.log(`[syncAllStoresOrdered] waiting for persist load of store "${e.name}"`);
      // cheap poll; replace with your own "when" helper if you have one
      while (!e.state$.get()?.isPersistLoaded) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  // 2) flush pending SETs first (parents first)
  for (const e of ordered) {
    await (e.state$ as any).set?.(); // if available
  }

  // 3) then pull remote GETs
  for (const e of ordered) {
    await (e.state$ as any).get?.(); // if available
  }

  // If your version only has sync(), do ordered.forEach(e => e.state$.sync())
}
