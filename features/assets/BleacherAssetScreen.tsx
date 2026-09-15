/**
 * One bleacher, read-only.
 *
 * A standalone stack screen with the damage report's and the backlog ticket's
 * floating header, for the same reason those two are: the swipe-back gesture
 * of a card screen is the affordance a driver already has, and this screen is
 * pure reading — there is nothing here to lose by swiping out of it, so the
 * gesture is left on unconditionally rather than guarded the way the ticket
 * editor's is.
 *
 * Read-only is the point, not an omission. Bleacher records are the office's
 * to maintain; the driver's edit path is a damage report, which is its own
 * screen. Nothing on this page writes.
 */

import { ThemeColors, elevation, radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { useThemedStyles } from "@/hooks/useThemedStyles";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useMemo } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AnnualInspectionCard from "./components/AnnualInspectionCard";
import AssetDocumentRow from "./components/AssetDocumentRow";
import AssetSpecSection, {
  type AssetSpec,
} from "./components/AssetSpecSection";
import { useAssetDetail } from "./hooks/useAssetDetail";
import { annualInspectionStatus } from "./utils/annualInspectionStatus";
import {
  formatDistance,
  formatGvwr,
  formatLength,
  formatValue,
} from "./utils/assetFields";
import {
  ANNUAL_INSPECTION_BUCKET,
  NVIS_BUCKET,
  assetDocumentUrl,
} from "./utils/assetDocuments";

/** Matches the backlog ticket's floating header, so the two screens agree. */
const FLOATING_HEADER_HEIGHT = 52;
const FLOATING_HEADER_GAP = 12;

export default function BleacherAssetScreen() {
  const { theme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const { bleacherId } = useLocalSearchParams<{ bleacherId?: string }>();
  const { asset, totalDistanceMeters, inspectionDocumentPath } = useAssetDetail(
    bleacherId ?? null,
  );

  const close = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/(drawer)/(tabs)/assets");
  }, [router]);

  const identity = useMemo<AssetSpec[]>(
    () =>
      asset
        ? [
            {
              label: "Bleacher Number",
              value: formatValue(asset.bleacherNumber),
              emphasis: true,
            },
            { label: "Seats", value: formatValue(asset.seats) },
            { label: "Rows", value: formatValue(asset.rows) },
            { label: "Bleacher Type", value: formatValue(asset.typeName) },
            {
              label: "Opening Direction",
              value: formatValue(asset.openingDirection),
            },
          ]
        : [],
    [asset],
  );

  const location = useMemo<AssetSpec[]>(
    () =>
      asset
        ? [
            {
              label: "Storage Location",
              value: formatValue(asset.storageLocationName),
            },
            { label: "Zone", value: formatValue(asset.zoneName) },
            {
              label: "Total Distance",
              value: formatDistance(totalDistanceMeters),
            },
          ]
        : [],
    [asset, totalDistanceMeters],
  );

  const trailer = useMemo<AssetSpec[]>(
    () =>
      asset
        ? [
            { label: "Manufacturer", value: formatValue(asset.manufacturer) },
            { label: "VIN Number", value: formatValue(asset.vinNumber) },
            { label: "Tag Number", value: formatValue(asset.tagNumber) },
            { label: "Hitch Type", value: formatValue(asset.hitchType) },
            {
              label: "Trailer Height",
              value: formatLength(asset.trailerHeightInches),
            },
            {
              label: "Trailer Length",
              value: formatLength(asset.trailerLengthInches),
            },
            { label: "GVWR", value: formatGvwr(asset.gvwrPounds) },
          ]
        : [],
    [asset],
  );

  const inspection = useMemo(
    () => annualInspectionStatus(asset?.annualInspection ?? null),
    [asset],
  );

  const headerTitle = asset?.bleacherNumber
    ? `Bleacher ${asset.bleacherNumber}`
    : "Bleacher";

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop:
              insets.top + FLOATING_HEADER_HEIGHT + FLOATING_HEADER_GAP * 2,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {!asset ? (
          <Text style={styles.missing}>
            This bleacher is not on this device.
          </Text>
        ) : (
          <>
            <AssetSpecSection title="Bleacher" specs={identity} />
            <AssetSpecSection title="Where it lives" specs={location} />
            <AssetSpecSection title="Trailer" specs={trailer} />

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Annual inspection</Text>
              <AnnualInspectionCard status={inspection} />
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Documents</Text>
              <AssetDocumentRow
                label="NVIS"
                url={assetDocumentUrl(NVIS_BUCKET, asset.nvisPdfPath)}
              />
              <AssetDocumentRow
                label="Annual inspection certificate"
                url={assetDocumentUrl(
                  ANNUAL_INSPECTION_BUCKET,
                  inspectionDocumentPath,
                )}
              />
            </View>

            <Text style={styles.readOnlyNote}>
              Bleacher records are maintained by the office. To report a problem
              with this bleacher, file a damage report.
            </Text>
          </>
        )}
      </ScrollView>

      {/* Floating header, over the content — the damage report's language. */}
      <View
        style={[
          styles.headerOverlay,
          { paddingTop: insets.top + FLOATING_HEADER_GAP },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.floatingHeader}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={close}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="chevron-back" size={22} color={theme.accent} />
          </TouchableOpacity>

          <Text style={styles.headerTitle} numberOfLines={1}>
            {headerTitle}
          </Text>

          <View style={styles.headerSide} />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (theme: ThemeColors) =>
  StyleSheet.create({
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
    headerButton: {
      width: 40,
      height: 40,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: radius.control,
    },
    headerSide: { width: 40 },
    headerTitle: {
      flex: 1,
      textAlign: "center",
      ...typeScale.body,
      fontWeight: "600",
      color: theme.textPrimary,
    },
    scrollContent: { paddingHorizontal: 16, gap: 20 },
    section: { gap: 8 },
    sectionTitle: {
      ...typeScale.caption2,
      fontWeight: "700",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      color: theme.textTertiary,
      paddingHorizontal: 4,
    },
    readOnlyNote: {
      ...typeScale.footnote,
      color: theme.textTertiary,
      textAlign: "center",
      paddingHorizontal: 12,
    },
    missing: {
      ...typeScale.subhead,
      color: theme.textTertiary,
      textAlign: "center",
      marginTop: 40,
    },
  });
