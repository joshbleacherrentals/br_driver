/**
 * "Track" on a bleacher fitted with a Linxup GPS unit.
 *
 * Asks the web app where the trailer is (it holds the fleet token — see
 * utils/eventRoster/linxupLocation.ts) and opens the point in a maps app.
 *
 * Unlike everything else on the event roster this needs signal, so each way it
 * can fail gets its own sentence. A driver who taps this in a dead spot is
 * told that is what happened.
 */

import { fetchDeviceLocation, googleMapsUrl } from "@/utils/eventRoster/linxupLocation";
import { useAuth } from "@clerk/clerk-expo";
import { useCallback, useState } from "react";
import { Alert, Linking } from "react-native";

const MESSAGES: Record<string, string> = {
  "no-position": "This tracker has not reported a position yet.",
  "not-found": "No GPS tracker is registered for this bleacher.",
  unauthorized: "Your session was refused. Sign out and back in, then try again.",
  unreachable: "Could not reach the tracker. Check your connection and try again.",
  "not-configured": "Tracking is not available in this build.",
};

export function useTrackBleacher() {
  const { getToken } = useAuth();
  const [trackingDeviceId, setTrackingDeviceId] = useState<string | null>(null);

  const track = useCallback(
    async (deviceId: string | null) => {
      if (!deviceId) return;

      setTrackingDeviceId(deviceId);
      try {
        const token = (await getToken()) ?? "";
        const location = await fetchDeviceLocation(deviceId, {
          baseUrl: process.env.EXPO_PUBLIC_WEB_URL ?? "",
          token,
          fetchImpl: fetch as never,
        });

        if (location.kind !== "ok") {
          Alert.alert("Tracker", MESSAGES[location.kind] ?? MESSAGES.unreachable);
          return;
        }

        try {
          await Linking.openURL(googleMapsUrl(location.lat, location.lng));
        } catch (error) {
          console.warn("[track] could not open maps", error);
          Alert.alert(
            "Tracker",
            `Position found (${location.lat}, ${location.lng}) but no maps app could be opened.`,
          );
        }
      } catch (error) {
        console.warn("[track] request failed", error);
        Alert.alert("Tracker", MESSAGES.unreachable);
      } finally {
        setTrackingDeviceId(null);
      }
    },
    [getToken],
  );

  return { track, trackingDeviceId };
}
