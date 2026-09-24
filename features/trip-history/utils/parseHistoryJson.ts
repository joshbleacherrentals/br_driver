/**
 * `WorkTrackers.history_json` → what Trip History renders.
 *
 * A finished trip's addresses, line items and inspections no longer sync to
 * the phone (docs/specs/sync-bucket-limit.md); Postgres snapshots them into
 * this column instead. The output reuses the shapes history already takes from
 * the live tables, so the screens only swap where the data comes from:
 *
 *   - an address is `{ street }` holding the whole formatted line — the
 *     snapshot is already "street, city, state zip", and `formatAddress` hands a
 *     multi-part `street` back untouched;
 *   - line items are `WorkTrackerLineItem`s with synthetic ids;
 *   - inspections are `InspectionData`, booleans as the 0/1 SQLite reads.
 *
 * Null when there is no snapshot or this build can't read it — the caller
 * falls back to live rows.
 */

import type { InspectionData } from "@/hooks/db/useInspection";
import type { WorkTrackerLineItem } from "@/hooks/db/useWorkTrackerLineItems";
import type { FormattableAddress } from "@/utils/formatAddress";

export type TripHistorySnapshot = {
  pickupAddress: FormattableAddress | null;
  dropoffAddress: FormattableAddress | null;
  lineItems: WorkTrackerLineItem[];
  preInspection: InspectionData | null;
  postInspection: InspectionData | null;
};

/** The snapshot shape this build reads; the migration writes it as `version`. */
const SUPPORTED_VERSION = 1;

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function flag(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  return num(value);
}

function address(value: unknown): FormattableAddress | null {
  const line = str(value)?.trim();
  return line ? { street: line } : null;
}

function lineItems(value: unknown, trackerId: string): WorkTrackerLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isObject).map((item, index) => ({
    id: `${trackerId}:line-${index}`,
    work_tracker_uuid: trackerId,
    type: str(item.type),
    qty_decimal: num(item.quantity),
    unit_amt_cents: num(item.unit_amt_cents),
    description: str(item.description),
    is_automatically_managed: null,
    created_at: null,
  }));
}

function inspection(value: unknown): InspectionData | null {
  if (!isObject(value)) return null;
  const id = str(value.id);
  if (!id) return null;
  return {
    id,
    created_at: str(value.created_at),
    walk_around_complete: flag(value.walk_around_complete),
    issues_found: flag(value.issues_found),
    issue_description: str(value.issue_description),
    answers_json: str(value.answers_json),
    bleacher_uuid: str(value.bleacher_uuid),
  };
}

export function parseHistoryJson(
  raw: string | null | undefined,
  trackerId: string,
): TripHistorySnapshot | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(parsed) || parsed.version !== SUPPORTED_VERSION) return null;

  return {
    pickupAddress: address(parsed.pick_up_address),
    dropoffAddress: address(parsed.drop_off_address),
    lineItems: lineItems(parsed.line_items, trackerId),
    preInspection: inspection(parsed.pre_inspection),
    postInspection: inspection(parsed.post_inspection),
  };
}
