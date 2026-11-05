# Agent Rules — Enigma AI

## Git Rules

- **NEVER push directly to `master`.** Always create a feature branch and open a PR.
- **NEVER force push.** If your push is rejected, pull first and resolve conflicts.
- **NEVER amend commits that are already pushed.**
- **Do NOT add `Co-Authored-By: Claude` or any AI attribution to commit messages.** The user explicitly opted out of this for this repo.
- Commit messages follow: `<type>: <short description>` (feat, fix, contract, refactor, docs, test, chore).
- Commit frequently — ETHGlobal requires real commit history, not single-commit dumps.

## Branch Naming

```
<type>/<short-description>
```
Examples: `feat/0g-integration`, `contract/escrow-deploy`, `fix/timer-bug`

## PR Workflow

1. Create a branch from `master`
2. Make changes, commit with clear messages
3. Push branch, open PR with `gh pr create`
4. PR needs at least 1 approval before merge
5. Use squash-merge
6. Delete branch after merge

## Code Ownership (Don't Touch Other People's Code)

| Owner | Area | Directories |
|---|---|---|
| parth | Smart contracts | `contracts/` |
| dev (Dev Patel) | 0G + Arkiv + Backend API | `backend/` |
| Dev Mondal | Landing, upload, demo pages | `frontend/app/(marketing)/`, `frontend/app/upload/`, `frontend/app/demo/` |
| Rudra Vable | Dashboard, wallet, job pages | `frontend/app/dashboard/`, `frontend/app/job/` |
| shared | Config, types, shared utils | `frontend/lib/`, `types/`, root config files |

If you need to change files in someone else's area, **ask them first** via TeamBus `ask_teammate_agent`.

## Shared Interfaces

Before changing any of these, call `publish_contract` on TeamBus:
- Smart contract ABI (`contracts/abi/`)
- API route request/response types (`types/api.ts`)
- Shared constants (`lib/constants.ts`)
- Environment variable schema (`.env.example`)

## Testing

- Smart contracts: Hardhat tests must pass before PR
- Backend: Test API routes with curl or integration tests
- Frontend: Verify in browser, test mobile, no console errors
- Run the full build before opening a PR: `npm run build`

## Tech Stack (Don't Substitute)

| Decided | Don't Use Instead |
|---|---|
| Next.js App Router | Pages router, Vite, Remix |
| TailwindCSS | styled-components, CSS modules, MUI |
| ethers v6 | web3.js, viem directly (wagmi wraps viem) |
| RainbowKit + wagmi | ConnectKit, Web3Modal |
| Hardhat | Foundry, Truffle |
| `@0gfoundation/0g-compute-ts-sdk` | Old `@0glabs/0g-serving-broker` |

## AI Model

- Primary: `0gm-1.0-35b-a3b` (0G's own, multimodal, 262K ctx)
- Backup: `qwen3-vl-plus` (Alibaba, video+images, 262K ctx)
- API: `POST https://router-api.0g.ai/v1/chat/completions` with `verify_tee: true`
- TEE signature: `GET https://router-api.0g.ai/signature/{chat_id}`

## Networks

| Network | Chain ID | RPC |
|---|---|---|
| 0G Testnet | 16602 | https://evmrpc-testnet.0g.ai |
| Whitechain Testnet | 1874 | https://rpc.ankr.com/whitechain_testnet |
| Arkiv Kaolin | 60138453025 | https://kaolin.hoodi.arkiv.network/rpc |

## ETHGlobal Rules

- Code must start AFTER Nov 6, 2026 (event start). No pre-built code.
- AI usage must be documented per file where AI wrote significant portions.
- Real commit history required — no single-commit dumps.
- Max 3 partner prizes (we target: 0G, Arkiv, Whitechain).

## Security

- Never commit private keys, API keys, or secrets.
- Use `.env` for all secrets. `.env` is in `.gitignore`.
- Never log sensitive user data (medical records, legal docs).
- All file content must be encrypted client-side before upload.
