import { View, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useColorScheme } from '@/hooks/useColorScheme';

export function LoadingScreen() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === 'dark' ? '#000' : '#fff';

  return (
    <View style={{ 
      flex: 1, 
      justifyContent: 'center', 
      alignItems: 'center', 
      backgroundColor 
    }}>
      <Image
        source={require("@/assets/images/NEW-Bleacher-Rentals-logo.png")}
        style={{ width: 200, height: 60, marginBottom: 32 }}
        contentFit="contain"
      />
      <ActivityIndicator size="large" color="#10365A" />
    </View>
  );
}