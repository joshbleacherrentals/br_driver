import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type WorkTracker = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  date: string | null;
  pickup_time: string | null;
  pickup_poc: string | null;
  dropoff_time: string | null;
  dropoff_poc: string | null;
  pay_cents: number | null;
  notes: string | null;
  internal_notes: string | null;
  pickup_address_uuid: string | null;
  dropoff_address_uuid: string | null;
  bleacher_uuid: string | null;
  driver_uuid: string | null;
  user_uuid: string | null;
  status: string | null;
  released_at: string | null;
  accepted_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  abandoned_at: string | null;
  teardown_required: number | null;
  pickup_instructions: string | null;
  setup_required: number | null;
  dropoff_instructions: string | null;
  pickup_poc_contact_uuid: string | null;
  dropoff_poc_contact_uuid: string | null;
  project_number: string | null;
  bol_number: string | null;
  pre_inspection_uuid: string | null;
  post_inspection_uuid: string | null;
  actual_bleacher_uuid: string | null;
  bleacher_change_reason: string | null;
  work_tracker_type_uuid: string | null;
  pickup_time_mode: string | null;
  pickup_time_start: string | null;
  pickup_time_end: string | null;
  dropoff_time_mode: string | null;
  dropoff_time_start: string | null;
  dropoff_time_end: string | null;
  /** Finished trips only — read through features/trip-history/utils/parseHistoryJson. */
  history_json: string | null;
  /** Server-computed (docs/specs/event-bleacher-roster.md section 4) — null is a run to storage. */
  dropoff_event_uuid: string | null;
  pickup_event_uuid: string | null;
};

export type UserData = {
  id: string;
};

export type DriverData = {
  id: string;
};

const WORK_TRACKER_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "date",
  "pickup_time",
  "pickup_poc",
  "dropoff_time",
  "dropoff_poc",
  "pay_cents",
  "notes",
  "internal_notes",
  "pickup_address_uuid",
  "dropoff_address_uuid",
  "bleacher_uuid",
  "driver_uuid",
  "user_uuid",
  "status",
  "released_at",
  "accepted_at",
  "started_at",
  "completed_at",
  // Set when the driver hands the work back — see utils/withdrawTracker.
  "declined_at",
  "abandoned_at",
  "teardown_required",
  "pickup_instructions",
  "setup_required",
  "dropoff_instructions",
  "pickup_poc_contact_uuid",
  "dropoff_poc_contact_uuid",
  "project_number",
  "bol_number",
  "pre_inspection_uuid",
  "post_inspection_uuid",
  "actual_bleacher_uuid",
  "bleacher_change_reason",
  // What kind of work this is — resolved to a kind through WorkTrackerTypes.
  "work_tracker_type_uuid",
  // Structured leg times; `pickup_time` / `dropoff_time` above are the
  // free-text mirrors kept only as a fallback for pre-migration rows.
  "pickup_time_mode",
  "pickup_time_start",
  "pickup_time_end",
  "dropoff_time_mode",
  "dropoff_time_start",
  "dropoff_time_end",
  // A finished trip's snapshot (addresses, pay, inspections) — those tables
  // stop syncing once the trip is done.
  "history_json",
  // Which event this leg serves — computed server-side, see useEventRoster.
  "dropoff_event_uuid",
  "pickup_event_uuid",
] as const;

/** Single work tracker by id — for completed-trip detail route. */
export function useWorkTracker(workTrackerId: string | null | undefined): {
  workTracker: WorkTracker | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!workTrackerId) return null;
    return db
      .selectFrom("WorkTrackers")
      .select([...WORK_TRACKER_COLUMNS])
      .where("id", "=", workTrackerId)
      .limit(1)
      .compile();
  }, [workTrackerId]);

  const { data } = useTypedQuery(compiled, expect<WorkTracker>());

  if (!workTrackerId) {
    return { workTracker: null, isLoading: false };
  }

  return {
    workTracker: data?.[0] ?? null,
    isLoading: data === undefined,
  };
}

/**
 * This driver's trips.
 *
 * The driver id comes from `useDriverScope()` — the app's single Clerk →
 * `Users` → `Drivers` resolver (§15) — rather than from two more lookups run
 * here. Until it resolves there is no query and no answer, which is the same
 * "still loading" the two chained lookups used to produce, minus the two
 * subscriptions.
 */
export function useWorkTrackers(): {
  workTrackers: WorkTracker[] | null;
  isLoading: boolean;
} {
  const scope = useDriverScope();

  const compiledWT = useMemo(() => {
    if (!scope) return null;
    return db
      .selectFrom("WorkTrackers")
      .select([...WORK_TRACKER_COLUMNS])
      .where("driver_uuid", "=", scope.driverUuid)
      .orderBy("date", "asc")
      .compile();
  }, [scope]);

  const WTData = useTypedQuery(compiledWT, expect<WorkTracker>());

  if (!scope) return { workTrackers: null, isLoading: true };

  return { workTrackers: WTData.data, isLoading: false };
}

/**
 * Lightweight pending-trips badge count for the tab bar.
 * Avoids subscribing the full WorkTrackers payload in TabLayout.
 */
export function useReleasedTripsCount(): {
  count: number;
  isLoading: boolean;
} {
  const scope = useDriverScope();

  const compiledCount = useMemo(() => {
    if (!scope) return null;
    return db
      .selectFrom("WorkTrackers")
      .select(["id"])
      .where("driver_uuid", "=", scope.driverUuid)
      .where("status", "=", "released")
      .compile();
  }, [scope]);

  const released = useTypedQuery(compiledCount, expect<{ id: string }>());

  if (!scope) return { count: 0, isLoading: true };

  return { count: released.data?.length ?? 0, isLoading: false };
}
