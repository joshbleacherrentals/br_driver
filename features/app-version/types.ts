export type AppEnv = "development" | "staging" | "production";

/** Local PowerSync row shape (columns are nullable in SQLite). */
export type AppVersionPolicy = {
  id: string;
  environment: string | null;
  recommended_version: string | null;
  required_version: string | null;
  soft_deadline: string | null;
  ios_store_url: string | null;
  android_store_url: string | null;
  message: string | null;
  updated_at: string | null;
};

export type VersionGateStatus =
  | { kind: "ok" }
  | { kind: "soft"; daysLeft: number | null; showEveryLaunch: boolean }
  | { kind: "force"; reason: "required" | "deadline" };

export type VersionGateState = {
  status: VersionGateStatus;
  policy: AppVersionPolicy | null;
  currentVersion: string;
  loading: boolean;
  dismissSoft: () => Promise<void>;
  openStore: () => Promise<void>;
  exitApp: () => void;
};
