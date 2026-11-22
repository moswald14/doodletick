# Doodle Tick Keeper · 0.19.4b

**0.17b adds a paper wallet maker to the Doodleverse miner.** From Keeper, open **Doodleverse Coin**, then choose **Paper wallet maker**. Open the downloaded file offline to create or recover a paper wallet. [Paper wallet guide](../keeper/paper-wallet/README.md)

**0.16b gives the Jazz band a memory and more ways to play.** Set the speed, beats per bar, phrase length, drum groove and key. Save editable Dot Wave voices to the players and teach the band with signed keepsakes or song naming. [Open the Jazz guide](../keeper/JAZZ.md).

**0.14b adds Home Assistant Jazz radio:** eight genres, hourly shuffle, optional world-update voice, local mute and signed eight-chord replay keepsakes. [Open the Jazz guide](../keeper/JAZZ.md).

**0.12b brings MozCorp’s cloud savepoints, fictional HOPE-LON feed and upgrade desk into Keeper.** Open **MozCorp → Keeper cloud** or **Upgrade desk**. Shared records live with this Keeper and survive restarts. AI drafts are optional and use a server-side key with explicit instruction-only consent. See [the MozCorp guide](../keeper/MOZCORP.md).

**0.13b adds a native Scrypt blockchain, encrypted browser wallet and address-only GPU mining.** Open **Doodleverse Coin**, check the connected network, enter a native receiving address and press the red **MINE NOW** button. **Keep mining** repeats work until stopped; hiding the page stops GPU work. Eco and Balanced change GPU intensity while the chain's algorithm remains Scrypt 1024/1/1. Your browser computer needs hardware WebGPU; the Home Assistant node validates blocks and does not mine on its CPU.

Choose **Your wallet · Receive & send** to create or restore a native wallet. Download its encrypted backup and keep the password separately. Mining needs only its public address, even while locked. Payments require unlocking, reviewing the recipient, amount, fee and change, and explicitly pressing **Sign and send this payment**. The signing key stays in this browser. Home Assistant backups do not contain that browser wallet.

This Pepecoin-derived network has its own genesis and addresses, a **21,000,000 DVC** maximum, a publicly recorded **1,000,000 founder allocation** and **20,000,000 mineable DVC**. The first mined block includes the founder allocation plus the miner's normal 50 DVC subsidy. Rewards need **30 confirmations** before spending. Ethereum/Coinbase `0x` addresses, PEPE, Pepecoin, private garden coins and the earlier Keeper DVC ledger remain separate; no balance conversion is supplied. See [the native chain rules](../doodleverse-core/README.md).

The app bundles a wallet-disabled Core node and defaults to the main network. RPC stays authenticated on loopback and is never exposed. The optional **TCP 38474** blockchain-peer host mapping is disabled by default; configure reachable peers using this exact published chain. Home Assistant Cloud HTTPS serves the web interface, not blockchain peer traffic. No inherited Pepecoin seed network or global relay is supplied. The [Windows GPU miner package](../doodleverse-core/windows/README.md) provides a matching node and runtime for Windows.

Install through the [Doodle Tick repository](https://github.com/moswald14/doodletick), then open its Web UI over trusted HTTPS. For an update, back up and update the **same installed repository app**. Keep its Keeper identity and data, then enable **Start on boot**, **Watchdog** and **Auto update** after checking the new version. This is a Home Assistant app/add-on, not a HACS integration. Read [setup, peers and backups](DOCS.md) and [HTTPS.md](HTTPS.md).

Native chain data stays in `/data/doodleverse-core`; Keeper records and the public wallet index stay under `/data/keeper`. Cold backups preserve server data. Creator-vault, native-wallet and project backups are separate browser exports. A local app and repository app have different storage: use the [offline migration guide](MIGRATION.md) and retain backups when moving between them.

This is experimental beta software. Disposable Core tests have covered GPU block acceptance, wallet payments, encrypted-backup restoration and reorganizations. They do not establish a distributed launch, real earnings or the current installation's health. Source review is not an independent security audit. There is no guaranteed value, exchange listing or redemption.

## The creator arcade stays with you

**0.12b brought MozCorp’s cloud savepoints, fictional HOPE-LON feed and upgrade desk into Keeper.** Open **MozCorp → Keeper cloud** or **Upgrade desk**. Shared records live with this Keeper and survive restarts. AI drafts are optional and use a server-side key with explicit instruction-only consent. See [the MozCorp guide](../keeper/MOZCORP.md).

**Shelf Defense** opens from Keeper's sidebar. The original three-shelf battle game and the shared **Idle shelves** cookie bakery run inside the existing authenticated Web UI. Idle progress is stored in this app's data and included in its cold backups; browser battle saves remain separate. The games need no API key. See [Shelf Defense](../keeper/SHELF-DEFENSE.md).

MozCorp private rooms use a separately supplied, verified bundle. Install it from the app’s MozCorp page after this update. The public app does not include private station pages or site credentials.

Creator arcade, hourly color clock, encrypted vault, mushroom garden and native Doodleverse Coin for Home Assistant OS (aarch64 and amd64).

Open **Telephone World** in the sidebar to create a narrative, give it an editable soundtrack in the included **Dot Studio**, and carry it into Keeper as a vault draft or a playable fictional world. Creative projects and exports are unencrypted browser copies; the vault remains separate. **Jazz room** adds a local piano, bass and drum trio with connected chords, repeating phrases and swing. Sound starts only when you press Play and uses this browser’s speakers or headphones. See the [Telephone guide](../keeper/TELEPHONE-WORLD.md) and [Jazz guide](../keeper/JAZZ.md).

The **Sleep garden** combines locally generated wind and mushroom sounds. Press **Start sleep sounds** for the eight-hour, low-volume preset with a final-minute fade. Starter mushrooms work without a vault; owned recipes are read only for listening. Sound may continue in a hidden tab and through vault locking once rendered, but the page and computer must remain active. There is no autoplay, new coin reward or uninterrupted-playback promise.

Signed Keeper samples now drive the clock display and fresh private-garden request timestamps, with visible stale/uncertainty status. They identify this Keeper as the source, not an independently verified UTC clock. See [time and Sleep garden](../keeper/TIME-AND-SLEEP.md) for controls and limits.

## Earlier coin history

**Legacy DVC history** preserves the earlier 0.6.x Keeper ledger and signed records. Its Coin page used full nonzero `0x` mining addresses, SHA-256/SHA-256d, separate **Mining address balances** and **Wallet for sending**. Those rules and addresses do not apply to the 0.13b native Scrypt chain.

The older ledger also used a 21-million limit with one million disclosed founder coins and 20 million mineable, but it is a different network and history. Its data remains under `/data/keeper/dvc`, without conversion into Core balances. See [the historical rules](../keeper/NATIVE-DVC.md).

Legacy browser peer sync used creator-vault connection codes, spirograph comparison and directly reachable browser Coin pages. Current Core blockchain peers use the separate node connection described above. Game and file pairing still use their browser connections. Home Assistant authentication and existing witness, receipts, garden and vault formats are preserved.

The Weather & music panel, original founder records, arcade and file sharing remain available. Optional public DGT gardens use their own wallet transactions and network fees; they do not convert into DVC. There is no exchange listing, redemption or promised coin value.

Read [validation](../keeper/VALIDATION.md) for completed checks and live-device limits. Source is GPL-3.0-only under the repository's LICENSE.


## Studio 2.10.1 update (0.19.4b)

The default image overlays the application on the exact checked 0.19.1b image digests for aarch64 and amd64, recorded in `runtime-base.json`. Those images carry the unchanged 0.19b native Core runtime, its corresponding source and validation records, Node, audio tools and installed Jazz dependencies. Application files and version labels come from this release; Keeper storage and keys remain in `/data`. Both architecture images still run the existing container, isolated audio and media checks before immutable image publication.

`Dockerfile.native` retains the full native build recipe with the current application label. Use `docker build --file doodletick/Dockerfile.native --build-arg BUILD_ARCH=<architecture> doodletick` when rebuilding the native runtime from its pinned source is desired. This web-editor update changes no native chain or consensus input.
