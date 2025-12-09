"use client";

import { useSession } from "@clerk/clerk-expo";
import { useEffect } from "react";
import { setSupabaseAccessToken, supabase } from "./supaLegend";

// export function useClerkSupabaseClient() {
//   const { session } = useSession();

//   const client = useMemo(
//     () =>
//       createClient<Database>(
//         process.env.EXPO_PUBLIC_SUPABASE_URL!,
//         process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!, // or _KEY, just be consistent
//         {
//           async accessToken() {
//             // If you’re using the Supabase third-party auth integration,
//             // this can just be the Clerk session token.
//             return (await session?.getToken()) ?? null;
//           },
//         }
//       ),
//     [session]
//   );

//   return client;
// }

export function useClerkSupabaseClient() {
  const { session } = useSession();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = (await session?.getToken()) ?? null;
      if (!cancelled) {
        setSupabaseAccessToken(token);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session]);

  // everyone uses the same client (the one Legend uses)
  return supabase;
}
