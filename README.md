# Enigma AI

**Private AI with self-destructing data.**

> "What if AI could help you without remembering you?"

Enigma AI is a B2B API that lets hospitals, law firms, and banks use AI on sensitive documents — with on-chain proof that everything was deleted after.

## How It Works

1. **Upload** — Company sends a sensitive document via API
2. **Encrypt** — File encrypted client-side before leaving the device
3. **Store** — Encrypted file uploaded to 0G Storage (decentralized)
4. **Pay** — Credit deducted from prepaid USDT balance (Whitechain)
5. **Process** — AI analyzes the document inside a sealed hardware enclave (0G TEE) — nobody can see the data, not even the machine operator
6. **Store Result** — AI output stored in Arkiv with a self-destruct timer (5 min to 30 days)
7. **Receipt** — On-chain compliance receipt generated (tx hash, TEE attestation, expiry)
8. **Destroy** — Timer expires → data permanently erased. Nothing to breach or subpoena.

## Architecture

```
Browser → 0G Storage (encrypted files)
       → Whitechain (USDT payment + receipts)
       → 0G Compute TEE (private AI inference)
       → Arkiv (expiring result storage)
```

| Layer | Technology |
|---|---|
| Frontend | Next.js + TailwindCSS |
| Wallet | RainbowKit + wagmi |
| Payment | Whitechain Sepolia (Chain ID: 1874) |
| File Storage | 0G Storage (decentralized) |
| AI Compute | 0G Compute TEE — `0gm-1.0-35b-a3b` (multimodal) |
| Result Storage | Arkiv Kaolin testnet (Network ID: 60138453025) |
| Smart Contract | Solidity (escrow, jobs, TEE verification) |

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
| **0G** | $15,000 | Storage (files) + Compute TEE (inference) + 0G's own model |
| **Arkiv** | $15,000 | Expiring entities — protocol-enforced auto-deletion |
| **Whitechain** | $15,000 | USDT credits + escrow + on-chain compliance receipts |

All three sponsors are **core** to the architecture — remove any one and the project breaks.

## Project Structure

```
enigma-ai/
├── frontend/          # Next.js app (upload UI, dashboard, demo page)
├── contracts/         # Solidity smart contracts (Whitechain)
├── backend/           # API routes + 0G/Arkiv integration
├── scripts/           # Deploy scripts, test scripts
└── docs/              # Architecture docs, AI usage documentation
```

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Add your 0G API key, Whitechain RPC, Arkiv credentials

# Run development server
npm run dev
```

## Test Networks

| Network | Chain ID | RPC |
|---|---|---|
| 0G Testnet | 16602 | https://evmrpc-testnet.0g.ai |
| Whitechain Testnet | 1874 | https://rpc.ankr.com/whitechain_testnet |
| Arkiv Kaolin | 60138453025 | https://kaolin.hoodi.arkiv.network/rpc |

**Faucets:**
- 0G: https://faucet.0g.ai (0.1 tokens/day)
- Google Cloud: https://cloud.google.com/application/web3/faucet/0g/galileo

## Team

| Member | Role |
|---|---|
| Dev Patel | Backend — 0G integration, Arkiv, API routes |
| Parth Soni | Backend — Smart contract (escrow, TEE verification) |
| Dev Mondal | Frontend — Landing page, upload UI, demo page |
| Rudra Vable | Frontend — Dashboard, wallet connect, countdown timer |

## Built For

**ETHGlobal Mumbai 2026** — Nov 6–8, Jio World Convention Centre

## License

MIT
