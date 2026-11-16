# Doodle Tick Keeper 0.3b for Home Assistant

This app keeps a local room directory, signed witness and shared mushroom garden online. It serves the creator vault, file library, arcade, color clock and night theme through Home Assistant's authenticated Web UI.

## Install and connect

Add the repository through **Settings → Apps → Install app → Repositories**, then install **Doodle Tick Keeper**. For a new installation, start it and open **Web UI**. The first source build needs internet access and can take several minutes. If replacing a local app, complete [the offline migration](MIGRATION.md) before the repository app's first start.

Open Home Assistant over trusted HTTPS. Use **Create invitation → Answer invitation → Finish pairing** with your friend, then compare both spirographs and every verification-code group over a trusted channel. Game and file channels use native encrypted WebRTC. Both pages must stay open. Send codes only to their intended recipient because they contain connection addresses.

There is no bundled VPN, sign-in enrollment or remote peer HTTP service. No STUN/TURN server or Internet relay is configured: the browsers need a directly reachable route, often the same local network. Reaching Home Assistant over HTTPS does not guarantee a route between players. Short room codes and garden trading work only through this same Keeper. Full invitations can pair browsers using different Keepers when they are directly reachable.

## HTTPS and browser data

Use trusted **HTTPS** for the vault, signatures, games and garden transactions. Ordinary LAN HTTP still supports recipe previews and explains the required setup. Follow [HTTPS.md](HTTPS.md); the app does not invent an HTTPS address or weaken cryptographic checks.

The sidebar is administrator-only and follows Home Assistant authorization. The vault password is separate from the Home Assistant password. This is intended for a trusted household, not isolated multi-tenant hosting. Other trusted Home Assistant frontend code shares the browser origin, and another Home Assistant login in the same browser does not create separate vault storage.

Changing the address or browser does not move existing storage. Export the vault, files and arcade backups separately, then restore them deliberately at the destination. Lock the vault when finished. The ingress build does not register an offline service worker.

## What stays online

The directory, witness and garden continue without an open browser. Games remain player-hosted: closing a host ends its room. File sharing needs an open, unlocked browser library. Home Assistant storage is not unattended P2P file storage, and the app does not relay game or file bytes.

The garden stores recipes, ownership, balances and paid-hour counters. Players using this same Keeper can mint completed mushroom hours, start optional bounded mining, send coins and trade generators. Different Keepers have different balances. A previous remote garden selection is shown as unavailable; selecting the local garden does not import its balances.

Public wallet gardens and the separate Doodleverse Coin contract use wallet-approved transactions and network fees. No shared live contract or conversion from private coins is supplied. See [MUSHROOMS.md](MUSHROOMS.md) and [the contract guide](../contracts/README.md).

## Backups and updates

Include this app in Home Assistant backups. Its `backup: cold` setting stops it briefly for consistent persistent data. Preserve `/data/keeper` with the original witness, receipt journal and garden ledger. Earlier `/data/tailscale` data, if present, stays untouched and inert for rollback; new installations need none. Browser backups remain separate.

Ordinary updates to the **same installed app** retain its data volume. Back up before updating, then verify the witness identity and garden. Do not uninstall or replace persistent data as an update procedure.

A local app and a repository app have different identifiers and separate storage. Adding the repository does not migrate anything. Follow [MIGRATION.md](MIGRATION.md), keep the old installation and protected backup, and never run cloned identities concurrently. After verifying cutover and restart, enable startup, watchdog and automatic updates on the repository app.

For local-source development, Update applies when the installed version differs; Rebuild applies source changes at the same version. Neither automatically migrates a local app to a repository.

## Permissions and implementation

The app mounts **only its own app configuration folder read-only** for migration staging. It requests no tunnel device, network-administration capabilities, host networking, Docker access, Home Assistant API access or Supervisor administrator access. Keep protection mode enabled; the default AppArmor profile applies.

The gateway accepts authenticated Supervisor ingress traffic, checks mutation headers and proxies only to its loopback Keeper. A forwarded header cannot grant access. No browser or peer port is published to the host. The Node.js image is pinned. The legacy `hostname` option remains accepted for upgrades but no longer configures a VPN device.

## Validation limits

The 0.1b baseline was built and checked on an aarch64 Home Assistant host; updates preserved its witness and receipts. The 0.2b suite passed 134 Keeper/Home Assistant tests and 10 compiled-contract tests. Those results do not prove a new deployment.

For 0.3b, the combined suite passed 182 tests during preparation, including migration and ingress checks. Native game pairing passed in Chrome with two connections on one machine and manual spirograph confirmation. Live Home Assistant HTTPS access has worked; the 0.3b repository app was installed and restarted with its original Keeper witness preserved. Physical two-device play, separate-home reachability, sustained load and real wallet transactions remain unverified. Consult [the validation record](../keeper/VALIDATION.md) for the current evidence.
