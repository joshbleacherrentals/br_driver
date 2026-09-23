/**
 * The colour family for a Linxup status badge — the three states the web
 * dashboard colours, and neutral for anything else. The component maps a
 * tone to a theme colour; this stays free of colours so it can be tested.
 */

export type LinxupStatusTone = "success" | "warning" | "info" | "neutral";

const TONES: Record<string, LinxupStatusTone> = {
  moving: "success",
  stopped: "warning",
  idle: "info",
};

export function linxupStatusTone(
  status: string | null | undefined,
): LinxupStatusTone {
  if (!status) return "neutral";
  return TONES[status.trim().toLowerCase()] ?? "neutral";
}
