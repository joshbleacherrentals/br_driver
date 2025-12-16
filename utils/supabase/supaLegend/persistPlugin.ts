import { observablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const persistPluginLocal = observablePersistAsyncStorage({ AsyncStorage });
