import { useTheme } from "@/hooks/useTheme";
import { StyleSheet, View } from "react-native";

export default function ThemedTabBarBackground() {
  const { theme } = useTheme();
  return (
    <View
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]}
    />
  );
}

export function useBottomTabOverflow() {
  return 0;
}
