/**
 * Somebody else's damage report, read-only.
 *
 * Spec: docs/specs/damage-report-dedupe.md
 *
 * Reached from the "select all that apply" checklist — a driver looking before
 * they tick — and from the trips screen, where the question is "what is wrong
 * with the bleacher I am about to haul".
 *
 * Deliberately NOT `DamageReportScreen` with a flag. That screen owns the
 * driver's own report: it edits, it re-picks photos, and it drives
 * `usePhotoRepair`'s Retry/Replace, all of which are operations on the
 * *evidence*. None of them may be offered on a record another driver filed, and
 * a shared screen with a `readOnly` prop is how that rule survives exactly
 * until someone adds the next feature.
 *
 * What it does keep is the `Fixed` mark, because that is a claim about the
 * bleacher in front of you rather than about the record: whoever was on site
 * and fixed the damage may say so, whoever filed the report.
 *
 * Offline: the base64 thumbnails sync with the photo rows, so the grid renders
 * with no connection. Full-size files of another driver's report live only in
 * the bucket — the viewer says so rather than showing a blank frame.
 */

import DamageBadge from "@/components/widgets/FixedBadge";
import { radius, typeScale } from "@/constants/theme";
import type { ThemeColors } from "@/constants/theme";
import { FixedMarkControl } from "@/features/damage-report/components/FixedMarkControl";
import { ImageViewer, type ImageViewerItem } from "@/features/damage-report/components/ImageViewer";
import {
  markDamageReportFixed,
  unmarkDamageReportFixed,
} from "@/features/damage-report/utils/setDamageReportFixed";
import { useBleacher } from "@/hooks/db/useBleacher";
import { useUserDisplayName } from "@/hooks/db/useCurrentUser";
import {
  useAnyDamageReportById,
  useDamageReportPhotoPaths,
  useDamageReportThumbnails,
} from "@/hooks/db/useDamageReport";
import { useAckCounts } from "@/hooks/db/useDamageReportAcknowledgements";
import { useDriverScope } from "@/hooks/useDriverScope";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { severityLabel, worstSeverity } from "@/utils/damageSeverity";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const BUCKET = "damage-report-photos";

function fullSizeUrl(photoPath: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${photoPath}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

export default function DamageReportViewScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const scope = useDriverScope();

  const params = useLocalSearchParams<{ damageReportId?: string }>();
  const reportId = params.damageReportId ?? null;

  // §15 — the unscoped read, because this screen exists precisely for reports
  // this driver did not file.
  const { damageReport, isLoading } = useAnyDamageReportById(reportId);
  const reportIds = useMemo(() => (reportId ? [reportId] : []), [reportId]);
  const { thumbnails } = useDamageReportThumbnails(reportIds);
  const { counts } = useAckCounts(reportIds);
  const { photoPaths } = useDamageReportPhotoPaths(reportId);
  const { bleacher } = useBleacher(damageReport?.bleacher_uuid ?? null);
  const authorName = useUserDisplayName(damageReport?.created_by_user_uuid);
  const fixedByName = useUserDisplayName(damageReport?.fixed_by_user_uuid);

  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const tiles = thumbnails[reportId ?? ""] ?? [];
  const ackCount = counts[reportId ?? ""] ?? 0;

  const viewerItems: ImageViewerItem[] = useMemo(
    () =>
      photoPaths.map((path, index) => ({
        id: `${path}-${index}`,
        uri: fullSizeUrl(path),
        // The viewer's fallback when the file cannot be fetched — which,
        // offline on another driver's report, is every time. It wants the raw
        // base64 the row carries, not the data URI the grid renders.
        thumbnail: tiles[index]?.replace(/^data:image\/jpeg;base64,/, ""),
        storagePath: path,
      })),
    [photoPaths, tiles],
  );

  const handleMarkFixed = useCallback(async () => {
    if (!reportId || !scope) return;
    try {
      await markDamageReportFixed(reportId, scope);
    } catch (error) {
      console.error("[DamageReportView] mark fixed failed:", error);
      Alert.alert("Error", "Could not mark this report as fixed.");
    }
  }, [reportId, scope]);

  const handleUnmarkFixed = useCallback(async () => {
    if (!reportId) return;
    try {
      await unmarkDamageReportFixed(reportId);
    } catch (error) {
      console.error("[DamageReportView] unmark fixed failed:", error);
      Alert.alert("Error", "Could not remove the fixed mark.");
    }
  }, [reportId]);

  if (!isLoading && !damageReport) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.title}>This damage report is not available</Text>
        <Text style={styles.meta}>
          It may have been resolved, or it has not reached this device yet.
        </Text>
        <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const severity = worstSeverity(
    damageReport?.seat_damage,
    damageReport?.haul_damage,
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={styles.headerRow}>
          <Text style={styles.title}>
            {bleacher?.bleacher_number != null
              ? `Bleacher #${bleacher.bleacher_number}`
              : "Damage report"}
          </Text>
          <DamageBadge fixedByDriver={damageReport?.fixed_by_driver} />
        </View>

        <Text style={styles.meta}>
          {formatDate(damageReport?.created_at ?? null)}
          {authorName ? ` · by ${authorName}` : ""}
        </Text>

        {ackCount > 0 && (
          <Text style={styles.meta}>
            Confirmed by {ackCount} {ackCount === 1 ? "driver" : "drivers"}
          </Text>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Severity</Text>
          <Text style={styles.value}>{severityLabel(severity)}</Text>

          <Text style={styles.label}>Seating</Text>
          <Text style={styles.value}>
            {severityLabel(damageReport?.seat_damage ?? null)}
          </Text>

          <Text style={styles.label}>Hauling</Text>
          <Text style={styles.value}>
            {severityLabel(damageReport?.haul_damage ?? null)}
          </Text>
        </View>

        {!!damageReport?.note && (
          <View style={styles.section}>
            <Text style={styles.label}>Notes</Text>
            <Text style={styles.value}>{damageReport.note}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Photos</Text>
          {tiles.length === 0 ? (
            <Text style={styles.meta}>No photos on this device</Text>
          ) : (
            <View style={styles.photoGrid}>
              {tiles.map((uri, index) => (
                <TouchableOpacity
                  key={`${reportId}-photo-${index}`}
                  activeOpacity={0.8}
                  onPress={() => setViewerIndex(index)}
                >
                  <Image
                    source={{ uri }}
                    style={styles.photo}
                    contentFit="cover"
                  />
                </TouchableOpacity>
              ))}
            </View>
          )}
          <View style={styles.hintRow}>
            <Ionicons name="cloud-offline-outline" size={14} color={theme.textSecondary} />
            <Text style={styles.hint}>
              Full-size photos need a connection.
            </Text>
          </View>
        </View>

        <FixedMarkControl
          isFixed={damageReport?.fixed_by_driver === 1}
          fixedAt={damageReport?.fixed_at ?? null}
          fixedByLabel={
            damageReport?.fixed_by_user_uuid && scope
              ? damageReport.fixed_by_user_uuid === scope.userUuid
                ? "you"
                : fixedByName
              : fixedByName
          }
          onMark={handleMarkFixed}
          onUnmark={handleUnmarkFixed}
          disabled={!scope}
        />

        <TouchableOpacity style={styles.doneButton} onPress={() => router.back()}>
          <Text style={styles.doneText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>

      <ImageViewer
        images={viewerItems}
        initialIndex={viewerIndex ?? 0}
        visible={viewerIndex !== null}
        onClose={() => setViewerIndex(null)}
        title="Damage photos"
      />
    </View>
  );
}

function makeStyles(theme: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    content: { paddingHorizontal: 16, gap: 10 },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    title: { ...typeScale.title3, fontWeight: "700", color: theme.header },
    meta: { ...typeScale.footnote, color: theme.textSecondary },
    section: {
      backgroundColor: theme.surface,
      borderRadius: radius.card,
      borderWidth: 1,
      borderColor: theme.border,
      padding: 12,
      gap: 4,
      marginTop: 6,
    },
    label: {
      ...typeScale.caption,
      color: theme.textSecondary,
      fontWeight: "600",
      marginTop: 6,
    },
    value: { ...typeScale.callout, color: theme.textPrimary },
    photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
    photo: { width: 84, height: 84, borderRadius: radius.control },
    hintRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    hint: { ...typeScale.caption, color: theme.textSecondary },
    doneButton: {
      marginTop: 14,
      padding: 16,
      borderRadius: radius.control,
      alignItems: "center",
      backgroundColor: theme.accent,
    },
    doneText: {
      ...typeScale.callout,
      fontWeight: "600",
      color: theme.onAccent,
    },
  });
}
