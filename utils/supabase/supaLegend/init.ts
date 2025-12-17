import "@/state/session/session";
import "@/state/stores/addresses.store";
import "@/state/stores/bleachers.store";
import "@/state/stores/drivers.store";
import "@/state/stores/inspectionPhotos.store";
import "@/state/stores/users.store";
import "@/state/stores/workTrackerInspections.store";
import "@/state/stores/workTrackers.store";
import { resyncOnForground } from "./appLifeCycle";
import "./config";

resyncOnForground();

console.log("[supaLegend] init complete (stores imported)");
