/**
 * Keeping `WorkTrackerInspections.answers_json` in step with `InspectionPhotos`.
 *
 * An inspection is rendered from its `answers_json` blob, not from the photo
 * table — each photo question carries the list of `storage_path`s that belong to
 * it. The `InspectionPhotos` rows are what the upload queue works on. The two
 * therefore have to move together: a repair that deletes a row without pruning
 * the JSON leaves a dangling path the summary tries to render, and one that
 * inserts a row without appending to the JSON produces a photo the driver can
 * never see — which, from their side, looks exactly like the data loss this
 * queue exists to prevent.
 *
 * Reusing a row is the safe case and needs nothing here: the repair keeps the
 * row's `storage_path`, so every reference to it stays correct.
 *
 * Pure — parses, rewrites and re-serialises; the DB read/write lives in the
 * runtime layer.
 */

type AnswerEntry = {
  question_type?: string;
  photos?: { storage_path: string }[];
  [key: string]: unknown;
};

type AnswersMap = Record<string, AnswerEntry>;

function parse(answersJson: string | null): AnswersMap | null {
  if (!answersJson) return null;
  try {
    const parsed = JSON.parse(answersJson);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as AnswersMap;
  } catch {
    return null;
  }
}

/**
 * The question id that owns `storagePath`, or `null` if no question lists it.
 * Used to decide where extra repair photos should be attached — they belong
 * with the photos they are replacing, not in an arbitrary question.
 */
export function findQuestionForPhoto(
  answersJson: string | null,
  storagePath: string,
): string | null {
  const answers = parse(answersJson);
  if (!answers) return null;

  for (const [questionId, entry] of Object.entries(answers)) {
    if (entry?.photos?.some((photo) => photo?.storage_path === storagePath)) {
      return questionId;
    }
  }
  return null;
}

/** First question that accepts photos — fallback when no owner is identifiable. */
export function firstPhotoQuestion(answersJson: string | null): string | null {
  const answers = parse(answersJson);
  if (!answers) return null;

  for (const [questionId, entry] of Object.entries(answers)) {
    if (entry?.question_type === "photo") return questionId;
  }
  return null;
}

export type AnswerPhotoChanges = {
  /** `storage_path`s whose rows are being deleted — prune them. */
  removedPaths?: readonly string[];
  /** New `storage_path`s to append, keyed by the question they belong to. */
  addedPathsByQuestion?: Readonly<Record<string, readonly string[]>>;
};

/**
 * Applies photo additions/removals to the answers blob and returns the new JSON
 * string, or `null` when nothing changed (or the blob is unusable — a malformed
 * blob is left exactly as it was rather than being replaced with a guess).
 */
export function applyPhotoChangesToAnswers(
  answersJson: string | null,
  changes: AnswerPhotoChanges,
): string | null {
  const answers = parse(answersJson);
  if (!answers) return null;

  const removed = new Set(changes.removedPaths ?? []);
  const added = changes.addedPathsByQuestion ?? {};
  let changed = false;

  const next: AnswersMap = {};

  for (const [questionId, entry] of Object.entries(answers)) {
    const photos = entry?.photos;
    const additions = added[questionId] ?? [];

    if (!Array.isArray(photos) && additions.length === 0) {
      next[questionId] = entry;
      continue;
    }

    const kept = (photos ?? []).filter(
      (photo) => !removed.has(photo?.storage_path),
    );
    if (kept.length !== (photos ?? []).length) {
      changed = true;
    }

    const appended = additions.map((storage_path) => ({ storage_path }));
    if (appended.length > 0) {
      changed = true;
    }

    next[questionId] = { ...entry, photos: [...kept, ...appended] };
  }

  return changed ? JSON.stringify(next) : null;
}
