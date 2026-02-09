import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { registerForPushNotificationsAsync, setupNotificationListeners } from '@/services/notificationService';
import { router } from 'expo-router';

export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notifiedWorkTrackerId, setNotifiedWorkTrackerId] = useState<string | null>(null);
  const notificationListener = useRef<Notifications.Subscription | undefined>(undefined);
  const responseListener = useRef<Notifications.Subscription | undefined>(undefined);

  useEffect(() => {
    // Register for push notifications
    registerForPushNotificationsAsync().then(token => {
      setExpoPushToken(token ?? null);
    });

    // Setup listeners
    const listeners = setupNotificationListeners(
      (notification) => {
        // Handle notification received while app is open
        console.log('Received notification:', notification);
        const data = notification.request.content.data;
        
        // Set the workTrackerId to show indicator
        if (data?.workTrackerId) {
          setNotifiedWorkTrackerId(data.workTrackerId as string);
        }
      },
      (response) => {
        // Handle user tapping on notification
        console.log('User tapped notification:', response);
        const data = response.notification.request.content.data;
        
        if (data?.workTrackerId) {
          // Set the workTrackerId to show indicator
          setNotifiedWorkTrackerId(data.workTrackerId as string);
          
          // Navigate to trips page
          router.push('/(tabs)/trips');
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

  const clearNotification = (workTrackerId: string) => {
    if (notifiedWorkTrackerId === workTrackerId) {
      setNotifiedWorkTrackerId(null);
    }
  };

  return { expoPushToken, notifiedWorkTrackerId, clearNotification };
}