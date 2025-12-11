import { todos$ } from "@/utils/supabase/supaLegend";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { syncState } from "@legendapp/state";
import { observer } from "@legendapp/state/react";
import NetInfo from "@react-native-community/netinfo";
import { ComponentProps, useEffect, useState } from "react";
import { ActivityIndicator, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type SyncStatus = "offline" | "syncing" | "pending" | "synced" | "error";
type MaterialIconName = ComponentProps<typeof MaterialIcons>["name"];

const STATUS_CONFIG: Record<
  SyncStatus,
  { icon: MaterialIconName; color: string; bgColor: string; label: string }
> = {
  offline: {
    icon: "cloud-off",
    color: "#666",
    bgColor: "#e0e0e0",
    label: "Offline",
  },
  syncing: {
    icon: "sync",
    color: "#fff",
    bgColor: "#007AFF",
    label: "Syncing...",
  },
  pending: {
    icon: "cloud-upload",
    color: "#fff",
    bgColor: "#FF9500",
    label: "Pending Changes",
  },
  synced: {
    icon: "cloud-done",
    color: "#fff",
    bgColor: "#34C759",
    label: "Online",
  },
  error: {
    icon: "error-outline",
    color: "#fff",
    bgColor: "#FF3B30",
    label: "Sync Error",
  },
};

export const SyncStatusIndicator = observer(() => {
  const [isOnline, setIsOnline] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);

  const state$ = syncState(todos$);
  const state = state$.get();

  const pendingChanges = state?.getPendingChanges?.();
  const hasPendingChanges = pendingChanges && Object.keys(pendingChanges).length > 0;

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      setIsOnline(netState.isConnected ?? false);
    });
    return () => unsubscribe();
  }, []);

  // Clear stale error once we know everything is synced & online
  useEffect(() => {
    const isBusy = !!state?.isGetting || !!state?.isSetting || (state?.numPendingSets ?? 0) > 0;

    if (isOnline && !isBusy && !hasPendingChanges && state?.error) {
      // Clear last error – purely for UI
      state$.error.set(undefined as any);
    }
  }, [isOnline, hasPendingChanges, state?.isGetting, state?.isSetting, state?.numPendingSets]);

  // Determine current sync status
  const getStatus = (): SyncStatus => {
    const err = state?.error as Error | undefined;

    const pendingChanges = state?.getPendingChanges?.();
    const hasPendingChanges = pendingChanges && Object.keys(pendingChanges).length > 0;

    const isBusy = !!state?.isGetting || !!state?.isSetting || (state?.numPendingSets ?? 0) > 0;

    if (!isOnline) return "offline";

    // 1️⃣ If we’re actively doing work, always show "syncing"
    if (isBusy) return "syncing";

    // 2️⃣ If we’re *not* busy, but we have an error and pending changes,
    //    that means "we tried and failed" -> show error.
    if (err && hasPendingChanges) return "error";

    // 3️⃣ No error, but still pending -> queued changes waiting for retry
    if (hasPendingChanges) return "pending";

    // 4️⃣ Everything clean
    return "synced";
  };

  const status = getStatus();
  const config = STATUS_CONFIG[status];

  // Get pending count from both sources
  // const pendingChanges = state?.getPendingChanges?.();
  const pendingCount = pendingChanges ? Object.keys(pendingChanges).length : 0;
  const lastSync = state?.lastSync ? new Date(state.lastSync).toLocaleTimeString() : "Never";

  return (
    <>
      {/* Floating indicator button */}
      <TouchableOpacity
        style={[styles.indicator, { backgroundColor: config.bgColor }]}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.8}
      >
        {status === "syncing" ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <MaterialIcons name={config.icon} size={20} color={config.color} />
        )}
      </TouchableOpacity>

      {/* Detail modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={[styles.statusBadge, { backgroundColor: config.bgColor }]}>
                {status === "syncing" ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <MaterialIcons name={config.icon} size={18} color={config.color} />
                )}
                <Text style={[styles.statusBadgeText, { color: config.color }]}>
                  {config.label}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoSection}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Network</Text>
                <Text style={[styles.infoValue, { color: isOnline ? "#34C759" : "#FF3B30" }]}>
                  {isOnline ? "Connected" : "Offline"}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Pending Changes</Text>
                <Text style={styles.infoValue}>{pendingCount}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Sync</Text>
                <Text style={styles.infoValue}>{lastSync}</Text>
              </View>
              {state?.error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorLabel}>Error</Text>
                  <Text style={styles.errorText}>{state.error.message}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  indicator: {
    position: "absolute",
    top: 60,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 1000,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 100,
    paddingRight: 16,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: 280,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    gap: 6,
  },
  statusBadgeText: {
    fontWeight: "600",
    fontSize: 14,
  },
  infoSection: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  infoLabel: {
    color: "#666",
    fontSize: 14,
  },
  infoValue: {
    fontWeight: "600",
    fontSize: 14,
    color: "#333",
  },
  errorBox: {
    marginTop: 12,
    backgroundColor: "#FFF3F3",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FFCDD2",
  },
  errorLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#c62828",
    marginBottom: 4,
  },
  errorText: {
    fontSize: 12,
    color: "#c62828",
  },
  actions: {
    gap: 8,
  },
  actionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  actionButtonDisabled: {
    backgroundColor: "#ccc",
  },
  actionButtonSecondary: {
    backgroundColor: "#f0f0f0",
    borderWidth: 1,
    borderColor: "#007AFF",
  },
  actionButtonDanger: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  actionButtonTextSecondary: {
    color: "#007AFF",
    fontWeight: "600",
    fontSize: 14,
  },
  actionIcon: {
    marginRight: 2,
  },
});
