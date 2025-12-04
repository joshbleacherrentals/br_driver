import { Alert, Linking, Platform } from "react-native";

/**
 * Open an address in available map apps
 */
export async function openInMaps(address: string): Promise<void> {
  if (!address) return;

  const q = encodeURIComponent(address);

  // Build URLs for different apps/platforms
  const appleUrl = `http://maps.apple.com/?q=${q}`;
  const googleUrlIOS = `comgooglemaps://?q=${q}`;
  const googleUrlWeb = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const wazeUrl = `waze://?q=${q}&navigate=yes`;
  const androidGeo = `geo:0,0?q=${q}`;

  // Determine available options
  const options: { label: string; url: string }[] = [];

  if (Platform.OS === "ios") {
    options.push({ label: "Apple Maps", url: appleUrl });
    if (await Linking.canOpenURL(googleUrlIOS)) {
      options.push({ label: "Google Maps", url: googleUrlIOS });
    }
    if (await Linking.canOpenURL(wazeUrl)) {
      options.push({ label: "Waze", url: wazeUrl });
    }
    // Web fallback
    if (!options.find((o) => o.label === "Google Maps")) {
      options.push({ label: "Google Maps", url: googleUrlWeb });
    }
  } else {
    // Android
    if (await Linking.canOpenURL(androidGeo)) {
      options.push({ label: "Maps", url: androidGeo });
    }
    options.push({ label: "Google Maps", url: googleUrlWeb });
    if (await Linking.canOpenURL(wazeUrl)) {
      options.push({ label: "Waze", url: wazeUrl });
    }
  }

  if (options.length === 0) {
    Linking.openURL(googleUrlWeb);
    return;
  }

  Alert.alert("Open in Maps", address, [
    ...options.map((o) => ({ text: o.label, onPress: () => Linking.openURL(o.url) })),
    { text: "Cancel", style: "cancel" },
  ]);
}
