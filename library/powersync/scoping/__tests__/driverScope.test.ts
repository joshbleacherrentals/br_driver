/**
 * Covers §15's store — the two ids every scoped query is built from.
 *
 * Small surface, but the `null` default is load-bearing: it is what makes a
 * scoped read return nothing rather than fall back to an unscoped one, so
 * "nothing has been published yet" has to be distinguishable from any real
 * driver, before and after a clear.
 *
 * The value-idempotent setter and the subscription are equally load-bearing now
 * that React reads this through `useSyncExternalStore`: a store that minted a
 * fresh object per publish would re-render every subscriber and recompile every
 * query built from the scope, on every render of the publisher.
 */

import {
  clearDriverScope,
  getDriverScope,
  publishDriverScope,
  subscribeDriverScope,
} from "@/library/powersync/scoping/driverScope";

afterEach(() => {
  clearDriverScope();
});

describe("driver scope store (§15)", () => {
  it("starts empty, so nothing is scoped to a driver that was never set", () => {
    expect(getDriverScope()).toBeNull();
  });

  it("round-trips both ids", () => {
    publishDriverScope("user-a", "driver-a");

    expect(getDriverScope()).toMatchObject({
      userUuid: "user-a",
      driverUuid: "driver-a",
    });
  });

  it("replaces rather than merges when a different driver signs in", () => {
    publishDriverScope("user-a", "driver-a");
    publishDriverScope("user-b", "driver-b");

    expect(getDriverScope()).toMatchObject({
      userUuid: "user-b",
      driverUuid: "driver-b",
    });
  });

  it("returns to null on clear — sign-out leaves no scope behind", () => {
    publishDriverScope("user-a", "driver-a");
    clearDriverScope();

    expect(getDriverScope()).toBeNull();
  });
});

describe("driver scope snapshot stability (§15)", () => {
  it("keeps the same reference when the same ids are republished", () => {
    publishDriverScope("user-a", "driver-a");
    const first = getDriverScope();

    publishDriverScope("user-a", "driver-a");

    // Identity, not equality: `useSyncExternalStore` compares snapshots by
    // reference, and `useMemo([scope])` recompiles a query when it changes.
    expect(getDriverScope()).toBe(first);
  });

  it("mints a new reference when either id actually changes", () => {
    publishDriverScope("user-a", "driver-a");
    const first = getDriverScope();

    publishDriverScope("user-a", "driver-b");

    expect(getDriverScope()).not.toBe(first);
  });
});

describe("driver scope subscription (§15)", () => {
  it("notifies on a real change, stays silent on a no-op republish", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDriverScope(listener);

    publishDriverScope("user-a", "driver-a");
    expect(listener).toHaveBeenCalledTimes(1);

    publishDriverScope("user-a", "driver-a");
    expect(listener).toHaveBeenCalledTimes(1);

    publishDriverScope("user-b", "driver-b");
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("notifies on a clear, but only when there was something to clear", () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDriverScope(listener);

    clearDriverScope();
    expect(listener).not.toHaveBeenCalled();

    publishDriverScope("user-a", "driver-a");
    clearDriverScope();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = jest.fn();
    subscribeDriverScope(listener)();

    publishDriverScope("user-a", "driver-a");

    expect(listener).not.toHaveBeenCalled();
  });
});
