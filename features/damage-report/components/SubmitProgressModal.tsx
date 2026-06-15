import { BRAND_BLUE } from "@/constants/Colors";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface Props {
  visible: boolean;
  current: number;
  total: number;
  onAbort: () => void;
}

export function SubmitProgressModal({ visible, current, total, onAbort }: Props) {
  const progress = total > 0 ? current / total : 0;

  const handleAbort = () => {
    Alert.alert(
      "Cancel Damage Report?",
      "Are you sure you want to cancel this damage report? All progress will be lost.",
      [
        { text: "Keep Going", style: "cancel" },
        { text: "Cancel Report", style: "destructive", onPress: onAbort },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <ActivityIndicator size="large" color={BRAND_BLUE} style={{ marginBottom: 16 }} />

          <Text style={styles.title}>Preparing Photos</Text>
          <Text style={styles.counter}>
            {current} of {total}
          </Text>

          {/* Progress bar */}
          <View style={styles.trackOuter}>
            <View style={[styles.trackFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          <TouchableOpacity style={styles.abortBtn} onPress={handleAbort} activeOpacity={0.7}>
            <Text style={styles.abortText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 28,
    width: "80%",
    alignItems: "center",
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1C1C1E",
    marginBottom: 4,
  },
  counter: {
    fontSize: 15,
    color: "#8E8E93",
    marginBottom: 16,
  },
  trackOuter: {
    width: "100%",
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
    marginBottom: 24,
  },
  trackFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: BRAND_BLUE,
  },
  abortBtn: {
    paddingVertical: 10,
    paddingHorizontal: 32,
  },
  abortText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FF3B30",
  },
});
