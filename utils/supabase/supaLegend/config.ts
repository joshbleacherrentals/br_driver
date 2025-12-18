import { configureSynced } from "@legendapp/state/sync";
import { syncedSupabase } from "@legendapp/state/sync-plugins/supabase";
import "react-native-get-random-values";
import { supabase } from "../supabaseClient";
import { persistPluginLocal } from "./persistPlugin";
import { generateId } from "./util";

// Create a configured sync function
export const customSynced = configureSynced(syncedSupabase, {
  // Use React Native Async Storage
  persist: {
    plugin: persistPluginLocal,
    retrySync: true,
  },
  generateId,
  supabase,
  updatePartial: true,
  fieldId: "legend_state_uuid",
  changesSince: "last-sync",
  fieldCreatedAt: "created_at",
  fieldUpdatedAt: "updated_at",
  fieldDeleted: "deleted",
});
