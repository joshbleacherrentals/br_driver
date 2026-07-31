import StatusScreen from "./StatusScreen";

type PoorConnectionScreenProps = {
  onRetry: () => void;
};

/**
 * Shown when the first sync hasn't completed within the grace period and the
 * failure isn't an auth error — most likely a weak or missing connection.
 * PowerSync keeps retrying in the background; "Retry" just re-shows the spinner.
 */
export default function PoorConnectionScreen({
  onRetry,
}: PoorConnectionScreenProps) {
  return (
    <StatusScreen
      title="Poor connection"
      subtitle="We're having trouble reaching the server. Check your connection and try again — your data will load automatically once you're back online."
      primaryLabel="Retry"
      onPrimary={onRetry}
    />
  );
}
