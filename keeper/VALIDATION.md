# Validation — Doodle Tick 0.6b

## Native DVC source verification · 2026-11-16

The native network is implemented with a fixed 21-million cap, disclosed one-million founder allocation, signed native payments and independent work validation. This report describes the checked source and local evidence; GitHub publication and Home Assistant installation are separate deployment steps.

| Check | Observed evidence |
| --- | --- |
| Complete app suite | **423/423 passed**, zero failures or skips, including the existing 287 checks and 136 native DVC checks. |
| Native consensus | 17 checks: real disposable signatures and proof of work, fixed genesis, exact shapes, supply, fees, maturity, nonce/overspend, algorithm binding, retarget and forks. |
| Native node and HTTP | 14 node and 7 HTTP checks: replay/restart, malformed complete records, incomplete-write recovery, storage faults, serialized conflicts, pending reservations, reorgs, bounds and origin restrictions. Normal-extension replay and transaction indexing are checked for linear validation work. |
| Wallet and native UI | 19 wallet and 41 UI checks with controlled providers/DOM and real disposable signatures; independent core validation of both algorithms, exact receipt matching, explicit review, stale-result cancellation and no automatic wallet or GPU actions. |
| Miner logic | 20 checks with simulated GPU devices, covering invalid input, resource cleanup, time/attempt bounds, visibility/abort/device loss and independent proof rechecking. |
| Peer protocol | 10 sync checks including two independently persisted nodes over actual localhost HTTP and simulated bounded RPC delivery: mine, sync, sign, include payment and sync recipient state; fork continuation, ties, invalid peers, cancellation and rotating mempool propagation. |
| Peer UI | 6 checks, including delayed invitation/answer results across disconnect, hide and leave, explicit start, identity cleanup and safe text rendering. |
| Integrated desktop and generated HA runtime | 2 checks: native routes/assets, genesis/balance, origin/invalid-input rejection, separate persisted journal and unchanged disposable witness/receipt state across restart. |
| Actual GPU execution | Both complete mining algorithms ran on an NVIDIA GeForce GTX 1080 hardware adapter through Dawn Node `webgpu@0.6.2` / D3D12. SHA-256 found a block after 983,040 candidates (1,258 ms); SHA-256d after 327,680 (360 ms). Both used the production initial difficulty on a distinct disposable regtest network and passed independent core validation. Cancellation returned `stopped`. These single searches are not a performance comparison or expected earnings. |
| Source review | Separate AI reviewers inspected consensus/node and wallet/miner/sync changes. Review found and corrected replay scaling, mempool propagation, stale status and exact receipt matching. This is not an independent human security audit or certification. |

The hardware check used the official [Dawn Node binding](https://github.com/dawn-gpu/node-webgpu), with its package pinned outside the distributed application and install scripts disabled. It executed the same WGSL/miner module used by the website. It did not automate Chrome, access a live wallet, mine on the production DVC network or touch the user's Keeper data.

## Unverified and operational limits

- Browser computer control returned **Transport closed**. The new release's actual Chrome rendering, Home Assistant iframe/popup behavior and live Coinbase native-transfer signature remain unverified. Native Dawn execution proves the tested shaders on that adapter, not every browser or driver.
- The generated Home Assistant runtime passed local tests. Updating and restarting the user's Home Assistant host on 0.6b has not been observed in this source verification.
- Peer tests are real independent local nodes with simulated authenticated-channel delivery, not a physical multi-device WebRTC/NAT test. No public seed, relay, persistent external peer service or worldwide network was deployed by these checks.
- No real-owner payment or production-chain mining was performed. The independent native chain is experimental; the stated supply and signature rules do not establish market value, irreversible settlement, decentralization or resistance to a majority of work.
- Default journal, side-branch and retained-history capacities are finite. See [native rules and operator limits](NATIVE-DVC.md). Sustained operation, resource exhaustion, large account populations, deep reorganizations and external adversarial review require further work.

The following earlier reports retain their original source-cut wording. The later public founder certificate and verification are preserved in [founder-records/0.5.1b](../founder-records/0.5.1b/README.md); those historical records remain separate from native DVC issuance.

---

# Validation — Doodle Tick 0.5.1b

## Current 0.5.1b evidence

The compatibility update is in preparation. It adds an explicitly selected Ethereum chain-1 read service while preserving wallet-controlled accounts/signing, exact-block checks and existing vault/v1/v2 formats. It requests no financial action.

| Check | Evidence |
| --- | --- |
| Focused wallet and recipient UI checks | **44 passed** using controlled provider/UI fixtures. |
| Read-transport checks | **17 passed** using mocked requests/responses. |
| Full Keeper/Home Assistant suite | **287/287 passed** via `node scripts/test.mjs`, with no failures or skips. The focused checks above are included in this total. |
| Live PublicNode read-service probe | Passed in Node: chain `0x1`, latest-block lookup and EIP-1898 exact-block `eth_getCode` for the public zero address. No owner address was queried. |
| Repository/source checks | Passed: 241 public files checked and 68 generated runtime files matched. |
| Actual Chrome browser verification | Passed with a disposable creator, mock wallet, live PublicNode reads and real WebGPU work; details below. |
| Release archives and publication | Pending. |
| Home Assistant 0.5.1b installation/restart | Pending. |
| Complete live Coinbase Wallet recipient proof | Unresolved; the 0.5b extension connection succeeded on chain 1, but recipient review failed before wallet signing. The failing preparatory request remains unidentified until the new diagnostics are deployed. |

The first Node probe failed certificate trust. Retrying with `--use-system-ca` used the Windows system trust store and succeeded; TLS certificate verification remained enabled. This verifies the sampled read path, not future availability, browser behavior or historical smart-account state.

The Chrome fixture deliberately rejected wallet block reads with code 4100. The app showed the safe method/code and made no automatic fallback. After explicit PublicNode selection, the browser fetched real Ethereum blocks and EIP-1898 exact-block EOA code, created the disposable creator and mock-wallet signatures, and completed real difficulty-16 WebGPU work. Its exported public JSON passed independent Node verification. Reload retained the public record but restored wallet reads as the default, without requesting accounts, signing or resuming mining.

The controlled 4100 failure is fixture evidence, not a diagnosis of the actual Coinbase failure. These checks used no owner wallet address, owner key or chosen founder certificate. Neither these tests nor the public-address probe establish an actual Coinbase signature or DVC issuance. The optional read source is not independent trustless verification. No 0.5.1b publication or deployment is claimed here.

## 0.5b publication and deployment evidence

The published 0.5b Home Assistant update was verified with the same Keeper witness and zero receipts preserved. Automatic updates remained enabled. This confirms the installation and retained state; it does not establish a complete backup restore, audible music output, actual Coinbase signing or a complete live recipient proof.

## Archived 0.5b source record

The pending packaging/deployment statements below describe the original source cut. The later published installation evidence above supersedes that pending installation status without rewriting the archived record.

# Validation — Doodle Tick 0.5b

## 0.5b source and browser evidence

The full Keeper/Home Assistant suite passed **263/263**, with no failures or skips, including **14 weather** and **11 background-music** checks. An initial restricted run could not connect to localhost (`EACCES`). A subsequent unrestricted run exposed an outdated CSP expectation; it was updated to require exactly the same origin and the two weather API hosts. The final full run passed. Home Assistant ingress checks also verify all six new JavaScript/CSS assets and their content types.

Actual Chrome checks used the public sample city London: city search, current conditions and a three-day forecast loaded; C/F conversion worked offline; the cached report survived reload; and Clear location removed the saved choice/report. Music Play/Pause, mute, volume and mood controls worked, preferences persisted without autoplay, and playback state continued across app-view navigation. Red night mode and a 390-pixel viewport were checked without horizontal overflow.

These observations verify controls and browser behavior, **not audible speaker output**, which was neither heard nor recorded. One unassigned receiving-end extension-style console error appeared; functional checks passed, but no overall clean-console claim is made.

**The live Home Assistant 0.5b update and extracted release-asset checks remain packaging/deployment steps at this source cut.** Actual Coinbase signing, live smart-account verification, physical multi-device reachability and audible-output checks remain separate work. No paid wallet action or DVC issuance is established by these results.

## 0.4b publication and deployment evidence

The 0.4b release was published after its source pull request merged, and release assets were checked. Home Assistant then updated over HTTPS with its backup-before-update switch explicitly enabled. The update and a subsequent restart reached Running with the same Keeper witness and receipt count. Start on boot, watchdog, automatic updates and sidebar visibility remained enabled. This observation does not verify a complete backup restore or an actual Coinbase signature.

## Archived 0.4b source record

Historical pending statements below describe that source cut. The later installation evidence above is separate; the published 0.4b record is preserved.

# Validation — Doodle Tick 0.4b

The combined Keeper/Home Assistant suite passed **238/238**, with no failures or skips: 19 recipient protocol checks, 22 signing-only wallet adapter checks, 15 recipient UI checks, and the preserved existing suite. The first full run exposed a test fixture using inconsistent clocks; sharing one controlled timestamp fixed the fixture without changing production freshness rules. The public garden artifact reproduced and all **10 offline EVM tests** passed. No paid network was used.

The pinned recipient cryptography bundle reproduced byte-for-byte, including component notices and preferred dependency source. Rebuild checks passed in both the repository and an extracted-Keeper layout. This is a bounded implementation review, not a comprehensive security audit.

Actual Chrome completed the full recipient interface with a disposable creator, the real signing adapter and a mock wallet provider: explicit discovery/connection, creator review, an EOA signature, fresh bounded 16-bit WebGPU proof, public JSON copy, restoration after reload and import while locked. The resulting public record also passed independent Node verification. The fixture's block and wallet were simulated; its GPU work was real. One unassigned receiving-end extension-style console error appeared after copying; the proof/import checks completed. The full standalone 0.4b app rendered both Coin panels and routed an imported v1 proof into the recipient panel with no console warnings/errors.

**Actual Coinbase extension compatibility and the live 0.4b Home Assistant update remain deployment steps at this source cut.** No real wallet signature, deployed DVC contract, spendable DVC issuance or canonical founder recipient is claimed. ERC-1271 checks use controlled exact-block fixtures, not a live smart wallet. Physical multi-device reachability and long-term operation remain separate acceptance work.

## 0.3b deployment evidence

After the archived source record below, 0.3b was published and installed in Home Assistant over HTTPS. Migration completed; an explicit restart preserved the original witness and receipt count. Startup, watchdog and automatic updates were enabled. The owner created and privately backed up a creator vault, and its bounded 20-bit GPU founder proof passed browser and independent Node verification. That public certificate is held locally while the requested wallet recipient link is prepared. The temporary migration stage was removed and the temporary terminal helper stopped; backups remain in Home Assistant. No private vault or backup was published.

## Archived 0.3b source record

Historical pending statements below describe release preparation, not the current installation.

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
