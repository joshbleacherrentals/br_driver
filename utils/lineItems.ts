/**
 * Presentation helpers for `WorkTrackerLineItems`.
 *
 * Kept out of the widget so the label map has one home: the same strings are
 * read by the pay-breakdown sheet on an active trip and on a completed one.
 */

/**
 * Human labels for `work_tracker_line_item_type`.
 *
 * The column syncs as text (PowerSync has no enum column), so an unknown value
 * is possible if the Postgres enum grows before the app ships — `lineItemLabel`
 * falls back to title-casing rather than showing a blank.
 */
const TYPE_LABELS: Record<string, string> = {
  hauling: "Hauling",
  deadhead: "Deadhead",
  setup: "Setup",
  teardown: "Teardown",
  maintenance: "Maintenance",
  per_diem: "Per Diem",
};

export function lineItemLabel(type: string | null): string {
  if (!type) return "Other";
  return (
    TYPE_LABELS[type] ??
    type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}

/**
 * `12345` → `"$123.45"`, `-2500` → `"-$25.00"`.
 *
 * Null/undefined reads as `$0.00`, not "—": a missing amount in a money column
 * is zero, and the sheet sums these. The sign leads the `$` because a negative
 * line (a deduction) should read as negative money at a glance.
 */
export function formatCents(cents: number | null | undefined): string {
  const value = cents ?? 0;
  const sign = value < 0 ? "-" : "";
  return `${sign}$${(Math.abs(value) / 100).toFixed(2)}`;
}

/**
 * A line's own total: unit price × quantity, in cents.
 *
 * Reads `qty_decimal`, not the deprecated integer `quantity`. Because the
 * quantity can now be fractional, the product is rounded: 0.3 × 1000 is
 * 299.99999999999994 in IEEE 754, and a total in cents has no room for that.
 */
export function lineItemTotalCents(item: {
  qty_decimal: number | null;
  unit_amt_cents: number | null;
}): number {
  return Math.round((item.unit_amt_cents ?? 0) * (item.qty_decimal ?? 0));
}
