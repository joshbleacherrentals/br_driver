import { ThemeColors, typeScale } from "@/constants/theme";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Non-dismissible red banner when profile is incomplete or documents are expired.
 */
export default function ProfileCompletionBanner() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const {
    isProfileComplete,
    hasDriver,
    hasExpiredDocuments,
    expiredDocumentNames,
    problemDocSlug,
  } = useProfileCompletion();

  if (!hasDriver || isProfileComplete) {
    return null;
  }

  const title = hasExpiredDocuments
    ? "Documents Expired"
    : "Complete Your Profile";
  const subtitle = hasExpiredDocuments
    ? `Update ${expiredDocumentNames.join(", ")} before you can accept trips`
    : "Enter your profile information before you can start accepting trips!";

  // Expired documents are fixed on the documents screen, so go straight
  // there — landing on the profile leaves the driver to find it themselves.
  const target = hasExpiredDocuments
    ? ({
        pathname: "/edit-documents",
        params: problemDocSlug ? { focus: problemDocSlug } : {},
      } as const)
    : ("/(tabs)/profile" as const);

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => router.push(target)}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Ionicons
            name={hasExpiredDocuments ? "document-text-outline" : "person-outline"}
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
