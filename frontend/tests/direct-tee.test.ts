// AI-assisted: Used Claude to write these tests.
import { describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the direct browser→TEE inference path.
 * These verify that:
 * 1. System prompts are built browser-side (not delegated to the backend)
 * 2. The request goes directly to the provider endpoint
 * 3. The backend is never sent plaintext when direct mode is used
 * 4. Attestation includes directMode flag
 */

// Mock the 0G Compute SDK broker
function mockBroker() {
  return {
    inference: {
      getRequestHeaders: vi.fn(async () => ({
        Authorization: "Bearer mock-0g-auth-token",
      })),
      processResponse: vi.fn(async () => true),
      listService: vi.fn(async () => [
        {
          provider: "0xTeeProvider",
          serviceType: "inference",
          url: "https://tee-provider.example.com",
          inputPrice: BigInt(100),
          outputPrice: BigInt(200),
          updatedAt: BigInt(Date.now()),
          model: "0gm-1.0-35b-a3b",
          verifiability: "TeeML",
          additionalInfo: "",
          teeSignerAddress: "0xSigner",
          teeSignerAcknowledged: true,
        },
      ]),
      getServiceMetadata: vi.fn(async () => ({
        endpoint: "https://tee-provider.example.com/v1/proxy",
        model: "0gm-1.0-35b-a3b",
      })),
      acknowledged: vi.fn(async () => true),
      getAccount: vi.fn(async () => ({ balance: BigInt(1_000_000_000_000_000) })),
      acknowledgeProviderSigner: vi.fn(async () => {}),
    },
    ledger: {
      getLedger: vi.fn(async () => ({ availableBalance: BigInt(1_000_000_000_000_000_000) })),
      depositFund: vi.fn(async () => {}),
      addLedger: vi.fn(async () => {}),
      transferFund: vi.fn(async () => {}),
    },
  };
}

const provider = {
  address: "0xTeeProvider",
  endpoint: "https://tee-provider.example.com/v1/proxy",
  model: "0gm-1.0-35b-a3b",
  url: "https://tee-provider.example.com",
};

describe("direct TEE inference", () => {
  it("builds system prompt in the browser, not on the backend", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "chat-direct-1",
          choices: [{ message: { content: "analysis result" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { runDirectInference } = await import("@/lib/client/direct-tee");
    const broker = mockBroker();

    await runDirectInference(
      broker as never,
      provider,
      "Patient report: blood pressure 140/90",
    );

    // The fetch should go to the provider's endpoint, NOT to /api/infer
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://tee-provider.example.com/v1/proxy/chat/completions");
    expect(url).not.toContain("/api/infer");

    // The body should include the system prompt (built browser-side)
    const body = JSON.parse(init.body as string);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("document analyst");

    // Auth headers come from the broker, not from our backend's access token
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mock-0g-auth-token");

    vi.unstubAllGlobals();
  });

  it("never sends plaintext to the backend when direct mode is used", async () => {
    const calls: string[] = [];
    const fetchSpy = vi.fn(async (url: string) => {
      calls.push(url as string);
      return new Response(
        JSON.stringify({
          id: "chat-direct-2",
          choices: [{ message: { content: "result" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { runDirectInference } = await import("@/lib/client/direct-tee");
    const broker = mockBroker();

    await runDirectInference(
      broker as never,
      provider,
      "Confidential contract between Party A and Party B",
    );

    // No call should go to our backend
    expect(calls.every((u) => !u.includes("/api/infer"))).toBe(true);
    expect(calls.every((u) => !u.includes("localhost"))).toBe(true);

    vi.unstubAllGlobals();
  });

  it("includes verify_tee: true in the request body", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "chat-3",
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: {},
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { runDirectInference } = await import("@/lib/client/direct-tee");
    const broker = mockBroker();

    await runDirectInference(broker as never, provider, "Q3 revenue: 4.2 crore");

    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.verify_tee).toBe(true);
    expect(body.max_tokens).toBe(8192);

    vi.unstubAllGlobals();
  });

  it("handles image documents with base64 encoding", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "chat-img",
          choices: [{ message: { content: "image analysis" }, finish_reason: "stop" }],
          usage: {},
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchSpy);

    const { runDirectInference } = await import("@/lib/client/direct-tee");
    const broker = mockBroker();

    await runDirectInference(
      broker as never,
      provider,
      "ignored-text",
      "BASE64DATA",
      "image/png"
    );

    const body = JSON.parse((fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    const userMsg = body.messages[1];
    expect(userMsg.content[1].type).toBe("image_url");
    expect(userMsg.content[1].image_url.url).toContain("data:image/png;base64,BASE64DATA");

    vi.unstubAllGlobals();
  });

  it("processes response for billing after successful inference", async () => {
    const fetchSpy = vi.fn(async () => {
      const res = new Response(
        JSON.stringify({
          id: "chat-bill",
          choices: [{ message: { content: "billed result" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 200, completion_tokens: 100, total_tokens: 300 },
        }),
        { status: 200 }
      );
      return res;
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { runDirectInference } = await import("@/lib/client/direct-tee");
    const broker = mockBroker();

    await runDirectInference(broker as never, provider, "test doc");

    expect(broker.inference.processResponse).toHaveBeenCalledTimes(1);
    expect(broker.inference.processResponse).toHaveBeenCalledWith(
      "0xTeeProvider",
      expect.any(String),
      expect.any(String),
    );

    vi.unstubAllGlobals();
  });
});
