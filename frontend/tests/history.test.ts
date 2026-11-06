import { describe, it, expect } from "vitest";
import { buildHistory } from "../src/lib/history";

describe("buildHistory", () => {
  it("returns empty array for first message in thread", () => {
    expect(buildHistory([], {}, () => undefined)).toEqual([]);
  });

  it("returns user+assistant pairs for prior turns", () => {
    const jobs = [
      { id: "1", fileName: "doc.txt", thread: "t1", createdAt: 100, ttl: 60, expiresAt: null, preview: false },
    ];
    const sent = { "1": { content: "Hello doc", label: "doc.txt", fileName: "doc.txt", task: "medical", ttl: 60, text: "", attachment: null } };
    const result = buildHistory(jobs, sent, (id) => id === "1" ? "Model reply" : undefined);
    expect(result).toEqual([
      { role: "user", content: "Hello doc" },
      { role: "assistant", content: "Model reply" },
    ]);
  });

  it("skips turns where assistant response is unavailable", () => {
    const jobs = [
      { id: "1", fileName: "doc.txt", thread: "t1", createdAt: 100, ttl: 60, expiresAt: null, preview: false },
      { id: "2", fileName: "doc2.txt", thread: "t1", createdAt: 200, ttl: 60, expiresAt: null, preview: false },
    ];
    const sent = {
      "1": { content: "First", label: "a", fileName: "a", task: "medical", ttl: 60, text: "", attachment: null },
      "2": { content: "Second", label: "b", fileName: "b", task: "medical", ttl: 60, text: "", attachment: null },
    };
    const result = buildHistory(jobs, sent, (id) => id === "2" ? "Reply 2" : undefined);
    expect(result).toEqual([
      { role: "user", content: "Second" },
      { role: "assistant", content: "Reply 2" },
    ]);
  });

  it("replaces image content with placeholder", () => {
    const jobs = [
      { id: "1", fileName: "scan.png", thread: "t1", createdAt: 100, ttl: 60, expiresAt: null, preview: false },
    ];
    const sent = {
      "1": { content: "base64data", label: "scan.png", fileName: "scan.png", task: "medical", ttl: 60, text: "", attachment: { name: "scan.png", content: "base64data", kind: "image" as const, bytes: 100 } },
    };
    const result = buildHistory(jobs, sent, () => "Reply");
    expect(result[0].content).toBe("[Image document attached]");
  });

  it("truncates oldest non-first turns when history exceeds budget", () => {
    const bigContent = "x".repeat(100_001);
    const jobs = [
      { id: "1", fileName: "a.txt", thread: "t1", createdAt: 100, ttl: 60, expiresAt: null, preview: false },
      { id: "2", fileName: "b.txt", thread: "t1", createdAt: 200, ttl: 60, expiresAt: null, preview: false },
      { id: "3", fileName: "c.txt", thread: "t1", createdAt: 300, ttl: 60, expiresAt: null, preview: false },
    ];
    const sent = {
      "1": { content: bigContent, label: "a", fileName: "a", task: "medical", ttl: 60, text: "", attachment: null },
      "2": { content: bigContent, label: "b", fileName: "b", task: "medical", ttl: 60, text: "", attachment: null },
      "3": { content: bigContent, label: "c", fileName: "c", task: "medical", ttl: 60, text: "", attachment: null },
    };
    const result = buildHistory(jobs, sent, () => "Reply", 200_000);
    expect(result.length).toBeLessThan(6);
    expect(result[0].content).toBe(bigContent);
  });
});
