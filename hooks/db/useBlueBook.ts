import { db, documentAttachmentQueue } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/library/powersync/typedQuery";
import { useEffect, useMemo, useState } from "react";

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
  | { status: "checking" }
  | { status: "cached"; localUri: string }
  | { status: "downloading" }
  | { status: "ready"; localUri: string }
  | { status: "error"; message: string };

/**
 * Manages the local cache state for a single BlueBook PDF.
 *
 * - On mount, checks if the file is already cached on disk.
 * - `download()` triggers a fetch from Supabase if not already cached.
 * - Returns a `localUri` (file:// path) once ready — pass to expo-sharing or IntentLauncher.
 */
export function useBlueBookDocument(documentPath: string | null) {
  const [state, setState] = useState<DocumentDownloadState>({ status: "idle" });

  // On mount (or when documentPath changes), check the cache.
  useEffect(() => {
    if (!documentPath || !documentAttachmentQueue) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "checking" });

    documentAttachmentQueue.isDownloaded(documentPath).then((cached) => {
      if (cancelled) return;
      if (cached) {
        const localUri = documentAttachmentQueue!.getLocalUri(documentPath);
        setState({ status: "cached", localUri });
      } else {
        setState({ status: "idle" });
      }
    });

    return () => { cancelled = true; };
  }, [documentPath]);

  /**
   * Trigger a download. If already cached this resolves immediately.
   * Returns the local file:// URI on success.
   */
  const download = async (): Promise<string | null> => {
    if (!documentPath || !documentAttachmentQueue) return null;

    setState({ status: "downloading" });
    try {
      const localUri = await documentAttachmentQueue.ensureDownloaded(documentPath);
      setState({ status: "ready", localUri });
      return localUri;
    } catch (err: any) {
      const message = err?.message ?? "Download failed";
      setState({ status: "error", message });
      return null;
    }
  };

  /**
   * Force a fresh download even if already cached (e.g. after an admin update).
   */
  const redownload = async (): Promise<string | null> => {
    if (!documentPath || !documentAttachmentQueue) return null;

    setState({ status: "downloading" });
    try {
      const localUri = await documentAttachmentQueue.redownload(documentPath);
      setState({ status: "ready", localUri });
      return localUri;
    } catch (err: any) {
      const message = err?.message ?? "Download failed";
      setState({ status: "error", message });
      return null;
    }
  };

  const localUri =
    state.status === "cached" || state.status === "ready" ? state.localUri : null;

  const isLoading = state.status === "checking" || state.status === "downloading";

  return { state, localUri, isLoading, download, redownload };
}
