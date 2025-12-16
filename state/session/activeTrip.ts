import { observable } from "@legendapp/state";
import { workTrackers$ } from "../stores/workTrackers.store";

type WorkTracker = {
  work_tracker_id: number;
  status: string | null;
  deleted?: boolean | null;
};

export const activeTripId$ = observable<number | null>(() => {
  const wts = workTrackers$.get();

  if (!wts) return null;

  const list = Object.values(wts);

  for (const wt of list) {
    if (!wt || wt.deleted) continue;
    if (wt.status === "in_progress") return wt.work_tracker_id;
  }

  return null;
});
