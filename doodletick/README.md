# Doodle Tick Keeper · 0.3b

Creator arcade, hourly color clock and Dot Wave mushroom garden for Home Assistant OS. This source-built app/add-on supports aarch64 and amd64.

Install through the [Doodle Tick repository](https://github.com/moswald14/doodletick), then open its Web UI through Home Assistant over HTTPS. Games and files pair directly between browsers with signed invitations, encrypted WebRTC and a spirograph comparison. No VPN is bundled. Direct reachability is required; no Internet relay is configured.

Read [DOCS.md](DOCS.md) and [HTTPS.md](HTTPS.md). Room directory codes and private garden trading work only for users of this same Keeper. Browser hosts and file holders must keep their pages open.

A repository installation has separate data from a pre-existing local app. The [offline migration procedure](MIGRATION.md) preserves the witness, receipts and garden in a verified one-time import into an unused target. Earlier VPN state, when present, is preserved inert for rollback. Installing the repository alone does not migrate anything.

Private Keeper coins, public wallet DGT gardens and the separate Doodleverse Coin proof-of-work contract have distinct balances. Public transactions require wallet confirmation and network fees. No shared deployed contract, redemption or token value is supplied. See [public-mode rules](../contracts/README.md).

Live Home Assistant HTTPS access worked. The actual 0.3b installation, data cutover and real wallet transactions remain unverified at this release's preparation; migration tests use disposable fixtures. Same-machine native Chrome pairing passed. See [validation](../keeper/VALIDATION.md) for evidence and limits. Source is GPL-3.0-only under the repository's LICENSE.
