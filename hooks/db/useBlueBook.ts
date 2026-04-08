import { db, documentAttachmentQueue } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import NetInfo from "@react-native-community/netinfo";
import * as FileSystem from "expo-file-system/legacy";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "react-native";

export type BlueBookData = {
    id: string;
    name: string | null;
    document_path: string | null;
    link: string | null;
    description: string | null;
    is_active: number | null;
    region: string | null;
    sort_order: number | null;
};

export function useBlueBook(): { blueBookEntries: BlueBookData[] | null } {
    const compiled = useMemo(() => {
        return db
            .selectFrom("BlueBook")
            .select([
                "id",
                "name",
                "document_path",
                "link",
                "description",
                "is_active",
                "region",
                "sort_order",
            ])
            .orderBy("sort_order", "asc")
            .compile();
    }, []);

    const data = useTypedQuery(compiled, expect<BlueBookData>());
    return { blueBookEntries: data.data };
}

export type DocumentDownloadState =
  | { status: "idle" }
  | { status: "loading"; localUri: null }
  | { status: "cached"; localUri: string }
  | { status: "ready"; localUri: string }
  | { status: "waiting-for-wifi"; localUri: null }
  | { status: "error"; localUri: null; message: string };

export function useBlueBookDocument(documentPath: string | null) {
  const [state, setState] = useState<DocumentDownloadState>({ status: "idle" });

  const prevPathRef = useRef<string | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const _doDownload = async (
    path: string,
    isMountedRef: { current: boolean }
  ) => {
    if (inFlightRef.current || !documentAttachmentQueue) return;

    setState({ status: "loading", localUri: null });

    const download = (async () => {
      try {
        const uri = await documentAttachmentQueue.ensureDownloaded(path);
        if (isMountedRef.current) {
          setState({ status: "ready", localUri: uri });
        }
      } catch (e) {
        console.error("[BlueBookDownload] Failed:", e);
        if (isMountedRef.current) {
          setState({ status: "error", localUri: null, message: (e as any)?.message ?? "Download failed" });
        }
      } finally {
        inFlightRef.current = null;
      }
    })();

    inFlightRef.current = download;
    await download;
  };

  useEffect(() => {
    if (!documentPath || !documentAttachmentQueue) {
      prevPathRef.current = null;
      inFlightRef.current = null;
      setState({ status: "idle" });
      return;
    }

    const isMountedRef = { current: true };
    const pathChanged = prevPathRef.current !== documentPath;
    prevPathRef.current = documentPath;

    const localUri = documentAttachmentQueue.getLocalUri(documentPath);

    const run = async () => {
      if (pathChanged) {
        inFlightRef.current = null;
        const prevUri = state.status === "cached" || state.status === "ready" ? state.localUri : null;
        if (prevUri && prevUri !== localUri) {
          FileSystem.deleteAsync(prevUri, { idempotent: true }).catch(() => {});
        }
      }

      if (inFlightRef.current) return;

      const isCachedOnDisk = await documentAttachmentQueue!.isDownloaded(documentPath);
      if (!isMountedRef.current) return;

      if (isCachedOnDisk && !pathChanged) {
        setState({ status: "cached", localUri });
        return;
      }

      const net = await NetInfo.fetch();
      const isWifi =
        net.type === "wifi" ||
        net.type === "ethernet" ||
        (net.type === "other" && net.isConnected);

      if (!isMountedRef.current) return;

      if (isWifi) {
        await _doDownload(documentPath, isMountedRef);
      } else {
        setState({ status: "waiting-for-wifi", localUri: null });
      }
    };

    run();

    return () => {
      isMountedRef.current = false;
    };
  }, [documentPath]);

  const download = async (): Promise<string | null> => {
    if (!documentPath || !documentAttachmentQueue) return null;

    const net = await NetInfo.fetch();
    const isConnected = net.isConnected;

    if (!isConnected) {
      Alert.alert("No connection", "Connect to the internet to download this document.");
      return null;
    }

    const isMountedRef = { current: true };
    await _doDownload(documentPath, isMountedRef);
    return documentAttachmentQueue.getLocalUri(documentPath);
  };

  const redownload = async (): Promise<string | null> => {
    if (!documentPath || !documentAttachmentQueue) return null;

    const net = await NetInfo.fetch();
    if (!net.isConnected) {
      Alert.alert("No connection", "Connect to the internet to refresh this document.");
      return null;
    }

    setState({ status: "loading", localUri: null });
    inFlightRef.current = null;

    try {
      const uri = await documentAttachmentQueue.redownload(documentPath);
      setState({ status: "ready", localUri: uri });
      return uri;
    } catch (e) {
      setState({ status: "error", localUri: null, message: (e as any)?.message ?? "Download failed" });
      return null;
    }
  };

  const localUri =
    state.status === "cached" || state.status === "ready" ? state.localUri : null;

  const isLoading = state.status === "loading";
  const isCached = state.status === "cached" || state.status === "ready";
  const isWaitingForWifi = state.status === "waiting-for-wifi";

  return { state, localUri, isLoading, isCached, isWaitingForWifi, download, redownload };
}