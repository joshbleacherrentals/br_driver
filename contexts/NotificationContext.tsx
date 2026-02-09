import React, { createContext, useContext, ReactNode } from 'react';
import { useNotifications } from '@/hooks/useNotifications';

interface NotificationContextType {
  expoPushToken: string | null;
  notifiedWorkTrackerId: string | null;
  clearNotification: (workTrackerId: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const notificationData = useNotifications();

  return (
    <NotificationContext.Provider value={notificationData}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotificationContext() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotificationContext must be used within a NotificationProvider');
  }
  return context;
}