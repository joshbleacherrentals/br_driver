/**
 * Custom photo upload queue — public surface.
 *
 * Design doc: docs/custom-photo-upload-queue.en.md
 * Status: contract only, no implementation yet (see the individual modules).
 */

export * from "./backoff";
export * from "./banner";
export * from "./contentType";
export * from "./inspectionAnswers";
export * from "./photoRepair";
export * from "./problemReports";
export * from "./recovery";
export * from "./types";
export * from "./uploadProgress";
export * from "./uploadStatus";
export * from "./uploadSuccess";
export * from "./uploadTimeout";
export * from "./worker";

// Runtime glue (PowerSync + Supabase Storage wiring).
export * from "./runtime/applyPhotoRepair";
export * from "./runtime/foregroundRecovery";
export * from "./runtime/localFile";
export * from "./runtime/photoUploadService";
export * from "./runtime/recoveryStore";
export * from "./runtime/replaceDriverDocumentPhoto";
export * from "./runtime/requeuePhotoRows";
export * from "./runtime/saveToGallery";
export type { PhotoQueueTableName } from "./runtime/types";
