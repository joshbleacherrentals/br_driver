/**
 * What the `+` button does.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * `+` used to mean "new damage report", full stop. It now means "you are about
 * to describe damage — here is what is already reported on that bleacher",
 * which is the same intervention as in the inspection, at the other entry
 * point. Filing something new is never blocked; it just stops being the first
 * thing that happens.
 *
 * The three answers, and why each exists:
 *
 * - no bleacher chosen → there is nothing to compare against yet, and asking
 *   for the bleacher is cheaper than showing every open report in the company;
 * - bleacher chosen, something open on it → show it;
 * - bleacher chosen, nothing open → straight to the form. A checklist with no
 *   entries is a screen that can only be dismissed.
 */

import { resolvePlusAction } from "@/features/damage-report-list/hooks/resolvePlusAction";

it("asks which bleacher first when none is chosen", () => {
  expect(resolvePlusAction({ bleacherUuid: null, openReportCount: 4 })).toBe(
    "pick-bleacher",
  );
});

it("shows what is already reported on the chosen bleacher", () => {
  expect(resolvePlusAction({ bleacherUuid: "b1", openReportCount: 2 })).toBe(
    "review-existing",
  );
});

it("goes straight to the form when nothing is open on it", () => {
  expect(resolvePlusAction({ bleacherUuid: "b1", openReportCount: 0 })).toBe(
    "file-new",
  );
});
