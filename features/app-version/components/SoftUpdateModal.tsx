import {
  BRAND_BLUE,
  Colors,
  GREEN_ACCENT,
} from "@/constants/Colors";
import { useColorScheme } from "@/hooks/useColorScheme";
import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

type SoftUpdateModalProps = {
  visible: boolean;
  daysLeft: number | null;
  message: string | null;
  onOk: () => void;
  onUpdate: () => void;
};

export default function SoftUpdateModal({
  visible,
  daysLeft,
  message,
  onOk,
  onUpdate,
}: SoftUpdateModalProps) {
  const isDark = useColorScheme() === "dark";
  const title =
    daysLeft != null && daysLeft <= 3
      ? daysLeft === 1
        ? "Update required soon"
        : "Update available"
      : "New version available";

  const body =
    daysLeft != null && daysLeft <= 3
      ? daysLeft === 1
        ? "A new version of the app is available. You have 1 day to update."
        : `A new version of the app is available. You have ${daysLeft} days to update.`
      : (message ??
        "A new version of the app is available. Please update when you can.");

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onOk}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            { backgroundColor: isDark ? "#1C1C1E" : "#FFFFFF" },
          ]}
        >
          <Text
            style={[
              styles.title,
              { color: isDark ? Colors.dark.text : Colors.light.text },
            ]}
          >
            {title}
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
            <TouchableOpacity
              style={[styles.btn, styles.btnSecondary]}
              onPress={onOk}
              activeOpacity={0.8}
            >
              <Text style={[styles.btnText, { color: BRAND_BLUE }]}>OK</Text>
            </TouchableOpacity>
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
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  card: {
    borderRadius: 14,
    padding: 20,
    gap: 12,
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
    marginTop: 8,
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
