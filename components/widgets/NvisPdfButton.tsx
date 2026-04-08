import { useNvisDocument } from "@/hooks/db/useBleacher";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Sharing from "expo-sharing";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity
} from "react-native";

interface NvisPdfButtonProps {
  nvisPdfPath: string | null;
  bleacherNumber?: string | null;
}

async function openPdf(localUri: string) {
  try {
    if (Platform.OS === "ios") {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert("Error", "Sharing is not available on this device.");
        return;
      }
      await Sharing.shareAsync(localUri, {
        mimeType: "application/pdf",
        UTI: "com.adobe.pdf",
      });
    } else {
      const contentUri = await FileSystem.getContentUriAsync(localUri);
      await IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: 1,
        type: "application/pdf",
      });
    }
  } catch {
    Alert.alert(
      "Error",
      "Could not open the PDF. Make sure a PDF viewer is installed."
    );
  }
}

export default function NvisPdfButton({ nvisPdfPath }: NvisPdfButtonProps) {
  const { isLoading, isCached, isWaitingForWifi, localUri, state, downloadManually } =
    useNvisDocument(nvisPdfPath);

  if (!nvisPdfPath) return null;

  const handlePress = async () => {
    if (isCached && localUri) {
      openPdf(localUri);
      return;
    }
    if (isWaitingForWifi) {
      downloadManually();
      return;
    }
    if (isLoading) {
      Alert.alert("Downloading…", "Please wait a moment.");
      return;
    }
    if (state.status === "error") {
      Alert.alert("Error", "Failed to load NVIS PDF. Try reopening this screen.");
    }
  };

  const iconColor = isCached ? "#34C759" : isWaitingForWifi ? "#FF9500" : "#1D62A3";
  const labelColor = isCached ? "#34C759" : isWaitingForWifi ? "#FF9500" : "#1D62A3";
  const label = isLoading ? "…" : isWaitingForWifi ? "Tap to download" : "NVIS";

  return (
    <TouchableOpacity
      style={[styles.button, isWaitingForWifi && styles.buttonCellular]}
      onPress={handlePress}
      activeOpacity={0.7}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color="#1D62A3" style={{ width: 16, height: 16 }} />
      ) : (
        <Ionicons
          name={isWaitingForWifi ? "cellular-outline" : "document-text-outline"}
          size={15}
          color={iconColor}
        />
      )}
      <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
    </TouchableOpacity>
  );
}


const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#EBF3FD",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#BDD6F0",
    marginTop: 4,
    alignSelf: "flex-start",
  },
  buttonCellular: { borderColor: "#FFD19A", backgroundColor: "#FFF5E6" },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D62A3",
    letterSpacing: 0.3,
  },
  labelCached: {
    color: "#34C759",
  },
  errorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#FF3B30",
    marginLeft: 2,
  },
});