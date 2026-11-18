# Dotlands saved rooms

Feature branch integrated with Keeper 0.17b; not yet included in an installed Keeper release. The game source lives at https://github.com/moswald14/dotlands and its persistent service lives in this repository.

Open **Dotlands · saved rooms**, unlock your usual vault, and create a room or enter a friend's six-character code. Each human pays **1 private garden Doodle Coin once per room**, including the creator. Matured garden earnings are settled on entry. Returning with the same vault identity is free. Solo, pass & play and computer seats are free.

Everyone uses the same Keeper. Saved rooms and confirmed turns survive closing all browsers and restarting the service. The Keeper must be reachable to take a turn; it does not need any player to stay online. Visible games check every five seconds, use revision-only replies when unchanged, and stop checking while hidden or offline. Previous temporary browser-hosted rooms are not migrated.

Share the room code. Under Home Assistant ingress or localhost, invitation copying intentionally omits the current address. Friends must use their own authorized access to the same Keeper. Do not share an ingress session URL. The itch.io launcher accepts a normal HTTPS Keeper address and rejects session paths.

## Payments and recovery

The service reserves a seat durably before charging the garden. The garden records a permanent admission receipt keyed by identity and room. A lost response or a failed room write can replay the exact signed request without a second debit. Ambiguous errors retain the browser's pending request, including across reloads. The iframe receives game state only; the vault key stays in Keeper's parent page.

Back up the entire Keeper data directory while stopped. Keep the witness identity, `garden-ledger.json`, and `dotlands-rooms.json` together. Restore them together. Do not publish those files or `dotlands-rooms.json.next`. An invalid room signature disables saved rooms without replacing the file or blocking the rest of Keeper.

Saved storage is bounded to 200 rooms and 40 created rooms per identity. Full storage rejects new entries before charging. There is no automatic room expiry or deletion. A completed game remains available to its admitted players.

## Release validation

Run `node scripts/sync-ha.mjs`, `node scripts/check-repository.mjs`, and `node scripts/test.mjs` before release. Recovery tests cover real garden debits followed by failed room writes, concurrent joins, stale exact retries, reloads and server restarts.

Validation on November 18, 2026: all 1,118 tests passed against the integrated 0.17b source with four test processes at a time. The gateway tests use real signed requests, independently earned garden coins, two players, turns, full Keeper and gateway restart, and free return with unchanged balances and admission receipts.

Chrome and the in-app browser completed paid create/join, maximum-army attrition, copy-code, play after the host closed, and reopening after both browsers closed. The returned map matched all 36 displayed tile labels. The game board and turn controls fit a 390 by 844 browser viewport. These are browser tests, not physical-phone tests.

The live installed Home Assistant update still needs verification. Assign a new release version and preserve later shared changes before packaging; do not replace published 0.17b artifacts.
