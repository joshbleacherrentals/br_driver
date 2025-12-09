// utils/supabase/useClerkSupabaseClient.ts
import { useAuth } from "@clerk/clerk-expo";
import { useEffect } from "react";
import { setSupabaseTokenGetter, supabase } from "./supabaseClient";

/**
 * Hook to connect Clerk authentication with the shared Supabase client.
 * Automatically refreshes the Supabase token whenever the Clerk session changes.
 */
export function useClerkSupabaseClient() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setSupabaseTokenGetter(null);
      supabase.realtime.setAuth("");
      return;
    }

    // Supply Supabase with a token getter that always calls Clerk
    setSupabaseTokenGetter(async () => {
      try {
        const token = await getToken(); // no template — new integration
        return token ?? null;
      } catch (err) {
        console.warn("Error getting Clerk token:", err);
        return null;
      }
    });

    // Immediately set Realtime auth (needed for subscriptions)
    (async () => {
      const token = await getToken();
      supabase.realtime.setAuth(token ?? "");
    })();

    // Clean up when user signs out
    return () => {
      setSupabaseTokenGetter(null);
      supabase.realtime.setAuth("");
    };
  }, [isSignedIn, getToken]);

  return supabase;
}
