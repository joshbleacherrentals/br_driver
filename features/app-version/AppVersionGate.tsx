import { useDriver } from "@/hooks/db/useDriver";
import { useUser } from "@clerk/clerk-expo";
import React from "react";
import ForceUpdateModal from "./components/ForceUpdateModal";
import SoftUpdateModal from "./components/SoftUpdateModal";
import { useAppVersionGate } from "./hooks/useAppVersionGate";
import { useReportDriverAppVersion } from "./hooks/useReportDriverAppVersion";

/**
 * Global store-version gate. Soft recommend / countdown / hard block.
 * Mount once near the root of the signed-in tree.
 */
export default function AppVersionGate() {
  const { isSignedIn, isLoaded } = useUser();
  const enabled = isLoaded && !!isSignedIn;
  const { driver } = useDriver();
  useReportDriverAppVersion(driver?.id);

  const {
    status,
    policy,
    loading,
    dismissSoft,
    openStore,
    exitApp,
  } = useAppVersionGate(enabled);

  if (!enabled || loading) return null;

  if (status.kind === "force") {
    return (
      <ForceUpdateModal
        visible
        message={policy?.message ?? null}
        onUpdate={openStore}
        onExit={exitApp}
      />
    );
  }

  if (status.kind === "soft") {
    return (
      <SoftUpdateModal
        visible
        daysLeft={status.daysLeft}
        message={policy?.message ?? null}
        onOk={dismissSoft}
        onUpdate={openStore}
      />
    );
  }

  return null;
}
