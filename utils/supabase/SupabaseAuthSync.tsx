// utils/supabase/SupabaseAuthSync.tsx
import { useAuth } from "@clerk/clerk-expo";
import { ReactNode, useEffect } from "react";
import { AppState } from "react-native";
import { setSupabaseTokenGetter, supabase } from "./supabaseClient";

export default function SupabaseAuthSync({ children }: { children: ReactNode }) {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    if (!isSignedIn) {
      setSupabaseTokenGetter(null);
      supabase.realtime.setAuth(""); // drop realtime auth
      return;
    }

    // Provide a getter that always fetches the *current* Clerk session token
    setSupabaseTokenGetter(async () => {
      // For the new native integration you *don’t* need a template
      const token = await getToken();
      return token ?? null;
    });

    // Also set Realtime auth up front
    (async () => {
      const token = await getToken();
      supabase.realtime.setAuth(token ?? "");
    })();

    return () => {
      setSupabaseTokenGetter(null);
      supabase.realtime.setAuth("");
    };
  }, [getToken, isSignedIn]);

  // Optional: refresh Realtime token when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state === "active" && isSignedIn) {
        const token = await getToken();
        supabase.realtime.setAuth(token ?? "");
      }
    });

    return () => sub.remove();
  }, [getToken, isSignedIn]);

  return <>{children}</>;
}
