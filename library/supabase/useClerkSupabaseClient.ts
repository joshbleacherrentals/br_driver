// utils/supabase/useClerkSupabaseClient.ts
import { isClerkRuntimeError, useAuth } from "@clerk/clerk-expo";
import { useEffect } from "react";
import { AppState } from "react-native";
import { setSupabaseTokenGetter, supabase } from "./supabaseClient";

/**
 * Hook to connect Clerk authentication with the shared Supabase client.
 * - Wires Clerk's getToken() into Supabase's accessToken + Realtime.
 * - Handles offline "network_error" safely so the app never crashes.
 */
export function useClerkSupabaseClient() {
  const { getToken, isSignedIn } = useAuth();

  // 1) Keep Supabase's accessToken getter in sync with Clerk
  useEffect(() => {
    let cancelled = false;

    if (!isSignedIn) {
      setSupabaseTokenGetter(null);
      supabase.realtime.setAuth("");
      return;
    }

    // Called by Supabase whenever it needs an access token
    setSupabaseTokenGetter(async () => {
      if (cancelled) return null;

      try {
        // CRITICAL: Must specify the template to get the Supabase-formatted JWT
        const token = await getToken({ template: "supabase" });
        return token ?? null;
      } catch (err: unknown) {
        if (isClerkRuntimeError(err) && err.code === "network_error") {
          console.log("[useClerkSupabaseClient] Network error getting token, returning null");
          return null;
        }

        console.warn("[useClerkSupabaseClient] Unexpected error getting token", err);
        return null;
      }
    });

    // Also set Realtime auth once up front
    (async () => {
      try {
        const token = await getToken({ template: "supabase" });
        if (!cancelled) {
          supabase.realtime.setAuth(token ?? "");
        }
      } catch (err: unknown) {
        if (isClerkRuntimeError(err) && err.code === "network_error") {
          console.log(
            "[useClerkSupabaseClient] Network error setting realtime auth, leaving Realtime unauthenticated"
          );
        } else {
          console.warn("[useClerkSupabaseClient] Unexpected error setting realtime auth", err);
        }
      }
    })();

    return () => {
      cancelled = true;
      setSupabaseTokenGetter(null);
      supabase.realtime.setAuth("");
    };
  }, [getToken, isSignedIn]);

  // 2) Refresh Realtime token when app returns to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active" || !isSignedIn) return;

      try {
        const token = await getToken({ template: "supabase" });
        supabase.realtime.setAuth(token ?? "");
      } catch (err: unknown) {
        if (isClerkRuntimeError(err) && err.code === "network_error") {
          console.log(
            "[useClerkSupabaseClient] Network error refreshing realtime token; keeping existing auth"
          );
        } else {
          console.warn("[useClerkSupabaseClient] Unexpected error refreshing realtime token", err);
        }
      }
    });

    return () => {
      sub.remove();
    };
  }, [getToken, isSignedIn]);

  return supabase;
}