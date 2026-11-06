# Privacy Roadmap — Eliminating Plaintext Transit

How Enigma AI protects documents in transit today, and how production eliminates the remaining trust gap.

## The problem

The browser holds the encryption key and all stored data (0G Storage, Arkiv) is ciphertext the backend cannot read. But during inference, the plaintext document passes through backend memory on its way to the 0G TEE. A compromised backend could capture it.

This document describes two paths: **Path A** (shipped, hackathon) and **Path B** (production roadmap).

## Path A — Private trust mode + auditable proxy (current)

Shipped in this build. Two changes narrow the trust gap:

### 1. `X-0G-Provider-Trust-Mode: private`

Every 0G inference request now includes this header. It restricts routing to **TeeML providers only** — Intel TDX enclaves where the model runs inside sealed hardware. If no TeeML provider is available, the request fails with a `503` (`no_provider_for_trust_mode`) rather than silently falling back to a non-TEE provider.

This means the plaintext, once it leaves the backend, enters a sealed enclave. The GPU operator, the 0G router, and the host machine cannot see it.

### 2. Auditable proxy pattern

The `/api/infer` route is structured as a trust-boundary proxy:

1. **Verify** — check the job exists, the access token is valid, and the document hash matches. This requires hashing the plaintext, so the backend must see it.
2. **Forward** — pass the plaintext to `runInference()`, which wraps it in the task-specific system prompt and sends it to 0G over TLS with `verify_tee: true` and `X-0G-Provider-Trust-Mode: private`.
3. **Discard** — the plaintext is never written to disk, logged, stored in the job record, or sent anywhere except the 0G endpoint. After the response returns, the request handler exits and the plaintext is garbage-collected.

The route file (`frontend/src/app/api/infer/route.ts`) carries audit comments marking the trust boundary. Anyone reviewing the code can verify that:
- The plaintext is received, hashed, forwarded to 0G, and discarded
- No `fs.write`, `console.log`, `store`, or other persistence touches it
- The `redact.ts` module scrubs any plaintext that might leak through error messages

### What Path A proves

| Property | Evidence |
|---|---|
| Only TeeML providers handle the request | `X-0G-Provider-Trust-Mode: private` header; 503 on fallback |
| Backend never stores plaintext | Code audit of `infer/route.ts` — no disk write, no log, no store |
| Backend never stores the key | Key exists only in browser `sessionStorage`; backend has no key field |
| Error messages are scrubbed | `redact.ts` strips content from all error responses |

### What Path A does NOT prove

- The backend **could** be modified to capture plaintext — it is a trust assumption, not a cryptographic guarantee
- The 0G Router itself handles plaintext in memory (zero-retention policy, but not verifiable from outside)

## Path B — Direct browser-to-TEE (production)

Eliminates the backend from the plaintext path entirely.

### How it works

0G offers an **Advanced/Direct mode** where a client connects directly to a TeeML provider, bypassing both our backend and the 0G Router:

```
Current (Path A):
  Browser → Backend (proxy) → 0G Router → TeeML Provider (TEE)
  
Production (Path B):
  Browser → TeeML Provider (TEE)   [direct, no intermediary]
  Backend → only handles: job creation, Arkiv storage, on-chain receipts
```

### Implementation steps

1. **Use `@0gfoundation/0g-compute-ts-sdk` in the browser.** The SDK supports wallet-based authentication and direct provider connections. The browser funds inference per-provider on-chain and sends requests directly.

2. **TLS terminates inside the TEE.** The provider's endpoint serves from within the Intel TDX enclave. The plaintext is encrypted in transit (TLS) and decrypted only inside the enclave. No intermediary sees it.

3. **Backend becomes metadata-only.** It handles:
   - Job creation on Whitechain (payment escrow)
   - Storing encrypted results on Arkiv (ciphertext only)
   - Oracle signing (attestation → on-chain receipt)
   - It never receives, proxies, or touches plaintext at all

4. **Verify the provider's TEE attestation from the browser.** The SDK's `verifyService()` checks the TEE signer address and Docker Compose hash against the on-chain `Service` contract. The browser can independently confirm the provider is running a genuine enclave.

### What Path B eliminates

| Trust gap | Path A | Path B |
|---|---|---|
| Backend sees plaintext in transit | Yes (in memory only) | **No** — backend never receives plaintext |
| 0G Router sees plaintext in memory | Yes (zero-retention) | **No** — browser connects directly to provider |
| Backend could be modified to capture data | Yes (code audit mitigates) | **No** — plaintext never reaches backend |

### What Path B still trusts

- Intel TDX hardware is secure (same as Path A)
- The provider's TEE implementation is correct (verifiable via attestation)
- The browser is not compromised (same as Path A)

### Blockers for Path B

1. **Browser SDK compatibility** — The `@0gfoundation/0g-compute-ts-sdk` is designed for Node.js. Browser bundling needs verification.
2. **Per-provider funding** — Direct mode requires on-chain funding per provider, adding UX complexity.
3. **System prompt injection** — The browser would build the full messages array, including the system prompt. A compromised browser could modify the prompt. (This is already true for the document itself, so the trust model doesn't change.)

## For judges

> "Today, our backend is an auditable proxy: it sees the plaintext in memory, hashes it for verification, forwards it to a TeeML enclave over TLS, and discards it. It never stores, logs, or persists the document. We enforce `private` trust mode so the request only reaches sealed hardware.
>
> In production, we eliminate the proxy entirely: the browser connects directly to the TEE provider using 0G's Direct mode SDK. The backend never touches plaintext at all — it only handles payment, encrypted storage, and on-chain receipts."
