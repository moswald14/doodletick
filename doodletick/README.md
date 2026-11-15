# Doodle Tick Keeper

Private creator arcade, hourly color clock and Dot Wave mushroom garden for Home Assistant OS. This is a source-built app/add-on, available for aarch64 and amd64.

Install through the [Doodle Tick repository](https://github.com/moswald14/doodletick), then open the Web UI. Use HTTPS for the vault and garden transactions. The recipe maker previews on HTTP. Peer play requires the included Tailscale device and the other Keepers to join the same private network.

Read [DOCS.md](DOCS.md) and the [HTTPS guide](HTTPS.md) before connecting. A repository installation has separate data from a pre-existing local app. The [offline migration procedure](MIGRATION.md) preserves Keeper and VPN data through a verified, one-time import into an unused target; adding the repository alone does not migrate anything.

Release: **0.2b**. Players can choose private Keeper coins or an optional public-wallet garden. The balances are separate. Public transactions require wallet confirmation and network fees; no shared deployed contract, redemption or token value is supplied. See [public-mode rules](../contracts/README.md).

The live Home Assistant frontend has been reached over HTTPS. The actual 0.2b repository installation/migration and real wallet/network transactions are not yet verified; migration has been rehearsed with disposable fixtures. See [validation](../keeper/VALIDATION.md) for precise evidence. Source is GPL-3.0-only under the repository's LICENSE.
