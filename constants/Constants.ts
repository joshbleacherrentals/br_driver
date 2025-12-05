export const USER_ROLES = {
  ADMIN: 2,
  ACCOUNT_MANAGER: 1,
  DRIVER: 3,
} as const;

// Google Places API Key (same as web app)
export const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || "";
