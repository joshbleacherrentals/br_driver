// utils/supabase/supaLegend.ts
import { observablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
import { configureSynced } from "@legendapp/state/sync";
import { syncedSupabase } from "@legendapp/state/sync-plugins/supabase";
import AsyncStorage from "@react-native-async-storage/async-storage";
import "react-native-get-random-values";
import { supabase } from "../supabaseClient";
import { generateId } from "./util";

// Create a configured sync function
export const customSynced = configureSynced(syncedSupabase, {
  // Use React Native Async Storage
  persist: {
    plugin: observablePersistAsyncStorage({
      AsyncStorage,
    }),
    retrySync: true,
  },
  generateId,
  supabase,
  updatePartial: true,
  fieldId: "legend_state_uuid",
  changesSince: "all",
  fieldCreatedAt: "created_at",
  fieldUpdatedAt: "updated_at",
  fieldDeleted: "deleted",
});

// // utils/supabase/supaLegend.ts
// import { observablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
// import { configureSynced } from "@legendapp/state/sync";
// import { syncedSupabase } from "@legendapp/state/sync-plugins/supabase";
// import AsyncStorage from "@react-native-async-storage/async-storage";
// import "react-native-get-random-values";
// import { supabase } from "../supabaseClient";
// import { generateId } from "./util";

// // Create a configured sync function
// export const customSynced = configureSynced(syncedSupabase, {
//   // Use React Native Async Storage
//   persist: {
//     plugin: observablePersistAsyncStorage({
//       AsyncStorage,
//     }),
//     retrySync: true,
//   },
//   generateId,
//   supabase,
//   fieldId: "legend_state_uuid",
//   changesSince: "last-sync",
//   fieldCreatedAt: "created_at",
//   fieldUpdatedAt: "updated_at",
//   fieldDeleted: "deleted",
//   // onError: (error) => console.error("Supabase sync error:", error),
// });
