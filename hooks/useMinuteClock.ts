import { useEffect, useState } from "react";

/** `Date.now()`, refreshed every minute — for countdowns that read in minutes. */
export function useMinuteClock(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  return now;
}
