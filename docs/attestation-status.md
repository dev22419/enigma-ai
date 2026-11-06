# What our "TEE attestation" is, and is not

Checked live on 2026-11-06 against `router-api.0g.ai` with our API key and `verify_tee: true`.

## What 0G actually returns
A normal chat completion plus a trace block:

- body: `id`, `x_0g_trace.provider` (the serving provider's address), `x_0g_trace.request_id`, `x_0g_trace.billing`
- headers: `x-provider`, `x-request-id`, `x-0g-e2ee`

There is **no enclave signature or attestation report** in the response.

## The signature endpoint
`GET /signature/{chat_id}` and `GET /v1/signature/{chat_id}` both returned **404 (route not found)**, for a chat
id from a call made minutes earlier. That is why `getTeeAttestation` no longer fetches one.

## What the backend does instead
`getTeeAttestation` (frontend/src/lib/og-inference.ts) builds a JSON record locally:
`{chatId, provider, requestId, verifyTee, model, timestamp}`. Its hash is the `attestationHash` the oracle signs
and the contract stores.

## What that means
- It **does** bind the result to a specific 0G request and provider, on-chain, and it is what the oracle vouches for.
- It is **not** independent proof that the inference ran inside a TEE. Nobody can verify an enclave signature
  from it, and the timestamp is ours, not 0G's.
- The trust assumption is therefore: 0G's router served the request as it says, and our backend and oracle report it
  honestly. That is what the contract's NatSpec already says ("does not verify TEE attestations on-chain").

## Suggested wording for judges
"We record which provider served each request and commit to it on-chain. Independent verification of the enclave
signature is not exposed by the router API today; we have not claimed it."

## Open question
Whether the `@0gfoundation/0g-compute-ts-sdk` path (listed in the stack) exposes a verifiable signature. Not
investigated yet.
