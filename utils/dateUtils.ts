/**
 * Parse a date string (YYYY-MM-DD) as a local date without timezone conversion
 */
export function parseLocalDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date string with ordinal suffix (e.g., "Thu, Dec 5th")
 */
export function formatDateWithOrdinal(dateISO?: string | null): string {
  if (!dateISO) return "";

  const d = parseLocalDate(dateISO);
  const dayNum = d.getDate();

  const ord = (n: number) => {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return (s as any)[(v - 20) % 10] || (s as any)[v] || s[0];
  };

  const weekday = d.toLocaleDateString(undefined, { weekday: "short" });
  const monthName = d.toLocaleDateString(undefined, { month: "short" });

  return `${weekday}, ${monthName} ${dayNum}${ord(dayNum)}`;
}

/**
 * Get today's date at midnight (local time)
 */
export function getTodayAtMidnight(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}
