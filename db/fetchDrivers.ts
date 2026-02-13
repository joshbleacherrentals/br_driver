import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";
import { useUser } from "@clerk/clerk-expo"
import { UserData } from "./workTrackers"


export type DriverData = {
    id: string;
    created_at: string | null;
    tax: number | null;
    pay_rate_cents: number | null;
    pay_currency: string | null;
    pay_per_unit: string | null;
    is_active: number | null;
    account_manager_uuid: string | null;
    user_uuid: string | null;
    phone_number: string | null;
    address_uuid: string | null;
    license_photo_path: string | null;
    insurance_photo_path: string | null;
    medical_card_photo_path: string | null;
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

/**
 * Fetch DriverData belonging to the user_id
 */
export function fetchDriver(): { driver: DriverData | null | undefined } {
  const { user, isLoaded: isUserLoaded } = useUser();
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

  const userQueryResult = useTypedQuery(compiled, expect<UserData>());

  const compiledDriver = useMemo(() => {
    const userId = userQueryResult.data?.[0]?.id;
    if (!userId) return null;

    return db
    .selectFrom("Drivers")
    .select([
        "id",
        "created_at",
        "tax",
        "pay_rate_cents",
        "pay_currency",
        "pay_per_unit",
        "is_active",
        "account_manager_uuid",
        "user_uuid",
        "phone_number",
        "address_uuid",
        "license_photo_path",
        "insurance_photo_path",
        "medical_card_photo_path",
        "vehicle_uuid"
    ])
    .where("user_uuid", "=", userId)
    .limit(1)
    .compile();
  }, [userQueryResult.data]);

  const driverQueryResult = useTypedQuery(compiledDriver, expect<DriverData>());

  console.log('[fetchDriver] Driver found!', driverQueryResult.data?.[0]);
  return { driver: driverQueryResult.data?.[0] ?? null };
}

/**
 * Fetch Vehicle Info belonging to the id
 */
export function fetchVehicle(vehicle_id: string | null): { vehicle: VehicleData | null | undefined } {

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

  const vehicleQueryResult = useTypedQuery(compiled, expect<VehicleData>());

  if (!compiled || vehicleQueryResult.isLoading) {
    return { vehicle: undefined };
  }

  return { vehicle: vehicleQueryResult.data?.[0] ?? null };
}