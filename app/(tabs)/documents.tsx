import BleacherDropdown, { BleacherOption } from '@/components/widgets/bleacherDropdown';
import NvisPdfButton from '@/components/widgets/NvisPdfButton';
import ProfileCompletionBanner from '@/components/widgets/onboardingBanner';
import { useAddress } from '@/hooks/db/useAddress';
import { useAllBleachers } from '@/hooks/db/useBleacher';
import { BlueBookData, useBlueBook, useBlueBookDocument } from '@/hooks/db/useBlueBook';
import { useDriver } from '@/hooks/db/useDriver';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from "expo-file-system/legacy";
import { Image } from "expo-image";
import * as IntentLauncher from "expo-intent-launcher";
import * as Network from "expo-network";
import * as Sharing from "expo-sharing";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const DARK_BLUE = "#10365A";
const MID_BLUE = "#164d82";


// ─── NVIS Lookup Card ─────────────────────────────────────────────────────────

/**
 * Shown at the bottom of the Documents list.
 * Driver picks a bleacher from the dropdown; the NVIS PDF button appears
 * and works identically to the one on trip cards.
 */
function NvisLookupCard() {
  const { bleachers } = useAllBleachers();
  const [selectedUuid, setSelectedUuid] = React.useState<string | null>(null);

  const options: BleacherOption[] = React.useMemo(
    () =>
      bleachers
        .map((b) => ({ uuid: b.id, bleacher_number: b.bleacher_number ?? '—' }))
        .sort((a, b) => parseInt(String(a.bleacher_number)) - parseInt(String(b.bleacher_number))),
    [bleachers]
  );

  const selectedBleacher = bleachers.find((b) => b.id === selectedUuid) ?? null;

  return (
    <View style={nvisStyles.card}>
      <View style={nvisStyles.headerRow}>
        <Ionicons name="document-text-outline" size={16} color="#93c5fd" />
        <Text style={nvisStyles.title}>Bleacher NVIS Lookup</Text>
      </View>
      <Text style={nvisStyles.subtitle}>
        Select a bleacher to view its NVIS PDF
      </Text>

      <View style={nvisStyles.inlineRow}>
        <View style={{ flex: 1 }}>
          <BleacherDropdown
            options={options}
            selectedUuid={selectedUuid}
            onChange={setSelectedUuid}
            placeholder="Search bleacher number…"
          />
        </View>

        {selectedBleacher?.nvis_pdf_path && (
          <NvisPdfButton
            nvisPdfPath={selectedBleacher.nvis_pdf_path}
            bleacherNumber={selectedBleacher.bleacher_number}
          />
        )}
      </View>

      {selectedBleacher && !selectedBleacher.nvis_pdf_path && (
        <Text style={nvisStyles.noPdf}>No NVIS PDF on file for this bleacher.</Text>
      )}
    </View>
  );
}

const nvisStyles = StyleSheet.create({
  card: {
    backgroundColor: MID_BLUE,
    borderRadius: 12,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1e5799',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  subtitle: { fontSize: 12, color: '#7fb3d3', marginTop: -4 },
  noPdf: { fontSize: 13, color: '#4a8fbb', fontStyle: 'italic' },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});

// ─── Per-entry row ────────────────────────────────────────────────────────────

function BlueBookEntry({ entry }: { entry: BlueBookData }) {
  const { state, isLoading, download, redownload } = useBlueBookDocument(entry.document_path);

  const hasDocument = !!entry.document_path;
  const hasLink = !!entry.link;
  const isCached = state.status === "cached" || state.status === "ready";
  const isInteractive = hasDocument || hasLink;

  // Auto-download in the background when on WiFi.
  // On cellular, the driver taps to download manually — no silent data use.
  // ensureDownloaded is cache-first so it's a no-op if already on disk.
  React.useEffect(() => {
    if (!hasDocument || state.status !== "idle") return;
    Network.getNetworkStateAsync().then(({ type }) => {
      if (type === Network.NetworkStateType.WIFI) {
        void download();
      }
    });
  }, [hasDocument, state.status]);

  const openLocalPdf = async (localUri: string) => {
    try {
      if (Platform.OS === "ios") {
        // expo-sharing opens the system share sheet which includes "Open in…" viewers
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(localUri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
        } else {
          Alert.alert("Error", "Sharing is not available on this device.");
        }
      } else {
        // Android: use IntentLauncher to open with a PDF viewer
        const contentUri = await FileSystem.getContentUriAsync(localUri);
        await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
          data: contentUri,
          flags: 1,
          type: "application/pdf",
        });
      }
    } catch {
      Alert.alert("Error", "Could not open the PDF. Make sure a PDF viewer is installed.");
    }
  };

  const handlePress = async () => {
    // PDF takes priority over link
    if (hasDocument) {
      if (isCached) {
        const localUri = (state as any).localUri as string;
        openLocalPdf(localUri);
        return;
      }
      if (isLoading) {
        Alert.alert("Downloading…", "The document is still downloading. Please try again in a moment.");
        return;
      }
      // On cellular (or if auto-download didn't fire): download on tap
      const localUri = await download();
      if (localUri) openLocalPdf(localUri);
      return;
    }

    if (hasLink) {
      const { Linking } = require("react-native");
      Linking.openURL(entry.link!).catch(() =>
        Alert.alert("Error", `Could not open link for: ${entry.name}`)
      );
    }
  };

  const handleLongPress = () => {
    if (!hasDocument) return;
    Alert.alert(
      "Refresh Document",
      "Re-download the latest version of this PDF?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Refresh", onPress: async () => {
          const localUri = await redownload();
          if (localUri) openLocalPdf(localUri);
        }},
      ]
    );
  };

  return (
    <TouchableOpacity
      style={[styles.card, !isInteractive && styles.cardDisabled]}
      onPress={handlePress}
      onLongPress={handleLongPress}
      activeOpacity={isInteractive ? 0.75 : 1}
      disabled={!isInteractive || isLoading}
    >
      <View style={styles.cardBody}>
        <Text style={[styles.cardTitle, !isInteractive && styles.cardTitleDisabled]}>
          {entry.name}
        </Text>
        {!!entry.description && (
          <Text style={styles.cardDesc} numberOfLines={2}>
            {entry.description}
          </Text>
        )}
        {!isInteractive && (
          <Text style={styles.comingSoon}>Coming soon</Text>
        )}
        {state.status === "error" && (
          <Text style={styles.errorText}>{state.message}</Text>
        )}
      </View>

      <View style={styles.cardRight}>
        {hasDocument ? (
          isLoading ? (
            <View style={styles.pdfBadge}>
              <ActivityIndicator size="small" color="#93c5fd" style={{ marginRight: 2 }} />
              <Text style={styles.pdfBadgeText}>Syncing</Text>
            </View>
          ) : (
            <View style={styles.pdfBadge}>
              {isCached && (
                <Ionicons name="checkmark-circle" size={12} color="#34C759" style={{ marginRight: 3 }} />
              )}
              <Ionicons name="document-text-outline" size={14} color={isCached ? "#34C759" : "#93c5fd"} />
              <Text style={[styles.pdfBadgeText, isCached && styles.pdfBadgeTextCached]}>
                {isCached ? "Saved" : "PDF"}
              </Text>
            </View>
          )
        ) : hasLink ? (
          <Ionicons name="chevron-forward" size={16} color="#4a6f96" />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function BlueBookScreen() {
  const logo = require('../../assets/images/adaptive-icon.png');
  const { blueBookEntries } = useBlueBook();
  const { driver } = useDriver();
  const { address } = useAddress(driver?.address_uuid ?? null);

  const country = address?.street?.split(",").pop()?.trim();
  const driverRegion: 'CAN' | 'US' | null =
    country === 'USA' ? 'US' : country === 'Canada' ? 'CAN' : null;

  const visibleEntries = blueBookEntries?.filter(e => {
    if (e.is_active === 0) return false;
    if (!driverRegion) return true;
    if (e.region === 'Both') return true;
    return e.region === driverRegion;
  }) ?? null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: DARK_BLUE }}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={logo} style={styles.logo} />
        <Text style={styles.headerTitle}>Documents</Text>
        <View style={styles.logoPlaceholder} />
      </View>

      <ProfileCompletionBanner />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Intro strip */}
        <View style={styles.introStrip}>
          <Ionicons name="book-outline" size={16} color="#93c5fd" />
          <Text style={styles.introText}>
            All your essential documents and resources in one place
          </Text>
        </View>

        <Text style={styles.hintText}>
          Tap to open · Long-press to refresh
        </Text>

        <NvisLookupCard />

        {visibleEntries && visibleEntries.length > 0 ? (
          visibleEntries.map((entry) => (
            <BlueBookEntry key={entry.id} entry={entry} />
          ))
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: { width: 45, height: 45 },
  logoPlaceholder: { width: 45, height: 45 },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#111827',
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
  },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  introStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: MID_BLUE,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  introText: { color: '#93c5fd', fontSize: 13, fontWeight: '500', flex: 1 },
  hintText: {
    fontSize: 11,
    color: '#4a6f96',
    textAlign: 'center',
    marginBottom: 14,
    fontStyle: 'italic',
  },
  card: {
    backgroundColor: MID_BLUE,
    borderRadius: 12,
    marginBottom: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e5799',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  cardDisabled: { opacity: 0.6 },
  cardBody: { flex: 1, marginRight: 8 },
  cardRight: { alignItems: 'center', justifyContent: 'center', minWidth: 48 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#FFFFFF', marginBottom: 2 },
  cardTitleDisabled: { color: '#a8c4de' },
  cardDesc: { fontSize: 12, color: '#7fb3d3', lineHeight: 17 },
  comingSoon: { fontSize: 11, color: '#4a8fbb', fontStyle: 'italic', marginTop: 2 },
  errorText: { fontSize: 11, color: '#FF6B6B', marginTop: 3 },
  pdfBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 3,
  },
  pdfBadgeText: { fontSize: 11, fontWeight: '600', color: '#93c5fd' },
  pdfBadgeTextCached: { color: '#34C759' },
  emptyText: { color: '#7fb3d3', textAlign: 'center', marginTop: 40, fontSize: 15 },
});