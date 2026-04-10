import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) {
  throw new Error(
    "Missing Supabase env vars. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY"
  );
}

// For local development with Clerk, use service role key to bypass JWT verification
// In production, configure Supabase to accept Clerk JWTs
const supabaseKey = serviceRole || anon;

// Token getter function that will be set by useClerkSupabaseClient
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setSupabaseTokenGetter(getter: (() => Promise<string | null>) | null) {
  tokenGetter = getter;
}

// Create a single shared Supabase client
export const supabase = createClient(url, supabaseKey, {
  global: {
    headers: {},
  },
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  accessToken: async () => {
    if (!tokenGetter) return null;
    return await tokenGetter();
  },
});

export type { SupabaseClient };
