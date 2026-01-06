import { PowerSyncContext } from "@powersync/react";
import { useAuth } from "@clerk/clerk-expo";
import { useEffect, useState } from "react";
import { getPowerSyncDatabase } from "./powersync";

export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, getToken } = useAuth();
  const [db, setDb] = useState<any>(null);

  useEffect(() => {
    if (!isSignedIn) return;

    let mounted = true;

    (async () => {
      const database = getPowerSyncDatabase();

      await database.connect({
        async fetchCredentials() {
          const token = await getToken({ template: "supabase" });
          return {
            token,
            endpoint: process.env.EXPO_PUBLIC_POWERSYNC_URL!,
          };
        },
      });

      if (mounted) setDb(database);
    })();

    return () => {
      mounted = false;
    };
  }, [isSignedIn]);

  if (!db) return null;

  return (
    <PowerSyncContext.Provider value={db}>
      {children}
    </PowerSyncContext.Provider>
  );
}
