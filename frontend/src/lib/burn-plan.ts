// AI-assisted: Used Claude to write this file.

/** How long the burn runs when there's time for all of it. */
export const BURN_MS = 2200;
const MIN_BURN_MS = 700;

/** The longest delay setTimeout can hold. A 30-day lifespan is longer than this. */
export const MAX_TIMER_MS = 2_147_483_647;

/**
 * When to start burning an answer so the fire ends as the key is wiped, and the text never outlives the key.
 * Returns null when too little time is left for it to read as a burn.
 */
export function burnPlan(leftMs: number): { wait: number; ms: number } | null {
  if (leftMs < MIN_BURN_MS) return null;
  const ms = Math.min(leftMs, BURN_MS);
  return { wait: leftMs - ms, ms };
}
