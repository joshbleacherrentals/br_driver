import { getAllSyncEntries } from "@/utils/supabase/supaLegend/util";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
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

  // Static list of entries; the *contents* are reactive via .get()
  const entries = getAllSyncEntries();
  const snapshots = entries.map((entry) => entry.state$.get());
  // const snapshotsforLogging = entries.map((entry) => {
  //   const s = entry.state$.get();
  //   return {
  //     name: entry.name,
  //     isGetting: !!s?.isGetting,
  //     isSetting: !!s?.isSetting,
  //     isLoaded: !!s?.isLoaded,
  //     lastSync: s?.lastSync,
  //     numPendingSets: s?.numPendingSets ?? 0,
  //     pending: s?.getPendingChanges?.() ? Object.keys(s.getPendingChanges() ?? {}).length : 0,
  //   };
  // });

  // console.log("Sync snapshots:", JSON.stringify(snapshotsforLogging, null, 2));

  // Aggregate pending + error + busy across all stores
  const totalPending = snapshots.reduce((sum, state) => {
    const pc = state?.getPendingChanges?.();
    return sum + (pc ? Object.keys(pc).length : 0);
  }, 0);
  const hasPendingChanges = totalPending > 0;

  const anyError = snapshots.find((s) => s?.error);
  // const anyBusy = snapshots.some(
  //   (s) => !!s?.isGetting || !!s?.isSetting || (s?.numPendingSets ?? 0) > 0
  // );
  const anyBusy = snapshots.some(
    // (s) => !!s?.isGetting || !!s?.isSetting
    (s) => !!s?.isLoaded === false
    // If you really want numPendingSets, guard it with "has pending":
    // || ((s?.numPendingSets ?? 0) > 0 && s?.getPendingChanges && Object.keys(s.getPendingChanges()).length > 0)
  );

  const latestSyncTs = snapshots.reduce<number>((max, s) => {
    const ts = s?.lastSync ? new Date(s.lastSync).getTime() : 0;
    return ts > max ? ts : max;
  }, 0);

  const lastSync = latestSyncTs ? new Date(latestSyncTs).toLocaleTimeString() : "Never";

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((netState) => {
      setIsOnline(netState.isConnected ?? false);
    });
    return () => unsubscribe();
  }, []);

  // Clear global error once we’re online, idle and fully synced
  useEffect(() => {
    if (!isOnline) return;
    if (anyBusy) return;
    if (totalPending > 0) return;
    // Clear errors on all states
    entries.forEach((entry) => {
      const s$ = entry.state$;
      const s = s$.get();
      if (s?.error) {
        s$.error.set(undefined as any);
      }
    });
  }, [isOnline, anyBusy, totalPending]);

  const getStatus = (): SyncStatus => {
    if (!isOnline) return "offline";

    if (anyBusy) return "syncing";

    if (anyError && totalPending > 0) return "error";

    if (totalPending > 0) return "pending";

    return "synced";
  };

  const status = getStatus();
  const config = STATUS_CONFIG[status];

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
                <Text style={styles.infoValue}>{totalPending}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Last Sync</Text>
                <Text style={styles.infoValue}>{lastSync}</Text>
              </View>
              {/* Optional: show per-store info */}
              {entries.map((entry) => {
                const s = entry.state$.get();
                const pc = s?.getPendingChanges?.();
                const pending = pc ? Object.keys(pc).length : 0;
                return (
                  <View key={entry.name} style={styles.infoRow}>
                    <Text style={[styles.infoLabel, { fontStyle: "italic" }]}>{entry.name}</Text>
                    <Text style={styles.infoValue}>
                      {pending} pending{s?.error ? " (error)" : ""}
                    </Text>
                  </View>
                );
              })}

              {anyError && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorLabel}>Error</Text>
                  <Text style={styles.errorText}>{(anyError.error as Error).message}</Text>
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
