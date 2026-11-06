// AI-assisted: Used Claude to write this file.
import { describe, expect, it } from "vitest";

import { BURN_MS, burnPlan } from "../src/lib/burn-plan";

describe("burnPlan", () => {
  it("ends the burn exactly when the key is wiped", () => {
    const plan = burnPlan(60_000);
    expect(plan).toEqual({ wait: 60_000 - BURN_MS, ms: BURN_MS });
    expect(plan!.wait + plan!.ms).toBe(60_000);
  });

  it("runs a shorter burn when the page opens late", () => {
    expect(burnPlan(1500)).toEqual({ wait: 0, ms: 1500 });
  });

  it("skips the burn when there's no time left for it", () => {
    expect(burnPlan(200)).toBeNull();
    expect(burnPlan(0)).toBeNull();
    expect(burnPlan(-5000)).toBeNull();
  });
});
