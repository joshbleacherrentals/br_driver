import { ThemeColors, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function UserProfileCard() {
  const { user } = useUser();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ");
  const email = user?.emailAddresses[0]?.emailAddress;

  return (
    <TouchableOpacity
      style={[styles.card, { paddingTop: insets.top + 16 }]}
      onPress={() => router.push("/(drawer)/(tabs)/profile")}
      activeOpacity={0.85}
    >
      {user?.imageUrl ? (
        <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
      ) : (
        <View style={styles.avatarFallback}>
          <Ionicons name="person" size={28} color={theme.onAccent} />
        </View>
      )}
      <View style={styles.text}>
        {!!fullName && <Text style={styles.name}>{fullName}</Text>}
        {!!email && <Text style={styles.email}>{email}</Text>}
        <Text style={styles.hint}>View profile</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.onAccent + "80"} />
    </TouchableOpacity>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
    card: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingBottom: 24,
      gap: 14,
      backgroundColor: theme.header,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      borderWidth: 2,
      borderColor: theme.onAccent + "4D",
    },
    avatarFallback: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: theme.onAccent + "26",
    },
    text: { flex: 1 },
    name: {
      ...typeScale.title3,
      fontWeight: "700",
      marginBottom: 2,
      color: theme.onAccent,
    },
    email: { ...typeScale.footnote, color: theme.onAccent + "B3" },
    hint: { ...typeScale.caption2, marginTop: 4, color: theme.onAccent + "73" },
  });
