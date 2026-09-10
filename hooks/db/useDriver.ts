import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";


export type DriverData = {
    id: string;
    created_at: string | null;
    /** Tax rate in percent, 3 decimals — `Drivers.tax_dec`. */
    tax_dec: number | null;
    pay_rate_cents: number | null;
    pay_currency: string | null;
    pay_per_unit: string | null;
    deadhead_cents: number | null;
    setup_cents: number | null;
    teardown_cents: number | null;
    is_active: number | null;
    account_manager_uuid: string | null;
    user_uuid: string | null;
    phone_number: string | null;
    address_uuid: string | null;
    license_photo_path: string | null;
    insurance_photo_path: string | null;
    medical_card_photo_path: string | null;
    license_expires_on: string | null;
    insurance_expires_on: string | null;
    medical_card_expires_on: string | null;
    vehicle_uuid: string | null;
};

export type VehicleData = {
  id: string;
  created_at: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin_number: string | null
};

export type DriverPayRangeData = {
  id: string;
  driver_uuid: string | null;
  min_value: number | null;
  max_value: number | null;
  rate: number | null;
};

/**
 * The signed-in driver's full `Drivers` row.
 *
 * Not a wrapper around `useDriverScope()` — it returns the whole row (pay,
 * vehicle, document paths and expiries), which the scope deliberately does not
 * carry. What it no longer does is re-derive *which* driver that is: it used to
 * run its own Clerk → `Users` → `Drivers` chain, the third copy of a lookup
 * `CurrentDriverScopePublisher` already performs once for the whole app. It now
 * starts from the published scope and asks one question instead of two.
 */
export function useDriver(): { driver: DriverData | null } {
  const scope = useDriverScope();

  const compiledDriver = useMemo(() => {
    if (!scope) return null;

    return db
    .selectFrom("Drivers")
    .select([
        "id",
        "created_at",
        "tax_dec",
        "pay_rate_cents",
        "pay_currency",
        "pay_per_unit",
        "deadhead_cents",
        "setup_cents",
        "teardown_cents",
        "is_active",
        "account_manager_uuid",
        "user_uuid",
        "phone_number",
        "address_uuid",
        "license_photo_path",
        "insurance_photo_path",
        "medical_card_photo_path",
        "license_expires_on",
        "insurance_expires_on",
        "medical_card_expires_on",
        "vehicle_uuid"
    ])
    .where("id", "=", scope.driverUuid)
    .limit(1)
    .compile();
  }, [scope]);

  const DriverData = useTypedQuery(compiledDriver, expect<DriverData>());

  return { driver: DriverData.data?.[0] ?? null };
}

/**
 * Fetch Vehicle Info belonging to the id
 */
export function useVehicle(vehicle_id: string | null): { vehicle: VehicleData | null } {

  const compiled = useMemo(() => {
    if (!vehicle_id) return null;

    return db
    .selectFrom("Vehicles")
    .select([
        "id",
        "created_at",
        "make",
        "model",
        "year",
        "vin_number"
    ])
    .where("id", "=", vehicle_id)
    .limit(1)
    .compile();
  }, [vehicle_id]);

  const vehicleData = useTypedQuery(compiled, expect<VehicleData>());

  return { vehicle: vehicleData.data?.[0] ?? null };
}

/**
 * Fetch the driver's tiered pay ranges (min/max distance -> rate), ordered
 * from lowest to highest range. Empty when the driver has a flat pay rate.
 */
export function useDriverPayRanges(driverId: string | null): {
  payRanges: DriverPayRangeData[];
} {
  const compiled = useMemo(() => {
    if (!driverId) return null;

    return db
      .selectFrom("DriverPayRanges")
      .select(["id", "driver_uuid", "min_value", "max_value", "rate"])
      .where("driver_uuid", "=", driverId)
      .orderBy("min_value", "asc")
      .compile();
  }, [driverId]);

  const payRangeData = useTypedQuery(compiled, expect<DriverPayRangeData>());

  return { payRanges: payRangeData.data ?? [] };
}