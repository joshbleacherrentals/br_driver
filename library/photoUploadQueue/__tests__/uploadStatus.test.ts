/**
 * Specification-first tests — see `./support.ts` for why this suite is red and
 * why it must not be edited to match a future implementation.
 *
 * Covers: design doc §3 (`upload_status` state machine, bookkeeping columns,
 * "a row is never deleted or archived as a side effect") and §5 ("timeout ≠
 * stop trying").
 */

import {
  UPLOAD_STATUSES,
  type UploadEvent,
  type UploadStatus,
} from "@/library/photoUploadQueue/types";
import {
  applyUploadEvent,
  isTerminalUploadStatus,
  nextUploadStatus,
} from "@/library/photoUploadQueue/uploadStatus";

import { makeRow } from "./support";

const ALL_EVENTS: UploadEvent[] = [
  "attempt_started",
  "upload_confirmed",
  "attempt_failed",
  "attempt_timed_out",
  "retry_requested",
];

const NOW_ISO = "2026-08-07T12:00:00.000Z";
const RETRYABLE: UploadStatus[] = ["pending", "failed"];

describe("upload_status state machine (§3)", () => {
  it("moves pending → uploading → uploaded on the happy path", () => {
    expect(nextUploadStatus("pending", "attempt_started")).toBe("uploading");
    expect(nextUploadStatus("uploading", "upload_confirmed")).toBe("uploaded");
  });

  it("treats uploaded as terminal and immutable for every event", () => {
    expect(isTerminalUploadStatus("uploaded")).toBe(true);
    for (const event of ALL_EVENTS) {
      expect(nextUploadStatus("uploaded", event)).toBe("uploaded");
    }
  });

  it("returns a failed attempt to a retryable state", () => {
    const afterFailure = nextUploadStatus("uploading", "attempt_failed");
    expect(RETRYABLE).toContain(afterFailure);
    expect(isTerminalUploadStatus(afterFailure)).toBe(false);
  });

  // §5 — "Timeout ≠ 'stop trying'": the row stays pending/failed and the queue
  // picks it up again. There is no global "5 minutes and that's it".
  it("returns a timed-out attempt to a retryable state, never a give-up", () => {
    const afterTimeout = nextUploadStatus("uploading", "attempt_timed_out");
    expect(RETRYABLE).toContain(afterTimeout);
    expect(isTerminalUploadStatus(afterTimeout)).toBe(false);
    expect(nextUploadStatus(afterTimeout, "attempt_started")).toBe("uploading");
  });

  it("puts a failed row back to pending when a retry is requested", () => {
    expect(nextUploadStatus("failed", "retry_requested")).toBe("pending");
    expect(isTerminalUploadStatus("failed")).toBe(false);
    expect(isTerminalUploadStatus("pending")).toBe(false);
    expect(isTerminalUploadStatus("uploading")).toBe(false);
  });

  // §3 — the state vocabulary is exactly pending/uploading/uploaded/failed.
  // Anything resembling ARCHIVED is what caused the permanent photo loss.
  it("has no archive or delete state to fall into", () => {
    expect([...UPLOAD_STATUSES].sort()).toEqual([
      "failed",
      "pending",
      "uploaded",
      "uploading",
    ]);
    for (const status of UPLOAD_STATUSES) {
      expect(status).not.toMatch(/archiv|delet|expire/i);
    }
  });

  it("only ever transitions into a known status", () => {
    for (const status of UPLOAD_STATUSES) {
      for (const event of ALL_EVENTS) {
        expect(UPLOAD_STATUSES).toContain(nextUploadStatus(status, event));
      }
    }
  });
});

describe("row bookkeeping (§3)", () => {
  // §3 — "a row is never deleted or archived as a side effect"; §2/§4 — the
  // local original is never dropped, so local_uri/gallery_asset_id survive.
  it("never drops the row identity or the local original", () => {
    const row = makeRow({ upload_status: "uploading" });

    for (const event of ALL_EVENTS) {
      const next = applyUploadEvent(row, event, NOW_ISO, "boom");

      expect(next.id).toBe(row.id);
      expect(next.photo_path).toBe(row.photo_path);
      expect(next.local_uri).toBe(row.local_uri);
      expect(next.gallery_asset_id).toBe(row.gallery_asset_id);
      expect(Object.keys(next)).toEqual(
        expect.not.arrayContaining(["deleted", "archived", "state"]),
      );
      // The bookkeeping wrapper and the pure machine must not disagree.
      expect(next.upload_status).toBe(
        nextUploadStatus(row.upload_status, event),
      );
    }
  });

  // §3 — `attempts` feeds backoff, `last_attempt_at`/`last_error` exist so
  // support can see from the synced row why a photo is not uploading.
  it("records a failed attempt for backoff and support diagnostics", () => {
    const row = makeRow({ upload_status: "uploading", attempts: 2 });
    const next = applyUploadEvent(
      row,
      "attempt_failed",
      NOW_ISO,
      "Network request failed",
    );

    expect(next.attempts).toBe(3);
    expect(next.last_attempt_at).toBe(NOW_ISO);
    expect(next.last_error).toContain("Network request failed");
  });

  it("never decreases the attempt counter", () => {
    const row = makeRow({ upload_status: "uploading", attempts: 7 });
    for (const event of ALL_EVENTS) {
      expect(
        applyUploadEvent(row, event, NOW_ISO, "boom").attempts,
      ).toBeGreaterThanOrEqual(row.attempts);
    }
  });

  it("keeps the local file reference after a confirmed upload", () => {
    const row = makeRow({ upload_status: "uploading", attempts: 1 });
    const next = applyUploadEvent(row, "upload_confirmed", NOW_ISO);

    expect(next.upload_status).toBe("uploaded");
    expect(next.local_uri).toBe(row.local_uri);
    expect(next.gallery_asset_id).toBe(row.gallery_asset_id);
  });
});
