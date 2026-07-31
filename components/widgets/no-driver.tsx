import { useUser } from "@clerk/clerk-expo";
import StatusScreen from "./StatusScreen";

type NoDriverScreenProps = {
  /**
   * "no-driver": user exists but has no active driver profile.
   * "account-not-found": no Users record synced for this account at all.
   */
  variant?: "no-driver" | "account-not-found";
};

export default function NoDriverScreen({
  variant = "no-driver",
}: NoDriverScreenProps) {
  const { user } = useUser();
  const firstName = user?.firstName || "there";

  if (variant === "account-not-found") {
    return (
      <StatusScreen
        title={`Welcome, ${firstName}!`}
        subtitle="We couldn't find your account. Please contact your account manager to get set up."
      />
    );
  }

  return (
    <StatusScreen
      title={`Welcome, ${firstName}!`}
      subtitle="Looks like you don't have a driver profile set up yet. Please contact your account manager to get started."
    />
  );
}
