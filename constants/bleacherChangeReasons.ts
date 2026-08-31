/**
 * Why a driver took a bleacher other than the one assigned.
 *
 * Codes, not free text — drivers will not type, and the web app has to render
 * the same list. The codes are mirrored by a CHECK constraint on
 * `WorkTrackers.bleacher_change_reason`, so adding one here means shipping a
 * migration too.
 */
export const BLEACHER_CHANGE_REASONS = [
  { code: "hard_to_access", label: "Hard to get to" },
  { code: "blocked_by_other_units", label: "Blocked by other bleachers" },
  { code: "damaged", label: "Assigned one is damaged" },
  { code: "not_on_site", label: "Not on site" },
  { code: "other", label: "Other" },
] as const;

export type BleacherChangeReason =
  (typeof BLEACHER_CHANGE_REASONS)[number]["code"];

export function bleacherChangeReasonLabel(code: string | null): string | null {
  if (!code) return null;
  return (
    BLEACHER_CHANGE_REASONS.find((r) => r.code === code)?.label ?? "Other"
  );
}
