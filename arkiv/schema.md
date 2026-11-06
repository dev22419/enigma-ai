# Arkiv schema

Source of truth: `frontend/src/lib/arkiv.ts`. Network: Arkiv **Rabdi** testnet (chain id 7794095).

```ts
defineSchema("enigma-ai.results", {
  jobId: str().indexed(),   // the on-chain job id, as a string; the only way we look an entity up
  data:  bytes(),           // UTF-8 JSON of an AES-256-GCM envelope. Never plaintext.
});
```

One entity is written per completed job, by `POST /api/jobs`, after the result has been encrypted.

## What is inside `data`
```json
{ "version": 1, "algorithm": "AES-256-GCM", "keyId": "key-...", "nonce": "<b64, 12 bytes>",
  "ciphertext": "<b64>", "tag": "<b64, 16 bytes>", "aad": { "jobId": "42", "objectType": "result" } }
```
The key lives only in the backend key store and is destroyed at expiry. Without it the entity is noise.

## Lifetime
`ExpirationTime.fromSeconds(n)` with `n` rounded **up** to a whole number of blocks. Arkiv enforces the
expiry itself. We read `$expiresAt` back from the chain and convert it with `getBlockTiming()`; the key
store uses that value as the key's expiry, so the key and the entity die together.

## Read path
`select({ $key, jobId, data, $expiresAt }).from(schema).where(eq("jobId", id))`. After expiry the query
returns nothing, which `scripts/smoke-arkiv.mts` checks end to end (needs a funded Rabdi key).

## Visibility
Arkiv entities are public. That is why only ciphertext is ever written.
