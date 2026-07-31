/**
 * Whole calendar days remaining until `deadline` (ceil).
 * Returns 0 if deadline has passed or is invalid.
 */
export function daysUntil(deadline: string | Date, now: Date = new Date()): number {
  const end = deadline instanceof Date ? deadline : new Date(deadline);
  if (Number.isNaN(end.getTime())) return 0;

  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
