/**
 * A clock that re-renders on a fixed tick.
 *
 * The 24-hour window closes while the driver is looking at the screen, and
 * nothing else would tell React about it: an Edit button that keeps working
 * after its window expires is a write the server refuses and PowerSync drops in
 * silence. A minute is fine — the countdown is displayed in hours and minutes,
 * and the mutations re-check the window at submit anyway.
 */

import { useEffect, useState } from "react";

const DEFAULT_TICK_MS = 60 * 1000;

export function useNow(tickMs: number = DEFAULT_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), tickMs);
    return () => clearInterval(timer);
  }, [tickMs]);

  return now;
}
