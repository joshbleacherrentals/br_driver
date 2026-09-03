import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import rawEntries from "./entries.json";
import {
  getLastSeenVersion,
  setLastSeenVersion,
} from "./storage/lastSeenVersion";
import type { ChangeLogEntry } from "./types";
import { compareVersions } from "./util/compareVersions";

// Sorted defensively at import time rather than trusting entries.json's own
// order — it's hand-edited, and a release added out of order must not land
// at the top of the list or lose its "Latest" badge.
const CHANGELOG_ENTRIES: ChangeLogEntry[] = [...rawEntries].sort((a, b) =>
  compareVersions(b.version, a.version),
);

interface ChangeLogContextValue {
  /** Every release, newest first. */
  entries: ChangeLogEntry[];
  /** True when a release exists that this device has not opened. */
  hasUnread: boolean;
  /** Mark everything up to the newest release as read. */
  markAllRead: () => void;
}

const ChangeLogContext = createContext<ChangeLogContextValue>({
  entries: [],
  hasUnread: false,
  markAllRead: () => {},
});

export function useChangeLog(): ChangeLogContextValue {
  return useContext(ChangeLogContext);
}

/**
 * Holds the unread state for the What's New page.
 *
 * Shared rather than per-screen so opening the page clears the dot on the
 * drawer button and the menu row in the same render, without either of them
 * re-reading storage.
 */
export function ChangeLogProvider({ children }: { children: React.ReactNode }) {
  const entries = CHANGELOG_ENTRIES;
  const latest = entries[0]?.version ?? null;

  // null while storage is still loading — the dot must not flash on every cold
  // start, so it stays hidden until we actually know.
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    getLastSeenVersion().then((version) => {
      if (!active) return;
      setLastSeen(version);
      setLoaded(true);
    });

    return () => {
      active = false;
    };
  }, []);

  const markAllRead = useCallback(() => {
    if (!latest) return;
    setLastSeen(latest);
    // Fire-and-forget: the UI must not wait on storage.
    void setLastSeenVersion(latest);
  }, [latest]);

  const hasUnread =
    loaded &&
    latest !== null &&
    (lastSeen === null || compareVersions(latest, lastSeen) > 0);

  const value = useMemo(
    () => ({ entries, hasUnread, markAllRead }),
    [entries, hasUnread, markAllRead],
  );

  return (
    <ChangeLogContext.Provider value={value}>
      {children}
    </ChangeLogContext.Provider>
  );
}
