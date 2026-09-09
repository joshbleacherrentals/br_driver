/**
 * What an inspection actually writes about damage.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * This is the step where the feature either works or quietly does nothing:
 * a driver who ticked existing reports must leave a record that they saw the
 * damage — and must NOT leave a fourth report about it. Both halves matter, and
 * neither is visible on the screen afterwards, so they are pinned here.
 *
 * Also pinned: an acknowledgement failing must not take the inspection down
 * with it. The inspection row and its work-tracker link are already committed
 * by this point; the ack is a count, and a count is not worth an error dialog
 * on a submitted inspection.
 */

import { acknowledgeDamageReports } from "@/features/damage-report/utils/acknowledgeDamageReports";
import { commitInspectionDamage } from "@/features/damage-report/utils/commitInspectionDamage";
import { commitDamageReport } from "@/features/damage-report/utils/createDamageReport";
import type { DriverScope } from "@/library/powersync/scoping";

jest.mock("@/features/damage-report/utils/createDamageReport", () => ({
  __esModule: true,
  commitDamageReport: jest.fn(),
}));

jest.mock("@/features/damage-report/utils/acknowledgeDamageReports", () => ({
  __esModule: true,
  acknowledgeDamageReports: jest.fn(),
}));

const mockCommitReport = commitDamageReport as jest.MockedFunction<
  typeof commitDamageReport
>;
const mockAcknowledge = acknowledgeDamageReports as jest.MockedFunction<
  typeof acknowledgeDamageReports
>;

const scope = { userUuid: "user-a", driverUuid: "driver-a" } as DriverScope;
const draft = { damageId: "new-report", photos: [] } as never;

const base = {
  draft: null as never,
  fields: {
    bleacherUuid: "b1",
    inspectionUuid: "insp-1",
    seatDamage: null,
    haulDamage: null,
    note: "",
    scope,
  },
  acknowledgedIds: [] as string[],
  inspectionUuid: "insp-1",
  workTrackerUuid: "wt-1",
  scope,
};

beforeEach(() => {
  mockCommitReport.mockResolvedValue({
    ok: true,
    damageId: "new-report",
    savedPhotoCount: 1,
    failures: [],
  });
  mockAcknowledge.mockResolvedValue(undefined);
});

describe("when the driver ticked existing reports", () => {
  it("writes no new damage report", async () => {
    await commitInspectionDamage({ ...base, acknowledgedIds: ["r1", "r2"] });

    expect(mockCommitReport).not.toHaveBeenCalled();
  });

  it("records the acknowledgement against this inspection and trip", async () => {
    await commitInspectionDamage({ ...base, acknowledgedIds: ["r1", "r2"] });

    expect(mockAcknowledge).toHaveBeenCalledWith({
      reportIds: ["r1", "r2"],
      inspectionUuid: "insp-1",
      workTrackerUuid: "wt-1",
      scope,
    });
  });
});

describe("when the driver filed something new", () => {
  it("writes the report", async () => {
    await commitInspectionDamage({ ...base, draft });

    expect(mockCommitReport).toHaveBeenCalledTimes(1);
  });

  it("acknowledges nothing it was not asked to", async () => {
    await commitInspectionDamage({ ...base, draft });

    expect(mockAcknowledge).not.toHaveBeenCalled();
  });

  it("hands back the result, so a partial photo save can still be reported", async () => {
    mockCommitReport.mockResolvedValue({
      ok: true,
      damageId: "new-report",
      savedPhotoCount: 1,
      failures: [{ reason: "copy_failed" } as never],
    });

    const result = await commitInspectionDamage({ ...base, draft });

    expect(result?.ok && result.failures).toHaveLength(1);
  });
});

describe("when it was some of each", () => {
  it("does both — part of what the driver saw was already known", async () => {
    await commitInspectionDamage({
      ...base,
      draft,
      acknowledgedIds: ["r1"],
    });

    expect(mockCommitReport).toHaveBeenCalledTimes(1);
    expect(mockAcknowledge).toHaveBeenCalledTimes(1);
  });
});

describe("when acknowledging fails", () => {
  it("does not fail the submitted inspection", async () => {
    // The inspection row and its work-tracker link are already committed when
    // this runs. Throwing here would put an error in front of a driver whose
    // inspection is, in fact, saved.
    mockAcknowledge.mockRejectedValue(new Error("offline write failed"));

    await expect(
      commitInspectionDamage({ ...base, acknowledgedIds: ["r1"] }),
    ).resolves.toBeNull();
  });

  it("still writes the new report first", async () => {
    mockAcknowledge.mockRejectedValue(new Error("offline write failed"));

    const result = await commitInspectionDamage({
      ...base,
      draft,
      acknowledgedIds: ["r1"],
    });

    expect(mockCommitReport).toHaveBeenCalledTimes(1);
    expect(result?.ok).toBe(true);
  });
});
