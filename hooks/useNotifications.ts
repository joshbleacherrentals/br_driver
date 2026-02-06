import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '@/services/notificationService';

export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    // Register for push notifications
    registerForPushNotificationsAsync().then(token => {
      setExpoPushToken(token ?? null);
      // TODO: Send this token to your backend to store for the user
      // so you can send them push notifications from your server
    });

    // Setup listeners
    const listeners = setupNotificationListeners(
      (notification) => {
        // Handle notification received while app is open
        console.log('Received notification:', notification);
      },
      (response) => {
        // Handle user tapping on notification
        console.log('User tapped notification:', response);
        const data = response.notification.request.content.data;
        
        // Navigate to appropriate screen based on notification data
        if (data?.workTrackerId) {
          // TODO: Navigate to the specific trip
          console.log('Navigate to trip:', data.workTrackerId);
        }
      }
    );

    notificationListener.current = listeners.notificationListener;
    responseListener.current = listeners.responseListener;

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return { expoPushToken };
}