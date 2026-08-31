/**
 * Three tickets per driver per rolling 24 hours.
 *
 * The number is enforced in two places — here, and by a Postgres trigger with
 * the *same* limit. That symmetry is deliberate and it is why the counting rule
 * has to match the server's exactly: PowerSync treats a constraint violation as
 * fatal (`FATAL_RESPONSE_CODES` in BackendConnector), so a write the client
 * lets through and the server refuses is silently dropped from the outbox and
 * the driver keeps a ticket that exists nowhere else. The client must never be
 * the looser of the two.
 *
 * Hence the one rule that reads as harsh: a soft-deleted ticket still occupies
 * its slot. If it did not, "create, delete, repeat" would be an unlimited
 * channel, and the server — which counts rows, not surviving rows — would start
 * rejecting writes the app had already accepted.
 */

import {
  DAILY_TICKET_LIMIT,
  canCreateTicket,
  countTicketsInWindow,
  nextTicketSlotAt,
} from "@/features/backlog-tickets/utils/dailyTicketLimit";

const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("countTicketsInWindow", () => {
  it("counts nothing for a driver with no tickets", () => {
    expect(countTicketsInWindow([], NOW)).toBe(0);
  });

  it("counts tickets created inside the last 24 hours", () => {
    expect(countTicketsInWindow([iso(0), iso(3 * HOUR), iso(23 * HOUR)], NOW)).toBe(3);
  });

  it("ignores tickets older than the window", () => {
    expect(countTicketsInWindow([iso(25 * HOUR), iso(3 * HOUR)], NOW)).toBe(1);
  });

  it("drops a ticket out of the count the moment it turns 24h old", () => {
    expect(countTicketsInWindow([iso(24 * HOUR)], NOW)).toBe(0);
  });

  it("ignores rows with an unusable created_at rather than throwing", () => {
    expect(countTicketsInWindow([null, "not-a-date", iso(HOUR)], NOW)).toBe(1);
  });
});

describe("canCreateTicket", () => {
  it("allows the first three tickets of the day", () => {
    expect(canCreateTicket([], NOW)).toBe(true);
    expect(canCreateTicket([iso(HOUR)], NOW)).toBe(true);
    expect(canCreateTicket([iso(HOUR), iso(2 * HOUR)], NOW)).toBe(true);
  });

  it("refuses the fourth", () => {
    const three = [iso(HOUR), iso(2 * HOUR), iso(3 * HOUR)];
    expect(three).toHaveLength(DAILY_TICKET_LIMIT);
    expect(canCreateTicket(three, NOW)).toBe(false);
  });

  it("allows again once the oldest ticket ages out", () => {
    expect(canCreateTicket([iso(25 * HOUR), iso(2 * HOUR), iso(3 * HOUR)], NOW)).toBe(true);
  });
});

describe("nextTicketSlotAt", () => {
  it("is null while the driver still has room", () => {
    expect(nextTicketSlotAt([iso(HOUR)], NOW)).toBeNull();
  });

  /**
   * The slot frees when the OLDEST in-window ticket turns 24h — that is the
   * moment the count drops below the limit, and it is what the UI promises.
   */
  it("is 24h after the oldest ticket still in the window", () => {
    const oldest = iso(20 * HOUR);
    const at = nextTicketSlotAt([iso(HOUR), oldest, iso(3 * HOUR)], NOW);
    expect(at).toBe(Date.parse(oldest) + 24 * HOUR);
  });
});
