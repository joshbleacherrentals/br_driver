/**
 * What Trip History is a record of, and what it pays.
 *
 * History is the driver's own record of finished business — not only the work
 * they completed, but the work they declined and the work they abandoned.
 * Those two are the reason this is not simply "completed trips": a driver who
 * declined Tuesday's delivery needs to be able to see that they did, because
 * the office is looking at exactly the same fact.
 *
 * The money is the line that must not blur. The weekly total is what a driver
 * checks their pay against, so it counts completed work and nothing else — a
 * trip handed back is worth nothing however far along it got.
 */

import { buildWeekGroups } from "@/features/trip-history/utils/buildWeekGroups";
import type { WorkTracker } from "@/hooks/db/useWorkTrackers";

/** A tracker with only the fields grouping and pay actually read. */
function tracker(over: Partial<WorkTracker> & { id: string }): WorkTracker {
  return {
    id: over.id,
    date: "date" in over ? over.date : "2026-09-09", // a Wednesday
    status: over.status ?? "completed",
    pay_cents: "pay_cents" in over ? over.pay_cents : 10_000,
  } as WorkTracker;
}

describe("which trackers reach history", () => {
  it("keeps the work the driver finished, one way or another", () => {
    const groups = buildWeekGroups([
      tracker({ id: "done", status: "completed" }),
      tracker({ id: "said-no", status: "declined" }),
      tracker({ id: "walked", status: "abandoned" }),
    ]);

    expect(
      groups
        .flatMap((g) => g.trips)
        .map((t) => t.id)
        .sort(),
    ).toEqual(["done", "said-no", "walked"]);
  });

  it("leaves out work that is still on the driver's plate", () => {
    const groups = buildWeekGroups([
      tracker({ id: "offer", status: "released" }),
      tracker({ id: "mine", status: "accepted" }),
      tracker({ id: "driving", status: "dest_pickup" }),
      tracker({ id: "unseen", status: "draft" }),
    ]);

    expect(groups).toEqual([]);
  });

  // Grouping is by week, so a tracker the office never dated has no week to
  // belong to. Dropping it beats inventing one.
  it("skips a tracker with no date", () => {
    const groups = buildWeekGroups([tracker({ id: "undated", date: null })]);

    expect(groups).toEqual([]);
  });
});

describe("what the week is worth", () => {
  it("pays for completed work only", () => {
    const [week] = buildWeekGroups([
      tracker({ id: "done", status: "completed", pay_cents: 25_000 }),
      tracker({ id: "said-no", status: "declined", pay_cents: 40_000 }),
      tracker({ id: "walked", status: "abandoned", pay_cents: 30_000 }),
    ]);

    expect(week.totalPay).toBe(25_000);
  });

  it("counts a week of nothing but handed-back work as zero", () => {
    const [week] = buildWeekGroups([
      tracker({ id: "said-no", status: "declined", pay_cents: 40_000 }),
    ]);

    expect(week.trips).toHaveLength(1);
    expect(week.totalPay).toBe(0);
  });

  it("treats a trip with no pay set as nothing, not as a crash", () => {
    const [week] = buildWeekGroups([
      tracker({ id: "unpaid", pay_cents: null }),
    ]);

    expect(week.totalPay).toBe(0);
  });
});

describe("how the weeks are laid out", () => {
  it("groups by the Monday of each week, newest week first", () => {
    const groups = buildWeekGroups([
      tracker({ id: "older", date: "2026-09-02" }), // Wed, week of Aug 31
      tracker({ id: "newer", date: "2026-09-09" }), // Wed, week of Sep 7
    ]);

    expect(groups.map((g) => g.key)).toEqual(["2026-09-07", "2026-08-31"]);
  });

  // A Sunday belongs to the week that started the Monday before it, not to the
  // one about to begin.
  it("puts a Sunday in the week it ends", () => {
    const [week] = buildWeekGroups([
      tracker({ id: "sun", date: "2026-09-13" }),
    ]);

    expect(week.key).toBe("2026-09-07");
  });

  it("shows the most recent trip at the top of its week", () => {
    const [week] = buildWeekGroups([
      tracker({ id: "mon", date: "2026-09-07" }),
      tracker({ id: "fri", date: "2026-09-11" }),
    ]);

    expect(week.trips.map((t) => t.id)).toEqual(["fri", "mon"]);
  });
});
