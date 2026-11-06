# Why Arkiv

Enigma AI's promise is that results are deleted, and that the deletion is not something we merely say.

- **Deletion is enforced by the protocol, not by us.** An entity written with an expiry stops being
  queryable when that expiry passes. A company does not have to trust our cleanup job for the stored
  result; it can query Arkiv and see the entity is gone.
- **The expiry is on-chain and checkable.** We read the real `$expiresAt` back from the chain instead of
  assuming the requested TTL, so the countdown in the UI shows what the network will enforce.
- **It matches the product's shape.** A result is short-lived data with a chosen lifetime, from minutes
  to 30 days. Per-entity expiry is the primitive this needs; a general-purpose store makes us build it.
- **Pairs with key destruction.** Arkiv removes the stored ciphertext; our key store removes the key at
  the same moment. Either one alone already makes the result unreadable.

Without Arkiv we would need our own database plus a deletion job and a promise that it ran. With it, the
"forgets by design" claim for the stored result rests on a public network rather than on our word.
Limits are listed in `friction.md` and in the security notes (data is public until it expires, so it is
stored encrypted).
