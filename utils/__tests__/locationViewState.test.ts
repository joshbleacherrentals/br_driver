/**
 * What the Live Location screen shows after each request.
 *
 * The screen re-asks every 30 seconds. A failed refresh must not wipe a
 * position the driver is already looking at — a trailer's last known spot is
 * still the most useful thing on screen — so it keeps the data and flags it
 * stale instead. Only a first request that fails shows an error.
 */

import type { DeviceLocation } from "@/utils/eventRoster/linxupLocation";
import {
  applyLocationResult,
  INITIAL_LOCATION_STATE,
  startLoading,
} from "@/utils/eventRoster/locationViewState";

const here: DeviceLocation = { kind: "ok", lat: 1, lng: 2, status: "Moving" };
const there: DeviceLocation = { kind: "ok", lat: 3, lng: 4 };

describe("location view state", () => {
  it("starts idle with nothing to show", () => {
    expect(INITIAL_LOCATION_STATE).toEqual({
      status: "idle",
      location: null,
      errorKind: null,
      refreshFailed: false,
    });
  });

  it("shows loading on the first request", () => {
    expect(startLoading(INITIAL_LOCATION_STATE).status).toBe("loading");
  });

  it("does not drop back to a spinner while refreshing a position on screen", () => {
    const shown = applyLocationResult(
      startLoading(INITIAL_LOCATION_STATE),
      here,
    );

    expect(startLoading(shown)).toBe(shown);
  });

  it("shows the position once it arrives", () => {
    const state = applyLocationResult(
      startLoading(INITIAL_LOCATION_STATE),
      here,
    );

    expect(state).toEqual({
      status: "ok",
      location: here,
      errorKind: null,
      refreshFailed: false,
    });
  });

  it("moves to the new position on a successful refresh", () => {
    const first = applyLocationResult(INITIAL_LOCATION_STATE, here);

    expect(applyLocationResult(first, there).location).toBe(there);
  });

  it.each([
    "unreachable",
    "no-position",
    "not-found",
    "unauthorized",
    "not-configured",
  ] as const)("shows the %s error when the first request fails", (kind) => {
    const state = applyLocationResult(startLoading(INITIAL_LOCATION_STATE), {
      kind,
    });

    expect(state).toEqual({
      status: "error",
      location: null,
      errorKind: kind,
      refreshFailed: false,
    });
  });

  it("keeps the last position and flags it when a refresh fails", () => {
    const shown = applyLocationResult(INITIAL_LOCATION_STATE, here);

    const state = applyLocationResult(shown, { kind: "unreachable" });

    expect(state).toEqual({
      status: "ok",
      location: here,
      errorKind: "unreachable",
      refreshFailed: true,
    });
  });

  it("clears the stale flag once a refresh succeeds again", () => {
    const stale = applyLocationResult(
      applyLocationResult(INITIAL_LOCATION_STATE, here),
      { kind: "unreachable" },
    );

    expect(applyLocationResult(stale, there)).toEqual({
      status: "ok",
      location: there,
      errorKind: null,
      refreshFailed: false,
    });
  });
});
