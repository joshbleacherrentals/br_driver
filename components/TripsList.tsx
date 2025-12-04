import { EnrichedWorkTracker } from "@/db/workTrackers";
import { formatDateWithOrdinal } from "@/utils/dateUtils";
import React from "react";
import { FlatList, Text, View } from "react-native";
import TripsListItem from "./TripListItem";

interface TripsListProps {
  trips: EnrichedWorkTracker[];
  isLoading?: boolean;
  emptyMessage?: string;
  onTripStart?: (workTrackerId: number) => void;
}

export default function TripsList({ trips, isLoading, emptyMessage, onTripStart }: TripsListProps) {
  const renderItem = ({ item }: { item: EnrichedWorkTracker }) => {
    const pickupAddr = item.pickup_address
      ? `${item.pickup_address.street}, ${item.pickup_address.city}, ${
          item.pickup_address.state_province
        }${item.pickup_address.zip_postal ? " " + item.pickup_address.zip_postal : ""}`
      : undefined;
    const dropoffAddr = item.dropoff_address
      ? `${item.dropoff_address.street}, ${item.dropoff_address.city}, ${
          item.dropoff_address.state_province
        }${item.dropoff_address.zip_postal ? " " + item.dropoff_address.zip_postal : ""}`
      : undefined;
    const payStr =
      typeof item.pay_cents === "number" ? `$${(item.pay_cents / 100).toFixed(2)}` : "";
    const bleacherStr = item.bleacher?.bleacher_number ? `#${item.bleacher.bleacher_number}` : "";
    const headerTitle = [payStr, bleacherStr].filter(Boolean).join(" · ");
    const headerSubtitle = formatDateWithOrdinal(item.date);

    return (
      <TripsListItem
        workTrackerId={item.work_tracker_id}
        status={item.status || "released"}
        date={item.date || ""}
        headerTitle={headerTitle}
        headerSubtitle={headerSubtitle}
        pickupAddress={pickupAddr}
        pickupTime={item.pickup_time || ""}
        pickupPoc={item.pickup_poc || ""}
        dropoffAddress={dropoffAddr}
        dropoffTime={item.dropoff_time || ""}
        dropoffPoc={item.dropoff_poc || ""}
        notes={item.notes || null}
        onTripStart={() => onTripStart?.(item.work_tracker_id)}
      />
    );
  };

  return (
    <FlatList
      contentContainerStyle={{ paddingBottom: 50 }}
      data={trips}
      keyExtractor={(item) => String(item.work_tracker_id)}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
      ListEmptyComponent={() => (
        <View style={{ padding: 16 }}>
          <Text style={{ color: "#666" }}>
            {isLoading ? "Loading…" : emptyMessage || "No trips yet."}
          </Text>
        </View>
      )}
    />
  );
}
