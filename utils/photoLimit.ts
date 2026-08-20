/**
 * The hard cap on how many photos one photo set may carry, and the driver-facing
 * copy that explains it.
 *
 * Lives in the global `utils/` rather than inside `features/damage-report/`
 * because two surfaces enforce the same cap: the damage-report form
 * (`features/damage-report/components/DamageDetailsForm.tsx`) and the inspection
 * photo questions rendered by the shared `components/widgets/inspection.tsx`.
 * A shared widget importing a feature-scoped util is backwards, so the rule the
 * project states — code used by 2+ features is global — decides where it sits.
 *
 * Thirty is well past what a real set needs (a handful of angles per damage
 * point, a few shots per inspection question), and it is the number the
 * prep/upload pipeline is comfortable with: a submit writes every photo to disk
 * and queues every photo for the bucket before the driver is free again, so an
 * unbounded selection is a phone-storage and battery problem long before it is
 * a data problem.
 *
 * The cap is enforced on *adding*. Reports created before it existed can hold
 * more, and nothing here deletes or hides those — see `describePhotoLimit`.
 */
export const MAX_PHOTOS = 30;

/**
 * What is holding the photos, in the two grammatical forms the copy needs.
 *
 * Two fields rather than one because the same noun appears both after "per"
 * ("Maximum 30 photos per report.") and at the head of a sentence, where it
 * needs its article ("An inspection question can hold up to 30 photos."), and
 * deriving the article from the noun is guesswork this does not need to do.
 */
export type PhotoLimitSubject = {
  /** Bare noun, used after "per". */
  noun: string;
  /** The same thing with its article, used to open a sentence. */
  sentenceNoun: string;
};

export const DAMAGE_REPORT_PHOTO_SUBJECT: PhotoLimitSubject = {
  noun: "report",
  sentenceNoun: "A damage report",
};

export const INSPECTION_QUESTION_PHOTO_SUBJECT: PhotoLimitSubject = {
  noun: "question",
  sentenceNoun: "An inspection question",
};

export type PhotoLimitState = {
  max: number;
  current: number;
  /**
   * How many more photos may be added. Clamped at zero, so a legacy set already
   * over the cap reports "no headroom" rather than a negative number that would
   * flow into a picker's `selectionLimit` or an array `slice`.
   */
  remaining: number;
  /** No headroom left — the add controls must be unavailable. */
  atLimit: boolean;
  /** Driver-facing explanation of the block. `null` while there is headroom. */
  notice: string | null;
  /** What is holding the photos, so the alert copy can name it. */
  subject: PhotoLimitSubject;
};

export type PhotoLimitAlert = { title: string; message: string };

/**
 * Everything the UI needs to know about the cap for a given photo count.
 *
 * Deliberately tolerant of `current > max`: an older report may already exceed
 * the cap, and that must read as "you cannot add more", never as broken UI or a
 * reason to drop photos.
 */
export function describePhotoLimit(
  current: number,
  max: number = MAX_PHOTOS,
  subject: PhotoLimitSubject = DAMAGE_REPORT_PHOTO_SUBJECT,
): PhotoLimitState {
  const remaining = Math.max(0, max - current);
  const atLimit = remaining === 0;

  return {
    max,
    current,
    remaining,
    atLimit,
    subject,
    notice: atLimit
      ? `Maximum ${max} photos per ${subject.noun}. Remove a photo if you need to add a different one.`
      : null,
  };
}

/** Alert copy for a tap on an add control that has no headroom behind it. */
export function photoLimitReachedAlert(limit: PhotoLimitState): PhotoLimitAlert {
  return {
    title: "Photo limit reached",
    message:
      `${limit.subject.sentenceNoun} can hold up to ${limit.max} photos. ` +
      `Remove a photo if you need to add a different one.`,
  };
}

/**
 * Alert copy for a multi-select that came back larger than the headroom left.
 *
 * The picker is asked for at most `remaining` photos, so this is the fallback
 * for platforms that do not honour a selection limit. Silently keeping the
 * first few would leave the driver believing photos were attached that were
 * not, so the shortfall is always named.
 */
export function photoSelectionTrimmedAlert(
  kept: number,
  dropped: number,
  limit: PhotoLimitState,
): PhotoLimitAlert {
  return {
    title: "Some photos were not added",
    message:
      `${limit.subject.sentenceNoun} can hold up to ${limit.max} photos. ` +
      `${kept} photo${kept === 1 ? "" : "s"} ${kept === 1 ? "was" : "were"} added and ` +
      `${dropped} ${dropped === 1 ? "was" : "were"} left out. ` +
      `Remove photos you no longer need, then add the rest.`,
  };
}

/**
 * What a picker result may actually contribute to a set with `limit.remaining`
 * slots left, and the alert owed to the driver when some of it is refused.
 *
 * Shared by the damage-report form and the inspection photo questions: both
 * hand the picker their headroom as `selectionLimit` and both still have to
 * cope with a platform picker that ignored it, so the trim-and-explain decision
 * belongs in one tested place rather than in each caller.
 */
export function admitPickedPhotos<T>(
  picked: T[],
  limit: PhotoLimitState,
): { kept: T[]; dropped: number; alert: PhotoLimitAlert | null } {
  const kept = picked.slice(0, limit.remaining);
  const dropped = picked.length - kept.length;

  return {
    kept,
    dropped,
    alert:
      dropped > 0
        ? photoSelectionTrimmedAlert(kept.length, dropped, limit)
        : null,
  };
}
