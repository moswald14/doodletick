# Doodle Tick Keeper · 0.6.1b

Creator arcade, hourly color clock, encrypted vault, mushroom garden and native Doodleverse Coin for Home Assistant OS (aarch64 and amd64).

The Coin page has a red **MINE NOW** button, SHA-256/SHA-256d choices, GPU intensity, Stop, native balances, signed payments and receiving requests. Supply is fixed at 21 million: one million disclosed founder coins and 20 million mineable coins. Native DVC is separate from Ethereum tokens, private garden coins and the original founder certificates. See [native rules and limitations](../keeper/NATIVE-DVC.md).

Install through the [Doodle Tick repository](https://github.com/moswald14/doodletick), then open its Web UI over trusted HTTPS. Enable Start on boot, Watchdog and Auto update. This is a Home Assistant app/add-on, not a HACS integration. Read [DOCS.md](DOCS.md) and [HTTPS.md](HTTPS.md).

Native-chain history is saved inside this app's `/data/keeper/dvc` directory. Cold backups include it. Existing witness, receipts, garden and vault formats are preserved. A separate repository installation does not migrate a local app automatically; use the [offline migration guide](MIGRATION.md) and keep backups.

For native peer sync, unlock your creator vault, exchange signed connection codes and compare the spirograph. Each Keeper independently verifies blocks and payments. Both browser Coin pages must remain visible and directly reachable; no public Internet relay, seed node, router port or VPN is configured. Home Assistant's authentication remains in place.

The Weather & music panel, original founder records, arcade and file sharing remain available. Optional public DGT gardens use their own wallet transactions and network fees; they do not convert into DVC. There is no exchange listing, redemption or promised coin value.

Read [validation](../keeper/VALIDATION.md) for completed checks and live-device limits. Source is GPL-3.0-only under the repository's LICENSE.
