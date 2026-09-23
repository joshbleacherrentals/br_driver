/**
 * "Track" on a bleacher fitted with a Linxup GPS unit — the data behind the
 * in-app Live Location view.
 *
 * Asks the web app where the trailer is (it holds the fleet token — see
 * utils/eventRoster/linxupLocation.ts), then asks again every 30 seconds while
 * the view is open and the app is in the foreground, like the web dashboard.
 *
 * This is the only part of the event roster that needs signal, so nothing here
 * blocks and nothing spins forever: each request gives up after a timeout, a
 * first failure becomes a sentence in the view, and a failed refresh keeps the
 * position already on screen (utils/eventRoster/locationViewState.ts).
 */

import { useStableCallback } from "@/hooks/useStableCallback";
import { fetchDeviceLocation } from "@/utils/eventRoster/linxupLocation";
import {
  applyLocationResult,
  INITIAL_LOCATION_STATE,
  type LocationErrorKind,
  type LocationViewState,
  startLoading,
} from "@/utils/eventRoster/locationViewState";
import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";

const REFRESH_MS = 30 * 1000;
/** A phone in a dead spot can leave fetch hanging for minutes. */
const REQUEST_TIMEOUT_MS = 15 * 1000;

export const LOCATION_MESSAGES: Record<LocationErrorKind, string> = {
  "no-position": "This tracker has not reported a position yet.",
  "not-found": "No GPS tracker is registered for this bleacher.",
  unauthorized:
    "Your session was refused. Sign out and back in, then try again.",
  unreachable:
    "Could not reach the tracker. Check your connection and try again.",
  "not-configured": "Tracking is not available in this build.",
};

export type TrackedBleacher = {
  deviceId: string;
  bleacherNumber: string | null;
};

function fetchWithTimeout(
  url: string,
  init: { headers: Record<string, string> },
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() =>
    clearTimeout(timer),
  );
}

export function useBleacherLocation() {
  // Clerk mints a new getToken every render; unwrapped it would restart the
  // polling effect (and fire a request) on every render.
  const getToken = useStableCallback(useAuth().getToken);
  const [target, setTarget] = useState<TrackedBleacher | null>(null);
  const [state, setState] = useState<LocationViewState>(INITIAL_LOCATION_STATE);
  /** Bumped by "Try again" to restart the request cycle now. */
  const [attempt, setAttempt] = useState(0);

  const open = useCallback(
    (deviceId: string | null, bleacherNumber: string | null) => {
      if (!deviceId) return;
      setState(INITIAL_LOCATION_STATE);
      setTarget({ deviceId, bleacherNumber });
    },
    [],
  );

  const close = useCallback(() => {
    setTarget(null);
    setState(INITIAL_LOCATION_STATE);
  }, []);

  const deviceId = target?.deviceId ?? null;

  useEffect(() => {
    if (!deviceId) return;

    // A response that lands after close / a switch to another bleacher is dropped.
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    let inFlight = false;

    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setState(startLoading);
      try {
        const token = (await getToken()) ?? "";
        const result = await fetchDeviceLocation(deviceId, {
          baseUrl: process.env.EXPO_PUBLIC_WEB_URL ?? "",
          token,
          fetchImpl: fetchWithTimeout as never,
        });
        if (!cancelled) setState((prev) => applyLocationResult(prev, result));
      } catch (error) {
        // getToken can throw offline; fetchDeviceLocation itself never does.
        console.warn("[track] request failed", error);
        if (!cancelled) {
          setState((prev) =>
            applyLocationResult(prev, { kind: "unreachable" }),
          );
        }
      } finally {
        inFlight = false;
      }
    };

    const start = () => {
      if (interval) return;
      void load();
      interval = setInterval(() => void load(), REFRESH_MS);
    };
    const stop = () => {
      if (interval) clearInterval(interval);
      interval = null;
    };

    if (AppState.currentState === "active") start();
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") start();
      else stop();
    });

    return () => {
      cancelled = true;
      stop();
      subscription.remove();
    };
  }, [deviceId, getToken, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return {
    target,
    state,
    errorMessage: state.errorKind ? LOCATION_MESSAGES[state.errorKind] : null,
    open,
    close,
    retry,
  };
}
