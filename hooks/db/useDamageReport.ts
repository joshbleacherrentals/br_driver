import { useDriverScope } from "@/hooks/useDriverScope";
import { db } from "@/library/powersync/db";
import {
  crossDriverRead,
  damageReportsOf,
  type DriverScope,
} from "@/library/powersync/scoping";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useMemo } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DamageReportData = {
  id: string;
  inspection_uuid: string | null;
  bleacher_uuid: string | null;
  is_safe_to_sit: number | null;
  is_safe_to_haul: number | null;
  seat_damage: string | null;
  haul_damage: string | null;
  note: string | null;
  created_at: string | null;
  resolved_at: string | null;
  maintenance_event_uuid: string | null;
  created_by_user_uuid: string | null;
};

const DAMAGE_REPORT_COLUMNS = [
  "id",
  "inspection_uuid",
  "bleacher_uuid",
  "is_safe_to_sit",
  "is_safe_to_haul",
  "seat_damage",
  "haul_damage",
  "note",
  "created_at",
  "resolved_at",
  "maintenance_event_uuid",
  "created_by_user_uuid",
] as const;

/**
 * Why the three bleacher/inspection lookups below are NOT driver-scoped.
 *
 * §15 scopes reads that answer "which photos is *my* queue responsible for".
 * These answer a different question — "what is wrong with this bleacher" — and
 * the honest answer spans drivers: a driver hauling a bleacher needs to see
 * damage a different driver reported on it, which is what feeds the damage
 * badges and `inspectionSummaryWidget`'s `DamageCard`. Scoping them would hide
 * exactly the information the screen exists to show.
 *
 * They are wrapped in `crossDriverRead` rather than simply left unfiltered so
 * that being unscoped is a decision with a written reason attached, and so
 * `grep crossDriverRead` enumerates every such read in the codebase.
 */
const BLEACHER_DAMAGE_IS_SHARED =
  "bleacher damage is visible to any driver hauling that bleacher — it feeds " +
  "the damage badges and inspection summary, not the upload queue";

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Returns the most-recent **unresolved** damage report for a given bleacher,
 * or `null` if the bleacher is damage-free (or the id is unknown).
 *
 * "Unresolved" means `resolved_at IS NULL`. Cross-driver by design — see
 * {@link BLEACHER_DAMAGE_IS_SHARED}.
 */
export function useDamageReport(bleacher_uuid: string | null | undefined): {
  damageReport: DamageReportData | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!bleacher_uuid) return null;

    return crossDriverRead(
      BLEACHER_DAMAGE_IS_SHARED,
      db
        .selectFrom("DamageReports")
        .select([...DAMAGE_REPORT_COLUMNS])
        .where("bleacher_uuid", "=", bleacher_uuid)
        .where("resolved_at", "is", null)
        .orderBy("created_at", "desc")
        .limit(1),
    ).compile();
  }, [bleacher_uuid]);

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<DamageReportData>(),
  );

  return {
    damageReport: data?.[0] ?? null,
    isLoading,
  };
}

/**
 * Returns ALL unresolved damage reports for a given bleacher, newest-first.
 * Cross-driver by design — see {@link BLEACHER_DAMAGE_IS_SHARED}.
 */
export function useDamageReports(bleacher_uuid: string | null | undefined): {
  damageReports: DamageReportData[];
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!bleacher_uuid) return null;

    return crossDriverRead(
      BLEACHER_DAMAGE_IS_SHARED,
      db
        .selectFrom("DamageReports")
        .select([...DAMAGE_REPORT_COLUMNS])
        .where("bleacher_uuid", "=", bleacher_uuid)
        .where("resolved_at", "is", null)
        .orderBy("created_at", "desc"),
    ).compile();
  }, [bleacher_uuid]);

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<DamageReportData>(),
  );

  return {
    damageReports: data ?? [],
    isLoading,
  };
}

/**
 * Returns the damage report tied to a specific inspection, for use in
 * inspection summaries. Cross-driver by design — the summary is rendered for
 * whichever inspection the screen is showing, and the damage on it belongs to
 * the bleacher, not to the reader (see {@link BLEACHER_DAMAGE_IS_SHARED}).
 */
export function useDamageReportByInspection(
  inspection_uuid: string | null | undefined,
): {
  damageReport: DamageReportData | null;
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!inspection_uuid) return null;

    return crossDriverRead(
      BLEACHER_DAMAGE_IS_SHARED,
      db
        .selectFrom("DamageReports")
        .select([...DAMAGE_REPORT_COLUMNS])
        .where("inspection_uuid", "=", inspection_uuid)
        .orderBy("created_at", "desc")
        .limit(1),
    ).compile();
  }, [inspection_uuid]);

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<DamageReportData>(),
  );

  return {
    damageReport: data?.[0] ?? null,
    isLoading,
  };
}

/**
 * The query behind {@link useDamageReportById}, exported separately so it can
 * be exercised directly against a database in tests.
 *
 * §15 — scoped, unlike the bleacher lookups above. This one is reached with an
 * id the caller supplies, and its single caller (`DamageReportScreen`) takes
 * that id from `useLocalSearchParams()`. It is also the read whose result
 * decides which rows `usePhotoRepair` may Retry/Replace, so "any report id
 * renders and becomes writable" was the concrete gap here.
 */
export function buildDamageReportByIdQuery(
  scope: DriverScope,
  damageReportId: string,
) {
  return damageReportsOf(scope)
    .select([...DAMAGE_REPORT_COLUMNS])
    .where("id", "=", damageReportId)
    .limit(1);
}

/**
 * Returns a single damage report by its ID, if the signed-in driver created it.
 *
 * `null` covers three cases the caller must not distinguish by guessing: no
 * scope resolved yet, no such report, and a report belonging to another driver.
 * `isLoading` is what tells them apart in time.
 */
export function useDamageReportById(damageReportId: string | null | undefined): {
  damageReport: DamageReportData | null;
  isLoading: boolean;
} {
  const scope = useDriverScope();

  const compiled = useMemo(
    () =>
      scope && damageReportId
        ? buildDamageReportByIdQuery(scope, damageReportId).compile()
        : null,
    [scope, damageReportId],
  );

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<DamageReportData>(),
  );

  return {
    damageReport: data?.[0] ?? null,
    // A query that has not been built yet has not finished loading either —
    // otherwise the screen would read "not found" during the scope's first
    // frames and flash a not-available state at its own driver.
    isLoading: isLoading || (!!damageReportId && !scope),
  };
}

/**
 * Bucket paths of the photos on a damage report, for read-only display.
 *
 * Cross-driver by design, and the counterpart to `useDamageReportPhotos` rather
 * than a duplicate of it. That hook is the *owner's* view: it carries upload
 * status and feeds `usePhotoRepair`'s Retry/Replace, so it is scoped (§15).
 * This one exists for `inspectionSummaryWidget`'s `DamageCard`, which renders
 * thumbnails for a report already surfaced by the cross-driver
 * `useDamageReports(bleacher_uuid)` — scoping it would show a damage card with
 * its photos silently missing. It returns paths only: nothing here can be
 * retried, replaced or written to.
 *
 * It previously lived inside `inspectionSummaryWidget.tsx` as a second local
 * hook *also* called `useDamageReportPhotos`, written in raw SQL through
 * `usePowerSyncQuery`. Two different hooks under one name, one scoped and one
 * not, is precisely the confusion §15 exists to prevent.
 */
export function useDamageReportPhotoPaths(
  damageReportId: string | null | undefined,
): { photoPaths: string[]; isLoading: boolean } {
  const compiled = useMemo(() => {
    if (!damageReportId) return null;

    return crossDriverRead(
      BLEACHER_DAMAGE_IS_SHARED,
      db
        // The one sanctioned unscoped read of this table, and the reason the
        // escape hatch is an inline disable rather than a source in
        // `scopedFrom.ts`: it must stay conspicuous and countable. See the
        // `crossDriverRead` reason above for why display-only paths are shared.
        // eslint-disable-next-line no-restricted-syntax -- §15 cross-driver by design
        .selectFrom("DamageReportPhotos")
        .select(["photo_path"])
        .where("damage_report_uuid", "=", damageReportId)
        .where("photo_path", "is not", null)
        .orderBy("created_at", "asc"),
    ).compile();
  }, [damageReportId]);

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<{ photo_path: string | null }>(),
  );

  const photoPaths = useMemo(
    () => (data ?? []).flatMap((row) => (row.photo_path ? [row.photo_path] : [])),
    [data],
  );

  return { photoPaths, isLoading };
}

/**
 * Returns damage reports created by the given user, newest first.
 * If no userUuid provided, returns empty.
 */
export function useMyDamageReports(userUuid: string | null | undefined): {
  damageReports: DamageReportData[];
  isLoading: boolean;
} {
  const compiled = useMemo(() => {
    if (!userUuid) return null;

    return db
      .selectFrom("DamageReports")
      .select([...DAMAGE_REPORT_COLUMNS])
      .where("created_by_user_uuid", "=", userUuid)
      .orderBy("created_at", "desc")
      .compile();
  }, [userUuid]);

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<DamageReportData>(),
  );

  return {
    damageReports: data ?? [],
    isLoading,
  };
}
