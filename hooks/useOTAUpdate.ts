import * as Updates from "expo-updates";
import { useCallback, useState } from "react";

interface OTAUpdateState {
  /** True when a new bundle has been downloaded and is ready to apply */
  updateReady: boolean;
  /** True while reloadAsync is in-flight — disables buttons to prevent double-tap */
  restarting: boolean;
  /** Optional message from `eas update --message` */
  updateMessage: string | undefined;
  /** Restart the app to apply the downloaded update */
  restart: () => Promise<void>;
}

/**
 * Thin wrapper around the official `Updates.useUpdates()` hook.
 *
 * The native expo-updates layer already checks for and downloads updates
 * automatically on every app launch (checkAutomatically: ON_LOAD default).
 * `useUpdates()` hooks into that native state machine via events, so we stay
 * in sync with whatever the native layer already did — no manual
 * checkForUpdateAsync/fetchUpdateAsync calls needed.
 *
 * Does nothing meaningful in __DEV__ (expo-updates is disabled in dev builds).
 */
export function useOTAUpdate(): OTAUpdateState {
  const { isUpdatePending, availableUpdate } = Updates.useUpdates();
  const [restarting, setRestarting] = useState(false);

  const updateMessage = (
    availableUpdate?.manifest as { metadata?: { message?: string } } | undefined
  )?.metadata?.message;

  const restart = useCallback(async () => {
    if (restarting) return;
    setRestarting(true);
    try {
      await Updates.reloadAsync();
    } catch (err) {
      console.warn("[OTA] Reload failed:", err);
      setRestarting(false);
    }
  }, [restarting]);

  return {
    updateReady: isUpdatePending,
    restarting,
    updateMessage,
    restart,
  };
}
