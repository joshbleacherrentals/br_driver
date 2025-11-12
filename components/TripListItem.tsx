import SwipeAcceptBarV2 from "@/components/SwipeAcceptBarV2";
import React from "react";
import { Alert, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type Props = {
  // Header
  headerTitle?: string; // e.g., $120.00 · Blch #12
  headerSubtitle?: string; // e.g., Mon, Jan 31st
  pickupAddress?: string;
  pickupTime?: string;
  pickupPoc?: string;
  dropoffAddress?: string;
  dropoffTime?: string;
  dropoffPoc?: string;
  notes?: string | null;
  swipeable?: boolean; // demo flag to wrap with SwipeToAccept
};

export default function TripsListItem({
  headerTitle,
  headerSubtitle,
  pickupAddress = "123 Main St, Springfield",
  pickupTime,
  pickupPoc,
  dropoffAddress = "456 Oak Ave, Shelbyville",
  dropoffTime,
  dropoffPoc,
  notes,
  swipeable = false,
}: Props) {
  const openInMaps = async (address?: string) => {
    if (!address) return;
    const q = encodeURIComponent(address);

    // Build URLs for different apps/platforms
    const appleUrl = `http://maps.apple.com/?q=${q}`; // iOS Apple Maps
    const googleUrlIOS = `comgooglemaps://?q=${q}`; // iOS Google Maps app scheme
    const googleUrlWeb = `https://www.google.com/maps/search/?api=1&query=${q}`; // Web fallback
    const wazeUrl = `waze://?q=${q}&navigate=yes`;
    const androidGeo = `geo:0,0?q=${q}`; // Android intent

    // Determine available options
    const options: { label: string; url: string }[] = [];

    if (Platform.OS === "ios") {
      options.push({ label: "Apple Maps", url: appleUrl });
      if (await Linking.canOpenURL(googleUrlIOS))
        options.push({ label: "Google Maps", url: googleUrlIOS });
      if (await Linking.canOpenURL(wazeUrl)) options.push({ label: "Waze", url: wazeUrl });
      // Web fallback as a last resort
      if (!options.find((o) => o.label === "Google Maps"))
        options.push({ label: "Google Maps", url: googleUrlWeb });
    } else {
      // Android: try geo intent first (lets user pick default maps app)
      if (await Linking.canOpenURL(androidGeo)) options.push({ label: "Maps", url: androidGeo });
      // Also offer Google Maps web
      options.push({ label: "Google Maps", url: googleUrlWeb });
      if (await Linking.canOpenURL(wazeUrl)) options.push({ label: "Waze", url: wazeUrl });
    }

    if (options.length === 0) {
      // Absolute fallback
      Linking.openURL(googleUrlWeb);
      return;
    }

    Alert.alert("Open in Maps", address, [
      ...options.map((o) => ({ text: o.label, onPress: () => Linking.openURL(o.url) })),
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const content = (
    <View style={styles.card}>
      {/* Header */}
      {(headerTitle || headerSubtitle) && (
        <View style={{ marginBottom: 12 }}>
          {headerTitle ? <Text style={styles.headerTitle}>{headerTitle}</Text> : null}
          {headerSubtitle ? <Text style={styles.headerSubtitle}>{headerSubtitle}</Text> : null}
        </View>
      )}
      {/* Pickup */}
      <View style={styles.row}>
        <View style={styles.bullet} />
        <View style={styles.textContainer}>
          <Text style={styles.sectionLabel}>Pickup</Text>
          <TouchableOpacity onPress={() => openInMaps(pickupAddress)} activeOpacity={0.7}>
            <Text style={styles.addressLink}>{pickupAddress}</Text>
          </TouchableOpacity>
          {pickupTime && (
            <View style={styles.subRow}>
              {pickupTime ? <Text style={styles.subText}>Time: {pickupTime}</Text> : null}
            </View>
          )}
          {pickupPoc && (
            <View style={styles.subRow}>
              {pickupPoc ? <Text style={styles.subText}>POC: {pickupPoc}</Text> : null}
            </View>
          )}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Drop-off */}
      <View style={styles.row}>
        <View style={[styles.bullet, { backgroundColor: "#FF3B30" }]} />
        <View style={styles.textContainer}>
          <Text style={styles.sectionLabel}>Drop-off</Text>
          <TouchableOpacity onPress={() => openInMaps(dropoffAddress)} activeOpacity={0.7}>
            <Text style={styles.addressLink}>{dropoffAddress}</Text>
          </TouchableOpacity>
          {dropoffTime && (
            <View style={styles.subRow}>
              {dropoffTime ? <Text style={styles.subText}>Time: {dropoffTime}</Text> : null}
            </View>
          )}
          {dropoffPoc && (
            <View style={styles.subRow}>
              {dropoffPoc ? <Text style={styles.subText}>POC: {dropoffPoc}</Text> : null}
            </View>
          )}
        </View>
      </View>

      {/* Swipe Bar (visual only) */}
      {swipeable ? <SwipeAcceptBarV2 /> : null}

      {/* Notes (stay at the very bottom) */}
      {notes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesLabel}>Notes</Text>
          <Text style={styles.notesText}>{notes}</Text>
        </View>
      ) : null}
    </View>
  );

  return content;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3, // Android shadow
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bullet: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#34C759", // green
    marginTop: 6,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  address: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111",
  },
  addressLink: {
    fontSize: 16,
    fontWeight: "600",
    color: "#0A84FF", // iOS link blue
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111",
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 2,
  },
  subRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  dot: {
    fontSize: 14,
    color: "#bbb",
    marginHorizontal: 4,
  },
  subText: {
    fontSize: 14,
    color: "#444",
  },
  divider: {
    height: 1,
    backgroundColor: "#eee",
    marginVertical: 12,
  },
  notesBox: {
    marginTop: 12,
    backgroundColor: "#F8F8F8",
    borderRadius: 8,
    padding: 10,
  },
  notesLabel: {
    fontSize: 12,
    color: "#888",
    marginBottom: 4,
  },
  notesText: {
    fontSize: 14,
    color: "#333",
  },
});
