import "@/state/session/session";
import "@/state/stores/addresses.store";
import "@/state/stores/bleachers.store";
import "@/state/stores/drivers.store";
import "@/state/stores/inspectionPhotos.store";
import "@/state/stores/users.store";
import "@/state/stores/workTrackerInspections.store";
import "@/state/stores/workTrackers.store";
import "./config";
import { startResyncManager } from "./resyncManager";

// resyncOnForground();
startResyncManager({
  debug: true,
  delayMs: 40,
  order: ["users", "drivers", "workTrackers", "workTrackerInspections", "inspectionPhotos"],
  // optional: don’t sync until you have a driver id / clerk user id, etc
  // canSync: () => !!currentDriver$.driver_id.get(),
});

console.log("[supaLegend] init complete (stores imported)");
