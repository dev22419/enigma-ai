# Security Properties & Limitations

How Enigma AI protects sensitive documents, what we prove, and what we trust.

## Architecture: zero-storage proxy

The backend is a **zero-storage proxy**. It never holds encryption keys, never stores plaintext, and never logs document content. All encryption and decryption happens in the browser using the Web Crypto API.

```
Browser                          Backend (proxy)                  External
───────                          ───────────────                  ────────
1. Generate AES-256-GCM key
2. Encrypt file → ciphertext
3. Hash plaintext → fileHash
4. Send {ciphertext, fileHash} ──→ createJob(fileHash) ─────────→ Whitechain
                                   store ciphertext ────────────→ 0G Storage
                                   ← {jobId, accessToken}
5. Send {plaintext, taskType} ───→ forward to 0G ──────────────→ 0G TEE
                                   ← {result, hashes}
                                   (plaintext held in memory only,
                                    never written to disk or logs)
6. Encrypt result → ciphertext
7. Send {ciphertext, hashes} ────→ store ciphertext ────────────→ Arkiv
                                   sign + complete ─────────────→ Whitechain
                                   ← {completeTxHash, expiresAt}
8. On TTL expiry:
   Wipe key from sessionStorage   (cannot help — no key)          Arkiv drops entity
```

## What we prove

| Property | How |
|---|---|
| **AI ran inside a TEE** | 0G Compute returns `x_0g_trace` with `provider` and `request_id`. We hash the attestation and store it on-chain. |
| **Result matches what the AI returned** | `resultHash = keccak256(result)` is stored on-chain before the result is encrypted. |
| **Input matches what was uploaded** | `fileHash = keccak256(plaintext)` is computed in the browser and passed to the contract. |
| **Result was deleted on schedule** | Arkiv enforces entity expiry at the protocol level. The browser wipes the key at the same time. |
| **Payment was fair** | Whitechain escrow locks payment on `createJob` and releases on `completeJob`. Failed jobs are refunded after timeout. |

## What we trust

| Component | Trust assumption | What breaks if it's compromised |
|---|---|---|
| **Browser** | The user's browser is not compromised | An attacker with browser access can read the key from `sessionStorage` |
| **0G TEE** | Intel TDX enclave is secure; 0G's TEE implementation is correct | An attacker who breaks the TEE can read plaintext during inference |
| **Backend (transit)** | The backend does not log or persist the plaintext it forwards to 0G | A malicious backend operator could capture plaintext in transit to the TEE |
| **TLS** | HTTPS between browser ↔ backend ↔ 0G is not intercepted | MITM can read plaintext in transit |
| **Arkiv** | Arkiv actually drops entities after expiry | Stale ciphertext persists (but is unreadable without the key) |
| **Whitechain** | The chain is live and the contract is correct | Payments could be stuck or receipts could be forged |

## What the backend never has

- Encryption keys (generated in the browser, stored in `sessionStorage`, never sent to the server)
- Decrypted results (the backend returns raw ciphertext from Arkiv; the browser decrypts)
- Decrypted files (the browser encrypts before upload; the backend stores the ciphertext blob)

The backend holds plaintext **only during the TEE proxy call** (`POST /api/infer`), in memory, for the duration of the 0G API request. It is never written to disk, logged, or stored in the job record. The `redact.ts` module scrubs any plaintext that might leak via error messages.

## Key lifecycle

1. **Generation:** Browser generates an AES-256-GCM key via `crypto.subtle.generateKey()`.
2. **Storage:** Key is exported and stored in the browser's `sessionStorage` (per-tab, not shared across tabs).
3. **Use:** Key encrypts the file before upload and the AI result after inference. Each operation uses a fresh 12-byte nonce.
4. **Destruction:** When the TTL expires, the browser's countdown timer removes the key from `sessionStorage` and nullifies the `CryptoKey` object. The key is gone forever.
5. **Verification:** After destruction, the browser generates a destruction receipt and sends it to the backend for on-chain anchoring.

## What remains after expiry

| Store | After key destruction | After Arkiv expiry |
|---|---|---|
| **Browser sessionStorage** | Key deleted | N/A |
| **0G Storage** | Encrypted file (ciphertext, undecryptable) | Still there (0G Storage does not expire) |
| **Arkiv** | Encrypted result (ciphertext, undecryptable) | Entity dropped by protocol |
| **Whitechain** | Hashes only (fileHash, resultHash, attestationHash) | Permanent (compliance record) |
| **Backend store.json** | Job metadata only (no keys, no plaintext) | Permanent (local record) |

## Known limitations

1. **Plaintext transits the backend.** During `POST /api/infer`, the plaintext document passes through backend memory on its way to the 0G TEE. A compromised backend could capture it. This is the main trust gap.
2. **sessionStorage is per-tab.** If the user closes the tab, the key is lost immediately — they cannot decrypt the result even before the TTL expires. This is by design (fail-closed), but it means the user must keep the tab open.
3. **No forward secrecy.** If an attacker captures the ciphertext from 0G Storage or Arkiv and later obtains the key (before destruction), they can decrypt. The security relies on the key being destroyed on schedule.
4. **Single-browser key custody.** The key exists in exactly one browser tab. There is no key backup, no recovery, and no multi-device access. Losing the tab means losing access.
5. **TEE trust.** We trust that 0G's TEE implementation is correct and that Intel TDX is not broken. We verify the attestation hash on-chain, but we cannot independently audit the enclave.
6. **Demo-grade infrastructure.** All three chains (0G, Whitechain, Arkiv) are testnets. In production, mainnet security guarantees would be stronger.
