# Doodle Tick Keeper 0.1b for Home Assistant

This app keeps a private room directory, signed witness and shared mushroom garden online. It also serves the creator vault, file library, arcade, spirograph pairing, color clock and night theme through Home Assistant's authenticated Web UI.

## Install and connect

Add the repository through **Settings → Apps → Install app → Repositories**, then install **Doodle Tick Keeper**. Enable startup and watchdog as appropriate, start the app and open **Web UI**. The first build needs internet access and can take several minutes.

Use **Connect private network**, then open the displayed Tailscale sign-in link and enroll this device in the same private network as the other Keepers. Keep authentication links private. The app runs its own Tailscale device; a separate Home Assistant Tailscale app is not needed and is not changed.

The peer service uses TCP 4318 on its Tailscale interface. Tailnet policy must allow intended members to reach it. No browser ports are published, and the app does not enable an exit node, subnet route, Tailscale SSH, public tunnel or router DMZ. The hostname option controls its VPN device name after restart. Expired or revoked membership needs a fresh sign-in.

## HTTPS and browser data

Use Home Assistant over a trusted **HTTPS** address for the vault, signatures, games and garden transactions. Browsers restrict Web Crypto on ordinary LAN HTTP. HTTP still shows the connection panel and a working recipe preview with a clear setup message. Do not disable certificate validation or cryptographic checks.

The sidebar is administrator-only and follows Home Assistant authorization. The vault password is separate from the Home Assistant password. This is intended for a trusted household, not isolated multi-tenant hosting. Other trusted Home Assistant frontend code shares the browser origin, and signing into another Home Assistant account in the same browser does not create separate vault storage. Lock the vault when finished.

Use the same address and browser for saved work. Moving from a desktop localhost origin or changing the Home Assistant address does not automatically move browser storage. Export the vault, files and arcade backups separately, then deliberately restore them at the destination. The ingress build does not register an offline service worker.

## What the app keeps online

The room directory and witness run independently of an open browser. Games remain player-hosted, and closing a host ends its room. File sharing still needs a browser with the encrypted library open and unlocked. The app does not turn Home Assistant storage into unattended P2P file storage. Directory invitations are temporary and must be reopened after a restart.

The selected garden Keeper stores generator recipes, balances, ownership and paid-hour counters. One unique mushroom earns one in-app coin per completed owned UTC hour, including time while browsers are closed. Players on this same Keeper can transfer coins, decorate mushrooms and trade generators. Coins are not cryptocurrency or a cash balance. See [MUSHROOMS.md](MUSHROOMS.md).

## Backups, updates and migration

Include this app in Home Assistant backups to protect `/data/keeper` and `/data/tailscale`. These contain private device keys. Preserve the original witness identity and garden ledger together. Browser vault/files/arcade backups remain separate; Home Assistant app backups do not contain them.

Ordinary updates to the **same installed app** retain its data volume. Back up before updating and verify the witness identity afterward. Do not uninstall or replace persistent data as an update procedure.

**Moving from a local app to this GitHub repository is not an ordinary update.** Home Assistant gives the repository installation a different app ID and data volume. Merely adding or installing this repository does not copy the local app's identity, balances or VPN state. Keep the old app and a private backup. A tested migration procedure is still pending; do not uninstall the old app until migration and rollback have been verified. Never run restored clones of the same identity concurrently.

For local-source development, reload the app store and use Update when source and installed versions differ. Rebuild applies to source changes at the already installed version. Neither operation makes a local-to-repository migration automatic.

## Permissions and implementation

The container requests `/dev/net/tun`, `NET_ADMIN` and `NET_RAW` for its private VPN interface. It does not request host networking, Docker access, Home Assistant API access, Supervisor administrative access, host directories or protection-mode disabling. Keep protection mode enabled; Docker's default AppArmor profile is used.

The gateway accepts Supervisor ingress traffic; client-supplied forwarded headers do not grant access. Mutations require a same-origin request header. The Keeper remains on container loopback and only the private peer service binds to Tailscale. Node.js and Tailscale container images are pinned in the Dockerfile; Debian networking utilities come from the image's configured repositories.

## Validation

The 0.1b baseline passed 82 combined tests, with 14 targeted garden/ingress tests repeated after the HTTP-preview fix. The container built and ran on an actual aarch64 Home Assistant system; update and rebuild preserved the witness identity and receipt count. The live Web UI and corrected HTTP garden preview were checked.

Real multi-device VPN play and trading, HTTPS garden transactions, complete backup restore, local-to-repository migration and prolonged operation remain unverified. Fresh checks for public-repository publication are recorded separately. Before relying on a new installation, verify HTTPS access, private-network enrollment, another real player joining after comparison, and identity retention after restart.
