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
  // Optionally enable soft deletes
  fieldDeleted: "deleted",
  onError: (error) => {
    // console.error("Supabase sync error:", error);
    // const errorMessage = error instanceof Error ? error.message : String(error);
    // if (errorMessage.includes("JWT expired")) {
    //   Alert.alert("Session Expired", errorMessage, [{ text: "OK" }]);
    // } else {
    //   Alert.alert("Sync Error", errorMessage, [{ text: "OK" }]);
    // }
  },
});

// The synced todos collection
export const todos$ = observable(
  customSynced({
    supabase,
    collection: "Todos", // <-- must match Database["public"]["Tables"]
    select: (from: any) => from.select("id,counter,text,done,created_at,updated_at,deleted"),
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    // Persist data and pending changes locally
    persist: {
      name: "todos",
      retrySync: true, // Persist pending changes and retry
    },
    retry: {
      infinite: true, // Retry changes with exponential backoff
      backoff: "exponential",
      delay: 1000, // Start with 1 second delay
      maxDelay: 30000, // Max 30 seconds between retries
    },
  })
);

// Helper functions

export function addTodo(text: string) {
  const id = generateId();
  todos$[id].assign({
    id,
    text,
    // counter/done/deleted will use defaults from the server if omitted
  });
}

export function toggleDone(id: string) {
  todos$[id].done.set((prev) => !prev);
}

export function deleteTodo(id: string) {
  // Soft delete by setting deleted to true
  todos$[id].deleted.set(true);
}
