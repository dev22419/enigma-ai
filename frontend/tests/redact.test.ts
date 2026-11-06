// AI-assisted: Used Claude to draft these tests
import { afterEach, describe, expect, it } from "vitest";
import { redact, safeErrorMessage } from "@/lib/redact";

const KEY = "0x" + "ab".repeat(32);

afterEach(() => {
  delete process.env.ZG_API_KEY;
  delete process.env.DEPLOYER_PRIVATE_KEY;
});

describe("redaction", () => {
  it("removes configured secrets wherever they appear, with or without 0x", () => {
    process.env.DEPLOYER_PRIVATE_KEY = KEY;
    process.env.ZG_API_KEY = "app-sk-test-1234567890";
    const msg = redact(`signer ${KEY} / ${KEY.slice(2)} failed for key app-sk-test-1234567890`);
    expect(msg).not.toContain("abab");
    expect(msg).not.toContain("app-sk-test");
  });

  it("removes bearer tokens, 32-byte hex and long base64 blobs", () => {
    const blob = Buffer.alloc(96, 7).toString("base64");
    const msg = redact(`Authorization: Bearer abc.DEF-123 body=${blob} key=${"cd".repeat(32)}`);
    expect(msg).not.toContain("abc.DEF-123");
    expect(msg).not.toContain(blob);
    expect(msg).not.toContain("cdcdcdcd");
  });

  it("keeps short, useful diagnostics", () => {
    expect(safeErrorMessage(new Error("0G inference failed: 429 rate limited"))).toBe("0G inference failed: 429 rate limited");
    expect(redact("job 12 reverted at 0x1CbD8308c5b76Ab724CE4143Fdc67811D44dFd5f")).toContain("job 12 reverted");
  });

  it("truncates long upstream bodies, so an echoed document cannot leak whole", () => {
    const echoed = "Patient John Doe, DOB 1980-01-01, diagnosis: ".repeat(40);
    const msg = safeErrorMessage(new Error(`0G inference failed: 400 ${echoed}`));
    expect(msg.length).toBeLessThanOrEqual(301);
    expect(msg.endsWith("…")).toBe(true);
  });

  it("handles non-Error values", () => {
    expect(safeErrorMessage(undefined)).toBe("Unknown error");
    expect(safeErrorMessage({ a: 1 })).toBe("Unknown error");
    expect(safeErrorMessage("plain string")).toBe("plain string");
  });
});
