import { db } from "@/library/powersync/db";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import {
  resolveWorkTrackerKind,
  type WorkTrackerKind,
} from "@/utils/workTrackerKind";
import { useMemo } from "react";

/**
 * `WorkTrackerTypes` — what kind of work a tracker is.
 *
 * The whole table ships to every phone (single digits of rows, see the mobile
 * stream in `br_powersync/config/sync_rules.yaml`), so the lookup is a local
 * read like everything else and works with the radio off.
 */
export type WorkTrackerTypeData = {
  id: string;
  code: string | null;
  display_name: string | null;
};

const WORK_TRACKER_TYPE_COLUMNS = ["id", "code", "display_name"] as const;

/** Every type the office can pick from, deleted ones included. */
export function useWorkTrackerTypes(): {
  types: WorkTrackerTypeData[] | null;
} {
  // Trackers created before a type was retired still point at it, so the
  // deleted rows have to be here too — otherwise those trips would lose their
  // kind the day someone tidies up the list.
  const compiled = useMemo(
    () =>
      db
        .selectFrom("WorkTrackerTypes")
        .select([...WORK_TRACKER_TYPE_COLUMNS])
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<WorkTrackerTypeData>());

  return { types: data ?? null };
}

/**
 * The kind of one tracker — what the whole trip card, its bill of lading and
 * its history row are shaped around.
 *
 * Answers `trip` until the types table is there to say otherwise, which is
 * also what a tracker with no type at all is.
 */
export function useWorkTrackerKind(
  workTrackerTypeUuid: string | null | undefined,
): WorkTrackerKind {
  const { types } = useWorkTrackerTypes();

  return useMemo(
    () => resolveWorkTrackerKind(workTrackerTypeUuid, types),
    [workTrackerTypeUuid, types],
  );
}
