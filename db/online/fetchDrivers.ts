// import { USER_ROLES } from "@/constants/Constants";
// import { getSupabaseClient } from "../utils/supabase/getSupabaseClient";

// const createErrorToast = (messages: string[]) => {
//   console.warn("[Toast]", ...messages);
// };

// export async function fetchDrivers(token: string | null): Promise<any> {
//   if (!token) {
//     createErrorToast(["No token found"]);
//     return { drivers: null };
//   }

//   try {
//     const supabase = await getSupabaseClient(token);
//     const { data, error } = await supabase.from("Users").select("*").eq("role", USER_ROLES.DRIVER);

//     if (error) {
//       createErrorToast(["Failed to fetch Drivers.", error.message]);
//       return { drivers: null };
//     }
//     return { drivers: data as any };
//   } catch (e: any) {
//     createErrorToast(["Unexpected error fetching Drivers", e?.message || String(e)]);
//     return { drivers: null };
//   }
// }
