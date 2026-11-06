# How we use Arkiv

1. **Write** (`storeInArkiv`, called from `POST /api/jobs`): after 0G returns a TEE-verified result, the
   backend encrypts it with the job's one-time key, wraps it in an envelope, and creates one entity
   (`enigma-ai.results`) with an expiry equal to the job's TTL (rounded up to whole blocks). The writer is
   the backend wallet; the SDK client is created with the Rabdi chain and an access key.
2. **Learn the real expiry**: the create call returns `expiresAt` as a block height. We convert it to unix
   time with the chain's block timing and store it as the key's expiry.
3. **Read** (`fetchFromArkiv`, used by `GET /api/jobs/:id`): look the entity up by `jobId`. If the key is
   still alive the backend decrypts and returns the result; if the key is gone the response still shows
   the ciphertext preview (it is public anyway) but no result.
4. **Expire**: Arkiv drops the entity; the 3-second worker destroys the key and signs a destruction
   receipt. The demo page shows both: the ciphertext query going empty and the key state flipping.

Configuration: `ARKIV_ACCESS_KEY` and the funded writer key (`DEPLOYER_PRIVATE_KEY`) in `.env`.
Check it works with `npx tsx scripts/smoke-arkiv.mts 60` from `frontend/`.
