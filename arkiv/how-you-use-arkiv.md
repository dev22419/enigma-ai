# How we use Arkiv

1. **Browser encrypts the AI result** using Web Crypto API (AES-256-GCM) with a per-job key that never
   leaves the browser. The ciphertext is sent to the backend via `POST /api/jobs/:id/result`.
2. **Backend stores the ciphertext** (`storeInArkiv`): creates one entity (`enigma-ai.results`) with an
   expiry equal to the job's TTL (rounded up to whole blocks). The backend never sees the encryption key
   and cannot read the data it stores. The writer is the backend wallet; the SDK client is created with
   the Rabdi chain and an access key.
3. **Learn the real expiry**: the create call returns `expiresAt` as a block height. We convert it to unix
   time with the chain's block timing and return it to the browser so the countdown timer is accurate.
4. **Read** (`fetchFromArkiv`, used by `GET /api/jobs/:id`): look the entity up by `jobId`. The backend
   returns the raw ciphertext to the browser (gated by a per-job access token). The browser decrypts it
   client-side with its local key.
5. **Expire**: Arkiv drops the entity. The browser's TTL timer wipes the key from `sessionStorage` at the
   same moment. The demo page shows both: the ciphertext query going empty and the decryption failing.

## Zero-storage backend

The backend is a **zero-storage proxy**. It forwards ciphertext to Arkiv and retrieves it on request, but
it never holds the encryption key. This means:

- The backend operator cannot read stored results, even from server logs or database dumps.
- Compromising the backend does not compromise past results.
- The "forgets by design" guarantee rests on the browser wiping the key, not on the backend.

Configuration: `ARKIV_ACCESS_KEY` and the funded writer key (`DEPLOYER_PRIVATE_KEY`) in `.env`.
Check it works with `npx tsx scripts/smoke-arkiv.mts 60` from `frontend/`.
