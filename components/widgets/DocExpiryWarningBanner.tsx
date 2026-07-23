import { WARNING_ORANGE } from "@/constants/Colors";
import { useProfileCompletion } from "@/hooks/useProfileCompletion";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * Dismissible orange banner when documents expire within 30 days
 * but are still valid today. Hidden while the hard (expired/incomplete) banner applies.
 */
export default function DocExpiryWarningBanner() {
  const router = useRouter();
  const {
    isProfileComplete,
    hasDriver,
    hasExpiringSoonDocuments,
    expiringSoonDocumentNames,
  } = useProfileCompletion();

  const [dismissed, setDismissed] = useState(false);
  const dismissKey = expiringSoonDocumentNames.join("|");

  // Re-show if the set of expiring docs changes (e.g. after sync / edit)
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
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>⏳</Text>
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
        <Text style={styles.dismissText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: WARNING_ORANGE,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#CC7700",
    flexDirection: "row",
    alignItems: "center",
  },
  content: {
    flex: 1,
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
    opacity: 0.95,
  },
  dismissButton: {
    marginLeft: 8,
    padding: 4,
  },
  dismissText: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "600",
    opacity: 0.9,
  },
});
