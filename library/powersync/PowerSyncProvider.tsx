import { PowerSyncContext } from "@powersync/react";
import { useMemo } from "react";
import { useSystem } from "./system";

export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  // const { isSignedIn, getToken } = useAuth();
  // const [db, setDb] = useState<any>(null);

  // useEffect(() => {
  //   if (!isSignedIn) return;

  //   let mounted = true;

  //   (async () => {
  //     const database = getPowerSyncDatabase();

  //     await database.connect({
  //       async fetchCredentials() {
  //         const token = await getToken({ template: "supabase" });
  //         return {
  //           token,
  //           endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL!,
  //         };
  //       },
  //     });

  //     if (mounted) setDb(database);
  //   })();

  //   return () => {
  //     mounted = false;
  //   };
  // }, [isSignedIn]);

  // if (!db) return null;

  const system = useSystem();
  const db = useMemo(() => {
    return system.powersync;
  }, []);

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>;
}
