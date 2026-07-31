import { db } from "@/components/providers/SystemProvider";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import Constants from "expo-constants";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

function getPlatform(): "ios" | "android" {
  return Platform.OS === "ios" ? "ios" : "android";
}

/**
 * Writes the installed app version onto Drivers when it changes.
 * PowerSync syncs to Supabase when online.
 */
export function useReportDriverAppVersion(driverId: string | null | undefined) {
  const lastReported = useRef<string | null>(null);

  useEffect(() => {
    if (!driverId) return;

    const version = getCurrentAppVersion();
    const platform = getPlatform();
    const key = `${driverId}:${version}:${platform}`;
    if (lastReported.current === key) return;

    let cancelled = false;

    (async () => {
      try {
        const row = await db
          .selectFrom("Drivers")
          .select(["app_version", "app_platform"])
          .where("id", "=", driverId)
          .executeTakeFirst();

        if (cancelled) return;

        if (
          row?.app_version === version &&
          row?.app_platform === platform
        ) {
          lastReported.current = key;
          return;
        }

        await executeTypedMutationVoid(
          db
            .updateTable("Drivers")
            .set({
              app_version: version,
              app_platform: platform,
              app_version_reported_at: new Date().toISOString(),
            })
            .where("id", "=", driverId)
            .compile(),
        );

        if (!cancelled) lastReported.current = key;
      } catch (err) {
        console.warn("[AppVersion] Failed to report driver version:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [driverId]);
}
