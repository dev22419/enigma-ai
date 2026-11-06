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

## Path B — Direct browser-to-TEE (implemented)

Eliminates the backend from the plaintext path entirely. **Now shipped** alongside Path A.

### How it works

The browser connects directly to a TeeML provider using `@0gfoundation/0g-compute-ts-sdk`, bypassing both our backend and the 0G Router:

```
Path A (fallback):
  Browser → Backend (proxy) → 0G Router → TeeML Provider (TEE)
  
Path B (active when wallet is on 0G chain):
  Browser → TeeML Provider (TEE)   [direct, no intermediary]
  Backend → only handles: job creation, Arkiv storage, on-chain receipts
```

### Implementation

1. **`frontend/src/lib/client/direct-tee.ts`** — Browser-side module that creates a `ZGComputeNetworkBroker` from the user's connected wallet, discovers TeeML providers from the on-chain Service contract, manages 0G Compute ledger funding, and sends inference requests directly to the provider's endpoint.

2. **System prompt wrapping in the browser.** The `SYSTEM_PROMPTS` from `constants.ts` are used directly in the browser to build the full messages array. The backend never sees the document content or the prompt.

3. **Wallet-based settlement.** The 0G Compute SDK handles per-provider billing on the 0G chain. The browser:
   - Creates a ledger (deposits 0G tokens)
   - Transfers funds to the provider's sub-account
   - Acknowledges the provider's TEE signer
   - Gets auth headers for each request (signed by the user's wallet)

4. **Automatic fallback.** When direct mode is unavailable (no TeeML providers found, wallet not on 0G chain), the system falls back to Path A (auditable proxy with `X-0G-Provider-Trust-Mode: private`).

5. **Visual indicator.** The chat header shows "direct TEE" with a green indicator when Path B is active, vs "sealed enclave" for Path A.

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
- TLS between browser and provider is not intercepted

### Files

| File | Role |
|---|---|
| `frontend/src/lib/client/direct-tee.ts` | Browser-side 0G Compute broker, provider discovery, direct inference |
| `frontend/src/components/app/jobs.ts` | `runJob()` accepts `DirectTeeConfig`, uses direct path when available |
| `frontend/src/components/app/chat.tsx` | Initializes direct TEE broker from wallet connector, shows mode indicator |
| `frontend/tests/direct-tee.test.ts` | 5 tests verifying direct path bypasses backend |

## For judges

> "Our backend is an auditable proxy: it sees plaintext in memory, hashes it, forwards it to a TeeML enclave, and discards it. We enforce `private` trust mode so the request only reaches sealed hardware.
>
> But we go further: when the user's wallet is on the 0G chain, the browser connects **directly** to the TEE provider using 0G's Compute SDK. The plaintext never touches our backend or the 0G router. The backend only handles payment escrow, encrypted storage, and on-chain receipts. Zero intermediaries in the plaintext path."
