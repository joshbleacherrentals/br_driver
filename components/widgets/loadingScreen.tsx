import { useTheme } from "@/hooks/useTheme";
import { ActivityIndicator, View } from "react-native";

export default function LoadingScreen() {
  const { theme } = useTheme();

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: theme.background,
      }}
    >
      <ActivityIndicator size="large" color={theme.accent} />
    </View>
  );
}
