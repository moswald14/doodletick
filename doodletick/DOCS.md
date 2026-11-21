# Doodle Tick Keeper 0.13b for Home Assistant

This app keeps a local room directory, signed witness, shared mushroom garden and Doodleverse Core node online. It serves the creator vault, file library, arcade, color clock, native wallet and GPU miner through Home Assistant's authenticated Web UI. Your computer performs GPU mining; the Home Assistant node validates blocks and payments.

## Share a Studio creation

Open **Studio → Export → Make share file** in Keeper. Choose what to share and download a file with a short listening preview. Open the [Dot Studio Gallery](https://dot-studio-gallery.hatchable.site/) to review and publish your file or hear the Top 10. The public gallery has its own link. Keeper prepares your file locally.

## Install and connect

Add `https://github.com/moswald14/doodletick` through **Settings → Apps → Install app → Repositories**, then install **Doodle Tick Keeper**. Home Assistant OS must use 64-bit ARM or AMD64. For a new installation, start it and open **Web UI**. The first source build includes Core, needs internet access and can take time. If replacing a local app, complete [the offline migration](MIGRATION.md) before the repository app's first start.

For an existing repository installation, make a backup and choose **Update** on that same app. If it is not offered, check for updates in the app store and confirm the repository is `moswald14/doodletick`, rather than Local apps. After restart, verify the original Keeper identity and the **DOODLE TICK 0.19.3b** label. Then enable **Start on boot**, **Watchdog** and **Auto update**. Do not uninstall as an update procedure.

## Mine and send native DVC

Open Home Assistant over trusted HTTPS, choose **Doodleverse Coin**, and check the displayed node network. **Your wallet · Receive & send** creates an encrypted native wallet or restores its encrypted backup. Save that backup and its password separately from Home Assistant backups. Mining needs only the public receiving address; the wallet can remain locked.

Choose **Eco** or **Balanced**, then press **MINE NOW**. **Keep mining** submits found blocks and requests another job; **Stop** ends work. Hiding the tab stops work and returning requires a new start. Chrome needs working hardware WebGPU. There is no automatic CPU fallback, and Home Assistant's CPU does not mine on behalf of visitors. The fixed network algorithm is Scrypt 1024/1/1; intensity changes batch size only.

Mined rewards require **30 confirmations** before spending. Unlock the native wallet, enter a same-network recipient and amount, then choose **Review payment**. Check the amount, fee, total and change before **Sign and send this payment**. The minimum payment is 0.01 DVC. The signing key never goes to Home Assistant or Core. A submitted transaction can stay pending until it is mined; acceptance by one node is not final settlement.

The native chain's maximum is **21,000,000 DVC**, including the publicly disclosed **1,000,000 founder allocation** and **20,000,000 mineable DVC**. Its [public founder record](../doodleverse-core/founder-recipient.json) does not itself issue coins. Native addresses are not Ethereum/Coinbase `0x` addresses. PEPE, Pepecoin, the earlier Keeper ledger and private garden balances are separate, with no balance conversion. There is no guaranteed value, earnings or redemption.

## Node options and peers

The app bundles Core with its wallet disabled. Default options enable the node on the main network. Its blockchain and index are server data; wallet keys remain in the browser.

| Option | Default | Purpose |
| --- | --- | --- |
| `dvc_node_enabled` | `true` | Start the bundled validating node with Keeper. |
| `dvc_network` | `main` | Select main, test or disposable regtest. Networks have separate histories and addresses. |
| `dvc_listen` | `true` | Allow the node to listen for blockchain peers inside the app. |
| `dvc_peers` | `[]` | Up to eight explicitly configured peer IP:port entries, using this exact Doodleverse chain. |

The **TCP 38474** host mapping is optional and disabled by default. Enable it in the app's Network settings only when you want reachable nodes to connect to this mainnet node. The Windows miner can connect to the Home Assistant LAN address and this mapped port; a private address reaches only devices with a route to that LAN. Home Assistant Cloud HTTPS serves the web interface and does not tunnel blockchain peer traffic.

No Pepecoin seeds are inherited and no worldwide seed network is supplied. Configure peers intentionally, or the node may be isolated and mining may be unavailable. An isolated node does not establish a distributed network. Do not expose RPC, the browser service or a router DMZ. RPC stays authenticated on the app's loopback; its port is not available as a host mapping. See [the native node guide](../doodleverse-core/README.md) for matching-chain setup.

## Games and shared files

Open Home Assistant over trusted HTTPS. Use **Create invitation → Answer invitation → Finish pairing** with your friend, then compare both spirographs and every verification-code group over a trusted channel. Game and file channels use native encrypted WebRTC. Both pages must stay open. Send codes only to their intended recipient because they contain connection addresses.

There is no bundled VPN, sign-in enrollment or remote peer HTTP service. No STUN/TURN server or Internet relay is configured: the browsers need a directly reachable route, often the same local network. Reaching Home Assistant over HTTPS does not guarantee a route between players. Short room codes and garden trading work only through this same Keeper. Full invitations can pair browsers using different Keepers when they are directly reachable.

## HTTPS and browser data

Use trusted **HTTPS** for the vault, native wallet, GPU mining, games and garden transactions. Ordinary LAN HTTP still supports recipe previews and explains the required setup. Follow [HTTPS.md](HTTPS.md); the app does not invent an HTTPS address or weaken cryptographic checks.

The sidebar is administrator-only and follows Home Assistant authorization. Creator-vault and native-wallet passwords are separate from the Home Assistant password. This is intended for a trusted household, not isolated multi-tenant hosting. Other trusted Home Assistant frontend code shares the browser origin, and another Home Assistant login in the same browser does not create separate vault or wallet storage.

Changing the address, browser or profile does not move existing storage. Export the creator vault, native wallet, files and arcade backups separately, then restore them deliberately at the destination. A native wallet created in the Windows miner needs its encrypted wallet backup restored before it can sign from Home Assistant. A receiving address or public founder certificate cannot restore spending access. The native wallet locks when hidden or after five minutes of inactivity. The ingress build does not register an offline service worker.

## What stays online

The directory, witness, garden and enabled Core node continue without an open browser. GPU mining and wallet signing require the browser. Games remain player-hosted: closing a host ends its room. File sharing needs an open, unlocked browser library. Home Assistant storage is not unattended P2P file storage, and the app does not relay game or file bytes.

The garden stores recipes, ownership, balances and paid-hour counters. Players using this same Keeper can mint completed mushroom hours, start optional bounded mining, send coins and trade generators. Different Keepers have different balances. A previous remote garden selection is shown as unavailable; selecting the local garden does not import its balances.

The earlier public wallet garden and contract experiments use wallet-approved transactions and network fees. They are separate from the native 0.13b Scrypt chain. No shared live contract or conversion from private coins is supplied. See [MUSHROOMS.md](MUSHROOMS.md) and [the contract guide](../contracts/README.md).

## Backups and updates

Include this app in Home Assistant backups. Its `backup: cold` setting stops it briefly for consistent persistent data. Preserve `/data/keeper` with the original witness, receipt journal and garden ledger, plus `/data/doodleverse-core` for the native node. Earlier `/data/tailscale` data, if present, stays untouched and inert for rollback; new installations need none. Browser native-wallet and creator-vault backups remain separate; the node runs without a wallet and has no copy of your signing key.

Ordinary updates to the **same installed app** retain its data volume. Back up before updating, then verify the witness identity and garden. Do not uninstall or replace persistent data as an update procedure.

A local app and a repository app have different identifiers and separate storage. Adding the repository does not migrate anything. Follow [MIGRATION.md](MIGRATION.md), keep the old installation and protected backup, and never run cloned identities concurrently. After verifying cutover and restart, enable startup, watchdog and automatic updates on the repository app.

For local-source development, Update applies when the installed version differs; Rebuild applies source changes at the same version. Neither automatically migrates a local app to a repository.

## Permissions and implementation

The app mounts **only its own app configuration folder read-only** for migration staging. It requests no tunnel device, network-administration capabilities, host networking, Docker access, Home Assistant API access or Supervisor administrator access. Keep protection mode enabled; the default AppArmor profile applies.

The gateway accepts authenticated Supervisor ingress traffic, checks mutation headers and proxies only to its loopback Keeper. A forwarded header cannot grant access. Browser and RPC ports are never published to the host. Only native blockchain P2P traffic has the optional TCP 38474 mapping described above; it does not grant access to wallet keys or Home Assistant. The Node.js image and Core source are pinned. The legacy `hostname` option remains accepted for upgrades but no longer configures a VPN device.

## Validation limits

For 0.13b, disposable native Core tests accepted browser GPU blocks and two-way browser-wallet transactions, including encrypted-backup restoration, reward maturity, duplicate retries, double-spend rejection and reorganization/restart. Long-script and high-output-count valid blocks were included in the wallet checks. These checks do not prove live mainnet issuance, a distributed peer network, sustained GPU performance or a successful installation on your Home Assistant host. Source review is not an independent security audit. Deployment receipts must be verified separately.

### Earlier deployment evidence

The 0.1b baseline was built and checked on an aarch64 Home Assistant host; updates preserved its witness and receipts. The 0.2b suite passed 134 Keeper/Home Assistant tests and 10 compiled-contract tests. Those results do not prove a new deployment.

For 0.3b, the combined suite passed 182 tests during preparation, including migration and ingress checks. Native game pairing passed in Chrome with two connections on one machine and manual spirograph confirmation. Live Home Assistant HTTPS access has worked; the 0.3b repository app was installed and restarted with its original Keeper witness preserved. Physical two-device play, separate-home reachability, sustained load and real wallet transactions remain unverified. Consult [the validation record](../keeper/VALIDATION.md) for the current evidence.
