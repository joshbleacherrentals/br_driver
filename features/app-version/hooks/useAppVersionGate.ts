import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { KVStorage } from "@/library/storage/KVStorage";
import Constants from "expo-constants";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Linking, Platform } from "react-native";
import type {
  AppEnv,
  AppVersionPolicy,
  VersionGateState,
  VersionGateStatus,
} from "../types";
import { isVersionLessThan } from "../utils/compareSemver";
import { daysUntil } from "../utils/daysUntil";

const kv = new KVStorage();
const dismissKey = (recommended: string) =>
  `version_gate_dismissed_${recommended.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

function getAppEnv(): AppEnv {
  const raw = Constants.expoConfig?.extra?.APP_ENV;
  if (raw === "production" || raw === "staging" || raw === "development") {
    return raw;
  }
  return "development";
}

function getCurrentAppVersion(): string {
  return Constants.expoConfig?.version ?? "0.0.0";
}

function deriveStatus(
  currentVersion: string,
  policy: AppVersionPolicy,
  dismissed: boolean,
): VersionGateStatus {
  const recommended = policy.recommended_version;
  const required = policy.required_version;
  if (!recommended || !required) return { kind: "ok" };

  const { soft_deadline } = policy;

  if (isVersionLessThan(currentVersion, required)) {
    return { kind: "force", reason: "required" };
  }

  if (!isVersionLessThan(currentVersion, recommended)) {
    return { kind: "ok" };
  }

  // Soft recommend — OK always dismisses for this session
  if (dismissed) return { kind: "ok" };

  if (soft_deadline) {
    const left = daysUntil(soft_deadline);
    if (left <= 0) {
      return { kind: "force", reason: "deadline" };
    }
    return {
      kind: "soft",
      daysLeft: left,
      showEveryLaunch: left <= 3,
    };
  }

  return { kind: "soft", daysLeft: null, showEveryLaunch: false };
}

/**
 * Store version gate driven by PowerSync-synced AppVersionPolicy.
 * Updates reactively when ops changes the policy row.
 */
export function useAppVersionGate(enabled: boolean): VersionGateState {
  const currentVersion = useMemo(() => getCurrentAppVersion(), []);
  const env = useMemo(() => getAppEnv(), []);
  const [dismissed, setDismissed] = useState(false);

  const compiled = useMemo(() => {
    if (!enabled) return null;
    return db
      .selectFrom("AppVersionPolicy")
      .select([
        "id",
        "environment",
        "recommended_version",
        "required_version",
        "soft_deadline",
        "ios_store_url",
        "android_store_url",
        "message",
        "updated_at",
      ])
      .where("environment", "=", env)
      .limit(1)
      .compile();
  }, [enabled, env]);

  const { data, isLoading } = useTypedQuery(
    compiled,
    expect<AppVersionPolicy>(),
  );
  const policy = data?.[0] ?? null;

  useEffect(() => {
    const recommended = policy?.recommended_version;
    if (!recommended || !policy) return;

    // Countdown (≤3 days): show again every launch — don't restore persisted dismiss
    if (policy.soft_deadline) {
      const left = daysUntil(policy.soft_deadline);
      if (left > 0 && left <= 3) {
        setDismissed(false);
        return;
      }
    }

    let cancelled = false;
    (async () => {
      const raw = await kv.getItem(dismissKey(recommended));
      if (!cancelled) setDismissed(raw === "1");
    })();
    return () => {
      cancelled = true;
    };
  }, [policy?.recommended_version, policy?.soft_deadline]);

  const status: VersionGateStatus = useMemo(() => {
    if (!enabled || !policy) return { kind: "ok" };
    return deriveStatus(currentVersion, policy, dismissed);
  }, [enabled, policy, currentVersion, dismissed]);

  const dismissSoft = useCallback(async () => {
    const recommended = policy?.recommended_version;
    if (!recommended) return;

    // Persist only when not in the final 3-day countdown window
    const inCountdown =
      !!policy?.soft_deadline &&
      (() => {
        const left = daysUntil(policy.soft_deadline!);
        return left > 0 && left <= 3;
      })();

    if (!inCountdown) {
      await kv.setItem(dismissKey(recommended), "1");
    }
    setDismissed(true);
  }, [policy?.recommended_version, policy?.soft_deadline]);

  const openStore = useCallback(async () => {
    if (!policy) return;
    const url =
      Platform.OS === "ios" ? policy.ios_store_url : policy.android_store_url;
    if (!url) {
      console.warn("[AppVersion] Store URL is empty for", Platform.OS);
      return;
    }
    try {
      await Linking.openURL(url);
    } catch (err) {
      console.warn("[AppVersion] Failed to open store URL:", err);
    }
  }, [policy]);

  const exitApp = useCallback(() => {
    BackHandler.exitApp();
  }, []);

  return {
    status,
    policy,
    currentVersion,
    loading: enabled && isLoading && !policy,
    dismissSoft,
    openStore,
    exitApp,
  };
}
