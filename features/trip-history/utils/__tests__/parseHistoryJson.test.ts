/**
 * Reading `WorkTrackers.history_json`, the snapshot Postgres writes when a trip
 * finishes (docs/specs/sync-bucket-limit.md §3).
 *
 * A finished trip's addresses, line items and inspections stop syncing to the
 * phone, so this snapshot is all Trip History has. It arrives as text written
 * by another system, possibly in a shape a later migration changes — anything
 * this build can't read comes back null, and history falls back to whatever
 * live rows are still on the device instead of rendering garbage.
 */

import { parseHistoryJson } from "@/features/trip-history/utils/parseHistoryJson";

/** What the migration writes for a completed trip, verbatim. */
const SNAPSHOT = JSON.stringify({
  version: 1,
  pick_up_address: "123 Main St, Calgary, AB T2P 1J9",
  drop_off_address: "9 Stadium Rd, Edmonton, AB",
  line_items: [
    {
      type: "hauling",
      quantity: 198.8,
      unit_amt_cents: 300,
      description: "198.8MI × $3.00/MI = $596.36",
    },
    {
      type: "setup",
      quantity: 1.0,
      unit_amt_cents: 5000,
      description: "Setup",
    },
  ],
  pre_inspection: {
    id: "insp-pre",
    created_at: "2026-09-01T08:00:00+00:00",
    walk_around_complete: true,
    issues_found: false,
    issue_description: null,
    answers_json: '{"q1":{"checked":true}}',
    bleacher_uuid: "bleacher-1",
  },
  post_inspection: null,
});

describe("parseHistoryJson", () => {
  it("reads a snapshot into the shapes Trip History already renders", () => {
    expect(parseHistoryJson(SNAPSHOT, "trip-1")).toEqual({
      pickupAddress: { street: "123 Main St, Calgary, AB T2P 1J9" },
      dropoffAddress: { street: "9 Stadium Rd, Edmonton, AB" },
      lineItems: [
        {
          id: "trip-1:line-0",
          work_tracker_uuid: "trip-1",
          type: "hauling",
          qty_decimal: 198.8,
          unit_amt_cents: 300,
          description: "198.8MI × $3.00/MI = $596.36",
          is_automatically_managed: null,
          created_at: null,
        },
        {
          id: "trip-1:line-1",
          work_tracker_uuid: "trip-1",
          type: "setup",
          qty_decimal: 1,
          unit_amt_cents: 5000,
          description: "Setup",
          is_automatically_managed: null,
          created_at: null,
        },
      ],
      preInspection: {
        id: "insp-pre",
        created_at: "2026-09-01T08:00:00+00:00",
        walk_around_complete: 1,
        issues_found: 0,
        issue_description: null,
        answers_json: '{"q1":{"checked":true}}',
        bleacher_uuid: "bleacher-1",
      },
      postInspection: null,
    });
  });

  it("has nothing to read for an active trip", () => {
    expect([parseHistoryJson(null, "t"), parseHistoryJson("", "t")]).toEqual([
      null,
      null,
    ]);
  });

  it("rejects text that isn't JSON rather than throwing", () => {
    expect(parseHistoryJson("{not json", "t")).toBeNull();
  });

  it("rejects a snapshot version this build doesn't know", () => {
    expect(
      parseHistoryJson(JSON.stringify({ version: 2, line_items: [] }), "t"),
    ).toBeNull();
  });

  it("rejects JSON that isn't a snapshot object", () => {
    expect([parseHistoryJson("[]", "t"), parseHistoryJson("42", "t")]).toEqual([
      null,
      null,
    ]);
  });

  it("reads missing or mistyped parts as absent, keeping the rest", () => {
    const parsed = parseHistoryJson(
      JSON.stringify({
        version: 1,
        pick_up_address: 42,
        line_items: "nope",
        pre_inspection: { walk_around_complete: true },
      }),
      "t",
    );

    expect(parsed).toEqual({
      pickupAddress: null,
      dropoffAddress: null,
      lineItems: [],
      preInspection: null,
      postInspection: null,
    });
  });
});
