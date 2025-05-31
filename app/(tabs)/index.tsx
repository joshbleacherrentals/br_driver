import TripsListItem from "@/components/TripListItem";
import { SafeAreaView, ScrollView } from "react-native";

export default function TripsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 50 }}>
        <TripsListItem />
        <TripsListItem />
        <TripsListItem />
        <TripsListItem />
        <TripsListItem />
        <TripsListItem />
        <TripsListItem />
        <TripsListItem />
      </ScrollView>
    </SafeAreaView>
  );
}
