import { useDriverGate } from "@/hooks/db/useDriverGate";
import AuthErrorScreen from "./AuthErrorScreen";
import NoDriverScreen from "./no-driver";
import PoorConnectionScreen from "./PoorConnectionScreen";
import SyncProgressScreen from "./SyncProgressScreen";

/**
 * Decides what to render for a signed-in user: the app, a loading spinner, or
 * one of the error screens. The PowerSync status subscription lives here (via
 * useDriverGate), so the heavy tab tree passed as `children` only re-renders
 * when the gate state actually changes — not on every sync-progress tick.
 */
export default function DriverGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { state, retry } = useDriverGate();

  switch (state) {
    case "loading":
      return <SyncProgressScreen />;
    case "poor-connection":
      return <PoorConnectionScreen onRetry={retry} />;
    case "auth-error":
      return <AuthErrorScreen />;
    case "account-not-found":
      return <NoDriverScreen variant="account-not-found" />;
    case "no-driver":
      return <NoDriverScreen />;
    case "ready":
      return <>{children}</>;
  }
}
