# 0.3b — Doodleverse direction, direct peers and GPU founder proof

- Removed the Tailscale runtime, peer HTTP bridge and Home Assistant tunnel/network privileges. Native WebRTC now carries signed game/file pairings with two-sided spirograph confirmation. No outside relay is configured; direct reachability remains network-dependent.
- Kept local garden/directory access and existing signed identities/ledgers. Room codes require the same Keeper. Old transient pairing codes must be recreated; remote garden data has not moved. Legacy VPN backup files remain inert for rollback.
- Added a separate Doodleverse Coin page for a disclosed, signed 1,000,000 DVC founder-allocation certificate, independent proof verification and bounded opt-in WebGPU work. It creates no spendable DVC balance or adopted genesis. Future network supply is unadopted.
- Added the public Doodleverse direction and invitation to human contributors, including communication, the proposed foundation and eventual food-day organizing goals.
- Validation: 182 combined app checks passed. Actual Chrome GPU proof, Stop and public proof copy/import checks passed; actual native signed peers delivered messages and a 65,537-byte licensed file on one computer. Physical multi-device/NAT and a live DVC chain remain untested/unimplemented respectively.

# 0.2b

- Clear HTTPS browser readiness and private VPN status, with setup and expired-session guidance.
- Private mushroom minting and opt-in bounded mining, plus a separate external-wallet public garden mode.
- Wallet-confirmed public deployment, registration, token minting, proof submission and transfer. No funds move without a player approving a transaction in their wallet.
- Verified offline migration into an empty repository app using its own read-only configuration folder. Existing state is never overwritten, and a restart never imports an old ledger again.
- Cold backups preserve consistent Keeper and VPN state. No public browser port or administrative Supervisor access is added.
- Updated release metadata, corresponding contract source and automated contract/browser-controller checks.

Use the same Home Assistant HTTPS address for continuing browser storage. Moving from HTTP to HTTPS still requires restoring the user's separate encrypted browser exports. See `MIGRATION.md` before replacing a local installation.

# 0.1b

Initial public baseline under the maintainer-designated version number.

- Complete hourly RGB sequence and 24-hour clock wheel, with Tetrachroma previews and automatic red night appearance.
- Encrypted creator vault, signed receipts, licensed peer files, private arcade and spirograph pairing.
- Dot Wave-compatible mushroom recipes, hourly in-app coins, transfers, decorations and atomic generator trades through one shared Keeper.
- Home Assistant ingress adaptation, private-network setup controls and persistent Keeper/VPN data.
- HTTP recipe previews with an explicit HTTPS requirement for signed operations; signature checks remain intact.
- Public installation, contributor and validation documentation. Earlier internal development numbers are not the public release sequence.

Updates and rebuilds of the same installed app retain its persistent data. A GitHub repository installation has a different app ID from an existing local app and does **not** automatically migrate its data. Keep the local app and private backup until a tested migration and rollback procedure is available.

The baseline was built and run on aarch64 Home Assistant. Physical multi-device VPN play, HTTPS garden transactions and full backup restore remain further acceptance work. See `DOCS.md` and the repository validation notes.
