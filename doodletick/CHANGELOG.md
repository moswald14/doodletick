# 0.6.1b — Nightcap and GITTIT::GODDIT

- Added command input with labeled output and errors to the native Coin page.
- Added help, status, balance, refresh, wallet discovery/connection, algorithm,
  intensity, repeat, mine, stop and clear commands using existing app controls.
- Added the Nightcap mushroom preset, opt-in Keep mining and an auto catcher
  that counts exact accepted blocks and refreshes immature rewards.
- Repeat mode stays in the foreground, starts only on MINE NOW or mine, and
  resets on Stop, off, hide, account changes or errors.
- Recorded sampled mining progress and known GPU recovery guidance, with bounded
  in-memory output, safe text rendering and no command replay after cancellation.
- Kept the native genesis, supply, signatures, saved identities and transfer
  review unchanged. This update does not start mining automatically.

# 0.6b — Native DVC mining and payments

- Add an independent native Doodleverse chain with a fixed 21-million cap: one million disclosed founder coins and 20 million mineable coins. The original founder certificates and existing garden balances are preserved separately.
- Add the red **MINE NOW** button, real SHA-256/SHA-256d GPU algorithms, three intensity settings, Stop and bounded work. Native rewards mature after six further blocks.
- Add wallet-controlled native signatures, exact payment review, sending, receiving, payment requests and account history. No Ethereum transaction or token allowance is used by native DVC.
- Persist and independently replay the chain; validate supply, proof, signatures, nonces, funds and competing-chain work. Add bounded manual peer sync over authenticated, encrypted browser pairing.
- Keep Home Assistant ingress authentication and loopback-only Keeper access. No new public ports, VPN, seed or relay is installed. Each connected node independently validates the public history.
- Early network limits: direct reachability and open browser Coin pages are required for pairing; no exchange, bridge, cash value or mature network security is claimed. See [native rules](../keeper/NATIVE-DVC.md) and [validation](../keeper/VALIDATION.md).

# 0.5.1b — Optional Ethereum read compatibility

This update is in preparation; publication and installation are pending.

- Add an explicitly selected PublicNode Ethereum chain-1 read service; the connected wallet keeps account/network checks and message signing.
- Default to wallet reads, with no saved service choice, on-load calls, automatic fallback or network switching. Disclose the public queries sent to the operator.
- Retain exact-block EIP-1898 verification and report safe method/numeric-code diagnostics without raw provider errors. Unsupported chains or missing state remain unverified.
- Preserve creator vaults, Keeper identity/data and v1/v2 records. No payment, spending permission, transaction, delegation or deployment is requested by this flow.
- Validation: all 287 app checks and repository checks passed. Chrome verified safe diagnostics/no fallback, explicit PublicNode reads, a disposable creator/mock-wallet proof with real GPU work, public-record verification and reload without automatic wallet activity. The live read-only Node probe also passed. Publication and deployment are pending; a complete live Coinbase recipient proof remains unresolved.

Earlier entries retain their source-cut status. The published 0.5b installation was later verified with the same Keeper witness, zero receipts and automatic-update setting preserved. See [validation](../keeper/VALIDATION.md).

# 0.5b — Weather and background music

- Add the global expandable Weather & music panel below the top bar.
- Add manual city search, saved/clearable location, C/F and a short Open-Meteo forecast with provider/license attribution. No automatic geolocation.
- Add three original local synthesized soundscapes with Play/Pause, Mute and volume. No autoplay; hiding pauses music and page exit releases audio resources.
- Preserve existing identities, garden data and signed proof formats.
- Validation: 263 combined checks passed, including all six new ingress assets. Chrome exercised sample-city weather, C/F/cache/clear, music controls without autoplay, view navigation and a 390-pixel red-night layout. Audible speaker output, actual Coinbase signing and the live 0.5b update remain unverified.

# 0.4b — Wallet-bound founder recipient

- Added a separate v2 recipient record that preserves the complete v1 founder proof and requires its original creator key plus the chosen wallet to sign. Fresh bounded GPU work commits both signatures.
- Added explicit injected-wallet discovery, account selection, recipient review and message signing. No payment, approval, network switch, delegation or deployment method is available in this flow.
- Ordinary wallet signatures verify offline; deployed ERC-1271 wallets need read-only verification against their declared chain and block. Unsupported wallet variants fail without granting a verified status.
- Preserved browser vaults, garden balances, Keeper state and v1 certificates. DVC remains prelaunch with zero spendable coins and no adopted issuance mechanism.
- Validation: 238 combined app checks and 10 offline EVM tests passed; the signature bundle reproduces. Chrome verified the full disposable-wallet flow with real WebGPU, public copy, reload and import. Actual Coinbase and live 0.4b installation remain deployment checks.

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
