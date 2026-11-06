# Enigma AI

**Private AI with self-destructing data.**

> "What if AI could help you without remembering you?"

Enigma AI lets hospitals, law firms, and banks use AI on sensitive documents — with on-chain proof that everything was deleted after. The encryption key never leaves your browser.

## How It Works

1. **Encrypt** — Browser generates a one-time AES-256-GCM key and encrypts the document client-side (Web Crypto API)
2. **Upload** — Encrypted file sent to 0G Storage; the backend never sees the plaintext file
3. **Pay** — Credit deducted from prepaid USDT balance on Whitechain
4. **Process** — Plaintext forwarded to 0G Compute TEE (sealed hardware enclave) for AI analysis — the backend proxies it in transit, never stores or logs it
5. **Encrypt Result** — Browser encrypts the AI result with the same key (fresh nonce) and sends the ciphertext to the backend
6. **Store Result** — Backend stores the encrypted result on Arkiv with a self-destruct timer (5 min to 30 days)
7. **Receipt** — On-chain compliance receipt generated on Whitechain (tx hash, TEE attestation hash, result hash)
8. **Destroy** — Timer expires → browser wipes the key from sessionStorage → Arkiv drops the entity → ciphertext is cryptographically dead

## Zero-Storage Backend

The backend is a **zero-storage proxy**. It never holds encryption keys, never stores plaintext, and never logs document content.

- Encryption keys exist only in the browser's `sessionStorage`
- The backend forwards plaintext to 0G TEE in transit only (never written to disk)
- All stored data (0G Storage, Arkiv) is ciphertext the backend cannot read
- Error messages are scrubbed by `redact.ts` to prevent accidental plaintext leakage

See [docs/SECURITY.md](docs/SECURITY.md) for the full security model, trust assumptions, and limitations.

## Architecture

```
Browser (key lives here)
  ├─ encrypt file ──────→ Backend ──→ 0G Storage (ciphertext)
  ├─ send plaintext ────→ Backend ──→ 0G Compute TEE (transit only)
  ├─ encrypt result ────→ Backend ──→ Arkiv (ciphertext, TTL)
  └─ hashes ────────────→ Backend ──→ Whitechain (on-chain receipt)
```

| Layer | Technology |
|---|---|
| Frontend | Next.js + TailwindCSS |
| Client Encryption | Web Crypto API (AES-256-GCM) |
| Wallet | RainbowKit + wagmi |
| Payment | Whitechain Testnet (Chain ID: 1874) |
| File Storage | 0G Storage (decentralized) |
| AI Compute | 0G Compute TEE — `0gm-1.0-35b-a3b` (multimodal) |
| Result Storage | Arkiv Rabdi testnet (Chain ID: 7794095) |
| Smart Contract | Solidity (escrow, jobs, TEE verification) |

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/api/jobs` | Create job: accept `{encryptedFile, fileHash}`, return `{jobId, accessToken}` |
| `POST` | `/api/infer` | TEE proxy: forward plaintext to 0G, return `{result, resultHash, attestationHash}` |
| `POST` | `/api/jobs/:id/result` | Store result: accept `{encryptedResult}`, store on Arkiv, complete on-chain |
| `GET` | `/api/jobs/:id` | Get job: return ciphertext (requires `x-access-token` header) |
| `GET` | `/api/jobs/:id/receipt` | Get receipt: hashes, tx hashes, destruction status |
| `GET` | `/api/history?address=0x...` | Job history for a wallet |
| `GET` | `/api/balance?address=0x...` | Credit balance |

## AI Model

We use **0gm-1.0-35b-a3b** — 0G's own multimodal model running inside TEE hardware enclaves:
- **Input:** Text + Images (262K context window)
- **Privacy:** Processed inside Intel TDX sealed enclave — operator cannot see data
- **Attestation:** Cryptographic proof of private execution stored on-chain
- **Backup model:** Qwen3-VL-Plus (text + video + images)

We do NOT use centralized AI providers (OpenAI, Claude, etc.) — data never touches any company's servers.

## Sponsor Integration

| Sponsor | Prize | Integration |
|---|---|---|
| **0G** | $15,000 | Storage (encrypted files) + Compute TEE (inference) + 0G's own model |
| **Arkiv** | $4,000 | Expiring entities — protocol-enforced auto-deletion of encrypted results |
| **Whitechain** | $15,000 | USDT credits + escrow + on-chain compliance receipts |

All three sponsors are **core** to the architecture — remove any one and the project breaks.

## Project Structure

```
enigma-ai/
├── frontend/          # Next.js app (API routes, upload UI, dashboard, demo)
│   └── src/
│       ├── app/api/   # Backend API routes (zero-storage proxy)
│       └── lib/       # Shared modules (crypto, contract, arkiv, etc.)
├── contracts/         # Solidity smart contracts (Whitechain)
├── arkiv/             # Arkiv prize deliverables
├── docs/              # AI usage, security properties, attestation status
└── scripts/           # Deploy scripts, test scripts
```

## Running the app

```bash
cp .env.example .env          # fill in real values
cd frontend && ln -s ../.env .env
npm install && npm run dev
```

**Required environment variables:**
- `ZG_API_KEY` — 0G API key for inference
- `ORACLE_PRIVATE_KEY` — 32-byte hex key for EIP-712 signing
- `DEPLOYER_PRIVATE_KEY` — Funded wallet for Whitechain + Arkiv transactions
- `CONTRACT_ADDRESS` — Deployed EnigmaAI contract on Whitechain
- `ARKIV_ACCESS_KEY` — Arkiv Rabdi access key

Job metadata is kept in `frontend/.enigma-data/store.json` (git-ignored).

## Test Networks

| Network | Chain ID | RPC |
|---|---|---|
| 0G Testnet | 16602 | https://evmrpc-testnet.0g.ai |
| Whitechain Testnet | 1874 | https://rpc.ankr.com/whitechain_testnet |
| Arkiv Rabdi | 7794095 | https://rpc.rabdi.db-chain.testnet.arkiv.network |

**Faucets:**
- 0G: https://faucet.0g.ai (0.1 tokens/day)
- Google Cloud: https://cloud.google.com/application/web3/faucet/0g/galileo

## Team

| Member | Role |
|---|---|
| Dev Patel | Backend — 0G integration, Arkiv, API routes, zero-storage proxy |
| Parth Soni | Backend — Smart contract (escrow, TEE verification, lifecycle) |
| Dev Mondal | Frontend — Landing page, upload UI, client-side encryption, demo |
| Rudra Vable | Frontend — Dashboard, wallet connect, countdown timer |

## Built For

**ETHGlobal Mumbai 2026** — Nov 6–8, Jio World Convention Centre

## License

MIT
