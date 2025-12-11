// utils/supabase/supaLegend.ts
import { observable } from "@legendapp/state";
import { observablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
import { configureSynced } from "@legendapp/state/sync";
import { syncedSupabase } from "@legendapp/state/sync-plugins/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "./supabaseClient";

// Provide a function to generate ids locally
const generateId = () => uuidv4();

// Create a configured sync function
const customSynced = configureSynced(syncedSupabase, {
  // Use React Native Async Storage
  persist: {
    plugin: observablePersistAsyncStorage({
      AsyncStorage,
    }),
  },
  generateId,
  supabase,
  changesSince: "last-sync",
  fieldCreatedAt: "created_at",
  fieldUpdatedAt: "updated_at",
  fieldDeleted: "deleted",
  retry: {
    infinite: true, // Retry changes with exponential backoff
    backoff: "exponential",
    delay: 1000, // Start with 1 second delay
    maxDelay: 30000, // Max 30 seconds between retries
  },
  // Handle conflict resolution: clear stale pending changes before fetching
  onBeforeGet: async ({ pendingChanges, clearPendingChanges }) => {
    if (pendingChanges && Object.keys(pendingChanges).length > 0) {
      // Check if any pending changes are stale (remote is newer)
      let hasStale = false;
      for (const key of Object.keys(pendingChanges)) {
        const pending = pendingChanges[key];
        const remoteUpdatedAt = pending?.p?.updated_at;
        const localUpdatedAt = pending?.v?.updated_at;

        if (remoteUpdatedAt && localUpdatedAt) {
          const remoteDate = new Date(remoteUpdatedAt).getTime();
          const localDate = new Date(localUpdatedAt).getTime();
          if (remoteDate > localDate) {
            console.log(`[onBeforeGet] Stale pending change detected for ${key}, remote is newer`);
            hasStale = true;
            break;
          }
        }
      }

      if (hasStale) {
        console.log("[onBeforeGet] Clearing stale pending changes before fetch");
        await clearPendingChanges();
      }
    }
  },
});

// The synced todos collection
export const todos$ = observable(
  customSynced({
    supabase,
    collection: "Todos", // <-- must match Database["public"]["Tables"]
    select: (from: any) => from.select("id,text,done,created_at,updated_at,deleted"),
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    // Persist data and pending changes locally
    persist: {
      name: "todos",
      retrySync: true, // Persist pending changes and retry
    },
  })
);

// Set up automatic stale pending change detection
// This runs periodically and when the observable changes to detect and clear stale changes
let staleCheckInterval: ReturnType<typeof setInterval> | null = null;
let isCheckingStale = false; // Prevent concurrent checks

export function initTodosSync() {
  // Check for stale pending changes every 2 seconds (reduced from 5)
  if (!staleCheckInterval) {
    staleCheckInterval = setInterval(async () => {
      if (isCheckingStale) return; // Skip if already checking
      isCheckingStale = true;
      try {
        const count = await clearStalePendingChanges();
        if (count > 0) {
          console.log(`[initTodosSync] Auto-cleared ${count} stale pending changes`);
        }
      } finally {
        isCheckingStale = false;
      }
    }, 2000);
  }

  // Also subscribe to changes and check for stale pending after each change
  todos$.onChange(async ({ isFromSync }) => {
    // Check when receiving any changes, not just remote
    // This catches realtime updates and local changes
    if (isCheckingStale) return;
    isCheckingStale = true;
    try {
      // Immediate check for remote changes
      if (isFromSync) {
        const count = await clearStalePendingChanges();
        if (count > 0) {
          console.log(`[initTodosSync] Cleared ${count} stale pending changes after remote update`);
        }
      }
    } finally {
      isCheckingStale = false;
    }
  });
}

// Clean up on unmount
export function cleanupTodosSync() {
  if (staleCheckInterval) {
    clearInterval(staleCheckInterval);
    staleCheckInterval = null;
  }
}

// Helper functions

export function addTodo(text: string) {
  const id = generateId();
  todos$[id].assign({
    id,
    text,
    // done/deleted will use defaults from the server if omitted
  });
}

export function toggleDone(id: string) {
  const currentDone = todos$[id].done.get();
  todos$[id].assign({
    done: !currentDone,
    updated_at: new Date().toISOString(), // Mark as locally modified
  });
}

export function deleteTodo(id: string) {
  // Soft delete by setting deleted to true
  todos$[id].assign({
    deleted: true,
    updated_at: new Date().toISOString(), // Mark as locally modified
  });
}

// Clear all cached/pending data (useful after schema changes)
export async function clearTodosCache() {
  const { syncState } = await import("@legendapp/state");
  const state = syncState(todos$).get();
  await state?.clearPersist();
  await state?.reset();
}

// Force sync - triggers both read and retries pending writes
// IMPORTANT: This now clears stale pending changes BEFORE syncing to prevent
// pushing outdated changes that would overwrite newer remote data
export async function forceSyncTodos() {
  const { syncState } = await import("@legendapp/state");
  const state$ = syncState(todos$);
  const state = state$.get();

  // Check for pending changes before doing anything
  const pendingBefore = state?.getPendingChanges?.();
  console.log("[forceSyncTodos] Pending changes before:", JSON.stringify(pendingBefore));

  // FIRST: Clear any stale pending changes by fetching remote state
  // This prevents us from pushing outdated local changes
  const clearedCount = await clearStalePendingChanges();
  if (clearedCount > 0) {
    console.log(`[forceSyncTodos] Cleared ${clearedCount} stale pending changes before sync`);
  }

  // Check pending again after clearing stale
  const pendingAfterClear = state?.getPendingChanges?.();
  console.log(
    "[forceSyncTodos] Pending changes after clearing stale:",
    JSON.stringify(pendingAfterClear)
  );

  // Trigger a sync which should:
  // 1. Fetch latest from remote
  // 2. Retry any remaining (valid) pending local changes
  await state?.sync();

  // If there are still pending changes after sync, the retry mechanism should handle them
  const pendingAfterSync = state?.getPendingChanges?.();
  console.log("[forceSyncTodos] Pending changes after sync:", JSON.stringify(pendingAfterSync));

  // One more stale check after sync in case new conflicts emerged
  if (pendingAfterSync && Object.keys(pendingAfterSync).length > 0) {
    const finalClearCount = await clearStalePendingChanges();
    if (finalClearCount > 0) {
      console.log(
        `[forceSyncTodos] Cleared ${finalClearCount} more stale pending changes after sync`
      );
    }
  }
}

/**
 * Reconcile local state with remote - detects and removes orphaned local records
 * that were hard-deleted on the server while the client was offline.
 * Returns the number of orphaned records found and removed.
 */
export async function reconcileTodosWithRemote(): Promise<{
  orphanedCount: number;
  orphanedIds: string[];
}> {
  console.log("[reconcileTodosWithRemote] Starting reconciliation...");

  // Get all local todo IDs (excluding already deleted ones)
  const localTodos = todos$.get();
  if (!localTodos) {
    return { orphanedCount: 0, orphanedIds: [] };
  }

  const localIds = Object.keys(localTodos).filter((id) => {
    const todo = localTodos[id];
    return todo && !todo.deleted;
  });

  if (localIds.length === 0) {
    console.log("[reconcileTodosWithRemote] No local todos to reconcile");
    return { orphanedCount: 0, orphanedIds: [] };
  }

  console.log(`[reconcileTodosWithRemote] Checking ${localIds.length} local todos against remote`);

  // Fetch all IDs that exist on the remote
  const { data: remoteTodos, error } = await supabase.from("Todos").select("id").in("id", localIds);

  if (error) {
    console.error("[reconcileTodosWithRemote] Error fetching remote IDs:", error.message);
    return { orphanedCount: 0, orphanedIds: [] };
  }

  const remoteIds = new Set((remoteTodos || []).map((t) => t.id));

  // Find local IDs that don't exist on remote (orphaned)
  const orphanedIds = localIds.filter((id) => !remoteIds.has(id));

  if (orphanedIds.length > 0) {
    console.log(
      `[reconcileTodosWithRemote] Found ${orphanedIds.length} orphaned todos:`,
      orphanedIds
    );

    // Remove orphaned records from local state
    for (const id of orphanedIds) {
      // Mark as deleted locally so it gets removed from the UI
      // We use delete() to completely remove it from the observable
      todos$[id].delete();
    }

    console.log("[reconcileTodosWithRemote] Removed orphaned todos from local state");
  } else {
    console.log("[reconcileTodosWithRemote] No orphaned todos found");
  }

  return { orphanedCount: orphanedIds.length, orphanedIds };
}

/**
 * Debug function to inspect the current sync state
 * Useful for debugging sync issues across devices
 */
export async function debugSyncState(todoId?: string) {
  const { syncState } = await import("@legendapp/state");
  const state$ = syncState(todos$);
  const state = state$.get();

  console.log("=== SYNC DEBUG ===");
  console.log("isLoaded:", state?.isLoaded);
  console.log("isPersistLoaded:", state?.isPersistLoaded);
  console.log("error:", state?.error);

  const pending = state?.getPendingChanges?.();
  console.log("Pending changes:", JSON.stringify(pending, null, 2));

  if (todoId) {
    const todoData = todos$[todoId].get();
    console.log(`Todo ${todoId}:`, JSON.stringify(todoData, null, 2));
  }

  // Show all todos with their updated_at
  const allTodos = todos$.get();
  console.log("All todos (id, done, updated_at):");
  Object.entries(allTodos || {}).forEach(([id, todo]: [string, any]) => {
    if (todo && !todo.deleted) {
      console.log(`  ${id.slice(0, 8)}...: done=${todo.done}, updated_at=${todo.updated_at}`);
    }
  });
  console.log("=== END DEBUG ===");
}

/**
 * Force refresh from remote - clears ALL local state and pending changes,
 * then fetches fresh data from the server.
 * Use this when local state is out of sync and you want to accept remote as truth.
 */
export async function forceRefreshFromRemote(): Promise<void> {
  console.log("[forceRefreshFromRemote] Starting force refresh...");

  const { syncState } = await import("@legendapp/state");
  const state$ = syncState(todos$);
  const state = state$.get();

  // Clear pending changes first
  const pending = state?.getPendingChanges?.();
  if (pending && Object.keys(pending).length > 0) {
    console.log(`[forceRefreshFromRemote] Clearing ${Object.keys(pending).length} pending changes`);

    // For each pending change, we need to accept the remote value
    for (const id of Object.keys(pending)) {
      const pendingItem = pending[id];
      if (pendingItem?.p) {
        // p = persisted/remote state, apply it to clear the pending change
        console.log(`[forceRefreshFromRemote] Restoring remote state for ${id}`);
        todos$[id].set(pendingItem.p);
      }
    }
  }

  // Clear persisted state and reload
  await state?.clearPersist?.();

  // Trigger a fresh sync from remote
  await state?.sync?.();

  console.log("[forceRefreshFromRemote] Force refresh complete");
}

/**
 * Clear stale pending changes where remote is newer or already synced.
 * This handles two cases:
 * 1. Remote updated_at is newer than local - accept remote state
 * 2. p is null but the record exists on remote - the sync succeeded but pending wasn't cleared
 */
export async function clearStalePendingChanges(): Promise<number> {
  console.log("[clearStalePendingChanges] Checking for stale pending changes...");

  const { syncState } = await import("@legendapp/state");
  const state$ = syncState(todos$);
  const state = state$.get();

  const pending = state?.getPendingChanges?.();
  if (!pending || Object.keys(pending).length === 0) {
    console.log("[clearStalePendingChanges] No pending changes");
    return 0;
  }

  let clearedCount = 0;
  const pendingKeys = Object.keys(pending);

  // Extract unique UUIDs from pending keys (keys can be "uuid" or "uuid/field")
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
  const pendingIds = [
    ...new Set(
      pendingKeys
        .map((key) => {
          const match = key.match(uuidRegex);
          return match ? match[0] : null;
        })
        .filter((id): id is string => id !== null)
    ),
  ];

  if (pendingIds.length === 0) {
    console.log("[clearStalePendingChanges] No valid UUIDs found in pending changes");
    return 0;
  }

  // Fetch current state from remote for all pending items
  const { data: remoteTodos, error } = await supabase
    .from("Todos")
    .select("id,text,done,created_at,updated_at,deleted")
    .in("id", pendingIds);

  if (error) {
    console.error("[clearStalePendingChanges] Error fetching remote state:", error.message);
    return 0;
  }

  const remoteMap = new Map(remoteTodos?.map((t) => [t.id, t]) || []);

  for (const key of pendingKeys) {
    const pendingItem = pending[key];

    // Check if this is a full object pending change (key is just UUID)
    // or a field-level change (key is UUID/field)
    const isFullObject = uuidRegex.test(key) && !key.includes("/");
    const id = key.match(uuidRegex)?.[0];

    if (!id) {
      console.log(`[clearStalePendingChanges] Skipping invalid key: ${key}`);
      continue;
    }

    const remoteTodo = remoteMap.get(id);

    if (isFullObject) {
      // Full object pending change
      const localValue = pendingItem?.v;

      // Case 1: p is null but record exists on remote - sync succeeded, clear pending
      if (pendingItem?.p === null && remoteTodo) {
        console.log(
          `[clearStalePendingChanges] Record ${id} exists on remote with p=null, checking if synced...`
        );

        // Compare key fields to see if remote matches local
        const localDone = localValue?.done;
        const localDeleted = localValue?.deleted;
        const remoteDone = remoteTodo.done;
        const remoteDeleted = remoteTodo.deleted;

        if (localDone === remoteDone && localDeleted === remoteDeleted) {
          console.log(
            `[clearStalePendingChanges] Record ${id} is already synced, clearing pending`
          );
          todos$[id].set(remoteTodo);
          clearedCount++;
          continue;
        }

        // If remote has a newer updated_at, accept remote
        const remoteUpdatedAt = remoteTodo.updated_at;
        const localUpdatedAt = localValue?.updated_at;
        if (remoteUpdatedAt && localUpdatedAt) {
          const remoteDate = new Date(remoteUpdatedAt).getTime();
          const localDate = new Date(localUpdatedAt).getTime();
          if (remoteDate >= localDate) {
            console.log(
              `[clearStalePendingChanges] Remote is same or newer for ${id}, accepting remote`
            );
            todos$[id].set(remoteTodo);
            clearedCount++;
            continue;
          }
        }
      }

      // Case 2: p exists and remote is newer
      const remoteUpdatedAt = pendingItem?.p?.updated_at;
      const localUpdatedAt = localValue?.updated_at;

      if (remoteUpdatedAt && localUpdatedAt) {
        const remoteDate = new Date(remoteUpdatedAt).getTime();
        const localDate = new Date(localUpdatedAt).getTime();

        if (remoteDate > localDate) {
          console.log(
            `[clearStalePendingChanges] Remote is newer for ${id}, accepting remote state`
          );
          todos$[id].set(pendingItem.p);
          clearedCount++;
        }
      }
    } else {
      // Field-level pending change (e.g., "uuid/updated_at", "uuid/done")
      // For these, we just need to check if the remote value matches
      if (remoteTodo) {
        const fieldPath = key.slice(id.length + 1); // Remove "uuid/" prefix
        const localValue = pendingItem?.v;
        const remoteValue = (remoteTodo as any)[fieldPath];

        console.log(`[clearStalePendingChanges] Field-level change for ${id}/${fieldPath}`);
        console.log(`  Local: ${localValue}, Remote: ${remoteValue}`);

        // If the values match or remote is newer, accept remote state
        if (localValue === remoteValue) {
          console.log(
            `[clearStalePendingChanges] Field ${fieldPath} matches remote, updating full record`
          );
          todos$[id].set(remoteTodo);
          clearedCount++;
        } else if (fieldPath === "updated_at" && remoteValue) {
          // For updated_at specifically, always accept the server timestamp
          console.log(`[clearStalePendingChanges] Accepting server updated_at for ${id}`);
          todos$[id].set(remoteTodo);
          clearedCount++;
        }
      }
    }
  }

  console.log(`[clearStalePendingChanges] Cleared ${clearedCount} stale pending changes`);
  return clearedCount;
}
