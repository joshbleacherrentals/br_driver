// utils/supabase/supabaseClient.ts
import { Database } from "@/database.types";
import { createClient } from "@supabase/supabase-js";

// A function that will be provided by Clerk-land
type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export function setSupabaseTokenGetter(fn: TokenGetter | null) {
  tokenGetter = fn;
}

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    // This is Supabase's official way to use 3rd-party JWTs
    accessToken: async () => {
      if (!tokenGetter) return null;
      try {
        return (await tokenGetter()) ?? null;
      } catch (err) {
        console.warn("Error getting Clerk token for Supabase:", err);
        return null;
      }
    },
  }
);
