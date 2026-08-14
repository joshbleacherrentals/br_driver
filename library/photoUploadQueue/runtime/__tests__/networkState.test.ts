/**
 * Covers §13 — the connectivity signal the retry gate is built on.
 *
 * The rule that matters most here is the *asymmetry*: only an explicit negative
 * from the platform means offline. Everything else — a partial state object, an
 * unknown connection type, or a network-state read that throws — reads as
 * online. Getting this backwards would be far worse than a wasted attempt: a
 * queue that decides it is permanently offline stops uploading photos entirely,
 * silently, with no driver-visible cause. One redundant attempt, by contrast,
 * costs a single request that the §6 backoff schedule already spaces out.
 */

import * as Network from "expo-network";

import {
  isNetworkAvailable,
  subscribeNetworkAvailability,
} from "@/library/photoUploadQueue/runtime/networkState";

jest.mock("expo-network", () => ({
  __esModule: true,
  getNetworkStateAsync: jest.fn(),
  addNetworkStateListener: jest.fn(),
}));

const mockNetwork = Network as unknown as {
  getNetworkStateAsync: jest.Mock;
  addNetworkStateListener: jest.Mock;
};

describe("isNetworkAvailable (§13)", () => {
  it("reports offline when the device has no active connection", async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
    });

    expect(await isNetworkAvailable()).toBe(false);
  });

  it("reports offline when connected to a network with no internet behind it", async () => {
    // Captive portal / hotel Wi-Fi: connected, but nothing routes.
    mockNetwork.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: false,
    });

    expect(await isNetworkAvailable()).toBe(false);
  });

  it("reports online when the platform confirms both", async () => {
    mockNetwork.getNetworkStateAsync.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
    });

    expect(await isNetworkAvailable()).toBe(true);
  });

  it("treats an unknown state as online rather than guessing offline", async () => {
    // `isInternetReachable` is optional in expo-network's own type — absence is
    // not a negative answer.
    mockNetwork.getNetworkStateAsync.mockResolvedValue({ isConnected: true });

    expect(await isNetworkAvailable()).toBe(true);
  });

  it("fails open when the network-state read itself throws", async () => {
    mockNetwork.getNetworkStateAsync.mockRejectedValue(
      new Error("native module unavailable"),
    );

    // A broken check must never be able to permanently silence the queue.
    expect(await isNetworkAvailable()).toBe(true);
  });
});

describe("subscribeNetworkAvailability (§13)", () => {
  it("maps listener events through the same predicate as the poll", async () => {
    let emit: ((event: unknown) => void) | undefined;
    mockNetwork.addNetworkStateListener.mockImplementation((listener) => {
      emit = listener;
      return { remove: jest.fn() };
    });

    const seen: boolean[] = [];
    subscribeNetworkAvailability((online) => seen.push(online));

    emit?.({ isConnected: false, isInternetReachable: false });
    emit?.({ isConnected: true, isInternetReachable: false });
    emit?.({ isConnected: true, isInternetReachable: true });
    emit?.({ isConnected: true });

    expect(seen).toEqual([false, false, true, true]);

    // The listener and the poll may never disagree about the same state.
    for (const state of [
      { isConnected: false, isInternetReachable: false },
      { isConnected: true, isInternetReachable: false },
      { isConnected: true, isInternetReachable: true },
    ]) {
      mockNetwork.getNetworkStateAsync.mockResolvedValue(state);
      const viaPoll = await isNetworkAvailable();
      const viaListener: boolean[] = [];
      const stop = subscribeNetworkAvailability((online) =>
        viaListener.push(online),
      );
      emit?.(state);
      stop();
      expect(viaListener).toEqual([viaPoll]);
    }
  });

  it("forwards the subscription's remove() as the unsubscribe", () => {
    const remove = jest.fn();
    mockNetwork.addNetworkStateListener.mockReturnValue({ remove });

    const unsubscribe = subscribeNetworkAvailability(() => {});
    expect(remove).not.toHaveBeenCalled();

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("degrades to a no-op unsubscribe when the listener cannot be attached", () => {
    mockNetwork.addNetworkStateListener.mockImplementation(() => {
      throw new Error("native module unavailable");
    });

    const unsubscribe = subscribeNetworkAvailability(() => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe("native module availability (§13)", () => {
  // `expo-network` resolves its native module at import time and throws when it
  // isn't linked. A static import would therefore turn an OTA landing on an
  // older binary into a crash on launch — strictly worse than the wasted
  // attempts the gate exists to prevent. Resolution is lazy and its failure
  // degrades to the pre-§13 behaviour: always attempt.
  it("degrades to always-online when the native module isn't in the binary", async () => {
    let isolated:
      | typeof import("@/library/photoUploadQueue/runtime/networkState")
      | undefined;

    jest.isolateModules(() => {
      jest.doMock("expo-network", () => {
        throw new Error("Cannot find native module 'ExpoNetwork'");
      });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      isolated = require("@/library/photoUploadQueue/runtime/networkState");
    });

    // Importing the module at all is half the assertion: a static import of
    // `expo-network` would have thrown on the line above.
    expect(isolated).toBeDefined();
    await expect(isolated!.isNetworkAvailable()).resolves.toBe(true);
    expect(() => isolated!.subscribeNetworkAvailability(() => {})()).not.toThrow();
  });
});
