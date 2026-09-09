/**
 * Damage severity, as it is read off a `DamageReports` row.
 *
 * Two shapes carry the same fact. The enum (`'major' | 'minor' | 'none'`) is
 * what the app writes today; `'1' | '0'` is what the older `is_safe_to_*` era
 * left behind, and those rows are still open, still syncing, and still shown
 * beside new ones. Every reader has to understand both, which is why this is
 * one module rather than a copy per screen.
 */

import type { ThemeColors } from "@/constants/theme";

export type Severity = "major" | "minor" | "none";

/** The human label for one rating. An absent rating reads as `None`. */
export function severityLabel(value: string | null | undefined): string {
  if (value === "major" || value === "1") return "Major";
  if (value === "minor" || value === "0") return "Minor";
  return "None";
}

/**
 * The worse of a report's two ratings.
 *
 * A card has room for one badge and a report has two ratings; showing the
 * first would let a `major` hauling fault hide behind a `none` for seating.
 */
export function worstSeverity(
  seat: string | null | undefined,
  haul: string | null | undefined,
): Severity {
  if (seat === "major" || haul === "major" || seat === "1" || haul === "1") {
    return "major";
  }
  if (seat === "minor" || haul === "minor" || seat === "0" || haul === "0") {
    return "minor";
  }
  return "none";
}

/** Fill, border and text for a severity pill. */
export function severityColors(theme: ThemeColors, severity: Severity) {
  if (severity === "major") {
    return { bg: theme.danger + "18", border: theme.danger, text: theme.danger };
  }
  if (severity === "minor") {
    return {
      bg: theme.warning + "18",
      border: theme.warning,
      text: theme.warning,
    };
  }
  return {
    bg: theme.secondaryAccentSoft,
    border: theme.success,
    text: theme.success,
  };
}
