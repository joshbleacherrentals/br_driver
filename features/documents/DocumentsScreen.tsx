import { useThemedStyles } from "@/hooks/useThemedStyles";
import DocExpiryWarningBanner from "@/components/widgets/DocExpiryWarningBanner";
import ProfileCompletionBanner from "@/components/widgets/onboardingBanner";
import PhotoUploadIssueBanner from "@/components/widgets/PhotoUploadIssueBanner";
import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import { useAddress } from "@/hooks/db/useAddress";
import { useBlueBook } from "@/hooks/db/useBlueBook";
import { useDriver } from "@/hooks/db/useDriver";
import { useTheme } from "@/hooks/useTheme";
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
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { blueBookEntries } = useBlueBook();
  const { driver } = useDriver();
  const { address } = useAddress(driver?.address_uuid ?? null);

  const country = address?.street?.split(",").pop()?.trim();
  const driverRegion: "CAN" | "US" | null =
    country === "USA" ? "US" : country === "Canada" ? "CAN" : null;

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
    <View style={styles.container}>
      <ProfileCompletionBanner />
      <PhotoUploadIssueBanner />
      <DocExpiryWarningBanner />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.introStrip}>
          <Ionicons name="book-outline" size={16} color={theme.accent} />
          <Text style={styles.introText}>
            All your essential documents and resources in one place
          </Text>
        </View>

        {visibleEntries === null ? (
          <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
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
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={theme.accent}
                  />
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

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    introStrip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: theme.accentSoft,
      borderRadius: radius.control,
      paddingVertical: 10,
      paddingHorizontal: 14,
      marginBottom: 16,
    },
    introText: {
      color: theme.accent,
      ...typeScale.footnote,
      fontWeight: "400",
      flex: 1,
    },
    card: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      marginBottom: 10,
      paddingVertical: 14,
      paddingHorizontal: 14,
      flexDirection: "row",
      alignItems: "center",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...elevation(theme, "card"),
    },
    cardDisabled: {
      opacity: 0.6,
    },
    cardBody: {
      flex: 1,
      marginRight: 8,
    },
    cardTitle: {
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
      marginBottom: 2,
    },
    cardTitleDisabled: {
      color: theme.textTertiary,
    },
    cardDesc: {
      ...typeScale.caption,
      color: theme.textSecondary,
      lineHeight: 17,
    },
    comingSoon: {
      ...typeScale.caption2,
      color: theme.textTertiary,
      fontStyle: "italic",
      marginTop: 2,
    },
    emptyText: {
      color: theme.textSecondary,
      textAlign: "center",
      marginTop: 40,
      ...typeScale.subhead,
    },
  });
}
