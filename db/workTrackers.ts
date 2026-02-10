import { db, powerSyncDb } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";
import { useUser } from "@clerk/clerk-expo";


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

  pre_inspection_uuid: string | null;
  post_inspection_uuid: string | null;
};


export type UserData = {
  id: string;
};

export type DriverData = {
  id: string;
}

/**
 * Fetch WorkTrackers belonging to the Clerk user using PowerSync
 */
export function fetchWorkTrackers(): { workTrackers: WorkTracker[] | null | undefined } {
  const { user } = useUser();
  const clerkUserId = user?.id ?? null;

  // 1. Get user_id from Users table
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

  // 2. Get driver_id from Drivers table
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

  // 3. Fetch WorkTrackers for this user
  const compiledWT = useMemo(() => {
    const driverId = driverData.data?.[0]?.id;
    if (!driverId) return null;

    return db
      .selectFrom("WorkTrackers")
      .select([
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
        "pre_inspection_uuid",
        "post_inspection_uuid",
      ])
      .where("driver_uuid", "=", driverId)
      .orderBy("date", "asc")
      .compile();
  }, [driverData.data]);

  const WTData = useTypedQuery(compiledWT, expect<WorkTracker>());

  return { workTrackers: WTData.data ?? [] };
}