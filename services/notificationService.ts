import { db } from '@/components/providers/SystemProvider'; // Your PowerSync db
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,  // Shows banner at top of screen
    shouldShowList: true,    // Shows in notification center
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync(userId: string | undefined) {
  if (!userId) {
    console.log('No user ID provided');
    return;
  }
  console.log('Registering for push notifications for user ID:', userId);

  let token;

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token for push notification!');
      return;
    }
    
    try {
      // Get project ID from app config
      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      
      if (!projectId) {
        console.error('Missing projectId in app.json');
        return;
      }

      token = (await Notifications.getExpoPushTokenAsync({
        projectId,
      })).data;
      
      console.log('Expo Push Token:', token);
      
      // Save to local PowerSync database - it will sync to Supabase
      try {
        await db
          .updateTable('Users')
          .set({ expo_push_token: token })
          .where('id', '=', userId)
          .execute();
        
        console.log('Push token saved successfully to PowerSync');
      } catch (dbError) {
        console.error('Error saving push token to PowerSync:', dbError);
      }
    } catch (error) {
      console.error('Error getting push token:', error);
    }
  } else {
    console.log('Must use physical device for Push Notifications');
  }

  return token;
}

export function setupNotificationListeners() {
  const notificationListener = Notifications.addNotificationReceivedListener(notification => {
    console.log('✅ Notification received in foreground:', notification);
  });

  const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
    console.log('✅ Notification tapped:', response);
    const notificationId = response.notification.request.content.data?.notificationId;
    console.log('Notification ID:', notificationId);
    
    // Navigate to index screen
    router.push('/(tabs)');
  });

  return {
    notificationListener,
    responseListener,
  };
}