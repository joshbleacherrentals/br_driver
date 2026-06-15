import { DAMAGE_PHOTO_ATTACHMENT_TABLE } from "@/library/powersync/AppSchema";
import { powerSyncDb } from "@/components/providers/SystemProvider";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// Matches @powersync/attachments AttachmentState
const STATE_LABELS: Record<number, string> = {
  0: "QUEUED_SYNC",
  1: "QUEUED_UPLOAD",
  2: "QUEUED_DOWNLOAD",
  3: "SYNCED",
  4: "ARCHIVED",
};

const STATE_COLORS: Record<number, string> = {
  0: "#FF9500", // orange
  1: "#FF9500", // orange
  2: "#5856D6", // purple
  3: "#34C759", // green
  4: "#8E8E93", // gray
};

interface AttachmentRow {
  id: string;
  filename: string;
  state: number;
  size: number | null;
  timestamp: number;
  local_uri: string | null;
}

interface Props {
  attachmentIds: string[];
}

export function DebugUploadTracker({ attachmentIds }: Props) {
  const [rows, setRows] = useState<AttachmentRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const logScrollRef = useRef<ScrollView>(null);
  const prevStatesRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (attachmentIds.length === 0) return;

    const abortController = new AbortController();
    const placeholders = attachmentIds.map(() => "?").join(",");
    const query = `SELECT id, filename, state, size, timestamp, local_uri
                   FROM "${DAMAGE_PHOTO_ATTACHMENT_TABLE}"
                   WHERE id IN (${placeholders})
                   ORDER BY timestamp ASC`;

    powerSyncDb.watch(
      query,
      attachmentIds,
      {
        onResult: (result: any) => {
          const newRows: AttachmentRow[] =
            result.rows?._array ?? [];
          setRows(newRows);

          const now = new Date().toISOString().slice(11, 23);
          const newLogs: string[] = [];

          for (const row of newRows) {
            const prev = prevStatesRef.current.get(row.id);
            if (prev !== undefined && prev !== row.state) {
              const shortId = row.filename?.split("/").pop() ?? row.id.slice(-20);
              const from = STATE_LABELS[prev] ?? `?${prev}`;
              const to = STATE_LABELS[row.state] ?? `?${row.state}`;
              newLogs.push(`${now} ${shortId}: ${from} -> ${to}`);
            }
            prevStatesRef.current.set(row.id, row.state);
          }

          if (newLogs.length > 0) {
            setLogs((prev) => [...prev, ...newLogs]);
          }
        },
      },
      { signal: abortController.signal },
    );

    return () => {
      abortController.abort();
    };
  }, [attachmentIds]);

  if (attachmentIds.length === 0) return null;

  const synced = rows.filter((r) => r.state === 3).length;
  const queued = rows.filter((r) => r.state === 0 || r.state === 1).length;
  const archived = rows.filter((r) => r.state === 4).length;
  const other = rows.length - synced - queued - archived;
  const total = attachmentIds.length;
  const found = rows.length;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Upload Tracker</Text>
        <TouchableOpacity
          style={s.copyBtn}
          onPress={() => {
            const summary = [
              `=== Upload Tracker ===`,
              `Total: ${total} | Found in queue: ${found}`,
              `Synced: ${synced} | Queued: ${queued} | Archived: ${archived} | Other: ${other}`,
              ``,
              `--- Per-photo status ---`,
              ...rows.map((r) => {
                const name =
                  r.filename?.split("/").pop() ?? r.id.slice(-20);
                const sizeKB = r.size ? `${Math.round(r.size / 1024)}KB` : "??KB";
                return `${name} | ${sizeKB} | ${STATE_LABELS[r.state] ?? `?${r.state}`}`;
              }),
              ``,
              `--- State transitions ---`,
              ...logs,
            ].join("\n");
            Clipboard.setStringAsync(summary);
            Alert.alert("Copied", "Upload tracker report copied to clipboard");
          }}
        >
          <Text style={s.copyBtnText}>Copy Report</Text>
        </TouchableOpacity>
      </View>

      {/* Summary bar */}
      <View style={s.summaryRow}>
        <View style={s.summaryItem}>
          <View style={[s.dot, { backgroundColor: "#34C759" }]} />
          <Text style={s.summaryText}>Synced: {synced}/{total}</Text>
        </View>
        <View style={s.summaryItem}>
          <View style={[s.dot, { backgroundColor: "#FF9500" }]} />
          <Text style={s.summaryText}>Queued: {queued}</Text>
        </View>
        {archived > 0 && (
          <View style={s.summaryItem}>
            <View style={[s.dot, { backgroundColor: "#8E8E93" }]} />
            <Text style={s.summaryText}>Archived: {archived}</Text>
          </View>
        )}
        {found < total && (
          <View style={s.summaryItem}>
            <View style={[s.dot, { backgroundColor: "#FF3B30" }]} />
            <Text style={s.summaryText}>Missing: {total - found}</Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      <View style={s.progressBg}>
        <View
          style={[
            s.progressFill,
            { width: `${total > 0 ? (synced / total) * 100 : 0}%` },
          ]}
        />
      </View>

      {/* Per-photo grid */}
      <View style={s.grid}>
        {attachmentIds.map((id, i) => {
          const row = rows.find((r) => r.id === id);
          const state = row?.state ?? -1;
          const color = state === -1 ? "#FF3B30" : (STATE_COLORS[state] ?? "#888");
          const label =
            state === -1
              ? "?"
              : state === 3
                ? "✓"
                : state === 4
                  ? "X"
                  : "•";
          return (
            <View key={id} style={[s.photoDot, { backgroundColor: color }]}>
              <Text style={s.photoDotText}>{label}</Text>
              <Text style={s.photoDotIndex}>{i}</Text>
            </View>
          );
        })}
      </View>

      {/* Live state transition log */}
      {logs.length > 0 && (
        <>
          <Text style={s.logHeader}>State Transitions</Text>
          <ScrollView
            ref={logScrollRef}
            style={s.logScroll}
            onContentSizeChange={() =>
              logScrollRef.current?.scrollToEnd({ animated: false })
            }
          >
            {logs.map((line, i) => (
              <Text key={i} style={s.logLine} selectable>
                {line}
              </Text>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    backgroundColor: "#2D2D2D",
  },
  title: {
    color: "#0AF",
    fontSize: 13,
    fontWeight: "700",
    fontFamily: "Courier",
  },
  copyBtn: {
    backgroundColor: "#0A84FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
  },
  copyBtnText: { color: "#FFF", fontSize: 11, fontWeight: "600" },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  summaryItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  summaryText: { color: "#DDD", fontSize: 11, fontFamily: "Courier" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  progressBg: {
    height: 6,
    backgroundColor: "#444",
    borderRadius: 3,
    marginHorizontal: 10,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#34C759",
    borderRadius: 3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    padding: 10,
  },
  photoDot: {
    width: 28,
    height: 28,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  photoDotText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  photoDotIndex: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 7,
    position: "absolute",
    bottom: 1,
  },
  logHeader: {
    color: "#0AF",
    fontSize: 11,
    fontWeight: "600",
    fontFamily: "Courier",
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  logScroll: { maxHeight: 200, paddingHorizontal: 10, paddingBottom: 10 },
  logLine: { color: "#DDD", fontSize: 10, fontFamily: "Courier", marginBottom: 1 },
});
