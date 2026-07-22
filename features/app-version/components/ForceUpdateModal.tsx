import {
  BRAND_BLUE,
  Colors,
  DANGER_RED,
  GREEN_ACCENT,
} from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import {
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type ForceUpdateModalProps = {
  visible: boolean;
  message: string | null;
  onUpdate: () => void;
  onExit: () => void;
};

export default function ForceUpdateModal({
  visible,
  message,
  onUpdate,
  onExit,
}: ForceUpdateModalProps) {
  const isDark = useColorScheme() === "dark";
  const body =
    message ??
    "This version of the app is no longer supported. Please update to continue.";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android: hardware back exits. iOS: Apple does not allow programmatic exit.
      onRequestClose={Platform.OS === "android" ? onExit : undefined}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
          ]}
        >
          <Text style={[styles.badge, { color: DANGER_RED }]}>
            Update required
          </Text>
          <Text
            style={[
              styles.title,
              { color: isDark ? Colors.dark.text : Colors.light.text },
            ]}
          >
            Please update the app
          </Text>
          <Text
            style={[
              styles.body,
              { color: isDark ? "rgba(255,255,255,0.7)" : "#6B7280" },
            ]}
          >
            {body}
          </Text>
          <View style={styles.actions}>
            {Platform.OS === "android" && (
              <TouchableOpacity
                style={[styles.btn, styles.btnSecondary]}
                onPress={onExit}
                activeOpacity={0.8}
              >
                <Text style={[styles.btnText, { color: BRAND_BLUE }]}>
                  Exit App
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary]}
              onPress={onUpdate}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, styles.btnPrimaryText]}>
                Update App
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    borderRadius: 14,
    padding: 20,
    gap: 10,
  },
  badge: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  body: {
    fontSize: 15,
    lineHeight: 21,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 10,
  },
  btn: {
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  btnSecondary: {
    backgroundColor: "transparent",
  },
  btnPrimary: {
    backgroundColor: GREEN_ACCENT,
  },
  btnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  btnPrimaryText: {
    color: "#FFFFFF",
  },
});
