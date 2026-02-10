import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import { fetchDriver } from '@/db/fetchDrivers';
import { useUser } from '@clerk/clerk-expo';

export function useDriverGuard() {
  const router = useRouter();
  const segments = useSegments();
  const { isSignedIn } = useUser();
  const { driver } = fetchDriver();

  useEffect(() => {
    // Don't redirect if not signed in or already on auth/not-found screens
    if (!isSignedIn) return;
    
    const inAuthGroup = segments[0] === '(auth)';
    const inNotFound = segments.includes('+not-found');

    if (driver === undefined) return; // still loading
    
    // If signed in but no driver profile, redirect to not-found
    if (driver === null && !inNotFound && !inAuthGroup) {
      router.replace('/+not-found');
    }
  }, [driver, isSignedIn, segments]);

  return { driver, hasDriver: !!driver };
}