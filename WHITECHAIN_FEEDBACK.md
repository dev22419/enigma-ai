# Whitechain Feedback — Enigma AI

Feedback from integrating Whitechain testnet into Enigma AI for ETHGlobal Mumbai 2026.

## What we built on Whitechain

Enigma AI uses Whitechain testnet (chain ID 1874) for:

1. **USDT escrow** — Companies prepay credits via `deposit()`. Each job locks the query price (`500000` = 0.50 USDT) from their balance.
2. **Job lifecycle** — `createJob()` locks payment, `completeJob()` releases it with oracle-signed proof of AI execution, `refundJob()` returns payment if the job times out.
3. **On-chain compliance receipts** — Every completed job stores `resultHash`, `attestationHash`, and `fileHash` on-chain, giving companies an auditable record that the AI ran inside a TEE and the result was stored with a self-destruct timer.
4. **EIP-712 oracle signing** — Domain-separated signatures (chainId 1874 + contract address) prevent replay across chains.

**Contract:** [`0x1CbD8308c5b76Ab724CE4143Fdc67811D44dFd5f`](https://testnet.whitescan.org/address/0x1CbD8308c5b76Ab724CE4143Fdc67811D44dFd5f)

## What worked well

- **Fast block times.** Job creation and completion confirm in seconds, which makes the demo flow feel instant.
- **Stable RPC.** `https://rpc.ankr.com/whitechain_testnet` was reliable throughout development. No dropped connections or rate limits during testing.
- **EVM compatibility.** ethers v6 worked out of the box. No chain-specific quirks in contract deployment or transaction signing.
- **Low gas costs.** Even complex transactions (EIP-712 signature verification in `completeJob`) cost negligible gas on testnet.

## What was tricky

1. **No public faucet found.** We did not find a Whitechain testnet faucet. We funded wallets by transferring between team accounts. A public faucet (like 0G's) would lower the barrier for hackathon teams.
2. **Limited block explorer.** Contract verification on the testnet explorer required manual steps. Etherscan-style auto-verification (via Hardhat plugin) would save time.
3. **Mock USDT.** Real USDT does not exist on Whitechain testnet, so we deployed a mock ERC20 (`0x7103Cd54837A2E086A2e131617d5D249cc9B7044`). This is fine for a hackathon, but documentation on official test tokens would help.
4. **`eth_getLogs` range limits.** The RPC rejects `eth_getLogs` over wide block ranges, so our history endpoint scans the job table directly instead of using event logs. This works but is slower for large job counts.

## What we'd want for production

- **Mainnet USDT support.** Real USDT on Whitechain mainnet for actual payments.
- **Subgraph / indexer.** So we can query job history by wallet address without scanning every job ID.
- **Faucet for testnet.** Especially for hackathons where multiple team members need funded wallets.

## Team

| Member | Whitechain work |
|---|---|
| Parth Soni | Smart contract development, deployment, Hardhat config |
| Dev Patel | Backend integration (ethers v6), oracle signing, refund worker |

## Why Whitechain

Whitechain is the settlement layer for Enigma AI. Every job creates an on-chain receipt — `fileHash` (what was uploaded), `resultHash` (what the AI returned), `attestationHash` (proof of TEE execution). Companies can point regulators at these receipts as proof that:

1. The AI ran inside a sealed enclave (TEE attestation).
2. The result was stored with a self-destruct timer (Arkiv entity).
3. The payment was escrowed and released only after verified completion.

This is not a token project — Whitechain is the compliance backbone.
