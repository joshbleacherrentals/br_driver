/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §10 ("One active worker for the whole queue" — no races
 * from parallel runs) and §10 ("Multiple photos in one report — processed
 * sequentially by the same worker"), plus the §9 comparison row
 * "Race risk from parallel watch callbacks: None — a single serialized worker".
 */

import { createUploadQueueWorker } from "@/library/photoUploadQueue/worker";

import { createDeferred, makeRow, settle, waitFor } from "./support";

describe("single serialized worker (§10)", () => {
  it("does not start a second row while one is in flight", async () => {
    const queue = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const gate = createDeferred<void>();
    const uploaded: string[] = [];
    let active = 0;
    let maxActive = 0;

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => queue.shift() ?? null,
      uploadRow: async (row) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        if (row.id === "a") {
          await gate.promise;
        }
        active -= 1;
        uploaded.push(row.id);
      },
    });

    const first = worker.trigger();
    await settle();
    // An overlapping trigger — the shape that races in the PowerSync queue.
    const second = worker.trigger();
    await settle();

    expect(maxActive).toBe(1);
    expect(uploaded).toEqual([]);
    expect(worker.isRunning).toBe(true);

    gate.resolve();
    await Promise.all([first, second]);
    await waitFor(() => uploaded.length === 2);

    expect(uploaded).toEqual(["a", "b"]);
    expect(maxActive).toBe(1);
    expect(worker.isRunning).toBe(false);
  });

  it("processes each queued row exactly once under concurrent triggers", async () => {
    const queue = [
      makeRow({ id: "a" }),
      makeRow({ id: "b" }),
      makeRow({ id: "c" }),
    ];
    const uploaded: string[] = [];
    let active = 0;
    let maxActive = 0;

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => queue.shift() ?? null,
      uploadRow: async (row) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        uploaded.push(row.id);
        active -= 1;
      },
    });

    await Promise.all([worker.trigger(), worker.trigger(), worker.trigger()]);
    await waitFor(() => uploaded.length === 3);

    // Sequential, in claim order — not three independent parallel runs (§10).
    expect(uploaded).toEqual(["a", "b", "c"]);
    expect(maxActive).toBe(1);
    expect(worker.isRunning).toBe(false);
  });

  it("drains the queue and reports itself idle again", async () => {
    let claims = 0;

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => {
        claims += 1;
        return null;
      },
      uploadRow: async () => {
        throw new Error("nothing was claimed, nothing should be uploaded");
      },
    });

    await worker.trigger();

    expect(claims).toBeGreaterThanOrEqual(1);
    expect(worker.isRunning).toBe(false);
  });

  // §5/§6 — attempts never truly end, so one bad row must not wedge the queue
  // and strand every photo behind it.
  it("keeps draining after a row fails to upload", async () => {
    const queue = [makeRow({ id: "a" }), makeRow({ id: "b" })];
    const uploaded: string[] = [];

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => queue.shift() ?? null,
      uploadRow: async (row) => {
        if (row.id === "a") {
          throw new Error("upload failed");
        }
        uploaded.push(row.id);
      },
    });

    // The contract does not say whether trigger() rethrows; either is fine.
    await worker.trigger().catch(() => undefined);
    await waitFor(() => uploaded.length === 1);

    expect(uploaded).toEqual(["b"]);
    expect(worker.isRunning).toBe(false);
  });
});
