// AI-assisted: Used Claude for these frontend logic tests
import { describe, expect, it } from "vitest";
import { expiryOf, hasHash, phaseOf, short } from "@/lib/client/api";
import { countdownTone, formatLeft } from "@/components/countdown";

const now = () => Math.floor(Date.now() / 1000);
const job = (over = {}) => ({ status: "Completed", keyDestroyed: false, expiresAt: null, completedAt: 0, expirySeconds: 300, ...over });

describe("phaseOf", () => {
  it("is live until the expiry passes", () => {
    expect(phaseOf(job({ expiresAt: now() + 60 }))).toBe("live");
    expect(phaseOf(job({ expiresAt: now() - 60 }))).toBe("expired");
  });
  it("falls back to on-chain timing when no expiry is stored", () => {
    expect(phaseOf(job({ completedAt: now() - 10 }))).toBe("live");
    expect(phaseOf(job({ completedAt: now() - 400 }))).toBe("expired");
  });
  it("trusts a destroyed key over the clock", () => {
    expect(phaseOf(job({ keyDestroyed: true, expiresAt: now() + 60 }))).toBe("destroyed");
  });
  it("reads running and failed jobs from their status", () => {
    expect(phaseOf(job({ status: "Pending" }))).toBe("running");
    expect(phaseOf(job({ status: "Processing" }))).toBe("running");
    expect(phaseOf(job({ status: "Refunded" }))).toBe("failed");
    expect(phaseOf(job({ status: "Failed" }))).toBe("failed");
  });
});

describe("countdown", () => {
  it("goes green, amber, red", () => {
    expect(countdownTone(0.8)).toBe("green");
    expect(countdownTone(0.4)).toBe("amber");
    expect(countdownTone(0.1)).toBe("red");
  });
  it("formats minutes, hours and days", () => {
    expect(formatLeft(65)).toBe("01:05");
    expect(formatLeft(3661)).toBe("01:01:01");
    expect(formatLeft(90000)).toBe("1d 01h");
    expect(formatLeft(-5)).toBe("00:00");
  });
});

describe("helpers", () => {
  it("computes expiry from either source", () => {
    expect(expiryOf({ expiresAt: 500, completedAt: 100, expirySeconds: 60 })).toBe(500);
    expect(expiryOf({ expiresAt: null, completedAt: 100, expirySeconds: 60 })).toBe(160);
    expect(expiryOf({ expiresAt: null, completedAt: 0, expirySeconds: 60 })).toBeNull();
  });
  it("treats the zero hash as no hash", () => {
    expect(hasHash(`0x${"0".repeat(64)}`)).toBe(false);
    expect(hasHash("0xabc")).toBe(true);
  });
  it("shortens long values only", () => {
    expect(short("abc")).toBe("abc");
    expect(short(null)).toBe("None");
    expect(short("0x1234567890abcdef1234")).toBe("0x123456…ef1234");
  });
});
