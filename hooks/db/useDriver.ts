import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useUser } from "@clerk/clerk-expo";
import { useMemo } from "react";
import { UserData } from "./useWorkTrackers";


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

/**
 * Fetch DriverData belonging to the user_id
 */
export function useDriver(): { driver: DriverData | null } {
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

  const compiledDriver = useMemo(() => {
    const userId = userData.data?.[0]?.id;
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
        "license_expires_on",
        "insurance_expires_on",
        "medical_card_expires_on",
        "vehicle_uuid"
    ])
    .where("user_uuid", "=", userId)
    .limit(1)
    .compile();
  }, [userData.data]);

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