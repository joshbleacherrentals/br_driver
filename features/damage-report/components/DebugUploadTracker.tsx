import { powerSyncDb } from "@/components/providers/SystemProvider";
import { themes, type ThemeColors, typeScale } from "@/constants/theme";
import { DAMAGE_PHOTO_ATTACHMENT_TABLE } from "@/library/powersync/AppSchema";
import * as Clipboard from "expo-clipboard";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

const STATE_LABELS: Record<number, string> = {
  0: "QUEUED_SYNC",
  1: "QUEUED_UPLOAD",
  2: "QUEUED_DOWNLOAD",
  3: "SYNCED",
  4: "ARCHIVED",
};

/** Debug console always uses dark tokens regardless of app theme. */
const debugTheme = themes.dark;

function stateColors(theme: ThemeColors): Record<number, string> {
  return {
    0: theme.warning,
    1: theme.warning,
    2: theme.accent,
    3: theme.success,
    4: theme.textTertiary,
  };
}

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
  const styles = useMemo(() => makeStyles(debugTheme), []);
  const colors = useMemo(() => stateColors(debugTheme), []);
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
          const newRows: AttachmentRow[] = result.rows?._array ?? [];
          setRows(newRows);

          const now = new Date().toISOString().slice(11, 23);
          const newLogs: string[] = [];

          for (const row of newRows) {
            const prev = prevStatesRef.current.get(row.id);
            if (prev !== undefined && prev !== row.state) {
              const shortId =
                row.filename?.split("/").pop() ?? row.id.slice(-20);
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upload Tracker</Text>
        <TouchableOpacity
          style={styles.copyBtn}
          onPress={() => {
            const summary = [
              `=== Upload Tracker ===`,
              `Total: ${total} | Found in queue: ${found}`,
              `Synced: ${synced} | Queued: ${queued} | Archived: ${archived} | Other: ${other}`,
              ``,
              `--- Per-photo status ---`,
              ...rows.map((r) => {
                const name = r.filename?.split("/").pop() ?? r.id.slice(-20);
                const sizeKB = r.size
                  ? `${Math.round(r.size / 1024)}KB`
                  : "??KB";
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
          <Text style={styles.copyBtnText}>Copy Report</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <View style={[styles.dot, { backgroundColor: debugTheme.success }]} />
          <Text style={styles.summaryText}>
            Synced: {synced}/{total}
          </Text>
        </View>
        <View style={styles.summaryItem}>
          <View style={[styles.dot, { backgroundColor: debugTheme.warning }]} />
          <Text style={styles.summaryText}>Queued: {queued}</Text>
        </View>
        {archived > 0 && (
          <View style={styles.summaryItem}>
            <View
              style={[styles.dot, { backgroundColor: debugTheme.textTertiary }]}
            />
            <Text style={styles.summaryText}>Archived: {archived}</Text>
          </View>
        )}
        {found < total && (
          <View style={styles.summaryItem}>
            <View style={[styles.dot, { backgroundColor: debugTheme.danger }]} />
            <Text style={styles.summaryText}>Missing: {total - found}</Text>
          </View>
        )}
      </View>

      <View style={styles.progressBg}>
        <View
          style={[
            styles.progressFill,
            { width: `${total > 0 ? (synced / total) * 100 : 0}%` },
          ]}
        />
      </View>

      <View style={styles.grid}>
        {attachmentIds.map((id, i) => {
          const row = rows.find((r) => r.id === id);
          const state = row?.state ?? -1;
          const color =
            state === -1
              ? debugTheme.danger
              : (colors[state] ?? debugTheme.textTertiary);
          const label =
            state === -1 ? "?" : state === 3 ? "✓" : state === 4 ? "X" : "•";
          return (
            <View key={id} style={[styles.photoDot, { backgroundColor: color }]}>
              <Text style={styles.photoDotText}>{label}</Text>
              <Text style={styles.photoDotIndex}>{i}</Text>
            </View>
          );
        })}
      </View>

      {logs.length > 0 && (
        <>
          <Text style={styles.logHeader}>State Transitions</Text>
          <ScrollView
            ref={logScrollRef}
            style={styles.logScroll}
            onContentSizeChange={() =>
              logScrollRef.current?.scrollToEnd({ animated: false })
            }
          >
            {logs.map((line, i) => (
              <Text key={i} style={styles.logLine} selectable>
                {line}
              </Text>
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
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
      backgroundColor: theme.surfaceElevated,
    },
    title: {
      color: theme.accent,
      ...typeScale.footnote,
      fontWeight: "700",
      fontFamily: "Courier",
    },
    copyBtn: {
      backgroundColor: theme.accent,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 4,
    },
    copyBtnText: {
      color: theme.onAccent,
      ...typeScale.caption2,
      fontWeight: "600",
    },
    summaryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
      paddingHorizontal: 10,
      paddingTop: 8,
    },
    summaryItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    summaryText: {
      color: theme.textPrimary,
      ...typeScale.caption2,
      fontFamily: "Courier",
    },
    dot: { width: 8, height: 8, borderRadius: 4 },
    progressBg: {
      height: 6,
      backgroundColor: theme.separator,
      borderRadius: 3,
      marginHorizontal: 10,
      marginTop: 8,
      overflow: "hidden",
    },
    progressFill: {
      height: "100%",
      backgroundColor: theme.success,
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
      color: theme.onAccent,
      ...typeScale.caption,
      fontWeight: "700",
    },
    photoDotIndex: {
      color: theme.onAccent + "80",
      ...typeScale.caption2,
      position: "absolute",
      bottom: 1,
    },
    logHeader: {
      color: theme.accent,
      ...typeScale.caption2,
      fontWeight: "600",
      fontFamily: "Courier",
      paddingHorizontal: 10,
      paddingTop: 6,
    },
    logScroll: { maxHeight: 200, paddingHorizontal: 10, paddingBottom: 10 },
    logLine: {
      color: theme.textSecondary,
      ...typeScale.caption2,
      fontFamily: "Courier",
      marginBottom: 1,
    },
  });
}
