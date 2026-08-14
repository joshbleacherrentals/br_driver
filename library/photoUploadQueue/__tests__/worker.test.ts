/**
 * Specification-first tests — see `./support.ts` for why this suite exists and
 * how it relates to the design doc.
 *
 * Covers: design doc §10 ("One worker for the whole queue" — no races from
 * parallel runs, bounded concurrency inside the single run) and §10 ("Multiple
 * photos in one report — a report's photos travel together, up to the
 * concurrency limit"), plus the §9 comparison row "Race risk from parallel
 * watch callbacks: None — a single claim gatekeeper".
 *
 * The rule that replaced "one row at a time": exclusivity comes from claim
 * reservation (the service hands each row out exactly once), NOT from running
 * rows serially. So these tests assert *which rows ran* as a set, and that
 * concurrency stays within `MAX_CONCURRENT_UPLOADS` — never that rows finished
 * in claim order, which is no longer true and no longer required.
 */

import {
  createUploadQueueWorker,
  MAX_CONCURRENT_UPLOADS,
} from "@/library/photoUploadQueue/worker";

import { createDeferred, type Deferred, makeRow, settle, waitFor } from "./support";

describe(`bounded-concurrency queue worker (§10, ${MAX_CONCURRENT_UPLOADS} lanes)`, () => {
  it("runs up to MAX_CONCURRENT_UPLOADS rows at once and never more", async () => {
    const queue = Array.from({ length: MAX_CONCURRENT_UPLOADS * 3 }, (_, i) =>
      makeRow({ id: `row-${i}` }),
    );
    const uploaded: string[] = [];
    let active = 0;
    let maxActive = 0;

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => queue.shift() ?? null,
      uploadRow: async (row) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        expect(active).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
        await settle(2);
        active -= 1;
        uploaded.push(row.id);
      },
    });

    await worker.trigger();
    await waitFor(() => uploaded.length === MAX_CONCURRENT_UPLOADS * 3);

    expect(uploaded).toHaveLength(MAX_CONCURRENT_UPLOADS * 3);
    // The window is used in full — this is a pool, not an accidental serial run.
    expect(maxActive).toBe(MAX_CONCURRENT_UPLOADS);
    expect(active).toBe(0);
    expect(worker.isRunning).toBe(false);
  });

  // The point of the whole change: a damage report's ~3 photos should be in
  // flight together, not queued behind each other's ~35s timeout budget.
  it("starts a report's three photos concurrently rather than one after another", async () => {
    const queue = [makeRow({ id: "a" }), makeRow({ id: "b" }), makeRow({ id: "c" })];
    const gate = createDeferred<void>();
    const started: string[] = [];

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => queue.shift() ?? null,
      uploadRow: async (row) => {
        started.push(row.id);
        await gate.promise;
      },
    });

    const run = worker.trigger();
    await settle();

    // All three are already in flight while none has finished.
    expect(started.sort()).toEqual(["a", "b", "c"]);
    expect(worker.isRunning).toBe(true);

    gate.resolve();
    await run;
    expect(worker.isRunning).toBe(false);
  });

  it("makes a fourth row wait for a lane to free before it is even claimed", async () => {
    const ids = ["a", "b", "c", "d"];
    const queue = ids.map((id) => makeRow({ id }));
    const gates = new Map<string, Deferred<void>>(
      ids.map((id) => [id, createDeferred<void>()]),
    );
    const started: string[] = [];

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => queue.shift() ?? null,
      uploadRow: async (row) => {
        started.push(row.id);
        await gates.get(row.id)!.promise;
      },
    });

    const run = worker.trigger();
    await settle();

    // The pool is full at three; `d` has not been claimed at all yet — a
    // sliding window, so the claim happens when a lane frees, not up front.
    expect(started).toHaveLength(MAX_CONCURRENT_UPLOADS);
    expect(started).not.toContain("d");
    expect(queue.map((row) => row.id)).toEqual(["d"]);

    gates.get(started[1])!.resolve();
    await waitFor(() => started.includes("d"));
    expect(started).toContain("d");

    for (const gate of gates.values()) gate.resolve();
    await run;
    expect(worker.isRunning).toBe(false);
  });

  // The human's explicit worry, and the direct reason the lanes are independent
  // rather than batched: one wedged photo must not hold up a whole report.
  it("lets the other lanes finish while one row is stuck", async () => {
    const stuck = createDeferred<void>();
    const queue = [
      makeRow({ id: "stuck" }),
      makeRow({ id: "fast-1" }),
      makeRow({ id: "fast-2" }),
    ];
    const uploaded: string[] = [];

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => queue.shift() ?? null,
      uploadRow: async (row) => {
        if (row.id === "stuck") {
          await stuck.promise;
        }
        uploaded.push(row.id);
      },
    });

    const run = worker.trigger();
    await waitFor(() => uploaded.length === 2);

    // Both healthy photos are done while the stuck one is still hanging.
    expect(uploaded.sort()).toEqual(["fast-1", "fast-2"]);
    expect(worker.isRunning).toBe(true);

    stuck.resolve();
    await run;
    expect(uploaded).toHaveLength(3);
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

    // Overlapping triggers join the one in-flight run: every row is handled,
    // exactly once, by that single run (§10). Order is not part of the
    // contract any more — the set is.
    expect(uploaded.sort()).toEqual(["a", "b", "c"]);
    expect(new Set(uploaded).size).toBe(uploaded.length);
    expect(maxActive).toBeLessThanOrEqual(MAX_CONCURRENT_UPLOADS);
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

    // Exactly one "is there anything?" per lane — an empty queue costs the pool
    // one claim each and nothing more.
    expect(claims).toBe(MAX_CONCURRENT_UPLOADS);
    expect(worker.isRunning).toBe(false);
  });

  // §5/§6 — attempts never truly end, so one bad row must not wedge its lane
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

  // A lane that throws outside `uploadRow` (i.e. the claim itself) must not be
  // able to take the whole run down with it — `Promise.allSettled` is what
  // guarantees the other lanes still get to finish.
  it("finishes the run even if a lane's claim throws", async () => {
    let claims = 0;
    const uploaded: string[] = [];

    const worker = createUploadQueueWorker({
      claimNextPendingRow: async () => {
        claims += 1;
        if (claims === 1) {
          throw new Error("claim blew up");
        }
        return claims <= 3 ? makeRow({ id: `row-${claims}` }) : null;
      },
      uploadRow: async (row) => {
        uploaded.push(row.id);
      },
    });

    await worker.trigger().catch(() => undefined);
    await waitFor(() => uploaded.length === 2);

    expect(uploaded.sort()).toEqual(["row-2", "row-3"]);
    expect(worker.isRunning).toBe(false);
  });
});
