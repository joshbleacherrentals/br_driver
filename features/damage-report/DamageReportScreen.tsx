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
import { useDriverScope } from "@/hooks/useDriverScope";
import { usePhotoRepair, type RepairablePhoto } from "@/hooks/usePhotoRepair";
import { PhotoRepairBanner } from "@/components/widgets/PhotoRepairBanner";
import PhotoUploadStatusOverlay from "@/components/widgets/PhotoUploadStatusOverlay";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";

import { useUserDisplayName } from "@/hooks/db/useCurrentUser";
import { FixedMarkControl } from "@/features/damage-report/components/FixedMarkControl";
import {
  markDamageReportFixed,
  unmarkDamageReportFixed,
} from "@/features/damage-report/utils/setDamageReportFixed";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Alert,
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
import { ReportUnavailable } from "./components/ReportUnavailable";
import { useReportPhotoPreviews } from "./hooks/useReportPhotoPreviews";
import { SubmitProgressBanner } from "./components/SubmitProgressBanner";
import { createDamageReport } from "./utils/createDamageReport";
import type { PhotoPrepProgress } from "./utils/prepareDamageReportPhotos";
import {
  describeAllPhotosFailed,
  describePartialPhotoFailure,
} from "./utils/describePhotoPrepFailures";
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
  const previews = useReportPhotoPreviews(photos);

  /**
   * Full-size URIs are resolved when the viewer is opened, not up front.
   *
   * This used to be an effect keyed on the `photos` array's identity, running
   * `Promise.all` of a `getInfoAsync` per photo — and that identity changes on
   * every write the upload queue makes to any row on this report, which is
   * several per photo. So the screen re-statted every file over and over, to
   * fill a viewer the driver had not opened, and held the result the whole
   * time. Nobody needs a full-size URI until there is something to show it in.
   */
  const openViewerAt = useCallback(
    async (index: number) => {
      const items: ImageViewerItem[] = await Promise.all(
        photos.map(async (photo) => ({
          id: photo.id,
          uri: photo.photo_path ? await resolvePhotoUri(photo.photo_path) : "",
          thumbnail: previews[photo.id]?.thumbnail,
          storagePath: photo.photo_path ?? undefined,
        })),
      );
      setFullSizeItems(items);
      setViewerIndex(index);
    },
    [photos, previews],
  );

  if (photos.length === 0) {
    return (
      <Text style={styles.emptyPhotosText}>No photos attached</Text>
    );
  }

  return (
    <>
      <View style={styles.photoGrid}>
        {photos.map((photo, index) => {
          const previewUri = previews[photo.id]?.uri;
          return (
            <TouchableOpacity
              key={photo.id}
              style={styles.photoContainer}
              activeOpacity={0.7}
              onPress={() => void openViewerAt(index)}
            >
              {previewUri ? (
                <Image
                  source={previewUri}
                  style={styles.photo}
                  contentFit="cover"
                  recyclingKey={photo.id}
                  cachePolicy="memory-disk"
                />
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
  const params = useLocalSearchParams<{
    damageReportId?: string;
    /** Prefilled when the driver came from a bleacher-filtered list. */
    bleacherUuid?: string;
  }>();
  const { bleachers } = useAllBleachers();
  // §15 — the signed-in driver's scope. Needed twice here: to attribute a new
  // report, and (inside the hooks below) to scope what this screen may read.
  const scope = useDriverScope();

  const [viewOnlyId, setViewOnlyId] = useState<string | null>(
    params.damageReportId ?? null,
  );
  const isViewOnly = !!viewOnlyId;

  const { damageReport, isLoading: isReportLoading } =
    useDamageReportById(viewOnlyId);
  const {
    photos: reportPhotos,
    hasPending: photosPending,
    hasFailed: photosFailed,
  } = useDamageReportPhotos(viewOnlyId);
  const [isRetryingPhotos, setIsRetryingPhotos] = useState(false);

  // Editing a resolved report's photos is not allowed: it is closed evidence,
  // and the queue's job there is only to finish delivering what is already on
  // it. Retry stays available; replacement does not.
  const isReportEditable = !damageReport?.resolved_at;

  // ── "Fixed by driver" ─────────────────────────────────────────────────────
  // A claim that the damage is gone, not a resolve: the report stays open, on
  // every phone, until a manager closes it on the web. Offered while the report
  // is still open, and to any driver who can see it — whoever was on site is
  // the one who fixed it (§15 cross-driver write, see `setDamageReportFixed`).
  const isFixedByDriver = damageReport?.fixed_by_driver === 1;
  const fixedByName = useUserDisplayName(damageReport?.fixed_by_user_uuid);
  const fixedByLabel =
    damageReport?.fixed_by_user_uuid && scope
      ? damageReport.fixed_by_user_uuid === scope.userUuid
        ? "you"
        : fixedByName
      : fixedByName;

  const handleMarkFixed = useCallback(async () => {
    if (!viewOnlyId || !scope) return;
    try {
      await markDamageReportFixed(viewOnlyId, scope);
    } catch (error) {
      console.error("[DamageReport] mark fixed failed:", error);
      Alert.alert("Error", "Could not mark this report as fixed.");
    }
  }, [viewOnlyId, scope]);

  const handleUnmarkFixed = useCallback(async () => {
    if (!viewOnlyId) return;
    try {
      await unmarkDamageReportFixed(viewOnlyId);
    } catch (error) {
      console.error("[DamageReport] unmark fixed failed:", error);
      Alert.alert("Error", "Could not remove the fixed mark.");
    }
  }, [viewOnlyId]);

  const repairablePhotos: RepairablePhoto[] = useMemo(
    () =>
      reportPhotos.map((photo) => ({
        id: photo.id,
        uploadStatus: photo.upload_status,
        lastError: photo.last_error,
        createdAt: photo.created_at,
        bucketPath: photo.photo_path,
      })),
    [reportPhotos],
  );

  const photoRepair = usePhotoRepair({
    // §15 — derived from the row the *scoped* read actually returned, never
    // from the route param. A foreign or unknown id leaves `damageReport` null,
    // and with it there is no parent for Retry/Replace to write through.
    parent: damageReport
      ? { table: "DamageReportPhotos", damageReportUuid: damageReport.id }
      : null,
    photos: repairablePhotos,
    editable: isReportEditable,
    subject: "report",
  });

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

  // Seeded from the route: arriving from a bleacher-filtered list, the driver
  // has already answered "which bleacher" once, and asking again is a chance to
  // file the report against the wrong one.
  const [selectedBleacher, setSelectedBleacher] = useState<string | null>(
    params.bleacherUuid ?? null,
  );
  const [details, setDetails] =
    useState<DamageDetailsFormValues>(INITIAL_DETAILS);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [prepProgress, setPrepProgress] = useState<PhotoPrepProgress>({
    attempted: 0,
    saved: 0,
    total: 0,
  });
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

  // The upload phase is no longer this screen's to report. Once photos are
  // queued their progress belongs to every screen, and
  // `components/widgets/PhotoUploadStatusOverlay.tsx` floats over all of them
  // (including this one) counting exactly the rows the queue is working on. The
  // banner below now covers only the local save that happens *before* anything
  // is queued, which is the one part no reactive query can see.

  // §15 — no scope, no attribution, no submit. `createDamageReport` requires a
  // `DriverScope`, so this is enforced by the type too; the flag is what stops
  // the button being tappable in the seconds before the scope resolves.
  const canSubmit =
    !!scope &&
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
        toRetry.map((p) => ({ id: p.id, bucketPath: p.photo_path })),
      );

      // "Re-add" is only actionable once the bucket has confirmed the photo is
      // genuinely absent — until then the repair banner deliberately stays shut,
      // so the copy points at waiting rather than at an unavailable button.
      if (needReAdd > 0 && retried === 0) {
        Alert.alert(
          "Photos missing on this device",
          "The original files are no longer on this phone, so upload cannot be retried automatically. Once we confirm they never reached the server, you'll be able to replace them here.",
        );
      } else if (needReAdd > 0) {
        Alert.alert(
          "Partial retry",
          `${retried} photo(s) re-queued. ${needReAdd} photo(s) are no longer on this device and will need replacing.`,
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
    if (!scope) {
      Alert.alert(
        "Just a moment",
        "Your driver profile is still loading. Please try again in a moment.",
      );
      return;
    }
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
        scope,
        shouldAbort: () => abortRef.current,
        onPhotoProgress: setPrepProgress,
      });

      if (!result.ok) {
        setIsSubmitting(false);

        if (result.reason === "aborted") {
          // Nothing was written — the photo files are prepared before any row
          // exists — so there is nothing to clean up and nothing to explain.
          dlog("SUBMIT: user cancelled before any row was written");
          return;
        }

        // A damage report may never exist without photos, so this blocks the
        // submission outright rather than creating an empty report and
        // apologising afterwards. The form keeps everything the driver typed.
        dlog(
          `SUBMIT: blocked — no photo could be saved (${result.failures.length} failed)`,
        );
        const { title, message } = describeAllPhotosFailed(result.failures);
        Alert.alert(title, message);
        return;
      }

      dlog(
        `SUBMIT: done saved=${result.savedPhotoCount} id=${result.damageId.slice(0, 8)}`,
      );

      // Partial save — the report exists and its saved photos are already
      // queued, so this is told, not undone (§2).
      if (result.failures.length > 0) {
        const { title, message } = describePartialPhotoFailure(
          result.savedPhotoCount,
          result.failures,
        );
        Alert.alert(title, message);
      }
      if (DEBUG_PHOTO_UPLOAD) {
        setTrackedAttachmentIds([result.damageId]);
      }

      dlog("SUBMIT: success! Navigating to view-only...");
      setIsSubmitting(false);
      // The photos are queued now, so the floating overlay picks the story up
      // from here — on this screen and on every other one.
      setViewOnlyId(result.damageId);
    } catch (error) {
      dlog(`SUBMIT: FATAL ERROR - ${String(error).slice(0, 200)}`);
      Alert.alert("Error", "Failed to submit damage report. Please try again.");
      setIsSubmitting(false);
    }
  };

  // Rendered by both branches below: the screen flips to view-only the moment
  // the report is saved, and a save still in progress must survive that flip.
  //
  // It sits at the top of the scroll content rather than over the screen: it is
  // progress information, and nothing about it needs the driver to wait. That
  // is the whole point of it no longer being a modal.
  const progressBanner = (
    <SubmitProgressBanner
      visible={isSubmitting}
      current={prepProgress.saved}
      total={prepProgress.total}
      failedCount={prepProgress.attempted - prepProgress.saved}
      onAbort={handleAbort}
    />
  );

  // §15 — a route param that resolves to no readable report (unknown id, or
  // another driver's, which the scoped read refuses) gets its own state rather
  // than the normal view-only screen with every field showing "—". Restricted to
  // the route-param path on purpose: a report this screen just created is also
  // momentarily absent from the reactive query, and that is not the same thing.
  const openedFromRoute =
    !!params.damageReportId && viewOnlyId === params.damageReportId;
  const reportUnavailable =
    isViewOnly && openedFromRoute && !isReportLoading && !damageReport;

  if (reportUnavailable) {
    return <ReportUnavailable onBack={() => router.back()} />;
  }

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
          {progressBanner}

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
              {/* Once the bucket has confirmed photos are genuinely gone, that
                  supersedes the "still uploading / tap retry" message — the
                  repair banner is the only one that can actually fix it. */}
              {photoRepair.replaceableCount > 0 ? (
                <PhotoRepairBanner
                  repair={photoRepair}
                  subject="report"
                  editable={isReportEditable}
                />
              ) : (
                <PhotoUploadStatusBanner
                  hasPending={photosPending}
                  hasFailed={photosFailed}
                  isRetrying={isRetryingPhotos}
                  onRetry={handleRetryFailedPhotos}
                />
              )}
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

          <View style={styles.section}>
            {/* A resolved report is closed history — there is nothing left for
                a driver to claim about it. */}
            {isReportEditable && (
              <FixedMarkControl
                isFixed={isFixedByDriver}
                fixedAt={damageReport?.fixed_at ?? null}
                fixedByLabel={fixedByLabel}
                onMark={handleMarkFixed}
                onUnmark={handleUnmarkFixed}
                disabled={!scope}
              />
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

        <PhotoUploadStatusOverlay />
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
        {progressBanner}

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

      <PhotoUploadStatusOverlay />
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
