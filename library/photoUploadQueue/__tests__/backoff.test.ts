/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §6 ("Background recovery ... backoff (30s → 1min → 5min →
 * plateau)" and "Backoff is about 'don't spam the network needlessly', not
 * about limiting the number of attempts").
 *
 * Time is always mocked — `jest.setSystemTime` / `advanceTimersByTime`. No test
 * in this file waits on a real clock.
 */

import {
  BACKOFF_SCHEDULE_MS,
  FAST_RETRY_SPACING_MS,
  backoffDelayMs,
  isDueForFastRetry,
  isDueForRetry,
} from "@/library/photoUploadQueue/backoff";

const THIRTY_SECONDS = 30_000;
const ONE_MINUTE = 60_000;
const FIVE_MINUTES = 300_000;
const PLATEAU = BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1];

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("backoff schedule (§6)", () => {
  it("publishes the documented 30s → 1min → 5min schedule", () => {
    expect([...BACKOFF_SCHEDULE_MS]).toEqual([
      THIRTY_SECONDS,
      ONE_MINUTE,
      FIVE_MINUTES,
    ]);
  });

  it("waits 30s, then 1min, then 5min between attempts", () => {
    expect(backoffDelayMs(1)).toBe(THIRTY_SECONDS);
    expect(backoffDelayMs(2)).toBe(ONE_MINUTE);
    expect(backoffDelayMs(3)).toBe(FIVE_MINUTES);
  });

  it("plateaus instead of growing without bound", () => {
    for (const attempts of [4, 5, 10, 100, 5_000]) {
      expect(backoffDelayMs(attempts)).toBe(PLATEAU);
    }
  });

  it("does not make the very first attempt wait out a full backoff step", () => {
    expect(backoffDelayMs(0)).toBeLessThanOrEqual(BACKOFF_SCHEDULE_MS[0]);
  });

  it("never shortens the pause as attempts pile up", () => {
    let previous = -1;
    for (let attempts = 0; attempts <= 50; attempts += 1) {
      const delay = backoffDelayMs(attempts);
      expect(delay).toBeGreaterThanOrEqual(previous);
      previous = delay;
    }
  });

  // §6 — "Attempts never truly end ... just with a growing pause between them."
  // A plateau is what makes that true; an ever-growing delay would be a
  // de facto give-up.
  it("keeps retrying forever rather than backing off into silence", () => {
    expect(backoffDelayMs(10_000)).toBe(PLATEAU);
    expect(backoffDelayMs(10_000)).toBeLessThanOrEqual(FIVE_MINUTES);
    expect(Number.isFinite(backoffDelayMs(10_000))).toBe(true);
  });
});

describe("retry eligibility against the schedule (§6)", () => {
  const BASE = new Date("2026-08-07T12:00:00.000Z");

  it("holds a row back until its backoff pause has elapsed", () => {
    jest.setSystemTime(BASE);
    const row = { attempts: 1, last_attempt_at: BASE.toISOString() };

    expect(isDueForRetry(row, Date.now())).toBe(false);

    jest.advanceTimersByTime(THIRTY_SECONDS - 1_000);
    expect(isDueForRetry(row, Date.now())).toBe(false);

    jest.advanceTimersByTime(1_000);
    expect(isDueForRetry(row, Date.now())).toBe(true);
  });

  it("applies the longer pause after more failures", () => {
    jest.setSystemTime(BASE);
    const row = { attempts: 3, last_attempt_at: BASE.toISOString() };

    jest.advanceTimersByTime(ONE_MINUTE);
    expect(isDueForRetry(row, Date.now())).toBe(false);

    jest.advanceTimersByTime(FIVE_MINUTES - ONE_MINUTE);
    expect(isDueForRetry(row, Date.now())).toBe(true);
  });

  it("lets a never-attempted row go immediately", () => {
    jest.setSystemTime(BASE);
    expect(isDueForRetry({ attempts: 0, last_attempt_at: null }, Date.now())).toBe(
      true,
    );
  });
});

// The property that makes a hot loop structurally impossible: even in fast mode
// (which skips the backoff schedule), a row that was just attempted is NOT
// immediately eligible again — so the worker can never re-claim the same failing
// row on the next iteration and spin. Fresh rows still go immediately.
describe("fast-mode cooldown makes a hot loop impossible (§6)", () => {
  const BASE = new Date("2026-08-07T12:00:00.000Z");

  it("lets a never-attempted row go immediately in fast mode", () => {
    jest.setSystemTime(BASE);
    expect(isDueForFastRetry({ last_attempt_at: null }, Date.now())).toBe(true);
  });

  it("refuses to re-attempt a just-failed row on the next tick", () => {
    jest.setSystemTime(BASE);
    const justAttempted = { last_attempt_at: BASE.toISOString() };

    // 1 ms later — the interval at which the old hot loop spun.
    jest.advanceTimersByTime(1);
    expect(isDueForFastRetry(justAttempted, Date.now())).toBe(false);

    // Still held back just before the spacing elapses.
    jest.advanceTimersByTime(FAST_RETRY_SPACING_MS - 2);
    expect(isDueForFastRetry(justAttempted, Date.now())).toBe(false);

    // Eligible again only once the full spacing has passed.
    jest.advanceTimersByTime(1);
    expect(isDueForFastRetry(justAttempted, Date.now())).toBe(true);
  });

  it("caps a permanently-failing row far below a spin (≤1 attempt per spacing)", () => {
    // Over a full minute of fast retries the same row can be attempted at most
    // ~15 times, not thousands — the spacing is the ceiling.
    const perMinute = 60_000 / FAST_RETRY_SPACING_MS;
    expect(perMinute).toBeLessThanOrEqual(15);
  });
});
