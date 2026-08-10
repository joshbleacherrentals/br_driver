import BleacherDropdown, {
  BleacherOption,
} from "@/components/widgets/bleacherDropdown";
import { retryDamageReportPhotos } from "./utils/retryDamageReportPhotos";
import {
  elevation,
  radius,
  themes,
  type ThemeColors,
  typeScale,
} from "@/constants/theme";
import { useAllBleachers } from "@/hooks/db/useBleacher";
import { useDamageReportById } from "@/hooks/db/useDamageReport";
import {
  DamageReportPhotoWithStatus,
  useDamageReportPhotos,
} from "@/hooks/db/useDamageReportPhotos";
import { useDriver } from "@/hooks/db/useDriver";
import { useTheme } from "@/hooks/useTheme";
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
import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";
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

import { useThemedStyles } from "@/hooks/useThemedStyles";

const FLOATING_HEADER_HEIGHT = 52;
const FLOATING_HEADER_GAP = 12;
const DEBUG_PHOTO_UPLOAD = false;
const debugTheme = themes.dark;

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

type ScreenStyles = ReturnType<typeof makeStyles>;

function DamageReportHeader({
  onBack,
  styles,
  theme,
  insets,
}: {
  onBack: () => void;
  styles: ScreenStyles;
  theme: ThemeColors;
  insets: { top: number };
}) {
  return (
    <View
      style={[
        styles.headerOverlay,
        { paddingTop: insets.top + FLOATING_HEADER_GAP },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.floatingHeader}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
          accessibilityLabel="Back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={22} color={theme.accent} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Damage Report
        </Text>
        <View style={styles.headerSide} />
      </View>
    </View>
  );
}

function ViewOnlyPhotoGrid({
  photos,
  styles,
  theme,
}: {
  photos: DamageReportPhotoWithStatus[];
  styles: ScreenStyles;
  theme: ThemeColors;
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
      <Text style={styles.emptyPhotosText}>No photos attached</Text>
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
                  <Ionicons
                    name="image-outline"
                    size={28}
                    color={theme.textTertiary}
                  />
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

function SeverityDisplay({
  label,
  value,
  styles,
  theme,
}: {
  label: string;
  value: string | null;
  styles: ScreenStyles;
  theme: ThemeColors;
}) {
  const isNone = !value || value === "none";
  const isMajor = value === "major" || value === "1";
  const color = isNone
    ? theme.success
    : isMajor
      ? theme.danger
      : theme.warning;
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

function DebugLogPanel({
  debugLogs,
  debugStyles,
  theme,
  onClear,
}: {
  debugLogs: DebugLogEntry[];
  debugStyles: ReturnType<typeof makeDebugStyles>;
  theme: ThemeColors;
  onClear: () => void;
}) {
  const debugScrollRef = useRef<ScrollView>(null);

  return (
    <View style={debugStyles.container}>
      <View style={debugStyles.header}>
        <Text style={debugStyles.title}>Debug Log ({debugLogs.length})</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            style={debugStyles.copyBtn}
            onPress={() => {
              const text = debugLogs.map((l) => `${l.ts} ${l.msg}`).join("\n");
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
            style={[debugStyles.copyBtn, { backgroundColor: theme.danger }]}
            onPress={onClear}
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
                  : entry.msg.includes("done") || entry.msg.includes("success")
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
  );
}

export default function DamageReportScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const headerScrollInset =
    FLOATING_HEADER_GAP + FLOATING_HEADER_HEIGHT + FLOATING_HEADER_GAP;
  const debugStyles = useMemo(() => makeDebugStyles(debugTheme), []);
  const params = useLocalSearchParams<{ damageReportId?: string }>();
  const { bleachers } = useAllBleachers();
  const { driver } = useDriver();

  const [viewOnlyId, setViewOnlyId] = useState<string | null>(
    params.damageReportId ?? null,
  );
  const isViewOnly = !!viewOnlyId;

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
    const toRetry = reportPhotos.filter(
      (p) =>
        (p.uploadStatus === "failed" || p.uploadStatus === "pending") &&
        p.photo_path,
    );
    if (toRetry.length === 0) return;

    setIsRetryingPhotos(true);
    try {
      const { retried, needReAdd } = await retryDamageReportPhotos(
        toRetry.map((p) => p.photo_path!),
      );

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

  if (isViewOnly) {
    return (
      <View style={styles.container}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + headerScrollInset,
              paddingBottom: 16 + insets.bottom,
            },
          ]}
        >
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

          <View style={styles.section}>
            <SeverityDisplay
              label="Seating Configuration"
              value={damageReport?.seat_damage ?? null}
              styles={styles}
              theme={theme}
            />
            <SeverityDisplay
              label="Hauling Configuration"
              value={damageReport?.haul_damage ?? null}
              styles={styles}
              theme={theme}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Damage Notes</Text>
            <Text style={styles.viewOnlyValue}>
              {damageReport?.note || "—"}
            </Text>
          </View>

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
              <ViewOnlyPhotoGrid
                photos={reportPhotos}
                styles={styles}
                theme={theme}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.metaText}>
              Created:{" "}
              {damageReport?.created_at
                ? new Date(damageReport.created_at).toLocaleString()
                : "—"}
            </Text>
            {damageReport?.resolved_at && (
              <Text style={[styles.metaText, { color: theme.success }]}>
                Resolved: {new Date(damageReport.resolved_at).toLocaleString()}
              </Text>
            )}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.submitButton, { backgroundColor: theme.accent }]}
              onPress={() => router.back()}
            >
              <Text style={styles.submitButtonText}>Done</Text>
            </TouchableOpacity>
          </View>

          {DEBUG_PHOTO_UPLOAD && debugLogs.length > 0 && (
            <DebugLogPanel
              debugLogs={debugLogs}
              debugStyles={debugStyles}
              theme={debugTheme}
              onClear={() => setDebugLogs([])}
            />
          )}

          {DEBUG_PHOTO_UPLOAD && trackedAttachmentIds.length > 0 && (
            <DebugUploadTracker attachmentIds={trackedAttachmentIds} />
          )}
        </ScrollView>

        <DamageReportHeader
          onBack={() => router.back()}
          styles={styles}
          theme={theme}
          insets={insets}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + headerScrollInset,
            paddingBottom: 16 + insets.bottom,
          },
        ]}
      >
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

        {DEBUG_PHOTO_UPLOAD && debugLogs.length > 0 && (
          <DebugLogPanel
            debugLogs={debugLogs}
            debugStyles={debugStyles}
            theme={debugTheme}
            onClear={() => setDebugLogs([])}
          />
        )}

        {DEBUG_PHOTO_UPLOAD && (
          <DebugUploadTracker attachmentIds={trackedAttachmentIds} />
        )}
      </ScrollView>

      <DamageReportHeader
        onBack={() => router.back()}
        styles={styles}
        theme={theme}
        insets={insets}
      />

      <SubmitProgressModal
        visible={isSubmitting}
        current={prepProgress.current}
        total={prepProgress.total}
        onAbort={handleAbort}
      />
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    headerOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
      backgroundColor: "transparent",
      zIndex: 10,
    },
    floatingHeader: {
      flexDirection: "row",
      alignItems: "center",
      height: FLOATING_HEADER_HEIGHT,
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      paddingHorizontal: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      ...elevation(theme, "floating"),
    },
    backButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
    },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      ...typeScale.body,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    headerSide: { width: 40 },
    scrollContent: { padding: 16 },
    section: {
      backgroundColor: theme.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 16,
    },
    sectionTitle: {
      ...typeScale.title3,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    requiredBadge: {
      backgroundColor: theme.danger,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 4,
      alignSelf: "flex-start",
      marginTop: 6,
    },
    requiredText: {
      ...typeScale.caption2,
      fontWeight: "700",
      color: theme.onAccent,
      letterSpacing: 0.5,
    },
    photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    photoContainer: { position: "relative", width: 100, height: 100 },
    photo: { width: "100%", height: "100%", borderRadius: 8 },
    photoPlaceholder: {
      backgroundColor: theme.surfaceElevated,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyPhotosText: {
      color: theme.textSecondary,
      ...typeScale.subhead,
      fontStyle: "italic",
    },
    buttonContainer: {
      flexDirection: "row",
      gap: 12,
      marginTop: 24,
      marginBottom: 32,
    },
    cancelButton: {
      flex: 1,
      backgroundColor: theme.surfaceElevated,
      padding: 16,
      borderRadius: 8,
      alignItems: "center",
    },
    cancelButtonText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    submitButton: {
      flex: 2,
      backgroundColor: theme.success,
      padding: 16,
      borderRadius: 8,
      alignItems: "center",
    },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.onSecondaryAccent,
    },
    viewOnlyValue: {
      ...typeScale.callout,
      color: theme.textSecondary,
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
      ...typeScale.subhead,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    severityBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
    },
    severityBadgeText: {
      ...typeScale.footnote,
      fontWeight: "700",
    },
    metaText: {
      ...typeScale.footnote,
      color: theme.textSecondary,
      marginBottom: 4,
    },
  });
}

function makeDebugStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: {
      backgroundColor: theme.surface,
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
      backgroundColor: theme.surfaceElevated,
    },
    title: {
      color: theme.success,
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
    logScroll: { maxHeight: 300, padding: 10 },
    logLine: { marginBottom: 2 },
    logTs: {
      color: theme.textTertiary,
      ...typeScale.caption2,
      fontFamily: "Courier",
    },
    logMsg: {
      color: theme.textSecondary,
      ...typeScale.caption2,
      fontFamily: "Courier",
    },
    logError: {
      color: theme.danger,
      ...typeScale.caption2,
      fontFamily: "Courier",
      fontWeight: "700",
    },
    logSuccess: {
      color: theme.success,
      ...typeScale.caption2,
      fontFamily: "Courier",
      fontWeight: "700",
    },
  });
}
