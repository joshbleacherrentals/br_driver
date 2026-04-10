import { db, nvisAttachmentQueue } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import * as FileSystem from "expo-file-system/legacy";
import * as Network from "expo-network";
import { sql } from "kysely";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

export type BleacherData = {
    id: string;
    created_at: string | null;
    bleacher_number: string | null;
    bleacher_rows: number | null;
    bleacher_seats: number | null;
    created_by: string | null;
    updated_at: string | null;
    updated_by: string | null;
    linxup_device_id: string | null;
    summer_account_manager_uuid: string | null;
    winter_account_manager_uuid: string | null;
    summer_home_base_uuid: string | null;
    winter_home_base_uuid: string | null;
    hitch_type: string | null;
    vin_number: string | null;
    tag_number: string | null;
    manufacturer: string | null;
    height_folded_ft: number | null;
    trailer_length: number | null;
    gvwr: number | null;
    opening_direction: string | null;
    nvis_pdf_path: string | null;
};

const BLEACHER_COLUMNS = [
    "id",
    "created_at",
    "bleacher_number",
    "bleacher_rows",
    "bleacher_seats",
    "created_by",
    "updated_at",
    "updated_by",
    "linxup_device_id",
    "summer_account_manager_uuid",
    "winter_account_manager_uuid",
    "summer_home_base_uuid",
    "winter_home_base_uuid",
    "hitch_type",
    "vin_number",
    "tag_number",
    "manufacturer",
    "height_folded_ft",
    "trailer_length",
    "gvwr",
    "opening_direction",
    "nvis_pdf_path",
] as const;

/**
 * Fetch a single bleacher by ID.
 */
export function useBleacher(bleacher_id: string | null): { bleacher: BleacherData | null } {
    const compiled = useMemo(() => {
        if (!bleacher_id) return null;
        return db
            .selectFrom("Bleachers")
            .select(BLEACHER_COLUMNS)
            .where("id", "=", bleacher_id)
            .limit(1)
            .compile();
    }, [bleacher_id]);

    const bleacherData = useTypedQuery(compiled, expect<BleacherData>());
    return { bleacher: bleacherData.data?.[0] ?? null };
}

/**
 * Fetch a batch of bleachers by ID list.
 * Returns a Record<uuid, BleacherData | null>.
 */
export function useBatchBleachers(bleacherIds: (string | null)[]): Record<string, BleacherData | null> {
    const uniqueIds = useMemo(
        () => Array.from(new Set(bleacherIds.filter((id): id is string => id !== null))),
        [bleacherIds]
    );

    const compiled = useMemo(() => {
        if (uniqueIds.length === 0) return null;
        return db
            .selectFrom("Bleachers")
            .select(BLEACHER_COLUMNS)
            .where("id", "in", uniqueIds)
            .compile();
    }, [uniqueIds]);

    const bleacherData = useTypedQuery(compiled, expect<BleacherData>());

    return useMemo(() => {
        const result: Record<string, BleacherData | null> = {};
        bleacherData.data?.forEach(bleacher => {
            result[bleacher.id] = bleacher;
        });
        return result;
    }, [bleacherData.data]);
}

/**
 * Fetch every bleacher in the fleet, sorted numerically by bleacher_number.
 * Use this to populate BleacherDropdown options.
 */
export function useAllBleachers(): { bleachers: BleacherData[] } {
    const compiled = useMemo(
        () =>
            db
                .selectFrom("Bleachers")
                .select(BLEACHER_COLUMNS)
                .orderBy(sql`CAST(bleacher_number AS INTEGER)`, "asc")
                .compile(),
        []
    );

    const result = useTypedQuery(compiled, expect<BleacherData>());
    return { bleachers: result.data ?? [] };
}

// ─── NVIS PDF download state ──────────────────────────────────────────────────

type State = {
  status: "idle" | "loading" | "cached" | "error" | "waiting-for-wifi";
  localUri: string | null;
};

export function useNvisDocument(nvisPdfPath: string | null) {
  const [state, setState] = useState<State>({ status: "idle", localUri: null });

  const prevPathRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const _doDownload = async (
    path: string,
    isMountedRef: { current: boolean }
  ) => {
    if (inFlightRef.current || !nvisAttachmentQueue) return;

    setState({ status: "loading", localUri: null });

    const download = (async () => {
      try {
        const uri = await nvisAttachmentQueue.ensureDownloaded(path);
        if (isMountedRef.current) {
          setState({ status: "cached", localUri: uri });
        }
      } catch (e) {
        console.error("[NvisDownload] Failed:", e);
        if (isMountedRef.current) {
          setState({ status: "error", localUri: null });
        }
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = download;
    await download;
  };

  useEffect(() => {
    if (!nvisPdfPath || !nvisAttachmentQueue) {
      prevPathRef.current = null;
      inFlightRef.current = null;
      setState({ status: "idle", localUri: null });
      return;
    }

    const isMountedRef = { current: true };
    const pathChanged = prevPathRef.current !== nvisPdfPath;
    prevPathRef.current = nvisPdfPath;

    const localUri = nvisAttachmentQueue.getLocalUri(nvisPdfPath);

    const run = async () => {
      // Path changed — cancel any in-flight download for the old path
      // and delete the stale cached file if there is one
      if (pathChanged) {
        inFlightRef.current = null;
        if (state.localUri && state.localUri !== localUri) {
          FileSystem.deleteAsync(state.localUri, { idempotent: true }).catch(() => {});
        }
      }

      if (inFlightRef.current) return;

      // Use the queue's isDownloaded so cache check + write use the same path
      const isCachedOnDisk = await nvisAttachmentQueue!.isDownloaded(nvisPdfPath);
      if (!isMountedRef.current) return;

      if (isCachedOnDisk && !pathChanged) {
        setState({ status: "cached", localUri });
        return;
      }

      // Check network before downloading
      const net = await Network.getNetworkStateAsync();
      const isWifi =
        net.type === Network.NetworkStateType.WIFI ||
        net.type === Network.NetworkStateType.ETHERNET ||
        (net.type === Network.NetworkStateType.OTHER && net.isConnected);

      if (!isMountedRef.current) return;

      if (isWifi) {
        await _doDownload(nvisPdfPath, isMountedRef);
      } else {
        setState({ status: "waiting-for-wifi", localUri: null });
      }
    };

    run();

    return () => {
      isMountedRef.current = false;
    };
  }, [nvisPdfPath]);

  const downloadManually = async () => {
    if (!nvisPdfPath || !nvisAttachmentQueue) return;

    const net = await Network.getNetworkStateAsync();
    const isWifi =
      net.type === Network.NetworkStateType.WIFI ||
      net.type === Network.NetworkStateType.ETHERNET ||
      (net.type === Network.NetworkStateType.OTHER && net.isConnected);

    if (!isWifi && !net.isConnected) {
      Alert.alert("No connection", "Connect to the internet to download this PDF.");
      return;
    }

    const isMountedRef = { current: true };
    await _doDownload(nvisPdfPath, isMountedRef);
  };

  return {
    isLoading: state.status === "loading",
    isCached: state.status === "cached",
    isWaitingForWifi: state.status === "waiting-for-wifi",
    localUri: state.localUri,
    state,
    downloadManually,
  };
}