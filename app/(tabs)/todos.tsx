import { LIST_TABLE, ListRecord, TODO_TABLE, TodoRecord } from "@/utils/powersync/appSchema";
import { useSystem } from "@/utils/powersync/system";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useQuery } from "@powersync/react-native";
import React from "react";
import { FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface List extends ListRecord {
  id: string;
}

interface Todo extends TodoRecord {
  id: string;
}

export default function TodosScreen() {
  const system = useSystem();
  const [selectedListId, setSelectedListId] = React.useState<string | null>(null);
  const [newListName, setNewListName] = React.useState("");
  const [showNewList, setShowNewList] = React.useState(false);
  const [newTodoDescription, setNewTodoDescription] = React.useState("");

  const { data: listRecords } = useQuery<
    ListRecord & { total_tasks: number; completed_tasks: number }
  >(`
      SELECT
        ${LIST_TABLE}.*, COUNT(${TODO_TABLE}.id) AS total_tasks, SUM(CASE WHEN ${TODO_TABLE}.completed = true THEN 1 ELSE 0 END) as completed_tasks
      FROM
        ${LIST_TABLE}
      LEFT JOIN ${TODO_TABLE}
        ON  ${LIST_TABLE}.id = ${TODO_TABLE}.list_id
      GROUP BY
        ${LIST_TABLE}.id;
      `);

  const { data: todos = [] } = useQuery<Todo>(
    selectedListId
      ? `SELECT * FROM ${TODO_TABLE} WHERE list_id = ? ORDER BY created_at DESC`
      : `SELECT * FROM ${TODO_TABLE} WHERE id IS NULL`,
    selectedListId ? [selectedListId] : []
  );

  const lists = (listRecords ?? []) as List[];
  const selectedList = lists.find((list) => list.id === selectedListId);

  const createList = async () => {
    if (!newListName.trim()) return;
    await createNewList(newListName);
    setNewListName("");
    setShowNewList(false);
  };

  const createNewList = async (name: string) => {
    const userID = await system.supabaseConnector.userId();

    const res = await system.powersync.execute(
      `INSERT INTO ${LIST_TABLE} (id, created_at, name, owner_id) VALUES (uuid(), datetime(), ?, ?) RETURNING *`,
      [name, userID]
    );

    const resultRecord = res.rows?.item(0);
    if (!resultRecord) {
      throw new Error("Could not create list");
    }
  };

  const deleteList = async (id: string) => {
    await system.powersync.writeTransaction(async (tx) => {
      // Delete associated todos
      await tx.execute(`DELETE FROM ${TODO_TABLE} WHERE list_id = ?`, [id]);
      // Delete list record
      await tx.execute(`DELETE FROM ${LIST_TABLE} WHERE id = ?`, [id]);
    });
    if (selectedListId === id) {
      setSelectedListId(null);
    }
  };

  const createTodo = async () => {
    if (!newTodoDescription.trim() || !selectedListId) return;

    await system.powersync.execute(
      `INSERT INTO ${TODO_TABLE} (id, created_at, list_id, description, completed, completed_at, created_by, completed_by) VALUES (uuid(), datetime(), ?, ?, ?, ?, ?, ?)`,
      [
        selectedListId,
        newTodoDescription,
        false,
        null,
        await system.supabaseConnector.userId(),
        null,
      ]
    );

    setNewTodoDescription("");
  };

  const toggleTodo = async (todo: Todo) => {
    const newCompleted = !todo.completed;
    const userID = await system.supabaseConnector.userId();

    await system.powersync.execute(
      `UPDATE ${TODO_TABLE} SET completed = ?, completed_at = ?, completed_by = ? WHERE id = ?`,
      [
        newCompleted,
        newCompleted ? new Date().toISOString() : null,
        newCompleted ? userID : null,
        todo.id,
      ]
    );
  };

  const deleteTodo = async (id: string) => {
    await system.powersync.execute(`DELETE FROM ${TODO_TABLE} WHERE id = ?`, [id]);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Lists Section */}
      <View style={styles.listsContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>Lists</Text>
          <TouchableOpacity onPress={() => setShowNewList(!showNewList)}>
            <FontAwesome6 name="plus" size={20} color="#007AFF" />
          </TouchableOpacity>
        </View>

        {showNewList && (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="New list name"
              value={newListName}
              onChangeText={setNewListName}
              onSubmitEditing={createList}
            />
            <TouchableOpacity onPress={createList} style={styles.addButton}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          horizontal
          data={lists}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.listChip, selectedListId === item.id && styles.listChipSelected]}
              onPress={() => setSelectedListId(item.id)}
              onLongPress={() => deleteList(item.id)}
            >
              <Text
                style={[
                  styles.listChipText,
                  selectedListId === item.id && styles.listChipTextSelected,
                ]}
              >
                {item.name}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={() => (
            <Text style={styles.emptyText}>No lists yet. Create one to get started!</Text>
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listsFlatListContent}
        />
      </View>

      {/* Todos Section */}
      {selectedList && (
        <View style={styles.todosContainer}>
          <Text style={styles.sectionTitle}>{selectedList.name}</Text>

          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Add a new todo"
              value={newTodoDescription}
              onChangeText={setNewTodoDescription}
              onSubmitEditing={createTodo}
            />
            <TouchableOpacity onPress={createTodo} style={styles.addButton}>
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={todos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.todoItem}>
                <TouchableOpacity style={styles.todoCheckbox} onPress={() => toggleTodo(item)}>
                  <FontAwesome6
                    name={item.completed ? "circle-check" : "circle"}
                    size={24}
                    color={item.completed ? "#34C759" : "#C7C7CC"}
                    solid={!!item.completed}
                  />
                </TouchableOpacity>
                <Text
                  style={[styles.todoText, item.completed ? styles.todoTextCompleted : undefined]}
                  numberOfLines={2}
                >
                  {item.description}
                </Text>
                <TouchableOpacity onPress={() => deleteTodo(item.id)} style={styles.deleteButton}>
                  <FontAwesome6 name="trash" size={18} color="#FF3B30" />
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={() => (
              <Text style={styles.emptyText}>No todos yet. Add one above!</Text>
            )}
            contentContainerStyle={styles.todosListContent}
          />
        </View>
      )}

      {!selectedList && lists.length > 0 && (
        <View style={styles.selectListPrompt}>
          <Text style={styles.emptyText}>Select a list to view todos</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F2F2F7",
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#666",
  },
  errorText: {
    fontSize: 16,
    color: "#FF3B30",
    marginBottom: 16,
  },
  helpText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    marginTop: 8,
    paddingHorizontal: 32,
  },
  listsContainer: {
    backgroundColor: "#FFF",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5EA",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  inputRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: "#F2F2F7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addButton: {
    backgroundColor: "#007AFF",
    borderRadius: 8,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  addButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "600",
  },
  listsFlatListContent: {
    paddingHorizontal: 16,
  },
  listChip: {
    backgroundColor: "#F2F2F7",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  listChipSelected: {
    backgroundColor: "#007AFF",
  },
  listChipText: {
    fontSize: 14,
    color: "#000",
  },
  listChipTextSelected: {
    color: "#FFF",
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 14,
    color: "#8E8E93",
    textAlign: "center",
    marginTop: 8,
  },
  todosContainer: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 16,
  },
  todosListContent: {
    paddingBottom: 20,
  },
  todoItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F2F2F7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  todoCheckbox: {
    marginRight: 12,
  },
  todoText: {
    flex: 1,
    fontSize: 16,
  },
  todoTextCompleted: {
    textDecorationLine: "line-through",
    color: "#8E8E93",
  },
  deleteButton: {
    padding: 8,
  },
  selectListPrompt: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
