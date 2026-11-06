// AI-assisted: Used Claude to write these tests.
import { afterEach, describe, expect, it, vi } from "vitest";

// constants.ts reads ZG_MODEL and ZG_FALLBACK_MODEL when it is first imported, so each test loads a fresh copy.
async function load(env: Record<string, string> = {}) {
  vi.resetModules();
  process.env.ZG_API_KEY = "zg-test-key-0123456789";
  delete process.env.ZG_MODEL;
  delete process.env.ZG_FALLBACK_MODEL;
  Object.assign(process.env, env);
  return import("@/lib/og-inference");
}

const answer = () =>
  new Response(JSON.stringify({ id: "chat-1", choices: [{ message: { content: "answer" }, finish_reason: "stop" }], x_0g_trace: { provider: "0xprovider", request_id: "req-1" } }), { status: 200 });
const down = () => new Response('{"error":{"type":"upstream_error"}}', { status: 502 });
const badRequest = () => new Response('{"error":"bad request"}', { status: 400 });

function fetchSequence(...responses: Response[]) {
  const f = vi.fn(async (url: string, init?: RequestInit) => {
    void url;
    void init;
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return next;
  });
  vi.stubGlobal("fetch", f);
  return f;
}
const modelsAsked = (f: ReturnType<typeof fetchSequence>) => f.mock.calls.map((c) => JSON.parse(String(c[1]?.body)).model);

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ZG_MODEL;
  delete process.env.ZG_FALLBACK_MODEL;
});

describe("model choice", () => {
  it("sends X-0G-Provider-Trust-Mode: private on every request", async () => {
    const { runInference } = await load();
    const f = fetchSequence(answer());
    await runInference("medical", "document text");
    const headers = f.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers["X-0G-Provider-Trust-Mode"]).toBe("private");
  });

  it("uses 0G's own model by default and records it", async () => {
    const { runInference } = await load();
    const f = fetchSequence(answer());
    const r = await runInference("medical", "document text");
    expect(modelsAsked(f)).toEqual(["0gm-1.0-35b-a3b"]);
    expect(r.model).toBe("0gm-1.0-35b-a3b");
  });

  it("uses the model set in ZG_MODEL", async () => {
    const { runInference } = await load({ ZG_MODEL: "glm-5.3" });
    const f = fetchSequence(answer());
    expect((await runInference("legal", "text")).model).toBe("glm-5.3");
    expect(modelsAsked(f)).toEqual(["glm-5.3"]);
  });

  it("never falls back unless a fallback is configured", async () => {
    const { runInference } = await load();
    const f = fetchSequence(down());
    await expect(runInference("medical", "text")).rejects.toThrow("0G inference failed: 502");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("falls back to the configured model when the provider is down, and says which one answered", async () => {
    const { runInference } = await load({ ZG_FALLBACK_MODEL: "glm-5.3" });
    const f = fetchSequence(down(), answer());
    const r = await runInference("medical", "text");
    expect(modelsAsked(f)).toEqual(["0gm-1.0-35b-a3b", "glm-5.3"]);
    expect(r).toMatchObject({ model: "glm-5.3", content: "answer", provider: "0xprovider", requestId: "req-1" });
  });

  it("does not fall back on a request error, which would fail on the other model too", async () => {
    const { runInference } = await load({ ZG_FALLBACK_MODEL: "glm-5.3" });
    const f = fetchSequence(badRequest());
    await expect(runInference("medical", "text")).rejects.toThrow("400");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("never sends an image to the fallback", async () => {
    const { runInference } = await load({ ZG_FALLBACK_MODEL: "glm-5.3" });
    const f = fetchSequence(down());
    await expect(runInference("medical", "ignored", "BASE64DATA", "image/png")).rejects.toThrow("502");
    expect(modelsAsked(f)).toEqual(["0gm-1.0-35b-a3b"]);
  });

  it("reports the last error when both models are down", async () => {
    const { runInference } = await load({ ZG_FALLBACK_MODEL: "glm-5.3" });
    const f = fetchSequence(down(), down());
    await expect(runInference("medical", "text")).rejects.toThrow("0G inference failed: 502");
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("records the model that answered in the attestation", async () => {
    const { getTeeAttestation } = await load({ ZG_FALLBACK_MODEL: "glm-5.3" });
    const a = JSON.parse(await getTeeAttestation("chat-1", "0xprovider", "req-1", "glm-5.3"));
    expect(a).toMatchObject({ chatId: "chat-1", provider: "0xprovider", requestId: "req-1", verifyTee: true, model: "glm-5.3" });
  });
});

describe("a note beside an image", () => {
  const sentText = (f: ReturnType<typeof fetchSequence>) => JSON.parse(String(f.mock.calls[0][1]?.body)).messages[1].content[0].text;

  it("reaches the model with the image", async () => {
    const { runInference } = await load();
    const f = fetchSequence(answer());
    await runInference("medical", "aGk=", "aGk=", "image/png", "Is this dose normal?");
    expect(sentText(f)).toContain("Is this dose normal?");
  });

  it("leaves the prompt alone when there is no note", async () => {
    const { runInference } = await load();
    const f = fetchSequence(answer());
    await runInference("medical", "aGk=", "aGk=");
    expect(sentText(f)).toBe("Analyze this document:");
  });
});

describe("image notes in the job content", () => {
  it("round-trips, and the image comes back clean", async () => {
    const { splitImageNote, withImageNote } = await import("@/lib/image-note");
    expect(splitImageNote(withImageNote("aGk=", "line one\nline two"))).toEqual({ image: "aGk=", note: "line one\nline two" });
  });

  it("changes nothing for an image with no note", async () => {
    const { splitImageNote, withImageNote } = await import("@/lib/image-note");
    expect(withImageNote("aGk=", "")).toBe("aGk=");
    expect(splitImageNote("aGk=")).toEqual({ image: "aGk=" });
  });
});
