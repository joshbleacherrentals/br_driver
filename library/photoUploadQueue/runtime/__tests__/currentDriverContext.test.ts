/**
 * Covers §15's store — the two ids every scoped query is built from.
 *
 * Small surface, but the `null` default is load-bearing: it is what makes an
 * adapter return nothing rather than fall back to an unscoped read, so
 * "nothing has been published yet" has to be distinguishable from any real
 * driver, before and after a clear.
 */

import {
  clearCurrentDriverContext,
  getCurrentDriverContext,
  setCurrentDriverContext,
} from "@/library/photoUploadQueue/runtime/currentDriverContext";

afterEach(() => {
  clearCurrentDriverContext();
});

describe("current driver context (§15)", () => {
  it("starts empty, so nothing is scoped to a driver that was never set", () => {
    expect(getCurrentDriverContext()).toBeNull();
  });

  it("round-trips both ids", () => {
    setCurrentDriverContext({ userUuid: "user-a", driverUuid: "driver-a" });

    expect(getCurrentDriverContext()).toEqual({
      userUuid: "user-a",
      driverUuid: "driver-a",
    });
  });

  it("replaces rather than merges when a different driver signs in", () => {
    setCurrentDriverContext({ userUuid: "user-a", driverUuid: "driver-a" });
    setCurrentDriverContext({ userUuid: "user-b", driverUuid: "driver-b" });

    expect(getCurrentDriverContext()).toEqual({
      userUuid: "user-b",
      driverUuid: "driver-b",
    });
  });

  it("returns to null on clear — sign-out leaves no scope behind", () => {
    setCurrentDriverContext({ userUuid: "user-a", driverUuid: "driver-a" });
    clearCurrentDriverContext();

    expect(getCurrentDriverContext()).toBeNull();
  });

  it("accepts an explicit null, the same as clearing", () => {
    setCurrentDriverContext({ userUuid: "user-a", driverUuid: "driver-a" });
    setCurrentDriverContext(null);

    expect(getCurrentDriverContext()).toBeNull();
  });
});
