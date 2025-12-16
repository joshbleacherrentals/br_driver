// import { TripsList } from "@/components/TripsList";
// import { enrichedWorkTrackers$ as _enrichedWorkTrackers$ } from "@/db/enrichedWorkTrackers";
import { TripsList } from "@/components/TripsList";
import { Tables } from "@/database.types";
import { enrichedWorkTrackers$ as _enrichedWorkTrackers$ } from "@/state/computes/enrichedWorkTrackers";
import { bleachers$ as _bleachers$ } from "@/state/stores/bleachers.store";
import { observer } from "@legendapp/state/react";
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const Bleachers = observer(({ bleachers$ }: { bleachers$: typeof _bleachers$ }) => {
  const bleachers = bleachers$.get();

  if (!bleachers) return null;

  return (
    <FlatList
      data={Object.values(bleachers) as Tables<"Bleachers">[]}
      keyExtractor={(b) => b.legend_state_uuid}
      renderItem={({ item }) => (
        <View style={{ padding: 12 }}>
          <Text>Bleacher #{item.bleacher_number}</Text>
          <Text>Seats: {item.bleacher_seats}</Text>
          <Text>Rows: {item.bleacher_rows}</Text>
        </View>
      )}
    />
  );
});

export default function TodosScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Text style={styles.title}>Trips</Text>
          <Text style={styles.subtitle}>See your schedule today</Text>
        </View>

        {/* <TripsList enrichedWorkTrackers$={_enrichedWorkTrackers$} /> */}
        {/* <Bleachers bleachers$={_bleachers$} /> */}
        <TripsList enrichedWorkTrackers$={_enrichedWorkTrackers$} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#333",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
});
