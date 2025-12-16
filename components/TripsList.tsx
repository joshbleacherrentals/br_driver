import { enrichedWorkTrackers$ as _enrichedWorkTrackers$ } from "@/state/computes/enrichedWorkTrackers";
import { EnrichedWorkTracker } from "@/types/workTracker";
import { formatDateWithOrdinal } from "@/utils/dateUtils";
import { observer } from "@legendapp/state/react";
import React from "react";
import { FlatList, Text, View } from "react-native";
import TripsListItem from "./TripListItem";

export const TripsList = observer(
  ({ enrichedWorkTrackers$ }: { enrichedWorkTrackers$: typeof _enrichedWorkTrackers$ }) => {
    const enrichedWorkTrackers = enrichedWorkTrackers$.get();

    // Helper to format address, handling empty fields
    const formatAddress = (address: EnrichedWorkTracker["pickup_address"]) => {
      if (!address) return undefined;
      const parts = [
        address.street,
        address.city,
        address.state_province,
        address.zip_postal,
      ].filter((p) => p && p.trim() !== "");
      return parts.length > 0 ? parts.join(", ") : undefined;
    };

    const renderItem = ({ item }: { item: EnrichedWorkTracker }) => {
      const pickupAddr = formatAddress(item.pickup_address);
      const dropoffAddr = formatAddress(item.dropoff_address);
      const payStr =
        typeof item.pay_cents === "number" ? `$${(item.pay_cents / 100).toFixed(2)}` : "";
      const bleacherStr = item.bleacher?.bleacher_number ? `#${item.bleacher.bleacher_number}` : "";
      const headerTitle = [payStr, bleacherStr].filter(Boolean).join(" · ");
      const headerSubtitle = formatDateWithOrdinal(item.date);

      return (
        <TripsListItem
          legendStateUuid={item.legend_state_uuid || ""}
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
          onTripStart={() => {}}
        />
      );
    };

    // Sort by created_at (deleted items already filtered in enrichedWorkTrackers$)
    const enrichedWorkTrackersList = (
      Object.values(enrichedWorkTrackers) as EnrichedWorkTracker[]
    ).sort((a, b) => {
      if (!a.created_at || !b.created_at) return 0;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return (
      <FlatList
        contentContainerStyle={{ paddingBottom: 50 }}
        data={enrichedWorkTrackersList}
        keyExtractor={(item) => String(item.work_tracker_id)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#666" }}>{"No trips yet."}</Text>
          </View>
        )}
      />
    );
  }
);
