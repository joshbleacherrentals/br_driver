/**
 * Covers: the repair path for photos the bucket confirmed never arrived —
 * the gap left by §3/§6 (a row whose local file is gone can never be retried,
 * only replaced).
 *
 * The rules encoded here:
 *   - §6.2's verification requirement, extended to replacement: a row may only
 *     be replaced once a direct bucket check confirmed the object is absent.
 *     A `failed` status on its own is ambiguous (the upload may have landed and
 *     only the confirmation been lost), and replacing on that ambiguity would
 *     overwrite a photo that did arrive.
 *   - §3's "never deleted as a side effect": the *only* row a repair may delete
 *     is one already confirmed missing from the bucket, and never the last photo
 *     of a report.
 */

import {
  derivePhotoRepairActions,
  minimumPicksToKeepOnePhoto,
  planPhotoReplacement,
  sortForRepair,
  type RepairPhotoRow,
} from "@/library/photoUploadQueue/photoRepair";
import { MISSING_LOCAL_FILE_ERROR } from "@/library/photoUploadQueue/types";

const row = (
  id: string,
  overrides: Partial<RepairPhotoRow> = {},
): RepairPhotoRow => ({
  id,
  uploadStatus: "failed",
  lastError: null,
  createdAt: null,
  ...overrides,
});

const parked = (id: string, overrides: Partial<RepairPhotoRow> = {}) =>
  row(id, { lastError: MISSING_LOCAL_FILE_ERROR, ...overrides });

const EDITABLE = { editable: true };
const CLOSED = { editable: false };

describe("repair affordances (bucket-confirmed gate)", () => {
  it("offers nothing to replace before the bucket check has confirmed a row", () => {
    const actions = derivePhotoRepairActions(
      [row("a"), parked("b")],
      new Set(),
      EDITABLE,
    );

    expect(actions.replaceableRows).toEqual([]);
    expect(actions.canReplace).toBe(false);
  });

  it("offers replacement only for rows the bucket confirmed missing", () => {
    const actions = derivePhotoRepairActions(
      [row("a"), row("b"), row("c")],
      new Set(["b"]),
      EDITABLE,
    );

    expect(actions.replaceableRows.map((r) => r.id)).toEqual(["b"]);
    expect(actions.canReplace).toBe(true);
  });

  // The file is gone from the phone, so there is nothing left to retry with —
  // only a fresh photo can fix the row.
  it("hides Retry when every unresolved row is parked as file-missing", () => {
    const actions = derivePhotoRepairActions(
      [parked("a"), parked("b")],
      new Set(["a", "b"]),
      EDITABLE,
    );

    expect(actions.canRetry).toBe(false);
    expect(actions.canReplace).toBe(true);
  });

  // Repeated network failures: the local file is still there, so both fixes are
  // genuinely available.
  it("offers Retry and replacement together when the local file still exists", () => {
    const actions = derivePhotoRepairActions([row("a")], new Set(["a"]), EDITABLE);

    expect(actions.canRetry).toBe(true);
    expect(actions.canReplace).toBe(true);
  });

  it("keeps Retry available while one unresolved row still has a local file", () => {
    const actions = derivePhotoRepairActions(
      [parked("a"), row("b")],
      new Set(["a"]),
      EDITABLE,
    );

    expect(actions.canRetry).toBe(true);
  });

  // Replacement edits the record; delivery does not. A closed parent stops the
  // former and leaves the latter alone.
  it("withholds replacement on a closed parent but keeps Retry", () => {
    const actions = derivePhotoRepairActions([row("a")], new Set(["a"]), CLOSED);

    expect(actions.canReplace).toBe(false);
    expect(actions.canRetry).toBe(true);
    expect(actions.replaceableRows.map((r) => r.id)).toEqual(["a"]);
  });

  it("never touches a row that already reached the bucket", () => {
    const actions = derivePhotoRepairActions(
      [row("done", { uploadStatus: "uploaded", lastError: null })],
      new Set(["done"]),
      EDITABLE,
    );

    expect(actions.replaceableRows).toEqual([]);
    expect(actions.canRetry).toBe(false);
    expect(actions.canReplace).toBe(false);
  });
});

describe("stable pairing order", () => {
  it("orders oldest first", () => {
    const ordered = sortForRepair([
      row("c", { createdAt: "2026-08-07T09:00:00.000Z" }),
      row("a", { createdAt: "2026-08-01T09:00:00.000Z" }),
      row("b", { createdAt: "2026-08-05T09:00:00.000Z" }),
    ]);

    expect(ordered.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  // Locally written rows take `created_at` from the server default, so it is
  // null until the first sync round-trip — the pairing still has to be stable.
  it("falls back to id so undated rows still pair deterministically", () => {
    const undated = [row("z"), row("m"), row("a")];

    expect(sortForRepair(undated).map((r) => r.id)).toEqual(["a", "m", "z"]);
    expect(sortForRepair([...undated].reverse()).map((r) => r.id)).toEqual([
      "a",
      "m",
      "z",
    ]);
  });
});

describe("mapping picked photos onto confirmed-missing rows", () => {
  const rows = [
    row("old", { createdAt: "2026-08-01T09:00:00.000Z" }),
    row("mid", { createdAt: "2026-08-05T09:00:00.000Z" }),
    row("new", { createdAt: "2026-08-07T09:00:00.000Z" }),
  ];

  it("pairs one picked photo per row, oldest row first", () => {
    const plan = planPhotoReplacement({
      replaceableRows: rows,
      pickedCount: 3,
      existingPhotoCount: 3,
    });

    expect(plan.reuse).toEqual([
      { rowId: "old", pickedIndex: 0 },
      { rowId: "mid", pickedIndex: 1 },
      { rowId: "new", pickedIndex: 2 },
    ]);
    expect(plan.extras).toEqual([]);
    expect(plan.deletions).toEqual([]);
    expect(plan.resultingPhotoCount).toBe(3);
    expect(plan.violatesMinimum).toBe(false);
  });

  it("turns surplus picks into brand-new rows", () => {
    const plan = planPhotoReplacement({
      replaceableRows: [rows[0]],
      pickedCount: 3,
      existingPhotoCount: 4,
    });

    expect(plan.reuse).toEqual([{ rowId: "old", pickedIndex: 0 }]);
    expect(plan.extras).toEqual([1, 2]);
    expect(plan.deletions).toEqual([]);
    expect(plan.resultingPhotoCount).toBe(6);
  });

  it("deletes the confirmed-missing rows left unpaired", () => {
    const plan = planPhotoReplacement({
      replaceableRows: rows,
      pickedCount: 1,
      existingPhotoCount: 3,
    });

    expect(plan.reuse).toEqual([{ rowId: "old", pickedIndex: 0 }]);
    expect(plan.deletions).toEqual(["mid", "new"]);
    expect(plan.resultingPhotoCount).toBe(1);
    expect(plan.violatesMinimum).toBe(false);
  });

  // A repair must never be able to empty the record it is repairing.
  it("flags a plan that would leave the report with no photos", () => {
    const plan = planPhotoReplacement({
      replaceableRows: rows,
      pickedCount: 0,
      existingPhotoCount: 3,
    });

    expect(plan.reuse).toEqual([]);
    expect(plan.deletions).toEqual(["old", "mid", "new"]);
    expect(plan.resultingPhotoCount).toBe(0);
    expect(plan.violatesMinimum).toBe(true);
  });

  it("allows emptying the repairable rows when healthy photos remain", () => {
    const plan = planPhotoReplacement({
      replaceableRows: rows,
      pickedCount: 0,
      existingPhotoCount: 4,
    });

    expect(plan.resultingPhotoCount).toBe(1);
    expect(plan.violatesMinimum).toBe(false);
  });
});

describe("minimum picks the driver must make", () => {
  it("requires one pick when every photo is repairable", () => {
    expect(
      minimumPicksToKeepOnePhoto({ replaceableCount: 2, existingPhotoCount: 2 }),
    ).toBe(1);
  });

  it("requires none when a healthy photo already survives", () => {
    expect(
      minimumPicksToKeepOnePhoto({ replaceableCount: 1, existingPhotoCount: 2 }),
    ).toBe(0);
  });
});
