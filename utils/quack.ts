/**
 * The odds behind the Pay Breakdown easter egg.
 *
 * Split out from the component so it can be tested without pulling in
 * `expo-audio` and `react-native-svg`, and so the one number that decides how
 * often the duck appears has an obvious home.
 */

/**
 * How often the duck shows up: one sheet open in twenty.
 *
 * High enough that a driver who checks their pay daily meets it within a couple
 * of weeks, low enough that it never reads as part of the UI.
 */
export const QUACK_CHANCE = 0.05;

/** One roll. Called once per sheet mount — never during a render loop. */
export function rollForQuack(random: () => number = Math.random): boolean {
  return random() < QUACK_CHANCE;
}
