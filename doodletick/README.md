# Doodle Tick Keeper · 0.9.3b

Creator arcade, hourly color clock, encrypted vault, mushroom garden and native Doodleverse Coin for Home Assistant OS (aarch64 and amd64).

Open **Telephone World** in the sidebar to create a narrative, give it an editable soundtrack in the included **Dot Studio**, and carry it into Keeper as a vault draft or a playable fictional world. Creative projects and exports are unencrypted browser copies; the vault remains separate. **Jazz room** adds a local piano, bass and drum trio with connected chords, repeating phrases and swing. Sound starts only when you press Play and uses this browser’s speakers or headphones. See the [Telephone guide](../keeper/TELEPHONE-WORLD.md) and [Jazz guide](../keeper/JAZZ.md).

The **Sleep garden** combines locally generated wind and mushroom sounds. Press **Start sleep sounds** for the eight-hour, low-volume preset with a final-minute fade. Starter mushrooms work without a vault; owned recipes are read only for listening. Sound may continue in a hidden tab and through vault locking once rendered, but the page and computer must remain active. There is no autoplay, new coin reward or uninterrupted-playback promise.

Signed Keeper samples now drive the clock display and fresh private-garden request timestamps, with visible stale/uncertainty status. They identify this Keeper as the source, not an independently verified UTC clock. See [time and Sleep garden](../keeper/TIME-AND-SLEEP.md) for controls and limits.

Enter a full nonzero **Mining reward address** on the Coin page, choose SHA-256/SHA-256d and GPU intensity, then press **MINE NOW**. Mining needs no wallet connection or signature. The destination's available funds, immature rewards and pending outgoing payments appear under **Mining address balances**, separately from **Wallet for sending**. A connected account can fill an empty mining field or be copied with **Use connected wallet address**. Editing the destination cancels work and repeat mode; sending still requires the controlling wallet's signature.

Supply and consensus stay fixed at 21 million coins: one million disclosed founder coins and 20 million mineable coins. No data migration is added. Native DVC remains separate from Ethereum tokens, private garden coins and the original founder certificates. See [native rules and limitations](../keeper/NATIVE-DVC.md).

Install through the [Doodle Tick repository](https://github.com/moswald14/doodletick), then open its Web UI over trusted HTTPS. Enable Start on boot, Watchdog and Auto update. This is a Home Assistant app/add-on, not a HACS integration. Read [DOCS.md](DOCS.md) and [HTTPS.md](HTTPS.md).

Native-chain history is saved inside this app's `/data/keeper/dvc` directory. Cold backups include it. Existing witness, receipts, garden and vault formats are preserved. A separate repository installation does not migrate a local app automatically; use the [offline migration guide](MIGRATION.md) and keep backups.

For native peer sync, unlock your creator vault, exchange signed connection codes and compare the spirograph. Each Keeper independently verifies blocks and payments. Both browser Coin pages must remain visible and directly reachable; no public Internet relay, seed node, router port or VPN is configured. Home Assistant's authentication remains in place.

The Weather & music panel, original founder records, arcade and file sharing remain available. Optional public DGT gardens use their own wallet transactions and network fees; they do not convert into DVC. There is no exchange listing, redemption or promised coin value.

Read [validation](../keeper/VALIDATION.md) for completed checks and live-device limits. Source is GPL-3.0-only under the repository's LICENSE.
