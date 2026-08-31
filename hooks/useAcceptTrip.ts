import { db } from "@/components/providers/SystemProvider";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { executeTypedMutationVoid } from "@/library/powersync/typedMutation";
import { AcceptBlock } from "@/utils/acceptBlock";
import { todayISODate } from "@/utils/documentExpiry";
import { useRouter } from "expo-router";
import { useCallback } from "react";
import { Alert } from "react-native";

/**
 * Accepting a trip, with the document rules attached.
 *
 * Shared by the Trips and Pending Trips screens so the block reason a driver
 * reads is identical wherever they tap Accept — and so the alert always
 * offers the fix rather than dead-ending on "OK".
 */
export function useAcceptTrip(options?: {
  /**
   * Ran just before navigating away — the pending-trips sheet uses it to close
   * itself, so the driver does not come back from the documents screen to a
   * modal still sitting on top of the app.
   */
  beforeNavigate?: () => void;
}) {
  const beforeNavigate = options?.beforeNavigate;
  const router = useRouter();
  const { getAcceptBlock } = useProfileCompletion();

  /** Why this trip can't be accepted, or `null`. */
  const blockFor = useCallback(
    (tripDate: string | null | undefined): AcceptBlock | null =>
      getAcceptBlock(tripDate ?? todayISODate()),
    [getAcceptBlock],
  );

  /**
   * Take the driver to what they have to fix. Carries the trip date along so
   * the documents screen can restate the block in full ("expires Aug 28, this
   * trip is Sep 3") instead of only the short reason from the button.
   */
  const openFix = useCallback(
    (tripDate: string | null | undefined) => {
      const block = blockFor(tripDate);
      beforeNavigate?.();
      if (!block || block.kind === "no_profile" || block.kind === "incomplete") {
        router.push("/(tabs)/profile");
        return;
      }
      router.push({
        pathname: "/edit-documents",
        params: {
          ...(block.focus ? { focus: block.focus } : {}),
          ...(tripDate ? { tripDate } : {}),
        },
      });
    },
    [beforeNavigate, blockFor, router],
  );

  const showBlockAlert = useCallback(
    (block: AcceptBlock) => {
      const goesToDocuments =
        block.kind === "expired" || block.kind === "expires_before_trip";

      Alert.alert(block.title, block.message, [
        { text: "Not now", style: "cancel" },
        {
          text: goesToDocuments ? "Update Documents" : "Open Profile",
          onPress: () => {
            beforeNavigate?.();
            if (goesToDocuments) {
              router.push({
                pathname: "/edit-documents",
                params: block.focus ? { focus: block.focus } : {},
              });
            } else {
              router.push("/(tabs)/profile");
            }
          },
        },
      ]);
    },
    [beforeNavigate, router],
  );

  const acceptTrip = useCallback(
    async (workTrackerId: string, tripDate: string | null | undefined) => {
      const block = blockFor(tripDate);
      if (block) {
        showBlockAlert(block);
        return;
      }
      try {
        const now = new Date().toISOString();
        await executeTypedMutationVoid(
          db
            .updateTable("WorkTrackers")
            .set({ status: "accepted", accepted_at: now, updated_at: now })
            .where("id", "=", workTrackerId)
            .compile(),
        );
      } catch {
        Alert.alert("Error", "Failed to accept trip.");
      }
    },
    [blockFor, showBlockAlert],
  );

  return { acceptTrip, blockFor, openFix };
}
