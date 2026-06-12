import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import { DARK_BLUE } from "@/constants/Colors";
import { useAddress } from "@/hooks/db/useAddress";
import { useBlueBook } from "@/hooks/db/useBlueBook";
import { useDriver } from "@/hooks/db/useDriver";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function BlueBookScreen() {
  const { blueBookEntries } = useBlueBook();
  const { driver } = useDriver();
  const { address } = useAddress(driver?.address_uuid ?? null);

  // Determine driver's region from address (same logic as ProfileScreen)
  const country = address?.street?.split(",").pop()?.trim();
  const driverRegion: "CAN" | "US" | null =
    country === "USA" ? "US" : country === "Canada" ? "CAN" : null;

  // Filter: active + matches driver's region (or 'Both')
  const visibleEntries =
    blueBookEntries?.filter((e) => {
      if (e.is_active === 0) return false;
      if (!driverRegion) return true;
      if (e.region === "Both") return true;
      return e.region === driverRegion;
    }) ?? null;

  const handleOpen = (link: string | null, name: string | null) => {
    if (!link) return;
    Linking.openURL(link).catch(() => {
      console.warn(`Failed to open link for: ${name}`);
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#F2F2F7" }}>
      <ProfileCompletionBanner />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Intro strip */}
        <View style={styles.introStrip}>
          <Ionicons name="book-outline" size={16} color="#93c5fd" />
          <Text style={styles.introText}>
            All your essential documents and resources in one place
          </Text>
        </View>

        {visibleEntries === null ? (
          <ActivityIndicator color="#93c5fd" style={{ marginTop: 40 }} />
        ) : visibleEntries.length === 0 ? (
          <Text style={styles.emptyText}>No entries available.</Text>
        ) : (
          visibleEntries.map((entry) => {
            const hasLink = !!entry.link;

            return (
              <TouchableOpacity
                key={entry.id}
                style={[styles.card, !hasLink && styles.cardDisabled]}
                onPress={() => handleOpen(entry.link, entry.name)}
                activeOpacity={hasLink ? 0.75 : 1}
                disabled={!hasLink}
              >
                <View style={styles.cardBody}>
                  <Text
                    style={[
                      styles.cardTitle,
                      !hasLink && styles.cardTitleDisabled,
                    ]}
                  >
                    {entry.name}
                  </Text>
                  {!!entry.description && (
                    <Text style={styles.cardDesc} numberOfLines={2}>
                      {entry.description}
                    </Text>
                  )}
                  {!hasLink && (
                    <Text style={styles.comingSoon}>Coming soon</Text>
                  )}
                </View>

                {hasLink && (
                  <Ionicons name="chevron-forward" size={16} color="#4a6f96" />
                )}
              </TouchableOpacity>
            );
          })
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: DARK_BLUE,
  },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    width: 45,
    height: 45,
  },
  logoPlaceholder: {
    width: 45,
    height: 45,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 0.3,
    color: "#111827",
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Intro strip
  introStrip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: DARK_BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  introText: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "500",
    flex: 1,
  },

  // Cards
  card: {
    backgroundColor: DARK_BLUE,
    borderRadius: 12,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1e5799",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  cardDisabled: {
    opacity: 0.6,
  },
  cardBody: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  cardTitleDisabled: {
    color: "#a8c4de",
  },
  cardDesc: {
    fontSize: 12,
    color: "#7fb3d3",
    lineHeight: 17,
  },
  comingSoon: {
    fontSize: 11,
    color: "#4a8fbb",
    fontStyle: "italic",
    marginTop: 2,
  },

  // Loading & empty
  emptyText: {
    color: "#7fb3d3",
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
  },
});
