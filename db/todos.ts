// db/todos.ts
import { supabase } from "@/utils/supabase/supabaseClient";
import { customSynced, generateId } from "@/utils/supabase/supaLegend";
import { observable } from "@legendapp/state";

// The synced todos collection
export const todos$ = observable(
  customSynced({
    supabase,
    collection: "Todos", // <-- must match Database["public"]["Tables"]
    select: (from: any) =>
      from.select("legend_base_uuid,todo_id,text,done,created_at,updated_at,deleted"),
    actions: ["read", "create", "update", "delete"],
    realtime: true,
    // Persist data and pending changes locally
    persist: {
      name: "todos_v1",
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
    legend_base_uuid: id,
    text,
    // /done/deleted will use defaults from the server if omitted
  });
}

export function toggleDone(id: string) {
  todos$[id].done.set((prev) => !prev);
}

export function deleteTodo(id: string) {
  // Soft delete by setting deleted to true
  todos$[id].deleted.set(true);
}
