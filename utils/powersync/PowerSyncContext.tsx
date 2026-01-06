import { useAuth, useSession } from "@clerk/clerk-expo";
import {
  AbstractPowerSyncDatabase,
  RNQSPowerSyncDatabaseOpenFactory,
} from "@powersync/react-native";
import React, { createContext, useContext, useEffect, useState } from "react";
import { AppSchema } from "./appSchema";
import { SupabaseConnector } from "./SupabaseConnector";

// Create PowerSync context
interface PowerSyncContextType {
  powerSync: AbstractPowerSyncDatabase | null;
  connector: SupabaseConnector | null;
  isReady: boolean;
}

const PowerSyncContext = createContext<PowerSyncContextType>({
  powerSync: null,
  connector: null,
  isReady: false,
});

export const usePowerSync = () => {
  const context = useContext(PowerSyncContext);
  return context;
};

interface PowerSyncProviderProps {
  children: React.ReactNode;
}

export const PowerSyncProvider: React.FC<PowerSyncProviderProps> = ({ children }) => {
  const [powerSync, setPowerSync] = useState<AbstractPowerSyncDatabase | null>(null);
  const [connector, setConnector] = useState<SupabaseConnector | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const { isSignedIn } = useAuth();
  const { session } = useSession();

  useEffect(() => {
    // Prevent re-initialization
    if (isInitialized) return;

    let db: AbstractPowerSyncDatabase | null = null;
    let conn: SupabaseConnector | null = null;

    const initPowerSync = async () => {
      try {
        if (!session) {
          console.log("No session available for PowerSync");
          return;
        }

        // Create PowerSync database instance
        const factory = new RNQSPowerSyncDatabaseOpenFactory({
          schema: AppSchema,
          dbFilename: "powersync.db",
        });

        db = factory.getInstance();

        // Initialize the database
        if (db) {
          await db.init();
        }

        // Create connector with auth token getter
        conn = new SupabaseConnector(session.getToken);

        // Connect PowerSync to Supabase (only if PowerSync URL is configured)
        const powerSyncUrl = process.env.EXPO_PUBLIC_POWERSYNC_URL;
        if (powerSyncUrl && db) {
          await db.connect(conn);
          console.log("PowerSync connected to backend");
        } else {
          console.log("PowerSync running in local-only mode");
        }

        setPowerSync(db);
        setConnector(conn);
        setIsReady(true);
        setIsInitialized(true);

        console.log("PowerSync initialized successfully");
      } catch (error) {
        console.error("Failed to initialize PowerSync:", error);
        console.warn(
          "⚠️ PowerSync requires a development build. Run 'npx expo run:ios' to create a custom build."
        );
        setIsReady(true);
        setIsInitialized(true);
      }
    };

    if (isSignedIn && !isInitialized && session) {
      initPowerSync();
    } else if (!isSignedIn) {
      setIsReady(true);
    }

    return () => {
      // Cleanup on unmount
      if (db) {
        db.disconnectAndClear().catch(console.error);
      }
    };
  }, [isSignedIn, isInitialized]);

  return (
    <PowerSyncContext.Provider value={{ powerSync, connector, isReady }}>
      {children}
    </PowerSyncContext.Provider>
  );
};
