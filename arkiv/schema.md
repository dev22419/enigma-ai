# Arkiv schema

Source of truth: `frontend/src/lib/arkiv.ts`. Network: Arkiv **Rabdi** testnet (chain id 7794095).

```ts
defineSchema("enigma-ai.results", {
  jobId: str().indexed(),   // the on-chain job id, as a string; the only way we look an entity up
  data:  bytes(),           // ciphertext from the browser's Web Crypto API (AES-256-GCM). Never plaintext.
});
```

One entity is written per completed job, by `POST /api/jobs/:id/result`, after the browser has encrypted the AI result client-side.

## What is inside `data`

Browser-generated AES-256-GCM ciphertext. The backend treats it as an opaque blob — it never decrypts, parses, or inspects the contents. The encryption key exists only in the browser's `sessionStorage` and is never sent to the server.

## Lifetime

`ExpirationTime.fromSeconds(n)` with `n` rounded **up** to a whole number of blocks. Arkiv enforces the
expiry itself. We read `$expiresAt` back from the chain and convert it with `getBlockTiming()`; the
browser uses that value as the key's TTL, so the key and the entity die together.

## Read path

`select({ $key, jobId, data, $expiresAt }).from(schema).where(eq("jobId", id))`. After expiry the query
returns nothing, which `scripts/smoke-arkiv.mts` checks end to end (needs a funded Rabdi key).

The backend returns the raw ciphertext to authorized callers (via `x-access-token` header). The browser decrypts it client-side with the key from `sessionStorage`.

## Visibility

Arkiv entities are public. That is why only ciphertext is ever written. The encryption key never leaves the browser, so even the backend operator cannot read the stored data.
