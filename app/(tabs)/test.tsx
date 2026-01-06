import { LIST_TABLE, ListRecord } from "@/library/powersync/AppSchema";
import { useSystem } from "@/library/powersync/system";
import { useQuery } from "@powersync/react-native";
import { Button, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TestScreen() {
  const system = useSystem();
  const { data: listRecords } = useQuery<ListRecord>(`
      SELECT
        ${LIST_TABLE}.*
      FROM
        ${LIST_TABLE}
      `);

  const insertRandomRow = async () => {
    await system.powersync.execute(
      `INSERT INTO ${LIST_TABLE} (id, name, created_at) VALUES (uuid(), ?, ?)`,
      [`hello_${Math.floor(Math.random() * 1000)}`, new Date().toISOString()]
    );
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontWeight: "600" }}>Lists Data</Text>
        <View style={{ height: 8 }} />
        <Text style={{ color: "#666" }}>Total records: {listRecords.length}</Text>
        <View style={{ height: 12 }} />
        <Button title="Insert Random Row" onPress={insertRandomRow} />
      </View>

      <FlatList
        contentContainerStyle={{ paddingBottom: 50, paddingHorizontal: 16 }}
        data={listRecords}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={{ padding: 12, backgroundColor: "#f5f5f5", borderRadius: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: "600" }}>Name: {item.name}</Text>
            <Text style={{ fontSize: 14, color: "#666", marginTop: 4 }}>
              Created: {item.created_at}
            </Text>
            <Text style={{ fontSize: 12, color: "#999", marginTop: 4 }}>ID: {item.id}</Text>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        ListEmptyComponent={() => (
          <View style={{ padding: 16 }}>
            <Text style={{ color: "#666" }}>No list records found.</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
