/**
 * Covers the §13 network gate on the §6.2 bucket verification.
 *
 * §6.2 exists to stop the app telling a driver a photo is lost on anything less
 * than ground truth. An offline phone cannot obtain that ground truth: every
 * lookup comes back `unknown`. Running them anyway costs a request per row for
 * a guaranteed non-answer.
 *
 * The half that's easy to get wrong is what happens to state on that branch.
 * Bailing out must leave the recovery store exactly as it was: an offline pass
 * is not evidence that a previously-confirmed problem has been resolved, so it
 * must not clear a banner the driver is already looking at.
 *
 * The pure decision table itself (`decideRecovery`) is specified separately in
 * `__tests__/recovery.test.ts`; this suite is about the runtime wiring.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { flushMicrotasks } from "@/library/photoUploadQueue/__tests__/support";
import {
  clearCurrentDriverContext,
  setCurrentDriverContext,
} from "@/library/photoUploadQueue/runtime/currentDriverContext";
import { createForegroundRecovery } from "@/library/photoUploadQueue/runtime/foregroundRecovery";
import { isNetworkAvailable } from "@/library/photoUploadQueue/runtime/networkState";
import type { PhotoUploadService } from "@/library/photoUploadQueue/runtime/photoUploadService";
import {
  getRecoveryState,
  setConfirmedMissingPhotoIds,
} from "@/library/photoUploadQueue/runtime/recoveryStore";
import type { PhotoQueueTableAdapter } from "@/library/photoUploadQueue/runtime/types";
import { FAST_RETRY_WINDOW_MS } from "@/library/photoUploadQueue/recovery";
import type { PhotoUploadRow } from "@/library/photoUploadQueue/types";

jest.mock("@/library/photoUploadQueue/runtime/networkState", () => ({
  __esModule: true,
  isNetworkAvailable: jest.fn(async () => true),
  subscribeNetworkAvailability: jest.fn(() => () => {}),
}));

// The store is a module-level singleton shared with the banner; keep the real
// one so "was the driver's banner preserved?" is a real question.
jest.mock("@/components/providers/SystemProvider", () => ({
  __esModule: true,
  db: {},
}));

const mockIsNetworkAvailable = isNetworkAvailable as jest.MockedFunction<
  typeof isNetworkAvailable
>;

function makeRow(id: string): PhotoUploadRow {
  return {
    id,
    photo_path: `report/${id}.jpg`,
    upload_status: "failed",
    gallery_asset_id: null,
    // §6 only considers a row that has actually failed an attempt.
    attempts: 2,
    last_attempt_at: "2026-08-01T09:00:00.000Z",
    last_error: "Network request failed",
  };
}

function makeAdapter(rows: PhotoUploadRow[]) {
  const listUnresolved = jest.fn(async () => rows.map((row) => ({ ...row })));
  const adapter: PhotoQueueTableAdapter & { listUnresolved: jest.Mock } = {
    table: "DamageReportPhotos",
    bucket: "damage-report-photos",
    upsert: false,
    listUnresolved,
    claimNext: jest.fn(async () => null),
    persist: jest.fn(async () => {}),
    countUnresolved: jest.fn(async () => rows.length),
    countActionable: jest.fn(async () => rows.length),
    countParked: jest.fn(async () => 0),
    // §14's sweep is not part of the §6 recovery pass; nothing here is ever
    // stuck `uploading`.
    listStaleUploading: jest.fn(async () => []),
  };
  return adapter;
}

function makeService(unresolved: number): PhotoUploadService {
  return {
    triggerFast: jest.fn(async () => {}),
    triggerBackoff: jest.fn(async () => {}),
    isRunning: false,
    countUnresolved: jest.fn(async () => unresolved),
  };
}

/**
 * The launch race as the recovery pass actually experiences it: the first count
 * is §15's gated 0 (no driver context published yet), every later one is the
 * truth. `run()` fires on every `connect()`, so this is the ordinary case on a
 * cold start, not an exotic one.
 */
function makeRacingService(afterContextResolves: number): PhotoUploadService {
  const countUnresolved = jest.fn(async () => afterContextResolves);
  countUnresolved.mockResolvedValueOnce(0);
  return {
    triggerFast: jest.fn(async () => {}),
    triggerBackoff: jest.fn(async () => {}),
    isRunning: false,
    countUnresolved,
  };
}

/** §15's ids, as `SystemProvider` publishes them once the chain resolves. */
const SIGNED_IN_DRIVER = { userUuid: "user-a", driverUuid: "driver-a" };

function makeClient(): { client: SupabaseClient; list: jest.Mock } {
  const list = jest.fn(async () => ({ data: [], error: null }));
  return {
    list,
    client: { storage: { from: () => ({ list }) } } as unknown as SupabaseClient,
  };
}

beforeEach(() => {
  jest.useFakeTimers();
  mockIsNetworkAvailable.mockResolvedValue(true);
  setConfirmedMissingPhotoIds(new Set());
  // Steady state: the driver is signed in and §15's ids are published, so the
  // counts these tests feed the pass are trustworthy. The startup race is its
  // own describe block, and clears this explicitly.
  setCurrentDriverContext(SIGNED_IN_DRIVER);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  setConfirmedMissingPhotoIds(new Set());
  clearCurrentDriverContext();
});

/** Runs one pass all the way through its 60s fast window. */
async function runFullPass(recovery: { run: () => void }): Promise<void> {
  recovery.run();
  await jest.advanceTimersByTimeAsync(FAST_RETRY_WINDOW_MS + 1);
}

describe("foreground recovery — network gating (§13)", () => {
  it("skips bucket verification entirely while offline", async () => {
    mockIsNetworkAvailable.mockResolvedValue(false);
    const adapter = makeAdapter([makeRow("a")]);
    const { client, list } = makeClient();

    const recovery = createForegroundRecovery({
      client,
      service: makeService(1),
      adapters: [adapter],
    });
    await runFullPass(recovery);

    expect(list).not.toHaveBeenCalled();
    expect(adapter.listUnresolved).not.toHaveBeenCalled();
    // No verdict may be invented from an offline pass.
    expect(getRecoveryState().confirmedMissingPhotoIds.size).toBe(0);
  });

  it("leaves an existing banner verdict untouched when it bails out offline", async () => {
    // The driver is already being shown a confirmed-missing photo from an
    // earlier, online pass.
    setConfirmedMissingPhotoIds(new Set(["already-confirmed"]));
    mockIsNetworkAvailable.mockResolvedValue(false);

    const { client, list } = makeClient();
    const recovery = createForegroundRecovery({
      client,
      service: makeService(1),
      adapters: [makeAdapter([makeRow("a")])],
    });
    await runFullPass(recovery);

    expect(list).not.toHaveBeenCalled();
    // Losing signal is not the same as the problem going away.
    expect([...getRecoveryState().confirmedMissingPhotoIds]).toEqual([
      "already-confirmed",
    ]);
  });

  it("still verifies against the bucket when online", async () => {
    const adapter = makeAdapter([makeRow("a")]);
    const { client, list } = makeClient();

    const recovery = createForegroundRecovery({
      client,
      service: makeService(1),
      adapters: [adapter],
    });
    await runFullPass(recovery);

    expect(adapter.listUnresolved).toHaveBeenCalled();
    expect(list).toHaveBeenCalled();
    // The bucket answered "not there", so the §6 gate opens.
    expect([...getRecoveryState().confirmedMissingPhotoIds]).toEqual(["a"]);
  });

  it("clears the verdict normally when everything drained during the fast window", async () => {
    setConfirmedMissingPhotoIds(new Set(["stale"]));
    const { client, list } = makeClient();

    // Nothing unresolved by the time the window closes ⇒ no verification, and
    // the offline gate is never even reached.
    const recovery = createForegroundRecovery({
      client,
      service: makeService(0),
      adapters: [makeAdapter([])],
    });
    await runFullPass(recovery);

    expect(list).not.toHaveBeenCalled();
    expect(getRecoveryState().confirmedMissingPhotoIds.size).toBe(0);
  });
});

/**
 * The §15 driver-context race, on the one branch of `run()` that ends a pass
 * early.
 *
 * `run()` fires on every `connect()` — launch, token refresh, JWT-expiry
 * reconnect — and its opening count is §15-scoped, so on a cold start it
 * routinely lands while `SystemProvider` is still resolving Clerk user →
 * `Users` → `Drivers`. Until that lands the count is 0 for every driver alive,
 * which `decideRecovery` reads as `idle`.
 *
 * Treating that as a genuine idle did two things at once: it skipped
 * `triggerFast` and the 60s verification timer — so `verifyAgainstBucket` never
 * ran, `recoveryStore` was never populated, and the banner had nothing to show
 * for real `failed` rows — and it called `clearRecoveryState()`, destroying a
 * verdict on the strength of a number nothing was in a position to compute.
 */
describe("foreground recovery — the §15 driver-context race", () => {
  it("never clears recovery state on a 0 counted before the driver context existed", async () => {
    clearCurrentDriverContext();
    // The driver is already being shown a confirmed-missing photo from an
    // earlier pass. An unverifiable 0 is not grounds to take it away.
    setConfirmedMissingPhotoIds(new Set(["already-confirmed"]));

    const service = makeRacingService(1);
    const adapter = makeAdapter([makeRow("a")]);
    const { client, list } = makeClient();

    const recovery = createForegroundRecovery({ client, service, adapters: [adapter] });
    recovery.run();
    await flushMicrotasks();

    expect(getRecoveryState().confirmedMissingPhotoIds.size).toBeGreaterThan(0);
    expect([...getRecoveryState().confirmedMissingPhotoIds]).toEqual([
      "already-confirmed",
    ]);
    // Instead of idling out, the pass takes the fast path: a retry window now,
    // and a verification armed for the far end of it.
    expect(service.triggerFast).toHaveBeenCalledWith("foreground-recovery");
    expect(jest.getTimerCount()).toBe(1);

    // By the time that timer fires the ids have long since landed, so the pass
    // finishes on real numbers — which is the whole point of not clearing.
    setCurrentDriverContext(SIGNED_IN_DRIVER);
    await jest.advanceTimersByTimeAsync(FAST_RETRY_WINDOW_MS + 1);

    expect(adapter.listUnresolved).toHaveBeenCalled();
    expect(list).toHaveBeenCalled();
    expect([...getRecoveryState().confirmedMissingPhotoIds]).toEqual(["a"]);
  });

  it("still idles out and clears when the 0 was counted against an established driver", async () => {
    // The inverse: a trustworthy 0 must keep its old, cheap behaviour — no fast
    // window, no verification timer, and a stale verdict retired immediately.
    setCurrentDriverContext(SIGNED_IN_DRIVER);
    setConfirmedMissingPhotoIds(new Set(["stale"]));

    const service = makeService(0);
    const { client, list } = makeClient();
    const adapter = makeAdapter([]);

    const recovery = createForegroundRecovery({ client, service, adapters: [adapter] });
    recovery.run();
    await flushMicrotasks();

    expect(getRecoveryState().confirmedMissingPhotoIds.size).toBe(0);
    expect(service.triggerFast).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
    expect(list).not.toHaveBeenCalled();
  });
});
