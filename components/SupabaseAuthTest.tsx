import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect } from "react";

export function SupabaseAuthTest() {
  const { getToken, isSignedIn } = useAuth();
  const supabase = useClerkSupabaseClient();

  useEffect(() => {
    if (!isSignedIn) return;

    const testSupabaseAuth = async () => {
      try {
        const token = await getToken();
        if (!token) {
          console.log("❌ No token available");
          return;
        }

        console.log("✅ Token received, testing Supabase connection...");

        const { count, error } = await supabase
          .from("Users")
          .select("*", { count: "exact", head: true });

        if (error) {
          console.error("❌ Supabase query error:", error);
        } else {
          console.log(`✅ Supabase authenticated! Users count: ${count}`);
        }
      } catch (err) {
        console.error("❌ Test failed:", err);
      }
    };

    testSupabaseAuth();
  }, [isSignedIn, getToken]);

  return null;
}
