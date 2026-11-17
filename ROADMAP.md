# Development roadmap

Current source version: **0.8b**, adding the Doodle Jazz room to the published 0.7b baseline. [Doodleverse's direction](DOODLEVERSE.md) describes the proposed founder allocation, communication effort, foundation and eventual food days. The table below separates implementation from outstanding verification and operational work.

| Priority | Work | Finish condition |
| --- | --- | --- |
| P1 | Jazz room field checks | Listen on physical speakers/headphones, exercise mobile screen lock and overnight operation, and record interruptions without inferring audible output from the browser meter. Source and local ingress checks are recorded in the validation report; delivery receipts remain separate. |
| P0 | Complete actual wallet-recipient checks | Exercise the Coinbase Wallet Chrome extension's native prompt and selected account/network. Verify its exact message and public export; test a real deployed ERC-1271 account separately before claiming that field check. Source and mock-wallet browser checks are complete, but are not evidence of these live paths. Unsupported ERC-6492/EIP-7702 accounts remain unverified; no financial call is available. |
| P0 | Publish the founder's chosen recipient proof | The owner privately selects/unlocks the original creator identity and intended wallet, reviews the disclosed allocation and full recipient, signs, runs fresh GPU work, and explicitly publishes the verified public record. Preserve the original v1 proof; expose no private keys and imply no live issuance. |
| P1 | Two-device direct connection field tests | Two physical devices compare complete patterns, complete a game and licensed binary file transfer, and exercise disconnect/reconnect on LAN and distinct networks. Record failure conditions without claiming universal connectivity. |
| P1 | Operator-owned rendezvous and relays | Define authenticated admission, scoped authorization, quotas, revocation, abuse handling and deployment costs; test independently before enabling remote garden or discovery services. |
| P1 | Native DVC protocol design | Agree genesis and disclosed allocation, future supply, signed spends, nonces/double-spend prevention, independent validation, cumulative-work fork choice, reorganization and recovery. Reproducible adversarial tests and human review precede live issuance. |
| P1 | GPU and wallet field tests | Test real browser/driver combinations, the Coinbase Wallet Chrome extension, cancellation, account/network changes and chain-state failures. Separately test existing public DGT transactions with disposable wallets and explicitly approved test-network funds. |
| P1 | Additional smart-account support | Design and test bounded read-only ERC-6492 verification and EIP-7702 policy before enabling either. Never deploy or modify a wallet to make verification pass. |
| P1 | Accessibility and recovery | Keyboard/narrow-screen checks, interrupted writes, compatible backups and ledger recovery retain saved work and clear control of mining. |
| P1 | Broader weather/audio field checks | Confirm audible output on real speakers/headphones and additional browser/device combinations. Exercise weather outages, stale-report clarity and repeated page lifecycle changes; keep data attribution and opt-in behavior intact. |
| P2 | HACS companion | Choose and implement an actual dashboard card or integration separately from the Keeper app; obtain acceptance before claiming a listing. |
| Organizing | Proposed foundation and food days | Establish governance, people, resources and communication pilots; then arrange real local food partners, responsibilities and dates. No service entitlement is promised by coins. |

0.3b implements native encrypted browser pairing, removes the Tailscale runtime and network privileges, preserves local signed garden accounting, and supplies a prelaunch certificate verifier plus bounded GPU search. It does not launch a spendable DVC chain or worldwide service.

0.4b adds a separately versioned wallet-recipient record linked to the existing proof. It preserves v1, requires creator and wallet approvals plus fresh work, and restricts the new wallet flow to message signing. It creates no spendable DVC balance or Coinbase listing. See the [recipient guide](keeper/WALLET-RECIPIENT.md) and [validation record](keeper/VALIDATION.md) for scope and evidence.

The **0.4b** combined suite passed **238 tests**. A real Chrome fixture using the actual adapter, a mock wallet and a disposable creator completed signing, GPU work, copy, reload and locked import; the exported proof also passed independent Node verification. The subsequent Home Assistant 0.4b update and restart preserved the original witness and receipt count. Actual Coinbase account verification remains pending.

0.5b adds optional city weather and local synthesized music in a global expandable panel. Its **263-check** suite passed, including 14 weather and 11 music checks. Chrome verified live sample-city retrieval, C/F/cache/clear, music controls and saved preferences without autoplay, navigation continuity and a 390-pixel red-night layout. Audible output and the live Home Assistant update remain unverified. Commercial weather hosting requires an appropriate provider plan/integration, separate from the code's GPL license.

## 0.8b Jazz room

The integration keeps Doodle Jazz's piano, bass and drum player as a separate same-tab page, linked from the Keeper sidebar. Swing, blues and bossa styles generate new phrases locally; no vault, wallet or audio-streaming service is required. Preferences remain local, and playback always needs Play. Background listening requires the jazz page to stay open and the device awake; Back to Keeper leaves that page and stops the sound. External same-origin assets must work through the existing authenticated ingress and desktop cache without loosening policy. The 509-check source suite and local browser/ingress observations are recorded in [validation](keeper/VALIDATION.md). Release and installation receipts are recorded separately.

## 0.6b native coin

Implemented: independent fixed-supply DVC, two real GPU algorithms, native signed payments, durable replay, most-work fork choice and bounded browser peer sync. Remaining: persistent operator peers, Internet reachability/relay design, scalable indexing/compaction, external protocol review, real multi-device operation and live-wallet/browser acceptance checks. An exchange, bridge and market liquidity are not implemented. See [native DVC](keeper/NATIVE-DVC.md).

## Next engineering task

Complete **Jazz room field listening checks** on physical speakers/headphones, mobile devices and an overnight session. Record audible output and interruptions separately from source, browser, package and deployment checks. A moving browser meter alone is not a listening result.

The **actual Coinbase Wallet handoff** remains required before publishing the owner's chosen record. Verify the full public export independently, exercise cancellation and changed accounts/networks, and confirm that the wallet is asked only for the displayed message signature. Record unsupported account types and unperformed checks honestly.

Then complete the **two-device direct-connection field test** with disposable players. Compare both spirographs, finish a game, transfer a licensed binary file, close/reopen the host, and record what works on LAN and through different routers. Use measured failures to design explicit operator-controlled relay support. Do not silently reintroduce a VPN or arbitrary URL proxy.

## Release gate

Canonical and generated runtime agree; signature/accounting/storage/network checks pass; relevant browser observations are recorded; archives exclude private state; migration preserves identity and rollback material. Release notes distinguish tested behavior from remaining setup. Source review does not constitute a production security audit.
