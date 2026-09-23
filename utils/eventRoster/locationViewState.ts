/**
 * What the Live Location screen shows after each request.
 *
 * A failed refresh keeps the position already on screen and flags it stale;
 * only a first request that fails becomes an error. Pure, so the rules are
 * tested without a network or a timer.
 */

import type { DeviceLocation } from "@/utils/eventRoster/linxupLocation";

type OkLocation = Extract<DeviceLocation, { kind: "ok" }>;
export type LocationErrorKind = Exclude<DeviceLocation["kind"], "ok">;

export type LocationViewState = {
  status: "idle" | "loading" | "ok" | "error";
  location: OkLocation | null;
  /** Why the latest request failed — shown as the error, or under a stale position. */
  errorKind: LocationErrorKind | null;
  /** A refresh failed and `location` is the last known one. */
  refreshFailed: boolean;
};

export const INITIAL_LOCATION_STATE: LocationViewState = {
  status: "idle",
  location: null,
  errorKind: null,
  refreshFailed: false,
};

/** Spinner only when there is nothing to show yet. */
export function startLoading(state: LocationViewState): LocationViewState {
  if (state.location) return state;
  return { ...INITIAL_LOCATION_STATE, status: "loading" };
}

export function applyLocationResult(
  state: LocationViewState,
  result: DeviceLocation,
): LocationViewState {
  if (result.kind === "ok") {
    return {
      status: "ok",
      location: result,
      errorKind: null,
      refreshFailed: false,
    };
  }

  if (state.location) {
    return {
      ...state,
      status: "ok",
      errorKind: result.kind,
      refreshFailed: true,
    };
  }

  return {
    status: "error",
    location: null,
    errorKind: result.kind,
    refreshFailed: false,
  };
}
