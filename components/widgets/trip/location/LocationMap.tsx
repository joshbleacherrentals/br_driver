/**
 * The trailer's pin — Apple Maps on iOS, Google Maps on Android.
 *
 * Each 30-second refresh moves the marker and glides the camera to it. Without
 * coordinates, or on an Android build made without a Google Maps key (the
 * Google SDK crashes the app when a map mounts without one), it shows a
 * placeholder instead; "Open in Maps" below still works either way.
 */

import { radius, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";

/** Roughly the web embed's zoom 15 — a few streets around the trailer. */
const DELTA = 0.01;

const MAP_UNAVAILABLE =
  Platform.OS === "android" && !process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY;

type LocationMapProps = {
  lat?: number;
  lng?: number;
  title?: string;
};

function regionFor(lat: number, lng: number): Region {
  return {
    latitude: lat,
    longitude: lng,
    latitudeDelta: DELTA,
    longitudeDelta: DELTA,
  };
}

function Placeholder({ text }: { text: string }) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.frame,
        styles.placeholder,
        { backgroundColor: theme.surfaceElevated, borderColor: theme.border },
      ]}
    >
      <Ionicons name="location-outline" size={28} color={theme.textTertiary} />
      <Text style={[styles.placeholderText, { color: theme.textTertiary }]}>
        {text}
      </Text>
    </View>
  );
}

export default function LocationMap({ lat, lng, title }: LocationMapProps) {
  const { theme, scheme } = useTheme();
  const mapRef = useRef<MapView>(null);
  const hasPoint = lat !== undefined && lng !== undefined;

  useEffect(() => {
    if (lat === undefined || lng === undefined) return;
    mapRef.current?.animateToRegion(regionFor(lat, lng), 600);
  }, [lat, lng]);

  if (!hasPoint) return <Placeholder text="Location data unavailable" />;
  if (MAP_UNAVAILABLE)
    return <Placeholder text="Map unavailable in this build" />;

  return (
    <View style={[styles.frame, { borderColor: theme.border }]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={regionFor(lat, lng)}
        userInterfaceStyle={scheme}
        toolbarEnabled={false}
        accessibilityLabel={`Map showing the bleacher at ${lat}, ${lng}`}
      >
        <Marker coordinate={{ latitude: lat, longitude: lng }} title={title} />
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 280,
    borderRadius: radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  placeholder: { alignItems: "center", justifyContent: "center", gap: 8 },
  placeholderText: { ...typeScale.subhead },
});
