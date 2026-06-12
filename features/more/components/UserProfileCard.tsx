import { DARK_BLUE } from "@/constants/Colors";
import { useUser } from "@clerk/clerk-expo";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function UserProfileCard() {
  const { user } = useUser();
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
          <Ionicons name="person" size={28} color="#FFFFFF" />
        </View>
      )}
      <View style={styles.text}>
        {!!fullName && <Text style={styles.name}>{fullName}</Text>}
        {!!email && <Text style={styles.email}>{email}</Text>}
        <Text style={styles.hint}>View profile</Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color="rgba(255,255,255,0.5)"
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DARK_BLUE,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.3)",
  },
  avatarFallback: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { flex: 1 },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 2,
  },
  email: {
    fontSize: 13,
    color: "rgba(255,255,255,0.7)",
  },
  hint: {
    fontSize: 11,
    color: "rgba(255,255,255,0.45)",
    marginTop: 4,
  },
});
