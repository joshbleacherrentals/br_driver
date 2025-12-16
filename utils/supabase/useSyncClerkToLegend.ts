// hooks/useSyncClerkToLegend.ts
import { session$ } from "@/state/session/session";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect } from "react";

export function useSyncClerkToLegend() {
  const { userId } = useAuth();

  useEffect(() => {
    // console.log("[useSyncClerkToLegend] Syncing Clerk user ID to Legend session$", userId);
    session$.clerkUserId.set(userId ?? null);
  }, [userId]);
}
