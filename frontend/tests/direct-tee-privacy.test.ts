// AI-assisted: Used Claude to write these tests.
//
// PRIVACY PROOF: verifies that when direct TEE mode (Path B) is active,
// the plaintext document NEVER reaches the backend. Every network request
// is intercepted and inspected — if any call to /api/infer contains the
// plaintext, the test fails.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SENSITIVE_DOCUMENT = "CONFIDENTIAL: Patient Jane Doe, SSN 123-45-6789, diagnosed with rare autoimmune disorder";
const TEE_PROVIDER_ENDPOINT = "https://tee-provider.0g.example/v1/proxy";

// ------------------------------------------------------------------ network spy
// Every fetch call is recorded with its URL and body, so we can audit
// exactly what went where.
interface NetworkCall {
  url: string;
  body: string | null;
  headers: Record<string, string>;
}

let networkLog: NetworkCall[] = [];

function spyOnAllFetch() {
  networkLog = [];
  const spy = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    const bodyStr = init?.body ? String(init.body) : null;
    const headers = (init?.headers ?? {}) as Record<string, string>;
    networkLog.push({ url: urlStr, body: bodyStr, headers });

    // Respond differently based on which endpoint was called
    if (urlStr.includes("/api/jobs") && init?.method === "POST" && !urlStr.includes("/result") && !urlStr.includes("/infer")) {
      // POST /api/jobs — create job
      return new Response(JSON.stringify({
        jobId: "42",
        createTxHash: "0xcreatetx",
        inputStorage: null,
        accessToken: "test-access-token",
      }), { status: 200 });
    }
    if (urlStr.includes("/api/infer")) {
      // This should NEVER be called in direct mode!
      return new Response(JSON.stringify({
        result: "LEAKED THROUGH BACKEND",
        chatId: "chat-leak",
        resultHash: "0xleak",
        attestationHash: "0xleak",
        provider: "backend-proxy",
        requestId: "leak",
      }), { status: 200 });
    }
    if (urlStr.includes(TEE_PROVIDER_ENDPOINT)) {
      // Direct TEE provider endpoint
      return new Response(JSON.stringify({
        id: "chat-direct-proof",
        choices: [{ message: { content: "TEE processed the document securely" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 200, completion_tokens: 50, total_tokens: 250 },
        x_0g_trace: { provider: "0xTeeProvider", request_id: "req-direct" },
      }), { status: 200 });
    }
    if (urlStr.includes("/api/jobs/") && urlStr.includes("/result")) {
      // POST /api/jobs/42/result — store encrypted result
      return new Response(JSON.stringify({
        completeTxHash: "0xcompletetx",
        arkivEntityKey: "0xarkiventity",
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      }), { status: 200 });
    }
    // Default
    return new Response("{}", { status: 200 });
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

// ------------------------------------------------------------------ mock vault
// The vault is browser-only (sessionStorage, Web Crypto). We mock it so runJob can run in Node.
vi.mock("@/lib/client/vault", () => ({
  hashText: (s: string) => {
    const { ethers } = require("ethers");
    return ethers.keccak256(ethers.toUtf8Bytes(s));
  },
  newJobKey: async () => ({ key: {}, keyId: "key-test" }),
  encryptText: async () => "encrypted-envelope-mock",
  storeKey: async () => {},
  storeToken: () => {},
  setKeyExpiry: () => {},
  loadKey: async () => null,
  loadToken: () => null,
  loadWipeReceipt: () => null,
  wipeKey: () => false,
  wipeAllKeys: () => {},
  wipeExpiredKeys: () => 0,
  hasKey: () => false,
  parseEnvelope: () => ({ ct: "" }),
  decryptEnvelope: async () => "",
}));

vi.mock("@/lib/auth-message", () => ({
  buildAuthMessage: () => "mock-auth-message",
}));

vi.mock("@/lib/client/chain", () => ({
  CHAIN_ID: 1874,
  ENIGMA_ADDRESS: "0xB4491c1eBE47447661B0e1266e19f3B2D32A226f",
  SERVICE_PAID: false,
}));

// ------------------------------------------------------------------ mock broker
function mockBroker() {
  return {
    inference: {
      getRequestHeaders: vi.fn(async () => ({
        Authorization: "Bearer 0g-compute-auth",
      })),
      processResponse: vi.fn(async () => true),
    },
    ledger: {},
  };
}

const teeProvider = {
  address: "0xTeeProvider",
  endpoint: TEE_PROVIDER_ENDPOINT,
  model: "0gm-1.0-35b-a3b",
  url: "https://tee-provider.0g.example",
};

// ------------------------------------------------------------------ tests

describe("PRIVACY PROOF: backend never receives plaintext in direct mode", () => {
  beforeEach(() => {
    spyOnAllFetch();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    networkLog = [];
  });

  it("Path B: plaintext is sent ONLY to the TEE provider, NEVER to /api/infer", async () => {
    const { runJob } = await import("@/components/app/jobs");
    const broker = mockBroker();

    await runJob(
      { ttl: 3600, fileName: "patient-report.txt", content: SENSITIVE_DOCUMENT },
      () => {},
      () => {},
      undefined, // no payer (service-paid mode or testing)
      { broker: broker as never, provider: teeProvider },
    );

    // --- AUDIT THE NETWORK LOG ---

    // 1. Find all calls that contain the sensitive document
    const callsWithPlaintext = networkLog.filter(
      (c) => c.body && c.body.includes(SENSITIVE_DOCUMENT)
    );

    // 2. The plaintext should appear in EXACTLY ONE call: to the TEE provider
    expect(callsWithPlaintext.length).toBe(1);
    expect(callsWithPlaintext[0].url).toContain(TEE_PROVIDER_ENDPOINT);

    // 3. NO call to /api/infer should exist at all
    const inferCalls = networkLog.filter((c) => c.url.includes("/api/infer"));
    expect(inferCalls).toHaveLength(0);

    // 4. The backend endpoints that WERE called should NOT contain plaintext
    const backendCalls = networkLog.filter((c) => c.url.includes("/api/"));
    for (const call of backendCalls) {
      expect(call.body ?? "").not.toContain(SENSITIVE_DOCUMENT);
      expect(call.body ?? "").not.toContain("Jane Doe");
      expect(call.body ?? "").not.toContain("123-45-6789");
      expect(call.body ?? "").not.toContain("autoimmune");
    }
  });

  it("Path B: the TEE provider receives the system prompt (built browser-side)", async () => {
    const { runJob } = await import("@/components/app/jobs");
    const broker = mockBroker();

    await runJob(
      { ttl: 3600, fileName: "report.txt", content: SENSITIVE_DOCUMENT },
      () => {},
      () => {},
      undefined,
      { broker: broker as never, provider: teeProvider },
    );

    const teeCalls = networkLog.filter((c) => c.url.includes(TEE_PROVIDER_ENDPOINT));
    expect(teeCalls).toHaveLength(1);

    const body = JSON.parse(teeCalls[0].body!);

    // System prompt was built in the browser, not by the backend
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toContain("document analyst");

    // The document content is in the user message
    expect(body.messages[1].role).toBe("user");
    expect(body.messages[1].content).toContain(SENSITIVE_DOCUMENT);

    // TEE verification is requested
    expect(body.verify_tee).toBe(true);
  });

  it("Path B: the TEE provider gets 0G Compute auth, NOT our backend's access token", async () => {
    const { runJob } = await import("@/components/app/jobs");
    const broker = mockBroker();

    await runJob(
      { ttl: 3600, fileName: "contract.txt", content: SENSITIVE_DOCUMENT },
      () => {},
      () => {},
      undefined,
      { broker: broker as never, provider: teeProvider },
    );

    const teeCalls = networkLog.filter((c) => c.url.includes(TEE_PROVIDER_ENDPOINT));
    expect(teeCalls[0].headers.Authorization).toBe("Bearer 0g-compute-auth");

    // The backend access token should NOT appear in the TEE call
    expect(teeCalls[0].headers["x-access-token"]).toBeUndefined();
  });

  it("Path A (fallback): plaintext IS sent to /api/infer when direct mode is off", async () => {
    const { runJob } = await import("@/components/app/jobs");

    await runJob(
      { ttl: 3600, fileName: "report.txt", content: SENSITIVE_DOCUMENT },
      () => {},
      () => {},
      undefined,
      // NO directTee config — falls back to Path A
    );

    // In Path A, /api/infer DOES receive the plaintext (this is the trust gap Path B closes)
    const inferCalls = networkLog.filter((c) => c.url.includes("/api/infer"));
    expect(inferCalls.length).toBeGreaterThan(0);

    const inferBody = inferCalls[0].body!;
    expect(inferBody).toContain(SENSITIVE_DOCUMENT);

    // No call goes to the TEE provider directly
    const teeCalls = networkLog.filter((c) => c.url.includes(TEE_PROVIDER_ENDPOINT));
    expect(teeCalls).toHaveLength(0);
  });

  it("Path B: the encrypted result sent to /api/jobs/42/result does NOT contain plaintext", async () => {
    const { runJob } = await import("@/components/app/jobs");
    const broker = mockBroker();

    await runJob(
      { ttl: 3600, fileName: "statement.txt", content: SENSITIVE_DOCUMENT },
      () => {},
      () => {},
      undefined,
      { broker: broker as never, provider: teeProvider },
    );

    // The result storage call should contain encrypted data, not plaintext
    const resultCalls = networkLog.filter((c) => c.url.includes("/result") && c.body);
    expect(resultCalls.length).toBeGreaterThan(0);

    for (const call of resultCalls) {
      expect(call.body!).not.toContain(SENSITIVE_DOCUMENT);
      expect(call.body!).not.toContain("Jane Doe");
      expect(call.body!).not.toContain("123-45-6789");
    }
  });
});
