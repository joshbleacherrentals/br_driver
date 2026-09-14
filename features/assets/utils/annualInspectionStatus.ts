/**
 * The annual inspection, read as a countdown.
 *
 * Built on `utils/documentExpiry` rather than beside it: a due date is a due
 * date, and the driver-document banner already settled how this app measures
 * one — local calendar days, no UTC day-shift, a thirty-day soft warning.
 */

import {
  DOC_EXPIRY_WARN_DAYS,
  calendarDaysBetween,
  formatExpiryDate,
  toISODateOnly,
  todayISODate,
} from "@/utils/documentExpiry";

import { NOT_ON_FILE } from "./assetFields";

export type AnnualInspectionTone = "missing" | "ok" | "due_soon" | "overdue";

export type AnnualInspectionStatus = {
  tone: AnnualInspectionTone;
  /** The one line a driver reads in the yard. */
  headline: string;
  dueLabel: string;
  inspectedLabel: string;
};

/** The columns this reads, so callers need not pass a whole row. */
export type AnnualInspectionRecord = {
  inspected_on: string | null;
  next_due_on: string | null;
};

const MISSING: AnnualInspectionStatus = {
  tone: "missing",
  headline: "Not on file",
  dueLabel: NOT_ON_FILE,
  inspectedLabel: NOT_ON_FILE,
};

function days(count: number): string {
  return count === 1 ? "1 day" : `${count} days`;
}

export function annualInspectionStatus(
  record: AnnualInspectionRecord | null | undefined,
  asOf: string = todayISODate(),
): AnnualInspectionStatus {
  const dueOn = toISODateOnly(record?.next_due_on);
  const inspectedOn = toISODateOnly(record?.inspected_on);

  const inspectedLabel = inspectedOn
    ? formatExpiryDate(inspectedOn)
    : NOT_ON_FILE;

  // No due date is the same state as no record: the app cannot say a bleacher
  // is compliant, and guessing from the last inspection would be inventing a
  // schedule the office never set.
  if (!dueOn) return { ...MISSING, inspectedLabel };

  const remaining = calendarDaysBetween(asOf, dueOn);
  if (Number.isNaN(remaining)) return { ...MISSING, inspectedLabel };

  const dueLabel = formatExpiryDate(dueOn);

  if (remaining < 0) {
    return {
      tone: "overdue",
      headline: `Overdue by ${days(-remaining)}`,
      dueLabel,
      inspectedLabel,
    };
  }

  if (remaining === 0) {
    return {
      tone: "due_soon",
      headline: "Due today",
      dueLabel,
      inspectedLabel,
    };
  }

  return {
    tone: remaining <= DOC_EXPIRY_WARN_DAYS ? "due_soon" : "ok",
    headline: `Due in ${days(remaining)}`,
    dueLabel,
    inspectedLabel,
  };
}
