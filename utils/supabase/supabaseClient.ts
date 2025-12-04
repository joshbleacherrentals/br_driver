// import "react-native-get-random-values";
// import "react-native-url-polyfill/auto";

// import { createClient, SupabaseClient } from "@supabase/supabase-js";

// // Prevent multiple clients with different tokens from piling up in memory
// let currentClient: SupabaseClient | null = null;
// let currentToken: string | null = null;

// export const supabaseClient = (supabaseToken: string): SupabaseClient => {
//   if (!supabaseToken) throw new Error("Missing Supabase token");

//   if (currentClient && currentToken === supabaseToken) {
//     return currentClient;
//   }

//   // Clean up any open channels if we are switching tokens
//   if (currentClient) {
//     try {
//       currentClient.removeAllChannels();
//     } catch {}
//   }

//   currentToken = supabaseToken;

//   const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
//   const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

//   if (!url || !anon) {
//     throw new Error(
//       "Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY"
//     );
//   }

//   currentClient = createClient(url, anon, {
//     global: {
//       headers: {
//         Authorization: `Bearer ${supabaseToken}`,
//       },
//     },
//     auth: {
//       // In React Native we manage auth with Clerk; Supabase auth is header-based
//       persistSession: false,
//       autoRefreshToken: false,
//       detectSessionInUrl: false,
//     },
//   });

//   return currentClient;
// };

// export type { SupabaseClient };
