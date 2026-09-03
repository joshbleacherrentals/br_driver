/** One release, as authored in `features/changelog/entries.json`. */
export type ChangeLogEntry = {
  version: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** Markdown body. */
  body_md: string;
};
