import { todos$ as _todos$, addTodo, deleteTodo, toggleDone } from "@/utils/supabase/supaLegend";
import { syncState } from "@legendapp/state";
import { observer } from "@legendapp/state/react";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

// Emojis to decorate each todo.
const NOT_DONE_ICON = String.fromCodePoint(0x1f7e0);
const DONE_ICON = String.fromCodePoint(0x2705);
const SYNCED_ICON = "☁️"; // Cloud = synced with remote
const ERROR_ICON = "⚠️"; // Warning = sync error

type Todo = {
  id: string;
  text: string | null;
  done: boolean | null;
  counter?: number;
  created_at?: string | null;
  updated_at?: string | null;
  deleted?: boolean | null;
};

// Sync status indicator component - tracks the whole collection's sync state
const SyncStatusIndicator = observer(() => {
  const state$ = syncState(_todos$);
  const state = state$.get();

  const handleRetry = () => {
    // Manually trigger a sync retry
    state?.sync();
  };

  // Check for error state
  if (state?.error) {
    return (
      <TouchableOpacity onPress={handleRetry} style={styles.syncIndicator}>
        <Text style={styles.syncIconError}>{ERROR_ICON}</Text>
      </TouchableOpacity>
    );
  }

  // Check if currently syncing (getting or setting)
  if (state?.isGetting || state?.isSetting) {
    return (
      <View style={styles.syncIndicator}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  }

  // Check if there are pending changes to sync
  if (state?.numPendingSets && state.numPendingSets > 0) {
    return (
      <View style={styles.syncIndicator}>
        <ActivityIndicator size="small" color="#FF9500" />
      </View>
    );
  }

  // Check if not yet loaded from remote
  if (!state?.isLoaded) {
    return (
      <View style={styles.syncIndicator}>
        <ActivityIndicator size="small" color="#999" />
      </View>
    );
  }

  // Synced successfully
  return (
    <View style={styles.syncIndicator}>
      <Text style={styles.syncIconSynced}>{SYNCED_ICON}</Text>
    </View>
  );
});

// Global sync status bar - shows at the top when there are issues
const GlobalSyncStatus = observer(() => {
  const state$ = syncState(_todos$);
  const state = state$.get();

  const handleRetry = () => {
    state?.sync();
  };

  // Show error banner
  if (state?.error) {
    return (
      <TouchableOpacity onPress={handleRetry} style={styles.syncBanner}>
        <Text style={styles.syncBannerText}>{ERROR_ICON} Sync failed - tap to retry</Text>
      </TouchableOpacity>
    );
  }

  // Show pending changes banner
  if (state?.numPendingSets && state.numPendingSets > 0) {
    return (
      <View style={styles.syncBannerPending}>
        <ActivityIndicator size="small" color="#fff" />
        <Text style={styles.syncBannerText}>
          Syncing {state.numPendingSets} change{state.numPendingSets > 1 ? "s" : ""}...
        </Text>
      </View>
    );
  }

  return null;
});

// The text input component to add a new todo.
const NewTodo = () => {
  const [text, setText] = useState("");

  const handleSubmitEditing = () => {
    if (text.trim()) {
      addTodo(text.trim());
      setText("");
    }
  };

  return (
    <View style={styles.inputContainer}>
      <TextInput
        value={text}
        onChangeText={setText}
        onSubmitEditing={handleSubmitEditing}
        placeholder="What do you want to do today?"
        placeholderTextColor="#999"
        style={styles.input}
        returnKeyType="done"
      />
      <TouchableOpacity style={styles.addButton} onPress={handleSubmitEditing}>
        <Text style={styles.addButtonText}>Add</Text>
      </TouchableOpacity>
    </View>
  );
};

// A single todo component, either 'not done' or 'done': press to toggle.
const TodoItem = ({ todo }: { todo: Todo }) => {
  const handlePress = () => {
    toggleDone(todo.id);
  };

  const handleDelete = () => {
    deleteTodo(todo.id);
  };

  return (
    <View style={[styles.todo, todo.done ? styles.done : null]}>
      <TouchableOpacity onPress={handlePress} style={styles.todoContent}>
        <Text style={styles.todoText}>
          {todo.done ? DONE_ICON : NOT_DONE_ICON} {todo.text}
        </Text>
      </TouchableOpacity>
      <SyncStatusIndicator />
      <TouchableOpacity onPress={handleDelete} style={styles.deleteButton}>
        <Text style={styles.deleteButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
};

// The list of todos, subscribed to realtime updates
const TodosList = observer(({ todos$ }: { todos$: typeof _todos$ }) => {
  const todos = todos$.get();

  const renderItem = ({ item }: { item: Todo }) => <TodoItem todo={item} />;

  if (!todos || Object.keys(todos).length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No todos yet!</Text>
        <Text style={styles.emptySubtext}>Add one above to get started</Text>
      </View>
    );
  }

  // Filter out deleted todos and sort by created_at
  const todoList = Object.values(todos)
    .filter((todo) => !todo.deleted)
    .sort((a, b) => {
      if (!a.created_at || !b.created_at) return 0;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return (
    <FlatList
      data={todoList}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      style={styles.list}
      contentContainerStyle={styles.listContent}
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
        <GlobalSyncStatus />

        <View style={styles.header}>
          <Text style={styles.title}>📝 Todos</Text>
          <Text style={styles.subtitle}>Legend-State + Supabase Realtime</Text>
        </View>

        <NewTodo />

        <TodosList todos$={_todos$} />
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
  inputContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  addButton: {
    backgroundColor: "#007AFF",
    borderRadius: 12,
    paddingHorizontal: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  addButtonText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 16,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  todo: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  todoContent: {
    flex: 1,
  },
  done: {
    backgroundColor: "#e8f5e9",
    borderColor: "#c8e6c9",
  },
  todoText: {
    fontSize: 16,
    color: "#333",
  },
  deleteButton: {
    marginLeft: 12,
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#ffebee",
  },
  deleteButtonText: {
    color: "#c62828",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 18,
    color: "#666",
    fontWeight: "500",
  },
  emptySubtext: {
    fontSize: 14,
    color: "#999",
    marginTop: 8,
  },
  syncIndicator: {
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  syncIconSynced: {
    fontSize: 16,
  },
  syncIconError: {
    fontSize: 16,
  },
  syncBanner: {
    backgroundColor: "#c62828",
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  syncBannerPending: {
    backgroundColor: "#FF9500",
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  syncBannerText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
