import { ThemeColors, typeScale } from "@/constants/theme";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Dismissible orange banner when documents expire within 30 days
 * but are still valid today. Hidden while the hard (expired/incomplete) banner applies.
 */
export default function DocExpiryWarningBanner() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const {
    isProfileComplete,
    hasDriver,
    hasExpiringSoonDocuments,
    expiringSoonDocumentNames,
  } = useProfileCompletion();

  const [dismissed, setDismissed] = useState(false);
  const dismissKey = expiringSoonDocumentNames.join("|");

  useEffect(() => {
    setDismissed(false);
  }, [dismissKey]);

  if (
    !hasDriver ||
    !isProfileComplete ||
    !hasExpiringSoonDocuments ||
    dismissed
  ) {
    return null;
  }

  return (
    <View style={styles.banner}>
      <TouchableOpacity
        style={styles.content}
        onPress={() => router.push("/(tabs)/profile")}
        activeOpacity={0.8}
      >
        <View style={styles.iconCircle}>
          <Ionicons name="time-outline" size={20} color={theme.onAccent} />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Documents Expiring Soon</Text>
          <Text style={styles.subtitle}>
            {expiringSoonDocumentNames.join(", ")} — update before they expire
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dismissButton}
        onPress={() => setDismissed(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel="Dismiss warning"
      >
        <Ionicons
          name="close-outline"
          size={22}
          color={theme.onAccent + "E6"}
        />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    banner: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.warning,
      borderBottomColor: theme.onAccent + "33",
    },
    content: {
      flex: 1,
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
      color: theme.onAccent + "F2",
    },
    dismissButton: {
      marginLeft: 8,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
    },
  });
