import { supabase, SupabaseClient } from "./supabaseClient";

/**
 * @deprecated Use the `supabase` client directly instead. The token is now managed automatically via useClerkSupabaseClient.
 * This function is kept for backwards compatibility but will be removed in the future.
 */
export const getSupabaseClient = async (token: string | null): Promise<SupabaseClient> => {
  // Token is now managed automatically, just return the shared client
  return supabase;
};
