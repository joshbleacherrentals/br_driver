/**
 * The damage step of an inspection, after "select all that apply".
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * Before this, `damage = yes` meant one thing: fill in a report. That is what
 * produced three to five reports about the same split plank — every driver who
 * saw it was required to describe it again.
 *
 * Now `yes` can be answered two ways, and the rule is that it must be answered
 * one of them: point at the reports that already describe it, or write a new
 * one. What must NOT be reachable is `yes` with neither — an inspection that
 * says damage was found and leaves no trace of what it was.
 *
 * The requirements for a NEW report are unchanged (a note and at least one
 * photo); the point is that they no longer apply when the driver is confirming
 * someone else's report, which already carries both.
 */

import { validateDamageStep } from "@/features/damage-report/utils/validateDamageStep";

const base = {
  damageFound: true as boolean | null,
  acknowledgedIds: [] as string[],
  filingNewReport: false,
  note: "",
  photoCount: 0,
};

describe("answering the question at all", () => {
  it("insists the driver says whether they found damage", () => {
    expect(validateDamageStep({ ...base, damageFound: null })).toBe(
      "Please indicate if damage was found",
    );
  });

  it("asks nothing more when no damage was found", () => {
    expect(validateDamageStep({ ...base, damageFound: false })).toBeNull();
  });
});

describe("confirming what is already reported", () => {
  it("accepts a tick and asks for nothing else", () => {
    // The report being confirmed already has the note and the photos. Asking
    // for them again is the duplication this feature removes.
    expect(
      validateDamageStep({ ...base, acknowledgedIds: ["r1"] }),
    ).toBeNull();
  });

  it("accepts several ticks", () => {
    expect(
      validateDamageStep({ ...base, acknowledgedIds: ["r1", "r2"] }),
    ).toBeNull();
  });
});

describe("filing a new report", () => {
  it("still requires a note", () => {
    expect(
      validateDamageStep({
        ...base,
        filingNewReport: true,
        note: "   ",
        photoCount: 2,
      }),
    ).toBe("Damage notes are required");
  });

  it("still requires a photo", () => {
    expect(
      validateDamageStep({
        ...base,
        filingNewReport: true,
        note: "Split plank",
        photoCount: 0,
      }),
    ).toBe("At least one damage photo is required");
  });

  it("passes when both are there", () => {
    expect(
      validateDamageStep({
        ...base,
        filingNewReport: true,
        note: "Split plank",
        photoCount: 1,
      }),
    ).toBeNull();
  });

  it("applies those rules even alongside ticked reports", () => {
    // Both at once is legitimate: some of what the driver sees is known, and
    // some of it is new.
    expect(
      validateDamageStep({
        ...base,
        acknowledgedIds: ["r1"],
        filingNewReport: true,
        note: "",
        photoCount: 1,
      }),
    ).toBe("Damage notes are required");
  });
});

describe("the state that must not be submittable", () => {
  it("refuses damage found with nothing said about it", () => {
    expect(validateDamageStep(base)).toBe(
      "Select an existing damage report or file a new one",
    );
  });

  it("refuses a new report that was started and left empty", () => {
    expect(
      validateDamageStep({ ...base, filingNewReport: true }),
    ).toBe("Damage notes are required");
  });
});
