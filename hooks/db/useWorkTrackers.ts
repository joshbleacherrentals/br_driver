import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useUser } from "@clerk/clerk-expo";
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
  teardown_required: number | null;
  pickup_instructions: string | null;
  setup_required: number | null;
  dropoff_instructions: string | null;
  project_number: string | null;
  bol_number: string | null;
  pre_inspection_uuid: string | null;
  post_inspection_uuid: string | null;
};

export type UserData = {
  id: string;
};

export type DriverData = {
  id: string;
}

export function useWorkTrackers(): { workTrackers: WorkTracker[] | null } {
  const { user } = useUser();
  const clerkUserId = user?.id ?? null;

  const compiled = useMemo(() => {
    if (!clerkUserId) return null;
    return db
      .selectFrom("Users as u")
      .select(["u.id as id"])
      .where("clerk_user_id", "=", clerkUserId)
      .limit(1)
      .compile();
  }, [clerkUserId]);

  const userData = useTypedQuery(compiled, expect<UserData>());

  const compiledDriver = useMemo(() => {
    const userId = userData.data?.[0]?.id;
    if (!userId) return null;
    return db
      .selectFrom("Drivers as d")
      .select(["d.id as id"])
      .where("user_uuid", "=", userId)
      .limit(1)
      .compile();
  }, [userData.data]);

  const driverData = useTypedQuery(compiledDriver, expect<DriverData>());

  const compiledWT = useMemo(() => {
    const driverId = driverData.data?.[0]?.id;
    if (!driverId) return null;
    return db
      .selectFrom("WorkTrackers")
      .select([
        "id", "created_at", "updated_at", "date",
        "pickup_time", "pickup_poc", "dropoff_time", "dropoff_poc",
        "pay_cents", "notes", "internal_notes",
        "pickup_address_uuid", "dropoff_address_uuid",
        "bleacher_uuid", "driver_uuid", "user_uuid",
        "status", "released_at", "accepted_at", "started_at", "completed_at",
        "teardown_required", "pickup_instructions", "setup_required", "dropoff_instructions",
        "project_number", "bol_number",
        "pre_inspection_uuid", "post_inspection_uuid",
      ])
      .where("driver_uuid", "=", driverId)
      .orderBy("date", "asc")
      .compile();
  }, [driverData.data]);

  const WTData = useTypedQuery(compiledWT, expect<WorkTracker>());

  if (!clerkUserId) {
    console.log("[WorkTrackers] No clerk user ID provided");
    return { workTrackers: null };
  }

  if (!compiled || !userData.data?.[0]?.id) return { workTrackers: [] };
  if (!compiledWT) return { workTrackers: [] };

  return { workTrackers: WTData.data };
}

// ---------------------------------------------------------------------------
// Fleet-wide WorkTrackers for bleacher address resolution.
// No status filter — we want the last known dropoff regardless of status.
// ---------------------------------------------------------------------------

export type DropoffRow = {
  bleacher_uuid: string | null;
  dropoff_address_uuid: string | null;
  date: string | null;
};

export function useDropoffsByBleachers(
  bleacherIds: string[],
  targetDate: string,
): { rows: DropoffRow[] } {
  const compiled = useMemo(() => {
    if (bleacherIds.length === 0) return null;
    return db
      .selectFrom('WorkTrackers')
      .select(['bleacher_uuid', 'dropoff_address_uuid', 'date'])
      .where('bleacher_uuid', 'in', bleacherIds)
      .where('date', '<=', targetDate)
      .where('dropoff_address_uuid', 'is not', null)
      .orderBy('date', 'desc')
      .compile();
  }, [bleacherIds, targetDate]);

  const result = useTypedQuery(compiled, expect<DropoffRow>());
  return { rows: result.data ?? [] };
}