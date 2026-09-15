import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

export type AddressData = {
  id: string;
  created_at: string | null;
  street: string | null;
  city: string | null;
  state_province: string | null;
  zip_postal: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
};

/**
 * Fetch Addresses belonging to the addressID
 */
export function useAddress(addressID: string | null): {
  address: AddressData | null;
} {
  // 1. Get user_id from Users table
  const compiled = useMemo(() => {
    if (!addressID) return null;

    return db
      .selectFrom("Addresses")
      .select([
        "id",
        "created_at",
        "street",
        "city",
        "state_province",
        "zip_postal",
        // The rest of the address, plus the geocode a maps app can be handed
        // directly — both read through utils/formatAddress.ts.
        "country",
        "latitude",
        "longitude",
        "place_id",
      ])
      .where("id", "=", addressID)
      .limit(1)
      .compile();
  }, [addressID]);

  const addressData = useTypedQuery(compiled, expect<AddressData>());

  return { address: addressData.data?.[0] ?? null };
}

export function useBatchAddresses(
  addressIds: (string | null)[],
): Record<string, AddressData | null> {
  // Filter out nulls and get unique IDs
  const uniqueIds = useMemo(() => {
    return Array.from(
      new Set(addressIds.filter((id): id is string => id !== null)),
    );
  }, [addressIds]);

  const compiled = useMemo(() => {
    if (uniqueIds.length === 0) return null;

    return db
      .selectFrom("Addresses")
      .select([
        "id",
        "created_at",
        "street",
        "city",
        "state_province",
        "zip_postal",
        "country",
        "latitude",
        "longitude",
        "place_id",
      ])
      .where("id", "in", uniqueIds)
      .compile();
  }, [uniqueIds]);

  const addressData = useTypedQuery(compiled, expect<AddressData>());

  return useMemo(() => {
    const result: Record<string, AddressData | null> = {};
    addressData.data?.forEach((addr) => {
      result[addr.id] = addr;
    });
    return result;
  }, [addressData.data]);
}
