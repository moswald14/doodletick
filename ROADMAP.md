# Development roadmap

Current release: **0.3b**. [Doodleverse's direction](DOODLEVERSE.md) describes the proposed founder allocation, communication effort, foundation and eventual food days. The table below separates implemented components from outstanding operational work.

| Priority | Work | Finish condition |
| --- | --- | --- |
| P0 | Complete the repository deployment | HTTPS app starts, original witness/receipts/ledger are retained, restart succeeds, old clone stays stopped and requested automatic updates are enabled. |
| P0 | Publish the founder's chosen proof | The owner privately selects/unlocks the signing identity, explicitly consents to the disclosed allocation, runs GPU work, exports a verified certificate and publishes its public reference. No private key is exposed and no live issuance is implied. |
| P1 | Two-device direct connection field tests | Two physical devices compare complete patterns, complete a game and licensed binary file transfer, and exercise disconnect/reconnect on LAN and distinct networks. Record failure conditions without claiming universal connectivity. |
| P1 | Operator-owned rendezvous and relays | Define authenticated admission, scoped authorization, quotas, revocation, abuse handling and deployment costs; test independently before enabling remote garden or discovery services. |
| P1 | Native DVC protocol design | Agree genesis and disclosed allocation, future supply, signed spends, nonces/double-spend prevention, independent validation, cumulative-work fork choice, reorganization and recovery. Reproducible adversarial tests and human review precede live issuance. |
| P1 | GPU and wallet field tests | Test real browser/driver combinations and cancellation/device loss. Separately test existing public DGT transactions with disposable wallets and explicitly approved test-network funds. |
| P1 | Accessibility and recovery | Keyboard/narrow-screen checks, interrupted writes, compatible backups and ledger recovery retain saved work and clear control of mining. |
| P2 | HACS companion | Choose and implement an actual dashboard card or integration separately from the Keeper app; obtain acceptance before claiming a listing. |
| Organizing | Proposed foundation and food days | Establish governance, people, resources and communication pilots; then arrange real local food partners, responsibilities and dates. No service entitlement is promised by coins. |

0.3b implements native encrypted browser pairing, removes the Tailscale runtime and network privileges, preserves local signed garden accounting, and supplies a prelaunch certificate verifier plus bounded GPU search. It does not launch a spendable DVC chain or worldwide service.

## Next engineering task

Complete the **two-device direct-connection field test** with disposable players after deployment. Compare both spirographs, finish a game, transfer a licensed binary file, close/reopen the host, and record what works on LAN and through different routers. Use the measured failures to design explicit operator-controlled relay support. Do not silently reintroduce a VPN or arbitrary URL proxy.

## Release gate

Canonical and generated runtime agree; signature/accounting/storage/network checks pass; relevant browser observations are recorded; archives exclude private state; migration preserves identity and rollback material. Release notes distinguish tested behavior from remaining setup. Source review does not constitute a production security audit.
