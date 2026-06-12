import { useCallback, useEffect, useRef, useState } from "react";
import * as Updates from "expo-updates";

export type OTAUpdateStatus = "idle" | "checking" | "downloading" | "ready" | "error";

interface OTAUpdateState {
  /** Current update status */
  status: OTAUpdateStatus;
  /** True when a new bundle has been downloaded and is ready to apply */
  updateReady: boolean;
  /** Restart the app to apply the downloaded update */
  restart: () => Promise<void>;
  /** Manually trigger an update check */
  checkForUpdate: () => Promise<void>;
}

/**
 * Non-blocking OTA update hook.
 *
 * On mount it silently checks for an EAS update, downloads it in the
 * background if available, and exposes `updateReady` + `restart()` so
 * a banner can prompt the user without ever blocking the app.
 *
 * Does nothing in __DEV__ (expo-updates is disabled in dev client / Expo Go).
 */
export function useOTAUpdate(): OTAUpdateState {
  const [status, setStatus] = useState<OTAUpdateStatus>("idle");
  const isMounted = useRef(true);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    // expo-updates APIs are not available in dev
    if (__DEV__) return;

    try {
      setStatus("checking");
      const check = await Updates.checkForUpdateAsync();

      if (!check.isAvailable) {
        if (isMounted.current) setStatus("idle");
        return;
      }

      if (isMounted.current) setStatus("downloading");
      await Updates.fetchUpdateAsync();

      if (isMounted.current) setStatus("ready");
    } catch (err) {
      console.warn("[OTA] Update check failed:", err);
      if (isMounted.current) setStatus("error");
    }
  }, []);

  // Check once on mount
  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  const restart = useCallback(async () => {
    await Updates.reloadAsync();
  }, []);

  return {
    status,
    updateReady: status === "ready",
    restart,
    checkForUpdate,
  };
}
