import { useAuth } from "@clerk/clerk-expo";
import { PowerSyncContext } from "@powersync/react";
import { useEffect, useMemo, useState } from "react";
import { useSystem } from "./system";

export function PowerSyncProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn } = useAuth();
  const system = useSystem();
  const [isInitialized, setIsInitialized] = useState(false);

  const db = useMemo(() => {
    return system.powersync;
  }, []);

  useEffect(() => {
    if (!isSignedIn) {
      setIsInitialized(false);
      return;
    }

    let mounted = true;

    (async () => {
      try {
        await system.init();
        if (mounted) {
          setIsInitialized(true);
          console.log("PowerSync initialized successfully");
        }
      } catch (error) {
        console.error("Failed to initialize PowerSync:", error);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [isSignedIn]);

  return <PowerSyncContext.Provider value={db}>{children}</PowerSyncContext.Provider>;
}
