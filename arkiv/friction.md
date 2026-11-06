# Friction we hit with Arkiv

Compiled from our integration history (`git log -- frontend/src/lib/arkiv.ts`) and the code. Dev Patel did
the first integration, so please add firsthand notes here.

1. **Network moved under us.** Kaolin was retired (May 2026); we had to move to Rabdi (chain 7794095).
   Older docs, and our own README table, still named Kaolin.
2. **Wrong option name.** The expiry is not an `expiresIn` field; it is an `ExpirationTime` value built
   with helpers such as `fromSeconds`, `fromHours`, `fromDays`.
3. **Expiry is a block height, not a timestamp.** Our first read path returned `Number($expiresAt)` as if it
   were unix time, so any countdown built on it was wrong. We now read `$expiresAt` and convert it with
   `getBlockTiming()`.
4. **Coarse units made lifetimes inaccurate.** The first write path rounded a TTL up to whole days
   (`fromDays`) or whole minutes (`fromMinutes`), so a 25-hour request lived two days. We now use
   `fromSeconds`, which only accepts a whole number of blocks, so the TTL is rounded up to a multiple of the
   block duration. Rounding down would delete early.
5. **Funded key and access key needed.** Writes need a wallet funded from the Arkiv faucet plus an access
   key, which adds setup steps before the first test run.
6. **Entities are public.** Fine for the product (we store ciphertext), but it rules out putting
   anything readable in an entity, and it means we cannot rely on Arkiv for confidentiality.
7. **Value comes back as raw bytes.** Reading `data` gives a `Uint8Array` (or a hex string, depending on
   path), so the read helper handles both before parsing the envelope JSON.
