/**
 * What kind of work a tracker is.
 *
 * The office picks one of three non-deleted `WorkTrackerTypes` rows per
 * tracker. The row's uuid is what `WorkTrackers.work_tracker_type_uuid` points
 * at, but the app never branches on a uuid or on `display_name` — both are
 * office-editable — only on the stable `code` enum.
 *
 * The shapes differ, not just the colour:
 *
 * - **Trip** — two legs. A pick up (time, address, POC, instructions) and a
 *   drop off, with an inspection at each end.
 * - **Repair / Maintenance** and **Site Visit / Cleaning / Other** — one stop
 *   and no inspection at all. Nothing is hauled: the bleacher stays where it
 *   stands and the driver goes to it, so there is no unit changing hands to
 *   document. One time, one address, one set of instructions, read off the
 *   `dropoff_*` columns — which the office picked to avoid inventing a third
 *   set, not because anything is dropped off.
 */
export type WorkTrackerKind =
  "trip" | "repair_maintenance" | "site_visit_cleaning_other";

const KNOWN_KINDS: ReadonlySet<string> = new Set<WorkTrackerKind>([
  "trip",
  "repair_maintenance",
  "site_visit_cleaning_other",
]);

/**
 * The kind behind a `WorkTrackerTypes.code`.
 *
 * Anything the app cannot place — no type at all, a type row that has not
 * synced yet, a code added to the enum after this build shipped — is a trip:
 * the two-leg shape every tracker had before types existed, and the only one
 * that can render a row with both legs filled in without hiding data.
 */
export function workTrackerKind(
  code: string | null | undefined,
): WorkTrackerKind {
  if (code && KNOWN_KINDS.has(code)) return code as WorkTrackerKind;
  return "trip";
}

/** Whether this kind is one stop — one time, one address, one set of notes. */
export function isSingleLeg(kind: WorkTrackerKind): boolean {
  return kind !== "trip";
}

/**
 * Whether the driver inspects the bleacher on this kind of work.
 *
 * Only a trip does. An inspection records the condition a unit changed hands
 * in; a repair or a site visit never moves one, so asking for one would be
 * paperwork with no counterparty.
 */
export function tripHasInspections(kind: WorkTrackerKind): boolean {
  return kind === "trip";
}

/** A `WorkTrackerTypes` row, as far as the kind is concerned. */
export type WorkTrackerTypeRow = {
  id: string;
  code?: string | null;
};

/**
 * The three live `WorkTrackerTypes` rows, by uuid.
 *
 * A fallback, not the source of truth: `WorkTrackerTypes` is tiny and syncs to
 * every phone, but a device that already holds a driver's trackers and not yet
 * that table would draw every repair and site visit as a two-leg haul — wrong
 * stops, wrong paperwork, an inspection the job does not have. These uuids are
 * stable production rows; the synced `code` always wins over them.
 */
const FALLBACK_KIND_BY_TYPE_UUID: Readonly<Record<string, WorkTrackerKind>> = {
  "e3c00371-897d-4a80-93da-66f374deaa2d": "trip",
  "42726bce-e191-45b1-8082-c297a9ca128a": "repair_maintenance",
  "cbffa6a5-d397-48d3-8bda-c50c6dfe0151": "site_visit_cleaning_other",
};

/**
 * The kind of the tracker pointing at `typeUuid`.
 *
 * Everything unresolvable lands on `trip` through `workTrackerKind`: a tracker
 * with no type, a type the app has never heard of, and the retired types
 * ("Deadhead", "Hotel / Per Diem", …) that were never given a code.
 */
export function resolveWorkTrackerKind(
  typeUuid: string | null | undefined,
  types: readonly WorkTrackerTypeRow[] | null | undefined,
): WorkTrackerKind {
  if (!typeUuid) return "trip";

  const synced = types?.find((type) => type.id === typeUuid);
  if (synced) return workTrackerKind(synced.code);

  return FALLBACK_KIND_BY_TYPE_UUID[typeUuid] ?? "trip";
}
