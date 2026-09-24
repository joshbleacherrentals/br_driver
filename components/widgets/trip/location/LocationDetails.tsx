/**
 * A tracker's reading, laid out like the web dashboard's Live Location card —
 * except "Last Updated" leads, so the driver knows how far to trust the rest:
 * freshness, name + VIN + status, the map, then the stat grid.
 */

import { monoFontFamily, typeScale } from "@/constants/theme";
import { useTheme } from "@/hooks/useTheme";
import {
  formatCoordinate,
  formatSpeed,
} from "@/utils/eventRoster/linxupDisplay";
import type { DeviceLocation } from "@/utils/eventRoster/linxupLocation";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import LocationFreshness from "./LocationFreshness";
import LocationMap from "./LocationMap";
import LocationStatCard from "./LocationStatCard";
import LocationStatusBadge from "./LocationStatusBadge";

type OkLocation = Extract<DeviceLocation, { kind: "ok" }>;

export default function LocationDetails({
  location,
}: {
  location: OkLocation;
}) {
  const { theme } = useTheme();

  return (
    <View style={styles.container}>
      <LocationFreshness updatedAtMs={location.updatedAtMs} />

      <View style={[styles.header, { borderBottomColor: theme.separator }]}>
        <View style={styles.headerText}>
          <Text
            style={[styles.name, { color: theme.textPrimary }]}
            numberOfLines={1}
          >
            {location.name ?? "GPS tracker"}
          </Text>
          {location.vin ? (
            <Text
              style={[styles.vin, { color: theme.textSecondary }]}
              selectable
              accessibilityLabel={`VIN ${location.vin}`}
            >
              {location.vin}
            </Text>
          ) : null}
        </View>
        {location.status ? (
          <LocationStatusBadge status={location.status} />
        ) : null}
      </View>

      <LocationMap
        lat={location.lat}
        lng={location.lng}
        title={location.name}
      />

      <View style={styles.grid}>
        <LocationStatCard
          label="Latitude"
          value={formatCoordinate(location.lat)}
          mono
        />
        <LocationStatCard
          label="Longitude"
          value={formatCoordinate(location.lng)}
          mono
        />
        <LocationStatCard label="Speed" value={formatSpeed(location.speed)} />
        {location.deviceId ? (
          <LocationStatCard label="Device ID" value={location.deviceId} mono />
        ) : null}
        {location.imei ? (
          <LocationStatCard label="IMEI" value={location.imei} mono />
        ) : null}
        {location.uuid ? (
          <LocationStatCard label="UUID" value={location.uuid} mono wide />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1, gap: 2 },
  name: { ...typeScale.headline, fontWeight: "700" },
  vin: { ...typeScale.footnote, fontFamily: monoFontFamily },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
