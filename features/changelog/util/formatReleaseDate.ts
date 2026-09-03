/**
 * Render a `YYYY-MM-DD` release date as prose.
 *
 * Parsed as UTC and formatted in UTC so a driver in a western timezone doesn't
 * see the day before the one written in the file.
 */
export function formatReleaseDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
