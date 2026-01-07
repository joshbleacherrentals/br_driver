// import TripsListItem from "@/components/TripListItem";
// import TripItem from "@/components/widgets/trip_item";
// import { EnrichedWorkTracker, fetchWorkTrackersForClerkUser } from "@/db/workTrackers";
// import { useAuth } from "@clerk/clerk-expo";
// import { useQuery } from "@tanstack/react-query";
// import { FlatList, Text, View } from "react-native";
// import { SafeAreaView } from "react-native-safe-area-context";

// export default function TripsScreen() {
//   const { getToken, isSignedIn, userId } = useAuth();

//   const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
//     queryKey: ["workTrackers", userId],
//     enabled: !!isSignedIn && !!userId,
//     queryFn: async () => {
//       const token = await getToken({ template: "supabase" });
//       return await fetchWorkTrackersForClerkUser(token ?? null, userId);
//     },
//   });

//   const workTrackers = (data?.workTrackers ?? []) as EnrichedWorkTracker[];

//   function formatDateWithOrdinal(dateISO?: string | null) {
//     if (!dateISO) return "";
//     const d = new Date(dateISO);
//     const day = d.getDate();
//     const ord = (n: number) => {
//       const s = ["th", "st", "nd", "rd"];
//       const v = n % 100;
//       return (s as any)[(v - 20) % 10] || (s as any)[v] || s[0];
//     };
//     const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
//     const month = d.toLocaleDateString(undefined, { month: "short" });
//     return `${weekday}, ${month} ${day}${ord(day)}`;
//   }

//   return (
//     <SafeAreaView style={{ flex: 1 }}>
//       <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
//         <Text style={{ fontSize: 20, fontWeight: "600" }}>Upcoming Trips</Text>
//         <View style={{ height: 8 }} />
//         <Text onPress={() => refetch()} style={{ color: "#007AFF" }}>
//           {isLoading || isRefetching ? "Refreshing…" : "Refresh"}
//         </Text>
//         {isError ? <Text style={{ color: "red" }}>{(error as Error)?.message}</Text> : null}
//       </View>

//       <FlatList
//         contentContainerStyle={{ paddingBottom: 50 }}
//         data={workTrackers}
//         keyExtractor={(item) => String(item.work_tracker_id)}
//         renderItem={({ item, index }) => {
//           // const pickupAddr = item.pickup_address
//           //   ? `${item.pickup_address.street}, ${item.pickup_address.city}, ${
//           //       item.pickup_address.state_province
//           //     }${item.pickup_address.zip_postal ? " " + item.pickup_address.zip_postal : ""}`
//           //   : undefined;
//           // const dropoffAddr = item.dropoff_address
//           //   ? `${item.dropoff_address.street}, ${item.dropoff_address.city}, ${
//           //       item.dropoff_address.state_province
//           //     }${item.dropoff_address.zip_postal ? " " + item.dropoff_address.zip_postal : ""}`
//           //   : undefined;
//           // const payStr =
//           //   typeof item.pay_cents === "number" ? `$${(item.pay_cents / 100).toFixed(2)}` : "";
//           // const bleacherStr = item.bleacher?.bleacher_number
//           //   ? `#${item.bleacher.bleacher_number}`
//           //   : "";
//           // const headerTitle = [payStr, bleacherStr].filter(Boolean).join(" · ");
//           // const headerSubtitle = formatDateWithOrdinal(item.date);
//           return (
//             //<TripsListItem
//             // headerTitle={headerTitle}
//             //   headerSubtitle={headerSubtitle}
//             //   pickupAddress={pickupAddr || "Pickup"}
//             //   pickupTime={item.pickup_time || ""}
//             //   pickupPoc={item.pickup_poc || ""}
//             //   dropoffAddress={dropoffAddr || "Drop-off"}
//             //   dropoffTime={item.dropoff_time || ""}
//             //   dropoffPoc={item.dropoff_poc || ""}
//             //   notes={item.notes || null}
//             // />
//             <TripItem
//               workTracker={item}
//               index={index + 1}
//               onAccept={handleAccept}
//               onStartTrip={handleStartTrip}
//               onSkip={handleSkip}
//               onArrived={handleArrived}
//             />
              
//           );
//         }}
//         ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
//         ListEmptyComponent={() => (
//           <View style={{ padding: 16 }}>
//             <Text style={{ color: "#666" }}>{isLoading ? "Loading…" : "No trips yet."}</Text>
//           </View>
//         )}
//       />
//     </SafeAreaView>
//   );
// }
import TripItem from "@/components/widgets/trip_item";
import { EnrichedWorkTracker, fetchWorkTrackersForClerkUser } from "@/db/workTrackers";
import { useAuth } from "@clerk/clerk-expo";
import { useQuery } from "@tanstack/react-query";
import { Alert, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TripsScreen() {
  const { getToken, isSignedIn, userId } = useAuth();

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["workTrackers", userId],
    enabled: !!isSignedIn && !!userId,
    queryFn: async () => {
      const token = await getToken({ template: "supabase" });
      return await fetchWorkTrackersForClerkUser(token ?? null, userId);
    },
  });

  const workTrackers = (data?.workTrackers ?? []) as EnrichedWorkTracker[];

  // Handler functions
  const handleAccept = async (workTrackerId: number) => {
    try {
      // TODO: Update status to 'accepted' in Supabase
    } catch (error) {
      console.error("Error accepting trip:", error);
      Alert.alert("Error", "Failed to accept trip. Please try again.");
    }
  };

  const handleStartTrip = async (workTrackerId: number) => {
    try {
      Alert.alert(
        "Start Trip",
        "Ready to start this trip?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Start",
            onPress: async () => {
              // TODO: Update status to 'in_progress' in Supabase
              // const token = await getToken({ template: "supabase" });
              // await supabase.from('WorkTrackers').update({ status: 'in_progress' }).eq('work_tracker_id', workTrackerId);
              console.log("Starting trip:", workTrackerId);
              refetch();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error starting trip:", error);
      Alert.alert("Error", "Failed to start trip. Please try again.");
    }
  };

  const handleSkip = async (workTrackerId: number) => {
    try {
      Alert.alert(
        "Skip Trip",
        "Do you want to skip this trip?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Skip",
            style: "destructive",
            onPress: async () => {
              // TODO: Handle skip logic (maybe update order or status)
              console.log("Skipping trip:", workTrackerId);
              refetch();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error skipping trip:", error);
      Alert.alert("Error", "Failed to skip trip. Please try again.");
    }
  };

  const handleArrived = async (workTrackerId: number) => {
    try {
      Alert.alert(
        "Arrived",
        "Have you arrived at the location?",
        [
          { text: "Not Yet", style: "cancel" },
          {
            text: "Yes, I've Arrived",
            onPress: async () => {
              // TODO: Update to next stage or complete
              // If at pickup, move to dropoff
              // If at dropoff, mark as completed
              console.log("Arrived at location for trip:", workTrackerId);
              refetch();
            },
          },
        ]
      );
    } catch (error) {
      console.error("Error updating arrival:", error);
      Alert.alert("Error", "Failed to update arrival status. Please try again.");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F2F7' }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, backgroundColor: '#FFFFFF' }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>Upcoming Trips</Text>
        <View style={{ height: 8 }} />
        <Text onPress={() => refetch()} style={{ color: "#007AFF" }}>
          {isLoading || isRefetching ? "Refreshing…" : "Refresh"}
        </Text>
        {isError ? <Text style={{ color: "red" }}>{(error as Error)?.message}</Text> : null}
      </View>

      <FlatList
        contentContainerStyle={{ paddingBottom: 50, paddingTop: 8 }}
        data={workTrackers}
        keyExtractor={(item) => String(item.work_tracker_id)}
        renderItem={({ item, index }) => (
          <TripItem
            workTracker={item}
            index={index + 1}
            onAccept={handleAccept}
            onStartTrip={handleStartTrip}
            onSkip={handleSkip}
            onArrived={handleArrived}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#666" }}>{isLoading ? "Loading…" : "No trips yet."}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}