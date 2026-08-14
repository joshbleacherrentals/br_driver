import { ThemeColors, typeScale } from "@/constants/theme";
import { usePhotoUploadBanner } from "@/hooks/usePhotoUploadBanner";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { photoUploadService } from "@/components/providers/SystemProvider";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * §6 — non-dismissible red banner for photos confirmed missing from the bucket.
 *
 * Same shape as `ProfileCompletionBanner` ("Documents Expired"), by design: red,
 * always visible, no dismiss control, and a tap that goes straight to the one
 * screen that can fix it rather than to a list. It is the driver's only signal
 * that a photo they believe they submitted is not actually stored anywhere but
 * their phone, so it must not be dismissible.
 *
 * The tap targets the newest problem report and kicks the queue at the same
 * time — "tap to retry" in the copy is literal. Once that report's photos land,
 * the count drops and the next tap goes to the next-most-recent one.
 */
export default function PhotoUploadIssueBanner() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { visible, title, subtitle, targetReportUuid } = usePhotoUploadBanner();

  if (!visible || !targetReportUuid) {
    return null;
  }

  const handlePress = () => {
    void photoUploadService?.triggerFast("manual-retry");
    router.push({
      pathname: "/damage-report",
      params: { damageReportId: targetReportUuid },
    });
  };

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={handlePress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons
            name="cloud-offline-outline"
            size={20}
            color={theme.onAccent}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Ionicons
          name="chevron-forward-outline"
          size={22}
          color={theme.onAccent}
          style={styles.chevron}
        />
      </View>
    </TouchableOpacity>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    banner: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      backgroundColor: theme.danger,
      borderBottomColor: theme.onAccent + "33",
    },
    content: {
      flexDirection: "row",
      alignItems: "center",
    },
    iconCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
      backgroundColor: theme.onAccent + "26",
    },
    textContainer: {
      flex: 1,
    },
    title: {
      ...typeScale.subhead,
      fontWeight: "700",
      marginBottom: 2,
      color: theme.onAccent,
    },
    subtitle: {
      ...typeScale.footnote,
      color: theme.onAccent + "E6",
    },
    chevron: {
      marginLeft: 8,
    },
  });
