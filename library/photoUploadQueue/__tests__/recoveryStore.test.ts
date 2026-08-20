/**
 * Covers: the §6 gate store, and specifically retiring a verdict for a row the
 * driver has just repaired.
 *
 * A verdict describes the object that was at a row's path. Replacing the photo
 * (or deleting the row) makes it describe nothing, so it has to be dropped —
 * otherwise the app keeps telling the driver a photo is lost the instant after
 * they fixed it, and invites them to replace it again.
 */

import {
  clearRecoveryState,
  forgetConfirmedMissingPhotoIds,
  getRecoveryState,
  setConfirmedMissingPhotoIds,
  subscribeRecoveryState,
} from "@/library/photoUploadQueue/runtime/recoveryStore";

const ids = () => [...getRecoveryState().confirmedMissingPhotoIds].sort();

beforeEach(() => {
  clearRecoveryState();
});

describe("publishing bucket verdicts", () => {
  it("exposes the confirmed-missing ids", () => {
    setConfirmedMissingPhotoIds(new Set(["a", "b"]));
    expect(ids()).toEqual(["a", "b"]);
  });

  it("replaces rather than merges, so a healed photo cannot linger", () => {
    setConfirmedMissingPhotoIds(new Set(["a", "b"]));
    setConfirmedMissingPhotoIds(new Set(["b"]));
    expect(ids()).toEqual(["b"]);
  });

  it("treats an empty verdict as a shut gate", () => {
    setConfirmedMissingPhotoIds(new Set(["a"]));
    setConfirmedMissingPhotoIds(new Set());
    expect(ids()).toEqual([]);
  });
});

describe("retiring a repaired row's verdict", () => {
  it("drops only the named rows", () => {
    setConfirmedMissingPhotoIds(new Set(["a", "b", "c"]));
    forgetConfirmedMissingPhotoIds(["b"]);
    expect(ids()).toEqual(["a", "c"]);
  });

  it("shuts the gate once the last one is retired", () => {
    setConfirmedMissingPhotoIds(new Set(["a"]));
    forgetConfirmedMissingPhotoIds(["a"]);
    expect(ids()).toEqual([]);
  });

  it("notifies subscribers so the banner updates immediately", () => {
    setConfirmedMissingPhotoIds(new Set(["a", "b"]));

    const listener = jest.fn();
    const unsubscribe = subscribeRecoveryState(listener);

    forgetConfirmedMissingPhotoIds(["a"]);
    expect(listener).toHaveBeenCalledTimes(1);

    // Nothing matched — no state change, so no needless re-render.
    forgetConfirmedMissingPhotoIds(["zzz"]);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it("keeps the snapshot reference stable when nothing changes", () => {
    setConfirmedMissingPhotoIds(new Set(["a"]));
    const before = getRecoveryState();
    forgetConfirmedMissingPhotoIds(["not-present"]);
    expect(getRecoveryState()).toBe(before);
  });
});
