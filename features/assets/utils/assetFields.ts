/**
 * Turning a bleacher row into the lines printed on the detail screen.
 *
 * Every function here answers the same two-part question: is there a value,
 * and what does it read like to a driver? "Not on file" is a real answer and
 * gets its own mark, so an empty field can never be mistaken for a zero.
 */

/** What the screen shows where the office has filled nothing in. */
export const NOT_ON_FILE = "—";

export function formatValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return NOT_ON_FILE;
  const text = String(value).trim();
  return text === "" ? NOT_ON_FILE : text;
}

/**
 * Hoisted, not rebuilt per call: constructing an `Intl.NumberFormat` is the
 * expensive half of formatting, and the detail screen formats a dozen fields.
 */
const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const INCHES_PER_FOOT = 12;
const METERS_PER_MILE = 1609.344;

export function formatGvwr(pounds: number | null | undefined): string {
  // A real bleacher has a rating. Zero is how "we never entered one" reaches
  // the app, and printing "0 lbs" would be a claim, not a gap.
  if (!pounds || pounds <= 0) return NOT_ON_FILE;
  return `${grouped.format(pounds)} lbs`;
}

export function formatLength(inches: number | null | undefined): string {
  if (!inches || inches <= 0) return NOT_ON_FILE;
  const whole = Math.round(inches);
  const feet = Math.floor(whole / INCHES_PER_FOOT);
  const remainder = whole % INCHES_PER_FOOT;
  return remainder === 0 ? `${feet}'` : `${feet}' ${remainder}"`;
}

export function formatDistance(meters: number | null | undefined): string {
  // Zero is a fact here, unlike above: a bleacher can genuinely have no
  // recorded haul, and "0 mi" is the honest way to say so.
  if (meters === null || meters === undefined) return NOT_ON_FILE;
  return `${grouped.format(Math.round(meters / METERS_PER_MILE))} mi`;
}
