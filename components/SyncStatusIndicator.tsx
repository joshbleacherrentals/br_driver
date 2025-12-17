import { getAllSyncEntries } from "@/utils/supabase/supaLegend/util";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { observer } from "@legendapp/state/react";
import NetInfo from "@react-native-community/netinfo";
import { ComponentProps, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

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

type StoreStatus = {
  name: string;
  pendingCount: number;
  isLoading: boolean;
  hasError: boolean;
  errorMessage: string | null;
  lastSync: string | null;
};

type ExpandedStoreInfo = {
  name: string;
  error: string | null;
  isLoaded: boolean;
  isPersistLoaded: boolean;
  isPersistEnabled: boolean;
  isSyncEnabled: boolean;
  lastSync: string | null;
  syncCount: number | null;
  isGetting: boolean;
  isSetting: boolean;
  numPendingGets: number | null;
  numPendingSets: number | null;
  numPendingRemoteLoads: number | null;
  pendingChanges: Record<string, { p: any; v?: any }> | null;
};

const isNetworkError = (error: any): boolean => {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("Network request failed");
};

export const SyncStatusIndicator = observer(() => {
  const [isOnline, setIsOnline] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [expandedStore, setExpandedStore] = useState<ExpandedStoreInfo | null>(null);

  // Static list of entries; the *contents* are reactive via .get()
  const entries = getAllSyncEntries();
  const snapshots = entries.map((entry) => entry.state$.get());

  const storeStatuses: StoreStatus[] = entries.map((entry, index) => {
    const s = snapshots[index];
    const pc = s?.getPendingChanges?.();
    const pendingCount = pc ? Object.keys(pc).length : 0;
    const error = s?.error;
    const errorMessage = error ? (error instanceof Error ? error.message : String(error)) : null;
    const isRealError = error && !(isNetworkError(error) && !isOnline);

    return {
      name: entry.name,
      pendingCount,
      isLoading: s?.isLoaded === false,
      hasError: !!isRealError,
      errorMessage,
      lastSync: s?.lastSync ? new Date(s.lastSync).toLocaleTimeString() : null,
    };
  });

  const totalPending = storeStatuses.reduce((sum, s) => sum + s.pendingCount, 0);
  const storesWithErrors = storeStatuses.filter((s) => s.hasError);
  const anyError = storesWithErrors.length > 0;
  const anyLoading = storeStatuses.some((s) => s.isLoading);

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
    if (anyLoading) return;
    if (totalPending > 0) return;
    if (anyError) return;
    if (!isOnline) return;
    // Clear errors on all states
    entries.forEach((entry) => {
      const s$ = entry.state$;
      const s = s$.get();
      if (s?.error) {
        s$.error.set(undefined as any);
      }
    });
  }, [isOnline, anyLoading, totalPending]);

  const getStatus = (): SyncStatus => {
    if (anyLoading) return "syncing";
    if (anyError) return "error";
    if (totalPending > 0) return "pending";
    if (!isOnline) return "offline";
    return "synced";
  };

  const status = getStatus();
  const config = STATUS_CONFIG[status];

  const handleStorePress = (entryName: string, s: any) => {
    const pendingChanges = s?.getPendingChanges?.() ?? null;

    const info: ExpandedStoreInfo = {
      name: entryName,
      error: s?.error ? (s.error instanceof Error ? s.error.message : String(s.error)) : null,
      isLoaded: s?.isLoaded ?? false,
      isPersistLoaded: s?.isPersistLoaded ?? false,
      isPersistEnabled: s?.isPersistEnabled ?? false,
      isSyncEnabled: s?.isSyncEnabled ?? false,
      lastSync: s?.lastSync ? new Date(s.lastSync).toISOString() : null,
      syncCount: s?.syncCount ?? null,
      isGetting: s?.isGetting ?? false,
      isSetting: s?.isSetting ?? false,
      numPendingGets: s?.numPendingGets ?? null,
      numPendingSets: s?.numPendingSets ?? null,
      numPendingRemoteLoads: s?.numPendingRemoteLoads ?? null,
      pendingChanges: pendingChanges,
    };

    // Use JSON.stringify with a replacer to handle circular references and show full objects/arrays
    try {
      console.warn(
        "[SyncStatusIndicator] Expanded store info:",
        JSON.stringify(
          info,
          (key, value) => {
            if (typeof value === "object" && value !== null) {
              if (Array.isArray(value)) return value;
              // Avoid circular reference
              if (value._visited) return "[Circular]";
              Object.defineProperty(value, "_visited", { value: true, enumerable: false });
            }
            return value;
          },
          2
        )
      );
    } catch (err) {
      console.warn("[SyncStatusIndicator] Expanded store info (raw):", info);
    }

    setExpandedStore(info);
  };

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
        <View
          style={styles.modalOverlay}
          // activeOpacity={1}
          // onPress={() => {
          //   // setModalVisible(false);
          //   setExpandedStore(null);
          // }}
        >
          <View
            style={styles.modalContent}
            // onStartShouldSetResponder={() => true}
            // onTouchEnd={(e) => e.stopPropagation()}
          >
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
              <TouchableOpacity
                onPress={() => {
                  setModalVisible(false);
                  setExpandedStore(null);
                }}
              >
                <MaterialIcons name="close" size={24} color="#999" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoSection}>
              <TouchableOpacity
                onPress={() => {
                  setExpandedStore(null);
                }}
              >
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
              </TouchableOpacity>
              {/* Optional: show per-store info */}
              {expandedStore !== null ? (
                <ScrollView style={styles.errorBox}>
                  <View>
                    <Text style={styles.errorText}>{JSON.stringify(expandedStore, null, 2)}</Text>
                  </View>
                </ScrollView>
              ) : (
                entries.map((entry) => {
                  const s = entry.state$.get();
                  const pc = s?.getPendingChanges?.();
                  const pending = pc ? Object.keys(pc).length : 0;
                  const isLoading = s?.isLoaded === false;
                  const error = s.error?.message ?? null;
                  const isRealError = error && !(isNetworkError(error) && !isOnline);
                  return (
                    <TouchableOpacity
                      key={entry.name}
                      onPress={() => handleStorePress(entry.name, s)}
                    >
                      <View key={entry.name} style={styles.infoRow}>
                        <Text style={[styles.infoLabel, { fontStyle: "italic" }]}>
                          {entry.name}
                        </Text>
                        {!!isRealError ? (
                          <View
                            style={[
                              styles.storeStatusCircle,
                              { backgroundColor: STATUS_CONFIG.error.bgColor },
                            ]}
                          >
                            <MaterialIcons
                              name="error"
                              size={14}
                              color={STATUS_CONFIG.error.bgColor}
                            />
                          </View>
                        ) : pending > 0 ? (
                          <View
                            style={[
                              styles.storeStatusCircle,
                              { backgroundColor: STATUS_CONFIG.pending.bgColor },
                            ]}
                          >
                            <Text
                              style={[
                                styles.storeStatusCount,
                                { color: STATUS_CONFIG.pending.color },
                              ]}
                            >
                              {pending}
                            </Text>
                          </View>
                        ) : isLoading ? (
                          <View
                            style={[
                              styles.storeStatusCircle,
                              { backgroundColor: STATUS_CONFIG.syncing.bgColor },
                            ]}
                          >
                            <ActivityIndicator size="small" color={STATUS_CONFIG.syncing.color} />
                          </View>
                        ) : (
                          <View
                            style={[
                              styles.storeStatusCircle,
                              { backgroundColor: STATUS_CONFIG.synced.bgColor },
                            ]}
                          >
                            <MaterialIcons
                              name="check"
                              size={14}
                              color={STATUS_CONFIG.synced.color}
                            />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          </View>
        </View>
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
    height: 400,
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
  storeStatusCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  storeStatusCount: {
    fontSize: 12,
    fontWeight: "700",
  },
});
