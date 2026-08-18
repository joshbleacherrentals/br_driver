import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type UnavailabilityDates = {
    id: string;
    driver_uuid: string | null;
    date_unavailable: string | null;
    updated_at: string | null;
}

/**
 * The dates this driver has marked unavailable.
 *
 * Driver id from `useDriverScope()` (§15) rather than a locally repeated
 * Clerk → `Users` → `Drivers` chain.
 */
export function useDriverUnavailability(): { unavailableDates: UnavailabilityDates[] | null } {
  const scope = useDriverScope();

  const compiledUnavailability = useMemo(() => {
    if (!scope) return null;

    return db
      .selectFrom("DriverUnavailability")
      .select(["id", "driver_uuid", "date_unavailable", "updated_at"])
      .where("driver_uuid", "=", scope.driverUuid)
      .orderBy("date_unavailable", "asc")
      .compile();
  }, [scope]);

  const unavailabilityData = useTypedQuery(
    compiledUnavailability,
    expect<UnavailabilityDates>(),
  );

  return { unavailableDates: unavailabilityData.data ?? null };
}
