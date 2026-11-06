# Arkiv reach

How Enigma AI extends what Arkiv can do, and who it reaches.

## New use case: compliance-grade self-destructing AI results

Before Enigma AI, Arkiv's expiring entities were a storage primitive. We turn them into a
**compliance tool**: hospitals, law firms, and banks can prove to regulators that sensitive AI results
were deleted on schedule, because the deletion is enforced by Arkiv's protocol, not by a cleanup script.

## Who this reaches

| Audience | How Arkiv reaches them through Enigma AI |
|---|---|
| **Healthcare providers** | HIPAA requires data retention limits. Arkiv's protocol-enforced expiry gives auditable proof of deletion — not a promise, a chain event. |
| **Legal firms** | Client confidentiality rules (ABA Model Rule 1.6) require secure disposal. Arkiv entities expire without human intervention. |
| **Financial institutions** | SOX, GDPR Article 17 (right to erasure). Arkiv's on-chain expiry is verifiable by external auditors. |
| **Compliance officers** | They need to show regulators a deletion log. Arkiv's `$expiresAt` is public and checkable — no internal system to trust. |
| **Web3 developers** | Enigma AI demonstrates a production pattern: expiring entities for any application that handles sensitive data with a shelf life. |

## What we prove

1. **Expiry works at scale.** We create entities with TTLs from 5 minutes to 30 days and verify they disappear (`scripts/smoke-arkiv.mts`).
2. **Public storage is safe for sensitive data** — when the data is encrypted client-side and the key is destroyed independently.
3. **Block-based expiry converts cleanly to wall-clock time** using `getBlockTiming()`, so UIs can show accurate countdowns.

## Numbers

- Entities created per job: 1
- Average entity size: 2–50 KB (encrypted AI analysis of a document)
- TTL range tested: 60 seconds to 30 days
- Networks used: Rabdi testnet (chain 7794095)
