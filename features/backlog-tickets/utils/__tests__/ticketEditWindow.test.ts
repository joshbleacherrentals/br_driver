/**
 * The 24-hour rule the whole feature hangs on: a driver may fix or withdraw
 * what they wrote, but only for a day — after that the ticket is the team's
 * record and stops moving under them.
 *
 * The server enforces 48 hours (an edit made at 23:59 offline may not reach
 * Postgres for days), so this function is the *product* rule, not the security
 * boundary. It therefore has to be exact at the boundary and honest about the
 * inputs it cannot trust: a missing or unparsable `created_at` is not an open
 * window.
 */

import {
  EDIT_WINDOW_MS,
  canEditTicket,
  editWindowMsLeft,
  formatEditWindowLeft,
} from "@/features/backlog-tickets/utils/ticketEditWindow";

const NOW = Date.parse("2026-08-26T12:00:00.000Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe("canEditTicket", () => {
  it("is open the moment the ticket is created", () => {
    expect(canEditTicket(iso(0), NOW)).toBe(true);
  });

  it("is open at 23h59m", () => {
    expect(canEditTicket(iso(24 * HOUR - MINUTE), NOW)).toBe(true);
  });

  it("is closed exactly at 24h", () => {
    expect(canEditTicket(iso(EDIT_WINDOW_MS), NOW)).toBe(false);
  });

  it("is closed after 24h", () => {
    expect(canEditTicket(iso(25 * HOUR), NOW)).toBe(false);
  });

  /**
   * Device clocks drift, and a ticket created on a phone whose clock ran fast
   * arrives with a `created_at` in the future. Refusing the edit would punish
   * the driver for the clock; the window is treated as freshly open instead.
   * The server's 48-hour rule is what actually bounds this case.
   */
  it("treats a future created_at as freshly created, not expired", () => {
    expect(canEditTicket(new Date(NOW + HOUR).toISOString(), NOW)).toBe(true);
  });

  it("refuses when created_at is missing", () => {
    expect(canEditTicket(null, NOW)).toBe(false);
  });

  it("refuses when created_at cannot be parsed", () => {
    expect(canEditTicket("not-a-date", NOW)).toBe(false);
  });
});

describe("editWindowMsLeft", () => {
  it("is the full window at creation", () => {
    expect(editWindowMsLeft(iso(0), NOW)).toBe(EDIT_WINDOW_MS);
  });

  it("counts down as the ticket ages", () => {
    expect(editWindowMsLeft(iso(6 * HOUR), NOW)).toBe(18 * HOUR);
  });

  it("is zero — never negative — once the window has closed", () => {
    expect(editWindowMsLeft(iso(40 * HOUR), NOW)).toBe(0);
  });

  it("is zero for an unusable created_at", () => {
    expect(editWindowMsLeft(null, NOW)).toBe(0);
    expect(editWindowMsLeft("not-a-date", NOW)).toBe(0);
  });
});

describe("formatEditWindowLeft", () => {
  it("rounds down to whole hours while more than an hour remains", () => {
    expect(formatEditWindowLeft(18 * HOUR + 59 * MINUTE)).toBe("18h left");
  });

  it("switches to minutes under an hour", () => {
    expect(formatEditWindowLeft(42 * MINUTE)).toBe("42m left");
  });

  it("never shows a zero countdown while the window is still open", () => {
    expect(formatEditWindowLeft(30 * 1000)).toBe("1m left");
  });

  it("is null once nothing is left, so no badge renders", () => {
    expect(formatEditWindowLeft(0)).toBeNull();
  });
});
