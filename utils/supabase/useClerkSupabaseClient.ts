"use client";

import { Database } from "@/database.types";
import { useSession } from "@clerk/clerk-expo";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";

export function useClerkSupabaseClient() {
  const { session } = useSession();

  const client = useMemo(
    () =>
      createClient<Database>(
        process.env.EXPO_PUBLIC_SUPABASE_URL!,
        process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, // or _KEY, just be consistent
        {
          async accessToken() {
            // If you’re using the Supabase third-party auth integration,
            // this can just be the Clerk session token.
            return (await session?.getToken()) ?? null;
          },
        }
      ),
    [session]
  );

  return client;
}
