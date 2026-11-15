# Dot Wave mushrooms in Doodle Tick 0.1b

Open **Mushroom garden**, unlock your creator vault and **Join this garden**. No extra player account is required. On Home Assistant, use HTTPS for signed garden operations. HTTP supports recipe previews and explains the remaining setup.

## Make and keep a mushroom

Use **New spore** and the four sound controls, or import a version-1 `.mushroom.json` recipe from Dot Wave Studio. Pure static and captured collisions are supported. Listening is quiet and explicit; imports never start audio. **Save Dot Wave recipe** creates an editable recipe Dot Wave can reopen. Motion preferences are retained, but Doodle Tick's preview does not run Auto-wander.

Planting registers a recipe on the selected Keeper with its creator credit. Its generator identity is derived from normalized sound settings, seed and captured source. A copied file, changed name, motion preference, listening gain or extra metadata does not create another generator. Each normalized recipe has at most one generator per garden. Registration identifies its holder, not a proven copyright owner.

## Earn, spend and trade

Each generator earns **one Doodle Coin per complete UTC hour owned**. A mushroom planted at 12:20 begins its first full hour at 13:00 and earns its first coin at 14:00. The shared Keeper calculates completed hours and stores paid-through counters, including time while browsers are closed. Collecting or a successful spending/listing action settles earnings. No cryptocurrency mining or background GPU work occurs.

- Send whole-number coins to another joined player using their garden address.
- Buy decorations: Golden ring (5), Spore lantern (12) and Moon halo (24). Decorations do not alter the earning rate.
- List a generator for a whole-number price. A sale atomically transfers the payment, generator and decorations. Completed seller earnings stay with the seller; the buyer receives future completed hours. The partial transfer hour is not paid twice.
- Save Keeper-signed receipts from Coin activity. A receipt verifies a historical action, not the current account balance.

All traders must select **the same shared garden Keeper**. The Home Assistant app can provide that always-on Keeper. Different Keepers have separate balances, and an address from another garden is rejected. Cross-computer access uses the private Tailscale network; this release does not automatically enroll devices or configure HTTPS.

Browsers sign actions with their existing creator keys. The Keeper checks signatures, sequences, recipients, prices and funds. A retry sends the same signed request and cannot charge twice; concurrent buyers cannot purchase one listing twice. Offline transfers are not finalized. After a network error, retry the pending action or inspect activity. Reloading discards an uncertain browser request, so inspect recent activity before repeating it manually.

## Authority, data and backups

Doodle Coins are a private game currency with no cash redemption, market-value guarantee or cross-Keeper exchange. The shared Keeper is the authority. Its operator controls the software, clock and backups; signatures do not make a malicious operator trustworthy. A backward clock cannot pay the same hours again, but a falsely advanced operator clock is not independently detected.

The Keeper stores recipes, credits, balances, ownership and recent activity in `garden-ledger.json` beside its `witness-key.json`. This data is readable by the operator. A browser retains its encrypted creator identity separately. The service returns the authenticated player's account and listed recipes; members can inspect listed recipes before purchase. Buying a generator does not transfer copyright, guarantee exclusivity or grant a Creative Commons license. Use Files & peers for licensed content distribution.

Keep both the encrypted browser vault backup and the Keeper data backup. Stop the Keeper before copying its data, or use Home Assistant's supported app backup. Restore the ledger with the original witness key. Mismatched or tampered ledgers fail closed. Restoring an older backup rolls back trades; never run two restored copies of one Keeper identity at once. A player's browser backup cannot replace the shared ledger.

Limits are 100 mushrooms per player, 1,000 players, 2,000 mushrooms per Keeper, 200 displayed market listings and 100,000 successful actions. The latest 2,000 activity receipts are retained; each account shows its last 30 matching receipts. Ownership and paid-hour counters persist beyond that history window. New identities and recipes can be freely created; no scarcity or anti-Sybil guarantee is made.

## Dot Wave compatibility and code provenance

The included `dot-effects-dsp.mjs`, `dot-amp-tone.mjs`, `dot-studio-dsp.mjs`, `dot-collision-audio.mjs`, `dot-wave-export.mjs`, `dot-mushroom-dsp.mjs` and `dot-mushroom-motion.mjs` come from Dot Wave Studio. They retain the original audio algorithms with a provenance comment and module filename adaptation. `mushroom-core.mjs` loads them in dependency order. `mushroom-art.mjs` adapts the original pixel mushroom into deterministic visual variations.

These included modules are published under this repository's GPLv3 license. That code license does not automatically apply to separately created recipe content, sound recordings or other Dot Wave Studio distributions. Preserve original creator credits when importing or sharing recipes.

Automated checks cover audio reproduction, normalized identity, hourly boundaries, persistence, duplicate protection, concurrent trades, coin conservation, failed writes and tampered storage. Physical multi-device VPN trading and HTTPS transactions on Home Assistant remain additional acceptance work. See the repository's validation and release notes for precise evidence.
