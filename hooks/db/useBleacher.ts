import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { sql } from "kysely";
import { useMemo } from "react";

export type BleacherData = {
  id: string;
  created_at: string | null;
  bleacher_number: string | null;
  bleacher_rows: number | null;
  bleacher_seats: number | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  linxup_device_id: string | null;
  summer_account_manager_uuid: string | null;
  winter_account_manager_uuid: string | null;
  summer_home_base_uuid: string | null;
  winter_home_base_uuid: string | null;
  hitch_type: string | null;
  vin_number: string | null;
  tag_number: string | null;
  manufacturer: string | null;
  height_folded_ft: number | null;
  trailer_length: number | null;
  gvwr: number | null;
  opening_direction: string | null;
  trailer_length_in: number | null;
  trailer_height_in: number | null;
};

/**
 * Fetch BleacherData belonging to the bleacher_id
 */
export function useBleacher(bleacher_id: string | null): {
  bleacher: BleacherData | null;
} {
  // 1. Get user_id from Users table
  const compiled = useMemo(() => {
    if (!bleacher_id) return null;

    return db
      .selectFrom("Bleachers")
      .select([
        "id",
        "created_at",
        "bleacher_number",
        "bleacher_rows",
        "bleacher_seats",
        "created_by",
        "updated_at",
        "updated_by",
        "linxup_device_id",
        "summer_account_manager_uuid",
        "winter_account_manager_uuid",
        "summer_home_base_uuid",
        "winter_home_base_uuid",
        "hitch_type",
        "vin_number",
        "tag_number",
        "manufacturer",
        "height_folded_ft",
        "trailer_length",
        "gvwr",
        "opening_direction",
        "trailer_height_in",
        "trailer_length_in",
      ])
      .where("id", "=", bleacher_id)
      .limit(1)
      .compile();
  }, [bleacher_id]);

  const bleacherData = useTypedQuery(compiled, expect<BleacherData>());

  return { bleacher: bleacherData.data?.[0] ?? null };
}

export function useBatchBleachers(
  bleacherIds: (string | null)[],
): Record<string, BleacherData | null> {
  // Filter out nulls and get unique IDs
  const uniqueIds = useMemo(() => {
    return Array.from(
      new Set(bleacherIds.filter((id): id is string => id !== null)),
    );
  }, [bleacherIds]);
  const compiled = useMemo(() => {
    if (uniqueIds.length === 0) return null;

    return db
      .selectFrom("Bleachers")
      .select([
        "id",
        "created_at",
        "bleacher_number",
        "bleacher_rows",
        "bleacher_seats",
        "created_by",
        "updated_at",
        "updated_by",
        "linxup_device_id",
        "summer_account_manager_uuid",
        "winter_account_manager_uuid",
        "summer_home_base_uuid",
        "winter_home_base_uuid",
        "hitch_type",
        "vin_number",
        "tag_number",
        "manufacturer",
        "height_folded_ft",
        "trailer_length",
        "gvwr",
        "opening_direction",
        "trailer_height_in",
        "trailer_length_in",
      ])
      .where("id", "in", uniqueIds)
      .compile();
  }, [uniqueIds]);

  const bleacherData = useTypedQuery(compiled, expect<BleacherData>());

  return useMemo(() => {
    const result: Record<string, BleacherData | null> = {};
    bleacherData.data?.forEach((bleacher) => {
      result[bleacher.id] = bleacher;
    });
    return result;
  }, [bleacherData.data]);
}

/**
 * Fetch every bleacher in the fleet, sorted by bleacher_number ascending.
 * Use this to populate the BleacherDropdown options.
 */
export function useAllBleachers(): { bleachers: BleacherData[] } {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Bleachers")
        .select([
          "id",
          "created_at",
          "bleacher_number",
          "bleacher_rows",
          "bleacher_seats",
          "created_by",
          "updated_at",
          "updated_by",
          "linxup_device_id",
          "summer_account_manager_uuid",
          "winter_account_manager_uuid",
          "summer_home_base_uuid",
          "winter_home_base_uuid",
          "hitch_type",
          "vin_number",
          "tag_number",
          "manufacturer",
          "height_folded_ft",
          "trailer_length",
          "gvwr",
          "opening_direction",
          "trailer_length_in",
          "trailer_height_in",
        ])
        .orderBy(sql`CAST(bleacher_number AS INTEGER)`, "asc")
        .compile(),
    [],
  );

  const result = useTypedQuery(compiled, expect<BleacherData>());
  return { bleachers: result.data ?? [] };
}
