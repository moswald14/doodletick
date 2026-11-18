# Dotlands saved rooms

Feature branch; not yet included in an installed Keeper release. The game source lives at https://github.com/moswald14/dotlands and its persistent service lives in this repository.

Open **Dotlands · saved rooms**, unlock your usual vault, and create a room or enter a friend's six-character code. Each human pays **1 private garden Doodle Coin once per room**, including the creator. Matured garden earnings are settled on entry. Returning with the same vault identity is free. Solo, pass & play and computer seats are free.

Everyone uses the same Keeper. Saved rooms and confirmed turns survive closing all browsers and restarting the service. The Keeper must be reachable to take a turn; it does not need any player to stay online. Visible games check every five seconds, use revision-only replies when unchanged, and stop checking while hidden or offline. Previous temporary browser-hosted rooms are not migrated.

Share the room code. Under Home Assistant ingress or localhost, invitation copying intentionally omits the current address. Friends must use their own authorized access to the same Keeper. Do not share an ingress session URL. The itch.io launcher accepts a normal HTTPS Keeper address and rejects session paths.

## Payments and recovery

The service reserves a seat durably before charging the garden. The garden records a permanent admission receipt keyed by identity and room. A lost response or a failed room write can replay the exact signed request without a second debit. Ambiguous errors retain the browser's pending request, including across reloads. The iframe receives game state only; the vault key stays in Keeper's parent page.

Back up the entire Keeper data directory while stopped. Keep the witness identity, `garden-ledger.json`, and `dotlands-rooms.json` together. Restore them together. Do not publish those files or `dotlands-rooms.json.next`. An invalid room signature disables saved rooms without replacing the file or blocking the rest of Keeper.

Saved storage is bounded to 200 rooms and 40 created rooms per identity. Full storage rejects new entries before charging. There is no automatic room expiry or deletion. A completed game remains available to its admitted players.

## Release validation

Run `node scripts/sync-ha.mjs`, `node scripts/check-repository.mjs`, and `node scripts/test.mjs` before release. Recovery tests cover real garden debits followed by failed room writes, concurrent joins, stale exact retries, reloads and server restarts.

Before deployment, finish a two-browser playtest with disposable identities, verify the phone layout and copy-code flow, and test reopening the game through authenticated Home Assistant ingress. Browser automation was unavailable during preparation; these live checks and the installed release remain pending. Integrate the latest shared Keeper release and update all release labels before packaging. Do not replace the parallel Telephone or Jazz candidates.
