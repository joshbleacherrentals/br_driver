import { DANGER_RED } from "@/constants/Colors";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { useRouter } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Non-dismissible red banner when profile is incomplete or documents are expired.
 */
export default function ProfileCompletionBanner() {
  const router = useRouter();
  const {
    isProfileComplete,
    hasDriver,
    hasExpiredDocuments,
    expiredDocumentNames,
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

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={() => router.push("/(tabs)/profile")}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>⚠️</Text>
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <View style={styles.arrow}>
          <Text style={styles.arrowText}>›</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: DANGER_RED,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#CC2E24",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconContainer: {
    marginRight: 12,
  },
  icon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 13,
    color: "#FFFFFF",
    opacity: 0.9,
  },
  arrow: {
    marginLeft: 8,
  },
  arrowText: {
    fontSize: 28,
    color: "#FFFFFF",
    fontWeight: "300",
  },
});
