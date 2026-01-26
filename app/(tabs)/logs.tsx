import { DebugLogger, LogEntry } from "@/library/debug/DebugLogger";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DARK_BLUE = "#10365A";

const levelColors: Record<string, string> = {
  debug: "#888",
  info: "#007AFF",
  warn: "#FF9500",
  error: "#FF3B30",
};

function LogItem({ entry }: { entry: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasData = entry.data !== undefined;

  return (
    <TouchableOpacity
      style={styles.logItem}
      onPress={() => hasData && setExpanded(!expanded)}
      activeOpacity={hasData ? 0.7 : 1}
    >
      <View style={styles.logHeader}>
        <Text style={[styles.levelBadge, { backgroundColor: levelColors[entry.level] }]}>
          {entry.level.toUpperCase()}
        </Text>
        <Text style={styles.tag}>{entry.tag}</Text>
        <Text style={styles.timestamp}>{entry.timestamp.substring(11)}</Text>
      </View>
      <Text style={styles.message}>{entry.message}</Text>
      {expanded && hasData && (
        <View style={styles.dataContainer}>
          <Text style={styles.dataText}>
            {typeof entry.data === "string"
              ? entry.data
              : JSON.stringify(entry.data, null, 2)}
          </Text>
        </View>
      )}
      {hasData && !expanded && (
        <Text style={styles.expandHint}>Tap to expand data...</Text>
      )}
    </TouchableOpacity>
  );
}

export default function LogsScreen() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  useEffect(() => {
    setLogs(DebugLogger.getLogs());
    return DebugLogger.subscribe(() => {
      setLogs(DebugLogger.getLogs());
    });
  }, []);

  const shareLogs = useCallback(async () => {
    const text = DebugLogger.exportAsText();
    try {
      await Share.share({
        message: text,
        title: "Debug Logs",
      });
    } catch (error: any) {
      Alert.alert("Error", "Failed to share logs");
    }
  }, []);

  const clearLogs = useCallback(() => {
    Alert.alert("Clear Logs", "Are you sure you want to clear all logs?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: () => DebugLogger.clear(),
      },
    ]);
  }, []);

  const filteredLogs = filter
    ? logs.filter((l) => l.level === filter || l.tag.includes(filter))
    : logs;

  const reversedLogs = [...filteredLogs].reverse();

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Debug Logs</Text>
        <Text style={styles.count}>{logs.length} entries</Text>
      </View>

      <View style={styles.filterRow}>
        {["all", "error", "warn", "Upload", "PowerSync"].map((f) => (
          <TouchableOpacity
            key={f}
            style={[
              styles.filterButton,
              (f === "all" ? filter === null : filter === f) && styles.filterActive,
            ]}
            onPress={() => setFilter(f === "all" ? null : f)}
          >
            <Text
              style={[
                styles.filterText,
                (f === "all" ? filter === null : filter === f) && styles.filterTextActive,
              ]}
            >
              {f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={shareLogs}>
          <FontAwesome6 name="share" size={16} color="#fff" />
          <Text style={styles.actionText}>Share Logs</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionButton, styles.clearButton]} onPress={clearLogs}>
          <FontAwesome6 name="trash" size={16} color="#fff" />
          <Text style={styles.actionText}>Clear</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={reversedLogs}
        keyExtractor={(_, i) => `log-${i}`}
        renderItem={({ item }) => <LogItem entry={item} />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No logs yet</Text>
            <Text style={styles.emptySubtext}>
              Logs will appear here when PowerSync operations occur
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: DARK_BLUE,
  },
  count: {
    fontSize: 14,
    color: "#666",
  },
  filterRow: {
    flexDirection: "row",
    padding: 8,
    gap: 8,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
  },
  filterActive: {
    backgroundColor: DARK_BLUE,
  },
  filterText: {
    fontSize: 12,
    color: "#666",
  },
  filterTextActive: {
    color: "#fff",
  },
  actions: {
    flexDirection: "row",
    padding: 8,
    gap: 8,
    backgroundColor: "#fff",
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: DARK_BLUE,
  },
  clearButton: {
    backgroundColor: "#FF3B30",
  },
  actionText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  list: {
    padding: 8,
    paddingBottom: 100,
  },
  logItem: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  logHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  levelBadge: {
    fontSize: 10,
    fontWeight: "700",
    color: "#fff",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
  },
  tag: {
    fontSize: 12,
    fontWeight: "600",
    color: DARK_BLUE,
    flex: 1,
  },
  timestamp: {
    fontSize: 10,
    color: "#999",
    fontFamily: "monospace",
  },
  message: {
    fontSize: 13,
    color: "#333",
    lineHeight: 18,
  },
  expandHint: {
    fontSize: 11,
    color: "#007AFF",
    marginTop: 4,
  },
  dataContainer: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "#f8f8f8",
    borderRadius: 4,
  },
  dataText: {
    fontSize: 11,
    fontFamily: "monospace",
    color: "#444",
  },
  empty: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#999",
  },
  emptySubtext: {
    fontSize: 13,
    color: "#bbb",
    textAlign: "center",
    marginTop: 8,
  },
});
