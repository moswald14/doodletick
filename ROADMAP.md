# Development roadmap

Current public baseline: **0.1b**. This roadmap proposes work; it does not promise dates or claim that the items are implemented. The maintainer chooses the next release number and approves scope.

| Priority | Work | Finish condition |
| --- | --- | --- |
| P0 | HTTPS onboarding | A new Home Assistant user can follow tested instructions to a trusted HTTPS address, unlock a disposable vault and join a garden. HTTP keeps a working recipe preview and a clear explanation. No browser security bypass is used. |
| P0 | Move from a local app to the public repository | A documented, rehearsed migration preserves the original witness fingerprint, receipt count, garden ownership and balances, and relevant VPN state. The old installation and private backup remain available for rollback; cloned identities never run together. |
| P1 | Real two-device private-network testing | Two physical devices join the same private network, compare pairing patterns, complete a game and a file transfer, and trade in one shared garden. Disconnect/reconnect, peer revocation and restart behavior are recorded with redacted evidence. |
| P1 | Garden recovery and bounded load | Disposable fixtures cover interrupted writes, restart during uncertain payments, retained-history limits and multiple simultaneous buyers near documented capacity. Successful actions preserve coin conservation and unique ownership; measured limits are published without claiming untested scale. |
| P1 | Accessible recipe and clock controls | Keyboard-only and narrow-screen checks cover the garden, clock, dialogs and night theme. Focus remains visible; controls have usable labels; imports never start sound automatically. |
| P2 | A genuine HACS companion | First decide a useful dashboard card or integration feature, then implement and test that separate component against HACS requirements. The background Keeper continues to install as a Home Assistant app. No HACS listing is claimed before acceptance. |

## Next concrete task

Start with **HTTPS onboarding**. Reproduce the difference between HTTP preview and HTTPS signed garden access using a disposable identity. Propose the smallest setup flow that works with Home Assistant's existing HTTPS options, preserves its authentication and avoids duplicating the user's VPN configuration. Finish with a tested guide and a clear record of unsupported setups.

Migration may proceed independently with fixture data. Installing the repository edition produces a different Home Assistant app identity from an existing local installation; do not describe adding the repository as an automatic data migration.

## Release finish condition

Before a release, the canonical runtime and generated add-on agree, required tests pass, relevant browser or device checks are recorded, and the archives exclude private state. Changes to persistence have backup and recovery evidence. Release notes distinguish verified behavior, remaining setup and untested scenarios. The maintainer reviews the final result and controls publication.

Public hosting, real-money payments, unattended P2P storage, automatic host migration, global identity verification and distributed recovery are separate design projects. They are not implied by the existing garden economy or encrypted vault.
