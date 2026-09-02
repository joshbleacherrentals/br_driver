/**
 * Split a `versions/<version>.md` file into its frontmatter date and its body.
 *
 * The web app reads a release date out of the `ChangeLog` table. The driver app
 * has no such table synced — the notes ship inside the JS bundle so they can be
 * read offline — so the date is written into the file itself:
 *
 *     ---
 *     date: 2026-09-02
 *     ---
 *
 *     ### 🆕 What changed
 *
 * Anything other than that one key is ignored, and a file with no frontmatter
 * parses to a null date rather than throwing.
 */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;
const DATE_LINE = /^date:\s*(\d{4}-\d{2}-\d{2})\s*$/m;

export type ParsedVersionFile = {
  /** `YYYY-MM-DD`, or null when absent or malformed. */
  date: string | null;
  /** The markdown below the frontmatter, trimmed. */
  body: string;
};

export function parseVersionFile(contents: string): ParsedVersionFile {
  const match = FRONTMATTER.exec(contents);

  if (!match) return { date: null, body: contents.trim() };

  const date = DATE_LINE.exec(match[1])?.[1] ?? null;
  return {
    date: isRealDate(date) ? date : null,
    body: contents.slice(match[0].length).trim(),
  };
}

/** Rejects shapes that pass the regex but are not days, e.g. 2026-13-40. */
function isRealDate(date: string | null): boolean {
  if (!date) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date)
  );
}
