import { useCallback, useEffect, useState } from "react";

export type SyncTimeout = {
  /** True once `ms` has elapsed while `active` stayed true. */
  elapsed: boolean;
  /** Re-arm the timer (e.g. a manual "retry"), returning to the waiting state. */
  reset: () => void;
};

/**
 * Fires once `ms` has passed while `active` remains true. Resets whenever
 * `active` becomes false, whenever `restartKey` changes, and can be manually
 * re-armed via `reset`.
 *
 * Passing a moving value (e.g. sync download progress) as `restartKey` turns
 * this into a stall detector: while the value keeps changing the countdown
 * keeps restarting, so it only fires after `ms` of no change. Used to hold the
 * first-sync progress screen and only surface "poor connection" / "auth error"
 * when the sync is genuinely stuck (or offline), not merely slow.
 */
export function useSyncTimeout(
  active: boolean,
  ms: number,
  restartKey?: unknown,
): SyncTimeout {
  const [elapsed, setElapsed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(false);
      return;
    }
    setElapsed(false);
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => clearTimeout(timer);
  }, [active, ms, nonce, restartKey]);

  const reset = useCallback(() => setNonce((n) => n + 1), []);

  return { elapsed, reset };
}
