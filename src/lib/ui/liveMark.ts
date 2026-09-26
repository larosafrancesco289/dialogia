/**
 * One live mark, wherever it is drawn. Every live Ionic mark reads its place
 * in the loop from the same clock, so a mark that replaces another (the
 * reply's waiting mark becoming the reasoning line's) carries the gold voice
 * on instead of starting it over.
 */

/** The loop's length; `styles/logo.css` runs `logo-answer` for as long. */
const LIVE_CYCLE_MS = 3200;

/** The negative delay that puts a mark started now at the shared clock's phase. */
export function liveMarkPhase(now: number = performance.now()): string {
  return `${-(now % LIVE_CYCLE_MS)}ms`;
}
