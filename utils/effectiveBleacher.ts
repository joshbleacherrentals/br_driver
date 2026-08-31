/**
 * Which bleacher a trip is really about.
 *
 * A manager assigns one (`bleacher_uuid`); at the warehouse the driver may take
 * an equivalent unit that is easier to get to and confirms it at inspection
 * (`actual_bleacher_uuid`). Anything describing the physical trailer — the
 * inspection, damage reports, the badge on the trip card — must read through
 * here.
 *
 * Two deliberate exceptions keep the assigned bleacher: the Bill of Lading,
 * which prints the trip as dispatched, and everything on the web side
 * (events, availability, conflicts).
 */

type BleacherAssignment = {
  bleacher_uuid: string | null;
  actual_bleacher_uuid: string | null;
};

export function getEffectiveBleacherUuid(
  workTracker: BleacherAssignment | null | undefined,
): string | null {
  if (!workTracker) return null;
  return workTracker.actual_bleacher_uuid ?? workTracker.bleacher_uuid;
}

/**
 * True only once the driver has confirmed a *different* bleacher. An
 * unconfirmed trip is not a swap — `actual_bleacher_uuid` is null then, which
 * means "not confirmed yet", never "same as assigned".
 */
export function isSwappedBleacher(
  workTracker: BleacherAssignment | null | undefined,
): boolean {
  if (!workTracker?.actual_bleacher_uuid) return false;
  return workTracker.actual_bleacher_uuid !== workTracker.bleacher_uuid;
}
