import { useTheme } from "@/hooks/useTheme";
import { useClerk } from "@clerk/clerk-expo";
import * as Linking from "expo-linking";
import { Text, TouchableOpacity } from "react-native";

export const SignOutButton = () => {
  const { theme } = useTheme();
  const { signOut } = useClerk();

  const handleSignOut = async () => {
    try {
      await signOut();
      Linking.openURL(Linking.createURL("/"));
    } catch (err) {
      console.error(JSON.stringify(err, null, 2));
    }
  };

  return (
    <TouchableOpacity onPress={handleSignOut}>
      <Text style={{ color: theme.accent, fontWeight: "600" }}>Sign out</Text>
    </TouchableOpacity>
  );
};
