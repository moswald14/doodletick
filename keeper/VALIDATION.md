# Validation — Doodle Tick 0.3b

The combined Keeper/Home Assistant suite passed **182/182**. This includes native signaling/transport fixtures, local route protections, preserved garden accounting, legacy and Keeper-only backup staging, ingress/HTTPS behavior, and 47 GPU/founder protocol/UI checks. An independent team review repeated the original 44 GPU/founder checks and reproduced/fixed a consent-withdrawal race; three additional checks cover public proof copying and clipboard fallback. This is bounded implementation review, not a security audit.

Actual Chrome WebGPU execution passed two shader self-tests, found the expected fixture nonce 5559 for difficulty 16, and produced SHA-256 `00004062061d99e4df2fd4123b18167566925f222214f696d45463e496957485`. Independent WebCrypto verification matched. It processed 8,192 candidates in about 608 ms on the owner's Windows computer (hardware inventory reports GTX 1080; the proof itself cannot establish hardware provenance). A second difficulty-24 run stopped on request after one batch, about 182 ms, without a proof result. No user founder keys or coins were created by these tests.

Actual native ArcadeLink connections in Chrome completed signed offer/answer exchange, produced matching spirographs, and delivered exact application messages in both directions after both confirmations. ICE-server lists were empty. A separate real PeerLink check transferred 65,537 exact bytes in five chunks, verified the signed Creative Commons record, received the storage acknowledgement and drained both channels. The fixture initially closed connections before its acknowledgement finished; correcting its teardown timing produced a clean pass without changing production code. These checks used two connections on one computer, not two physical devices or a cross-router test. One browser log contained an unassigned extension-style receiving-end error; application pairing and message checks completed successfully, and no matching extension API call exists in the inspected connection code.

The actual founder interface signed a disposable proposal and generated a GPU proof. After reload, Copy public proof exposed a 1,259-byte public record containing no private key, username, vault or password fields. Importing that record through the browser file chooser verified its signature and proof again while locked. The test identity was disposable and is not an official founder reference. Browser download completion was not confirmed; the copy/import path was verified instead.

Home Assistant Cloud HTTPS and the published 0.2b source installation were verified before the user changed the next release's network direction. The old Keeper is backed up offline and its identity staged for the Tailscale-free app. **The actual 0.3b repository update/start/migration is still pending at this source record.** Record live cutover and restart evidence separately before claiming completion.

The integrated standalone 0.3b app rendered its Coin navigation, locked-vault controls and direct-connection status without browser console warnings or errors.

The DVC page produces a prelaunch certificate only. No official founder reference, spendable DVC blockchain, production consensus, live public-wallet transaction or comprehensive security audit is established by these results. Physical multi-device reachability, relays, long-term uptime and complete backup restore remain additional work. The existing EVM contract implementation is unchanged from the 0.2b checks below.

## Archived 0.2b source record

The following is the evidence as recorded for 0.2b before its deployment transition. Historical pending statements are not current installation instructions.

### Validation — Doodle Tick 0.2b

This record separates current automated checks, observed deployment behavior and historical evidence. A passing local test does not verify every browser, Home Assistant installation, VPN or public blockchain.

## Current 0.2b evidence

- The final combined Keeper and Home Assistant suite passed **134 of 134 tests**. This includes private-garden signatures and accounting, optional mining, browser wallet/provider behavior, secure-context onboarding, ingress protections and migration fixtures.
- An independent team review repeated **22 public-provider/UI tests** and **10 contract tests** successfully, and passed the compiled-artifact equality check. The provider/UI checks overlap the combined suite; these counts are not additional unique tests.
- Public-contract checks run the compiled code in an offline EVM with disposable addresses. They cover registration reservation/reveal, ownership and limits, hourly claims, proof domains and replay, mining/supply caps, failed-operation rollback and 1,000 deterministic randomized harvest/transfer steps. Some cap cases explicitly seed near-limit storage. No public RPC, deployed garden or paid transaction is used by those tests.
- Public UI fixtures cover explicit wallet requests, exact contract-runtime checks, changed accounts/networks, failed and pending transactions, and mining cancellation, visibility and time limits. These fixtures do not replace a real injected-wallet browser check.
- A browser smoke check rendered both private and public garden modes without console errors. No real wallet transaction was approved in that check; transaction behavior was exercised through fixtures.
- A disposable Keeper migration rehearsal creates a signed witness receipt, a mushroom and earned coins, stops the source, stages/imports its data, then verifies the same witness, receipt count, signed balances, ownership and history after starting the target. Archive fixtures cover private-tree selection, unsafe paths, links, duplicate entries and completion markers. Restart tests prevent stale ledger/VPN re-import and reject existing target data. The VPN state in this rehearsal is an opaque dummy file.
- Home Assistant Cloud HTTPS was enabled with the owner's agreement and the actual Home Assistant frontend was successfully signed into over HTTPS. This verifies that frontend connection, not a completed 0.2b install, wallet transaction or migrated garden.

**The actual Home Assistant 0.2b repository installation and local-app migration have not yet been performed.** The migration tools and rollback guide are implemented and rehearsed with fixtures. Live cutover, retained VPN identity, signed garden operations after migration and restart verification remain deployment steps.

## Historical 0.1b baseline

The following checks belong to the archived 0.1b release. They are retained as evidence for that version and are not fresh 0.2b deployment results.

- All **82 combined Keeper and Home Assistant tests** passed for the numbered release. After the HTTP recipe-preview correction, all **14 targeted mushroom and ingress tests** passed again.
- The full RGB sequence was checked for range and uniqueness across the first two complete passes, with red/green endpoints, hour boundaries and compatibility with older signed records.
- Garden tests cover original Dot Wave audio, recipe normalization, hourly earnings, restart persistence, duplicate prevention, concurrent purchases, signed requests, idempotent payments, coin conservation, failed writes and tampered ledgers. Private routing tests use simulated adapters with real local HTTP.
- Ingress tests cover source restrictions, spoofed headers, protected mutations, relative frontend URLs, served assets, witness identity retention and signed garden operations.
- The extracted desktop release started independently, served all 40 published assets and the garden endpoint, and blocked private file paths. Archive contents and checksums were read back against source, with private runtime state excluded.
- The Home Assistant container built and ran on an actual **aarch64 Raspberry Pi**. An update and rebuild preserved the existing witness identity and receipt count. Its Web UI showed 0.1b, the garden and the corrected HTTPS explanation. The temporary installation helper and transfer services were stopped afterward.
- Browser checks with disposable players exercised planting, coin transfers, decorations, mushroom purchases, reload persistence, recipe import, a narrow layout and the red night theme. Recipe-export download completion was not captured by automation; format round-trips and original audio were checked programmatically.

## Not yet verified

Real multi-device VPN gameplay, file sharing and trading; Home Assistant HTTPS garden transactions; a complete Home Assistant backup restore; the actual 0.2b app migration/install; Raspberry Pi OS service installation and recovery; prolonged uptime, adversarial load and a comprehensive independent security audit remain unverified.

Public-mode deployment, registration, hourly claims, mining-proof submission and transfers with a real wallet on a real network remain untested. There is no shared deployed garden supplied by this release. Offline EVM success does not establish wallet compatibility, transaction inclusion/finality, economic value, liquidity or security against every attack. Private Keeper coins and public tokens have separate balances and no conversion or redemption mechanism.

An actual Home Assistant ARM64 deployment does not verify the separate Raspberry Pi OS installer. Simulated private adapters do not prove a physical VPN connection. Passing signature checks does not establish authorship, unique humans, independent time, honest operators or compliance with content licenses outside the app.

## Reproduce checks

From the repository root:

```sh
node scripts/sync-ha.mjs --check
node scripts/check-repository.mjs
node scripts/test.mjs
```

Use Node.js 24 and Python 3.11 or later for the full repository suite; Python is used by disposable backup-staging fixtures, not by the running Home Assistant app. Reproduce the offline contract checks separately:

```sh
cd contracts
npm ci --ignore-scripts
npm run check
npm test
```

See [contract verification details](../contracts/README.md), [HTTPS setup](../doodletick/HTTPS.md) and the [migration procedure](../doodletick/MIGRATION.md). A build-artifact equality check confirms correspondence to the pinned compiler inputs; it is not a contract security audit.

Use disposable identities, controlled fixtures and temporary data directories. Report commands, version or commit, observed results and untested steps. Keep keys, backups, authentication links, private deployment identifiers and personal logs out of public evidence.
