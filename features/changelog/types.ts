/** One release, as authored in `versions/<version>.md`. */
export type ChangeLogEntry = {
  version: string;
  /** `YYYY-MM-DD` from the file's frontmatter. */
  date: string;
  /** Markdown body, frontmatter stripped. */
  body_md: string;
};
