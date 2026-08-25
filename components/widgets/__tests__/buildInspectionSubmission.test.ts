import { buildInspectionSubmission } from "@/components/widgets/inspection/buildInspectionSubmission";

const ASSIGNED = "bleacher-assigned";
const TAKEN = "bleacher-taken";

/** A submission that changes nothing about the bleacher. */
function input(overrides: Partial<Parameters<typeof buildInspectionSubmission>[0]> = {}) {
  return {
    workTrackerId: "wt-1",
    inspectionId: "insp-1",
    inspectionType: "pickup" as const,
    now: "2026-08-25T10:00:00.000Z",
    assignedBleacherUuid: ASSIGNED,
    selectedBleacherUuid: ASSIGNED,
    confirmedBleacherUuid: null as string | null,
    changeReason: null as string | null,
    walkAroundComplete: true,
    damageFound: false,
    answersPayload: {},
    ...overrides,
  };
}

function ok(result: ReturnType<typeof buildInspectionSubmission>) {
  if (!result.ok) throw new Error(`expected ok, got ${result.error}`);
  return result;
}

describe("buildInspectionSubmission", () => {
  it("stamps the inspection with the bleacher it actually covered", () => {
    const result = ok(buildInspectionSubmission(input({ selectedBleacherUuid: TAKEN, changeReason: "hard_to_access" })));

    expect(result.inspectionRow).toMatchObject({
      id: "insp-1",
      bleacher_uuid: TAKEN,
    });
  });

  it("records the confirmed bleacher even when it is the assigned one", () => {
    // Null must keep meaning "not confirmed yet", so a match is written too.
    const result = ok(buildInspectionSubmission(input()));

    expect(result.workTrackerUpdate).toMatchObject({
      actual_bleacher_uuid: ASSIGNED,
      bleacher_change_reason: null,
    });
  });

  it("records the swap and its reason", () => {
    const result = ok(
      buildInspectionSubmission(
        input({ selectedBleacherUuid: TAKEN, changeReason: "blocked_by_other_units" }),
      ),
    );

    expect(result.workTrackerUpdate).toMatchObject({
      actual_bleacher_uuid: TAKEN,
      bleacher_change_reason: "blocked_by_other_units",
    });
  });

  it("refuses a swap with no reason given", () => {
    const result = buildInspectionSubmission(
      input({ selectedBleacherUuid: TAKEN, changeReason: null }),
    );

    expect(result).toEqual({ ok: false, error: "reason_required" });
  });

  it("refuses a reason code the database would reject", () => {
    const result = buildInspectionSubmission(
      input({ selectedBleacherUuid: TAKEN, changeReason: "because_i_said_so" }),
    );

    expect(result).toEqual({ ok: false, error: "unknown_reason" });
  });

  it("drops a reason left behind when the driver reverts to the assigned bleacher", () => {
    const result = ok(
      buildInspectionSubmission(
        input({ selectedBleacherUuid: ASSIGNED, changeReason: "damaged" }),
      ),
    );

    expect(result.workTrackerUpdate.bleacher_change_reason).toBeNull();
  });

  it("refuses to submit with no bleacher chosen", () => {
    const result = buildInspectionSubmission(
      input({ assignedBleacherUuid: null, selectedBleacherUuid: null }),
    );

    expect(result).toEqual({ ok: false, error: "no_bleacher_selected" });
  });

  it("leaves an already-confirmed bleacher alone", () => {
    // The dropoff inspection must not silently re-answer what pickup settled.
    const result = ok(
      buildInspectionSubmission(
        input({
          inspectionType: "dropoff",
          confirmedBleacherUuid: TAKEN,
          selectedBleacherUuid: TAKEN,
        }),
      ),
    );

    expect(result.workTrackerUpdate).not.toHaveProperty("actual_bleacher_uuid");
    expect(result.workTrackerUpdate).not.toHaveProperty("bleacher_change_reason");
  });

  it("still stamps the inspection when the bleacher was confirmed earlier", () => {
    const result = ok(
      buildInspectionSubmission(
        input({
          inspectionType: "dropoff",
          confirmedBleacherUuid: TAKEN,
          selectedBleacherUuid: TAKEN,
        }),
      ),
    );

    expect(result.inspectionRow.bleacher_uuid).toBe(TAKEN);
  });

  it("attaches a damage report to the bleacher actually inspected", () => {
    const result = ok(
      buildInspectionSubmission(
        input({
          selectedBleacherUuid: TAKEN,
          changeReason: "hard_to_access",
          damageFound: true,
        }),
      ),
    );

    expect(result.damageBleacherUuid).toBe(TAKEN);
    expect(result.inspectionRow.issues_found).toBe(1);
  });

  it("writes a pickup inspection to the pickup slot", () => {
    const result = ok(buildInspectionSubmission(input({ inspectionType: "pickup" })));

    expect(result.workTrackerUpdate).toMatchObject({
      pre_inspection_uuid: "insp-1",
      updated_at: "2026-08-25T10:00:00.000Z",
    });
    expect(result.workTrackerUpdate).not.toHaveProperty("post_inspection_uuid");
  });

  it("writes a dropoff inspection to the dropoff slot", () => {
    const result = ok(buildInspectionSubmission(input({ inspectionType: "dropoff" })));

    expect(result.workTrackerUpdate).toMatchObject({ post_inspection_uuid: "insp-1" });
    expect(result.workTrackerUpdate).not.toHaveProperty("pre_inspection_uuid");
  });

  it("carries the answers through as stored JSON", () => {
    const answersPayload = { q1: { question_text: "Tyres OK?", checked: true } };
    const result = ok(buildInspectionSubmission(input({ answersPayload })));

    expect(result.inspectionRow).toMatchObject({
      answers_json: JSON.stringify(answersPayload),
      walk_around_complete: 1,
      created_at: "2026-08-25T10:00:00.000Z",
    });
  });
});
