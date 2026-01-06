import { USER_ROLES } from "@/constants/Constants";
import { supabase } from "@/library/supabase/supabaseClient";

const createErrorToast = (messages: string[]) => {
  console.warn("[Toast]", ...messages);
};

export async function fetchDrivers(token: string | null): Promise<any> {
  try {
    const { data, error } = await supabase.from("Users").select("*").eq("role", USER_ROLES.DRIVER);

    if (error) {
      createErrorToast(["Failed to fetch Drivers.", error.message]);
      return { drivers: null };
    }
    return { drivers: data as any };
  } catch (e: any) {
    createErrorToast(["Unexpected error fetching Drivers", e?.message || String(e)]);
    return { drivers: null };
  }
}
