/**
 * Trip History, grouped the way the driver reads it: one block per week,
 * newest first, with what that week paid.
 *
 * History is finished business, which is more than completed work — a tracker
 * the driver declined or abandoned belongs here too, because the office is
 * looking at the same fact and the driver needs to see their own record of it.
 * The weekly total stays narrow on purpose: it is what a driver checks their
 * pay against, so only completed work counts toward it.
 */

import type { WorkTracker } from "@/hooks/db/useWorkTrackers";

export interface WeekGroup {
  /** ISO date of the week's Monday — stable identity for collapse state. */
  key: string;
  label: string;
  monday: Date;
  sunday: Date;
  trips: WorkTracker[];
  /** Cents, completed work only. */
  totalPay: number;
  isCurrent: boolean;
}

/** Statuses that put a tracker in the driver's record rather than their list. */
const HISTORY_STATUSES: ReadonlySet<string> = new Set([
  "completed",
  "declined",
  "abandoned",
]);

export function isDriverHistoryTracker(
  status: string | null | undefined,
): boolean {
  return !!status && HISTORY_STATUSES.has(status);
}

export function getWeekStart(dateISO: string): Date {
  const d = new Date(dateISO + "T00:00:00");
  const day = d.getDay();
  // Sunday closes the week that began six days earlier, it does not open one.
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

export function getWeekEnd(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return sunday;
}

export function getWeekKey(monday: Date): string {
  const year = monday.getFullYear();
  const month = String(monday.getMonth() + 1).padStart(2, "0");
  const day = String(monday.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatWeekRange(monday: Date, sunday: Date): string {
  const sameMonth = monday.getMonth() === sunday.getMonth();
  const monthFmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "long" });
  const dayOrd = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  };
  if (sameMonth) {
    return `${monthFmt(monday)} ${dayOrd(monday.getDate())} – ${dayOrd(sunday.getDate())}`;
  }
  return `${monthFmt(monday)} ${dayOrd(monday.getDate())} – ${monthFmt(sunday)} ${dayOrd(sunday.getDate())}`;
}

export function isCurrentWeek(monday: Date): boolean {
  const currentMonday = getWeekStart(new Date().toISOString().split("T")[0]);
  return getWeekKey(monday) === getWeekKey(currentMonday);
}

/** The driver's finished work, in weeks, newest first. */
export function buildWeekGroups(workTrackers: WorkTracker[]): WeekGroup[] {
  const groups: Record<string, WeekGroup> = {};

  for (const trip of workTrackers) {
    if (!isDriverHistoryTracker(trip.status)) continue;
    // No date, no week to file it under.
    if (!trip.date) continue;

    const monday = getWeekStart(trip.date);
    const key = getWeekKey(monday);
    if (!groups[key]) {
      const sunday = getWeekEnd(monday);
      groups[key] = {
        key,
        label: formatWeekRange(monday, sunday),
        monday,
        sunday,
        trips: [],
        totalPay: 0,
        isCurrent: isCurrentWeek(monday),
      };
    }
    groups[key].trips.push(trip);
    // Handed-back work is worth nothing, however far along it got.
    if (trip.status === "completed") {
      groups[key].totalPay += trip.pay_cents ?? 0;
    }
  }

  return Object.values(groups)
    .sort((a, b) => b.monday.getTime() - a.monday.getTime())
    .map((g) => ({
      ...g,
      trips: [...g.trips].sort((a, b) =>
        (b.date ?? "").localeCompare(a.date ?? ""),
      ),
    }));
}
