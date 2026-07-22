/**
 * Supabase Storage errors that mean the object is already in the bucket.
 * Treat as upload success so the queue does not spin.
 */
export function isAlreadyInStorageError(e: unknown): boolean {
  const msg =
    e instanceof Error
      ? `${e.name} ${e.message}`
      : typeof e === "string"
        ? e
        : JSON.stringify(e);
  return (
    /duplicate/i.test(msg) ||
    /already exists/i.test(msg) ||
    /resource already exists/i.test(msg) ||
    (typeof e === "object" &&
      e !== null &&
      "error" in e &&
      String((e as { error?: unknown }).error).toLowerCase() === "duplicate")
  );
}
