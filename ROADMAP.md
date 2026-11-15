# Development roadmap

Current implemented release scope: **0.2b**. The work below distinguishes completed implementation from deployment and field verification. It does not promise dates. The maintainer chooses subsequent release numbers and approves scope.

## Implemented for 0.2b

- Per-player private and public-wallet garden modes with separate balances. Private hourly minting and optional proof mining retain signature, ownership, replay and accounting checks.
- An optional EVM garden contract and wallet UI for deployment/attachment, fingerprint reservation and registration, hourly claims, bounded proof mining and token transfers. Wallet confirmation remains necessary for transactions. Compiler inputs, licenses and verification tools are included; no shared deployed contract or real wallet/network transaction is claimed.
- Home Assistant onboarding distinguishes browser security from private-network status. Cloud HTTPS is working on the live frontend; the new app installation and signed garden operations still need deployment checks.
- A verified offline import into an unused repository installation, with archive staging, no-overwrite checks, restart protection and documented rollback. It has passed disposable-fixture rehearsals; the actual local-to-repository cutover remains outstanding. Cold app backups are configured for future consistent snapshots.

The combined application suite passed 134 checks. Current evidence and historical 0.1b results are separated in [VALIDATION.md](keeper/VALIDATION.md).

## Remaining work

| Priority | Work | Finish condition |
| --- | --- | --- |
| P0 | Complete the actual 0.2b Home Assistant cutover | Install the repository app, transfer the stopped local app through the rehearsed procedure, verify witness/receipts/garden/VPN identity, and repeat after restart. Open its HTTPS UI with the original browser identity. Keep the old installation stopped and an intact private backup for rollback; enable requested automatic updates only on the verified repository installation. |
| P1 | Real two-device private-network testing | Two physical devices join the same private network, compare pairing patterns, complete a game and a file transfer, and trade in one shared garden. Disconnect/reconnect, peer revocation and restart behavior are recorded with redacted evidence. |
| P1 | Real wallet and test-network verification | With explicit wallet approvals and disposable test assets, exercise deployment, reservation/reveal, hourly claim, proof submission and transfer. Verify account/network changes, pending/replaced transactions and wallet visibility in the actual browser. Record fees and outcomes without claiming production security or token value. |
| P1 | Garden recovery and bounded load | Disposable fixtures cover interrupted writes, restart during uncertain payments, retained-history limits and multiple simultaneous buyers near documented capacity. Successful actions preserve coin conservation and unique ownership; measured limits are published without claiming untested scale. |
| P1 | Accessible recipe and clock controls | Keyboard-only and narrow-screen checks cover the garden, clock, dialogs and night theme. Focus remains visible; controls have usable labels; imports never start sound automatically. |
| P2 | A genuine HACS companion | First decide a useful dashboard card or integration feature, then implement and test that separate component against HACS requirements. The background Keeper continues to install as a Home Assistant app. No HACS listing is claimed before acceptance. |

## Next concrete task

After completing the current 0.2b cutover, run **real two-device private-network verification**. Use disposable players on two physical devices and one shared Keeper. Compare the full pairing codes, finish one game and one licensed file transfer, then mint/transfer coins and trade a mushroom. Check a disconnect and a Keeper restart without changing the saved witness or duplicating a transaction. Finish with redacted evidence and explicit pass/fail results for each step.

Installing the repository edition produces a different Home Assistant app identity from an existing local installation. The new importer requires a deliberately prepared offline stage; merely adding the repository does not migrate data. A real wallet/network transaction test is a separate task from private-network verification.

## Release finish condition

Before a release, the canonical runtime and generated add-on agree, required tests pass, relevant browser or device checks are recorded, and the archives exclude private state. Changes to persistence have backup and recovery evidence. Release notes distinguish verified behavior, remaining setup and untested scenarios. The maintainer reviews the final result and controls publication.

Public hosting, a private/public currency bridge, cash redemption, unattended P2P storage, automatic host migration, global identity verification and distributed recovery remain outside the implemented scope. The optional public contract does not imply these services.
