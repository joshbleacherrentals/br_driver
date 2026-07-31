import { useAuth } from "@clerk/clerk-expo";
import { router } from "expo-router";
import StatusScreen from "./StatusScreen";

/**
 * Shown when the first sync is blocked by a persistent authorization failure
 * (expired/invalid token). The fix is to sign in again, so the primary action
 * signs out and returns to the sign-in screen.
 */
export default function AuthErrorScreen() {
  const { signOut } = useAuth();

  const onSignInAgain = async () => {
    await signOut();
    router.replace("/(auth)/sign-in");
  };

  return (
    <StatusScreen
      title="Authorization error"
      subtitle="We couldn't verify your session. Please sign in again to continue."
      primaryLabel="Sign in again"
      onPrimary={onSignInAgain}
      showLogout={false}
    />
  );
}
