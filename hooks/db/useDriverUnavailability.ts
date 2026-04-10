import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useUser } from "@clerk/clerk-expo";
import { useMemo } from "react";
import { DriverData, UserData } from "./useWorkTrackers";

export type UnavailabilityDates = {
    id: string;
    driver_uuid: string | null;
    date_unavailable: string | null;
    updated_at: string | null;
}

export function useDriverUnavailability(): { unavailableDates: UnavailabilityDates[] | null } {
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

  // 3. Fetch UnavailabilityDates for this driver
  const compiledUnavailability = useMemo(() => {
    const driverId = driverData.data?.[0]?.id;
    if (!driverId) return null;

    return db
        .selectFrom("DriverUnavailability")
        .select([
            "id",
            "driver_uuid",
            "date_unavailable",
            "updated_at"
        ])
        .where("driver_uuid", "=", driverId)
        .orderBy("date_unavailable", "asc")
        .compile();
    }, [driverData.data]);

    const unavailabilityData = useTypedQuery(compiledUnavailability, expect<UnavailabilityDates>());

    return { unavailableDates: unavailabilityData.data ?? null };
}