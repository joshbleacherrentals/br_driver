import BleacherDropdown, {
  BleacherOption,
} from "@/components/widgets/bleacherDropdown";
import { damageReportPhotoAttachmentQueue } from "@/components/providers/SystemProvider";
import { useAllBleachers } from "@/hooks/db/useBleacher";
import { useDamageReportById } from "@/hooks/db/useDamageReport";
import {
  DamageReportPhotoWithStatus,
  useDamageReportPhotos,
} from "@/hooks/db/useDamageReportPhotos";
import { useDriver } from "@/hooks/db/useDriver";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  DamageDetailsForm,
  DamageDetailsFormValues,
} from "./components/DamageDetailsForm";
import { DebugUploadTracker } from "./components/DebugUploadTracker";
import { ImageViewer, ImageViewerItem } from "./components/ImageViewer";
import { PhotoUploadIndicator } from "./components/PhotoUploadIndicator";
import { PhotoUploadStatusBanner } from "./components/PhotoUploadStatusBanner";
import { SubmitProgressModal } from "./components/SubmitProgressModal";
import { createDamageReport } from "./utils/createDamageReport";
import { resolvePhotoUri } from "./utils/resolvePhotoUri";

// ━━━ Debug toggle ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const DEBUG_PHOTO_UPLOAD = false;
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DebugLogEntry {
  ts: string;
  msg: string;
}

const INITIAL_DETAILS: DamageDetailsFormValues = {
  seatDamage: null,
  haulDamage: null,
  note: "",
  photos: [],
};

// ── View-only photo grid ────────────────────────────────────────────────────

function ViewOnlyPhotoGrid({
  photos,
}: {
  photos: DamageReportPhotoWithStatus[];
}) {
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [fullSizeItems, setFullSizeItems] = useState<ImageViewerItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function resolve() {
      const items: ImageViewerItem[] = await Promise.all(
        photos.map(async (p) => {
          const uri = p.photo_path ? await resolvePhotoUri(p.photo_path) : "";
          return {
            id: p.id,
            uri,
            thumbnail: p.thumbnail ?? undefined,
            storagePath: p.photo_path ?? undefined,
          };
        }),
      );
      if (!cancelled) setFullSizeItems(items);
    }
    resolve();
    return () => {
      cancelled = true;
    };
  }, [photos]);

  if (photos.length === 0) {
    return (
      <Text style={{ color: "#8E8E93", fontSize: 14, fontStyle: "italic" }}>
        No photos attached
      </Text>
    );
  }

  return (
    <>
      <View style={styles.photoGrid}>
        {photos.map((photo, index) => {
          const thumbUri = photo.thumbnail
            ? `data:image/jpeg;base64,${photo.thumbnail}`
            : undefined;
          return (
            <TouchableOpacity
              key={photo.id}
              style={styles.photoContainer}
              activeOpacity={0.7}
              onPress={() => setViewerIndex(index)}
            >
              {thumbUri ? (
                <Image source={{ uri: thumbUri }} style={styles.photo} />
              ) : (
                <View style={[styles.photo, styles.photoPlaceholder]}>
                  <Ionicons name="image-outline" size={28} color="#C7C7CC" />
                </View>
              )}
              <PhotoUploadIndicator status={photo.uploadStatus} />
            </TouchableOpacity>
          );
        })}
      </View>

      {viewerIndex !== null && fullSizeItems.length > 0 && (
        <ImageViewer
          images={fullSizeItems}
          initialIndex={viewerIndex}
          visible
          title="Damage Photos"
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}

// ── Severity display (read-only) ────────────────────────────────────────────

function SeverityDisplay({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const isNone = !value || value === "none";
  const isMajor = value === "major" || value === "1";
  const color = isNone ? "#34C759" : isMajor ? "#FF3B30" : "#FF9500";
  const text = isNone ? "None" : isMajor ? "Major" : "Minor";

  return (
    <View style={styles.severityRow}>
      <Text style={styles.severityLabel}>{label}</Text>
      <View
        style={[
          styles.severityBadge,
          { backgroundColor: color + "18", borderColor: color },
        ]}
      >
        <Text style={[styles.severityBadgeText, { color }]}>{text}</Text>
      </View>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────────────

export default function DamageReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ damageReportId?: string }>();
  const { bleachers } = useAllBleachers();
  const { driver } = useDriver();

  // View-only state — set either from route param or after submit
  const [viewOnlyId, setViewOnlyId] = useState<string | null>(
    params.damageReportId ?? null,
  );
  const isViewOnly = !!viewOnlyId;

  // Load existing report data when in view-only mode
  const { damageReport } = useDamageReportById(viewOnlyId);
  const {
    photos: reportPhotos,
    hasPending: photosPending,
    hasFailed: photosFailed,
  } = useDamageReportPhotos(viewOnlyId);
  const [isRetryingPhotos, setIsRetryingPhotos] = useState(false);

  const bleacherOptions: BleacherOption[] = useMemo(
    () =>
      bleachers
        .filter((b) => !(b as any).deleted)
        .map((b) => ({
          uuid: b.id,
          bleacher_number: b.bleacher_number ?? "",
          bleacher_rows: b.bleacher_rows,
        })),
    [bleachers],
  );

  const viewBleacher = useMemo(() => {
    if (!damageReport?.bleacher_uuid) return null;
    return (
      bleacherOptions.find((b) => b.uuid === damageReport.bleacher_uuid) ?? null
    );
  }, [damageReport, bleacherOptions]);

  // ── Create mode state ───────────────────────────────────────────────────
  const [selectedBleacher, setSelectedBleacher] = useState<string | null>(null);
  const [details, setDetails] =
    useState<DamageDetailsFormValues>(INITIAL_DETAILS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prepProgress, setPrepProgress] = useState({ current: 0, total: 0 });
  const abortRef = useRef(false);
  const [debugLogs, setDebugLogs] = useState<DebugLogEntry[]>([]);
  const [trackedAttachmentIds, setTrackedAttachmentIds] = useState<string[]>(
    [],
  );
  const debugScrollRef = useRef<ScrollView>(null);

  const dlog = useCallback((msg: string) => {
    const entry: DebugLogEntry = {
      ts: new Date().toISOString().slice(11, 23),
      msg,
    };
    console.log(`[DR-DEBUG] ${entry.ts} ${msg}`);
    if (DEBUG_PHOTO_UPLOAD) {
      setDebugLogs((prev) => [...prev, entry]);
    }
  }, []);

  const canSubmit =
    selectedBleacher &&
    (details.seatDamage !== null || details.haulDamage !== null) &&
    details.note.trim().length > 0 &&
    details.photos.length > 0 &&
    !isSubmitting;

  const handleAbort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const handleRetryFailedPhotos = useCallback(async () => {
    if (!damageReportPhotoAttachmentQueue) {
      Alert.alert(
        "Unavailable",
        "Photo upload is not ready yet. Try again shortly.",
      );
      return;
    }

    const toRetry = reportPhotos.filter(
      (p) =>
        (p.uploadStatus === "failed" || p.uploadStatus === "pending") &&
        p.photo_path,
    );
    if (toRetry.length === 0) return;

    setIsRetryingPhotos(true);
    try {
      let retried = 0;
      let needReAdd = 0;

      for (const photo of toRetry) {
        const path = photo.photo_path!;
        const ok = await damageReportPhotoAttachmentQueue.retryUpload(path);
        if (ok) {
          retried++;
        } else {
          needReAdd++;
        }
      }

      if (needReAdd > 0 && retried === 0) {
        Alert.alert(
          "Photos missing on this device",
          "The original files are no longer on this phone, so upload cannot be retried automatically. Please create a new damage report with the photos.",
        );
      } else if (needReAdd > 0) {
        Alert.alert(
          "Partial retry",
          `${retried} photo(s) re-queued. ${needReAdd} photo(s) are no longer on this device and need a new report.`,
        );
      }
    } catch (e) {
      Alert.alert(
        "Retry failed",
        e instanceof Error ? e.message : "Could not retry photo upload.",
      );
    } finally {
      setIsRetryingPhotos(false);
    }
  }, [reportPhotos]);

  const handleSubmit = async () => {
    if (!selectedBleacher) {
      Alert.alert("Required", "Please select a bleacher");
      return;
    }
    if (details.seatDamage === null && details.haulDamage === null) {
      Alert.alert("Required", "Please select at least one damage severity");
      return;
    }
    if (!details.note.trim()) {
      Alert.alert("Required", "Please add damage notes");
      return;
    }
    if (details.photos.length === 0) {
      Alert.alert("Required", "Please add at least one damage photo");
      return;
    }

    abortRef.current = false;
    setIsSubmitting(true);
    dlog(`SUBMIT: starting with ${details.photos.length} photos`);

    try {
      const result = await createDamageReport({
        bleacherUuid: selectedBleacher,
        inspectionUuid: null,
        seatDamage: details.seatDamage,
        haulDamage: details.haulDamage,
        note: details.note,
        photos: details.photos,
        createdByUserUuid: driver?.user_uuid ?? null,
        shouldAbort: () => abortRef.current,
        onPhotoProgress: (current, total) =>
          setPrepProgress({ current, total }),
      });

      if (result.aborted) {
        dlog("SUBMIT: user cancelled — report row exists but photos are partial");
        setIsSubmitting(false);
        return;
      }

      dlog(
        `SUBMIT: done saved=${result.savedPhotoCount} id=${result.damageId.slice(0, 8)}`,
      );
      if (DEBUG_PHOTO_UPLOAD) {
        setTrackedAttachmentIds([result.damageId]);
      }

      dlog("SUBMIT: success! Navigating to view-only...");
      setIsSubmitting(false);
      setViewOnlyId(result.damageId);
    } catch (error) {
      dlog(`SUBMIT: FATAL ERROR - ${String(error).slice(0, 200)}`);
      Alert.alert("Error", "Failed to submit damage report. Please try again.");
      setIsSubmitting(false);
    }
  };

  // ── View-only render ────────────────────────────────────────────────────

  if (isViewOnly) {
    return (
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* Bleacher */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Bleacher</Text>
            <Text style={styles.viewOnlyValue}>
              #
              {viewBleacher?.bleacher_number ??
                damageReport?.bleacher_uuid?.slice(0, 8) ??
                "—"}
              {viewBleacher?.bleacher_rows
                ? ` (${viewBleacher.bleacher_rows} rows)`
                : ""}
            </Text>
          </View>

          {/* Severity */}
          <View style={styles.section}>
            <SeverityDisplay
              label="Seating Configuration"
              value={damageReport?.seat_damage ?? null}
            />
            <SeverityDisplay
              label="Hauling Configuration"
              value={damageReport?.haul_damage ?? null}
            />
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Damage Notes</Text>
            <Text style={styles.viewOnlyValue}>
              {damageReport?.note || "—"}
            </Text>
          </View>

          {/* Photos with upload status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Damage Photos ({reportPhotos.length})
            </Text>
            <View style={{ marginTop: 8 }}>
              <PhotoUploadStatusBanner
                hasPending={photosPending}
                hasFailed={photosFailed}
                isRetrying={isRetryingPhotos}
                onRetry={handleRetryFailedPhotos}
              />
              <ViewOnlyPhotoGrid photos={reportPhotos} />
            </View>
          </View>

          {/* Metadata */}
          <View style={styles.section}>
            <Text style={styles.metaText}>
              Created:{" "}
              {damageReport?.created_at
                ? new Date(damageReport.created_at).toLocaleString()
                : "—"}
            </Text>
            {damageReport?.resolved_at && (
              <Text style={[styles.metaText, { color: "#34C759" }]}>
                Resolved: {new Date(damageReport.resolved_at).toLocaleString()}
              </Text>
            )}
          </View>

          {/* Back button */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: "#0A84FF" }]}
              onPress={() => router.back()}
            >
              <Text style={styles.submitButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {/* Debug panel (only shown after submit with debug on) */}
          {DEBUG_PHOTO_UPLOAD && debugLogs.length > 0 && (
            <View style={debugStyles.container}>
              <View style={debugStyles.header}>
                <Text style={debugStyles.title}>
                  Debug Log ({debugLogs.length})
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={debugStyles.copyBtn}
                    onPress={() => {
                      const text = debugLogs
                        .map((l) => `${l.ts} ${l.msg}`)
                        .join("\n");
                      Clipboard.setStringAsync(text);
                      Alert.alert(
                        "Copied",
                        `${debugLogs.length} log entries copied to clipboard`,
                      );
                    }}
                  >
                    <Text style={debugStyles.copyBtnText}>Copy All</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      debugStyles.copyBtn,
                      { backgroundColor: "#FF3B30" },
                    ]}
                    onPress={() => setDebugLogs([])}
                  >
                    <Text style={debugStyles.copyBtnText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView
                ref={debugScrollRef}
                style={debugStyles.logScroll}
                onContentSizeChange={() =>
                  debugScrollRef.current?.scrollToEnd({ animated: false })
                }
              >
                {debugLogs.map((entry, i) => (
                  <Text key={i} style={debugStyles.logLine} selectable>
                    <Text style={debugStyles.logTs}>{entry.ts} </Text>
                    <Text
                      style={
                        entry.msg.includes("ERROR") ||
                        entry.msg.includes("FAILED") ||
                        entry.msg.includes("MISSING")
                          ? debugStyles.logError
                          : entry.msg.includes("done") ||
                              entry.msg.includes("success")
                            ? debugStyles.logSuccess
                            : debugStyles.logMsg
                      }
                    >
                      {entry.msg}
                    </Text>
                  </Text>
                ))}
              </ScrollView>
            </View>
          )}

          {DEBUG_PHOTO_UPLOAD && trackedAttachmentIds.length > 0 && (
            <DebugUploadTracker attachmentIds={trackedAttachmentIds} />
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Create mode render ──────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Bleacher select */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Bleacher</Text>
          <View style={styles.requiredBadge}>
            <Text style={styles.requiredText}>REQUIRED</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <BleacherDropdown
              options={bleacherOptions}
              selectedUuid={selectedBleacher}
              onChange={setSelectedBleacher}
              placeholder="Select bleacher…"
            />
          </View>
        </View>

        <DamageDetailsForm
          values={details}
          onChange={(patch) =>
            setDetails((prev) => ({ ...prev, ...patch }))
          }
        />

        {/* Submit */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.submitButton,
              !canSubmit && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitButtonText}>
              {isSubmitting ? "Submitting..." : "Submit Report"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Debug panel */}
        {DEBUG_PHOTO_UPLOAD && debugLogs.length > 0 && (
          <View style={debugStyles.container}>
            <View style={debugStyles.header}>
              <Text style={debugStyles.title}>
                Debug Log ({debugLogs.length})
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={debugStyles.copyBtn}
                  onPress={() => {
                    const text = debugLogs
                      .map((l) => `${l.ts} ${l.msg}`)
                      .join("\n");
                    Clipboard.setStringAsync(text);
                    Alert.alert(
                      "Copied",
                      `${debugLogs.length} log entries copied to clipboard`,
                    );
                  }}
                >
                  <Text style={debugStyles.copyBtnText}>Copy All</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[debugStyles.copyBtn, { backgroundColor: "#FF3B30" }]}
                  onPress={() => setDebugLogs([])}
                >
                  <Text style={debugStyles.copyBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView
              ref={debugScrollRef}
              style={debugStyles.logScroll}
              onContentSizeChange={() =>
                debugScrollRef.current?.scrollToEnd({ animated: false })
              }
            >
              {debugLogs.map((entry, i) => (
                <Text key={i} style={debugStyles.logLine} selectable>
                  <Text style={debugStyles.logTs}>{entry.ts} </Text>
                  <Text
                    style={
                      entry.msg.includes("ERROR") ||
                      entry.msg.includes("FAILED") ||
                      entry.msg.includes("MISSING")
                        ? debugStyles.logError
                        : entry.msg.includes("done")
                          ? debugStyles.logSuccess
                          : debugStyles.logMsg
                    }
                  >
                    {entry.msg}
                  </Text>
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {DEBUG_PHOTO_UPLOAD && (
          <DebugUploadTracker attachmentIds={trackedAttachmentIds} />
        )}
      </ScrollView>

      <SubmitProgressModal
        visible={isSubmitting}
        current={prepProgress.current}
        total={prepProgress.total}
        onAbort={handleAbort}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F2F2F7" },
  scrollContent: { padding: 16 },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000",
  },
  requiredBadge: {
    backgroundColor: "#FF3B30",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  requiredText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoContainer: { position: "relative", width: 100, height: 100 },
  photo: { width: "100%", height: "100%", borderRadius: 8 },
  photoPlaceholder: {
    backgroundColor: "#F2F2F7",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButtonText: { fontSize: 16, fontWeight: "600", color: "#000" },
  submitButton: {
    flex: 2,
    backgroundColor: "#34C759",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  submitButtonDisabled: { backgroundColor: "#A8E6B7" },
  submitButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  // View-only styles
  viewOnlyValue: {
    fontSize: 16,
    color: "#3C3C43",
    marginTop: 6,
    lineHeight: 22,
  },
  severityRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  severityLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  severityBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  severityBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  metaText: {
    fontSize: 13,
    color: "#8E8E93",
    marginBottom: 4,
  },
});

const debugStyles = StyleSheet.create({
  container: {
    backgroundColor: "#1E1E1E",
    borderRadius: 8,
    marginTop: 16,
    marginBottom: 32,
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
    color: "#00FF00",
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
  logScroll: { maxHeight: 300, padding: 10 },
  logLine: { marginBottom: 2 },
  logTs: { color: "#888", fontSize: 10, fontFamily: "Courier" },
  logMsg: { color: "#DDD", fontSize: 10, fontFamily: "Courier" },
  logError: {
    color: "#FF6B6B",
    fontSize: 10,
    fontFamily: "Courier",
    fontWeight: "700",
  },
  logSuccess: {
    color: "#00FF00",
    fontSize: 10,
    fontFamily: "Courier",
    fontWeight: "700",
  },
});
