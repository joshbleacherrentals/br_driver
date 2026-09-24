/**
 * "Live Location" — shown inside the event roster sheet in place of the list
 * (never a second Modal on top: nested Modals misbehave on iOS).
 *
 * Every state ends in something readable: a first request that fails shows
 * its sentence and "Try again", a refresh that fails keeps the last position
 * with a note, and loading is bounded by the request timeout in
 * hooks/useBleacherLocation.ts.
 */

import { radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import type { TrackedBleacher } from "@/hooks/useBleacherLocation";
import { googleMapsUrl } from "@/utils/eventRoster/linxupLocation";
import type { LocationViewState } from "@/utils/eventRoster/locationViewState";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import LocationDetails from "./LocationDetails";

type BleacherLocationViewProps = {
  target: TrackedBleacher;
  state: LocationViewState;
  errorMessage: string | null;
  onBack: () => void;
  onRetry: () => void;
};

export default function BleacherLocationView({
  target,
  state,
  errorMessage,
  onBack,
  onRetry,
}: BleacherLocationViewProps) {
  const { theme } = useTheme();
  const { location } = state;

  const openInMaps = useCallback(async () => {
    if (!location) return;
    try {
      await Linking.openURL(googleMapsUrl(location.lat, location.lng));
    } catch (error) {
      console.warn("[track] could not open maps", error);
      Alert.alert(
        "Tracker",
        `No maps app could be opened. The bleacher is at ${location.lat}, ${location.lng}.`,
      );
    }
  }, [location]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity
          onPress={onBack}
          style={styles.back}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back to the event roster"
        >
          <Text style={[styles.backText, { color: theme.accent }]}>‹ Back</Text>
        </TouchableOpacity>

        <Text style={[styles.title, { color: theme.header }]}>
          {target.bleacherNumber
            ? `Bleacher #${target.bleacherNumber}`
            : "Bleacher"}{" "}
          · Live Location
        </Text>

        {state.refreshFailed ? (
          <Text style={[styles.stale, { color: theme.warning }]}>
            Couldn&apos;t refresh — showing last known position
          </Text>
        ) : null}

        {location ? (
          <LocationDetails location={location} />
        ) : state.status === "error" ? (
          <View style={styles.centered}>
            <Ionicons
              name="cloud-offline-outline"
              size={32}
              color={theme.textTertiary}
            />
            <Text style={[styles.message, { color: theme.textSecondary }]}>
              {errorMessage}
            </Text>
            <TouchableOpacity
              onPress={onRetry}
              style={[styles.retry, { borderColor: theme.accent }]}
              accessibilityRole="button"
            >
              <Text style={[styles.retryText, { color: theme.accent }]}>
                Try again
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.centered}>
            <ActivityIndicator color={theme.accent} />
            <Text style={[styles.message, { color: theme.textSecondary }]}>
              Finding the trailer…
            </Text>
          </View>
        )}
      </ScrollView>

      {location ? (
        <View style={[styles.footer, { borderTopColor: theme.separator }]}>
          <TouchableOpacity
            onPress={openInMaps}
            style={[styles.primary, { backgroundColor: theme.accent }]}
            accessibilityRole="button"
            accessibilityLabel="Open this position in a maps app for directions"
          >
            <Ionicons name="navigate" size={18} color={theme.onAccent} />
            <Text style={[styles.primaryText, { color: theme.onAccent }]}>
              Open in Maps
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 10 },
  back: { alignSelf: "flex-start", paddingVertical: 4 },
  backText: { ...typeScale.body, fontWeight: "600" },
  title: { ...typeScale.headline, fontWeight: "700" },
  stale: { ...typeScale.footnote, fontWeight: "600" },
  centered: { alignItems: "center", gap: 12, paddingVertical: 48 },
  message: { ...typeScale.subhead, textAlign: "center" },
  retry: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  retryText: { ...typeScale.subhead, fontWeight: "600" },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.control,
  },
  primaryText: { ...typeScale.headline, fontWeight: "700" },
});
