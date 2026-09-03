/**
 * The newest release this device has read, remembered locally.
 *
 * Deliberately not the `Users.changelog_last_read_at` column the web app uses:
 * that column tracks the web changelog for the same person, and the two lists
 * are different releases. Local storage also keeps the unread dot correct on a
 * phone that has been offline for a week.
 *
 * SecureStore is what the app already uses for device preferences (see
 * ThemeProvider); every call is best-effort and resolves rather than throwing,
 * because a missing dot is never worth a crash.
 */
import * as SecureStore from "expo-secure-store";

const STORAGE_KEY = "changelog.lastSeenVersion";

export async function getLastSeenVersion(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY);
  } catch {
    return null;
  }
}

export async function setLastSeenVersion(version: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, version);
  } catch {
    // Nothing to recover — the dot reappears next launch.
  }
}
