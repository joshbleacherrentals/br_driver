import * as Updates from "expo-updates";
import { useCallback, useEffect, useRef, useState } from "react";

export type OTAUpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "error";

interface OTAUpdateState {
  /** Current update status */
  status: OTAUpdateStatus;
  /** True when a new bundle has been downloaded and is ready to apply */
  updateReady: boolean;
  /** True while reloadAsync is in-flight — disables buttons to prevent double-tap */
  restarting: boolean;
  /** Optional message from `eas update --message` */
  updateMessage: string | undefined;
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
  const [restarting, setRestarting] = useState(false);
  const [updateMessage, setUpdateMessage] = useState<string | undefined>(
    undefined,
  );
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

      if (isMounted.current) {
        setStatus("downloading");
        const msg = (
          check.manifest as { metadata?: { message?: string } } | undefined
        )?.metadata?.message;
        setUpdateMessage(msg);
      }
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
    if (restarting) return;
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch (err) {
      console.warn("[OTA] Reload failed:", err);
      if (isMounted.current) setRestarting(false);
    }
  }, [restarting]);

  return {
    status,
    updateReady: status === "ready",
    restarting,
    updateMessage,
    restart,
    checkForUpdate,
  };
}
