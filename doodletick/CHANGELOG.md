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
