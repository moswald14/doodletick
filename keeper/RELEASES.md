## 0.5.1b — Optional Ethereum read compatibility

This update is in preparation; publication and installation are pending.

- Add explicit PublicNode Ethereum chain-1 reads for wallets whose account connection works but exact-block queries fail. The selected wallet still handles account/network checks and purpose-specific message signing.
- Keep wallet reads as the default. Do not save the service choice, call it on load, switch networks or fall back automatically. Disclose the connecting IP, public-address/block queries and ERC-1271 public digest/signature sent to the read operator.
- Preserve EIP-1898 block-hash/canonicality checks and reject unsupported chains or unavailable state. Safe method/numeric-code diagnostics replace opaque failures without displaying raw provider payloads.
- Preserve creator vaults, Keeper data and existing v1/v2 proof formats. This flow requests no payment, allowance, transaction, delegation or deployment; DVC remains non-spendable.
- Validation: all 287 combined app checks passed, including 44 wallet/UI and 17 mock-transport checks. Repository checks verified 241 public files and 68 matching generated runtime files. Chrome verified safe method/code diagnostics with no fallback, explicit PublicNode selection, live exact-block reads, disposable creator/mock-wallet signatures, real difficulty-16 GPU work, independent public-record verification and reload without automatic wallet activity. A separate public-address Node read probe passed with TLS verification enabled. Publication and deployment are pending; a complete live Coinbase Wallet recipient proof remains unresolved.

Earlier entries retain their source-cut wording. The published 0.5b Home Assistant update was subsequently verified with the same witness, zero receipts and automatic-update setting preserved; see [VALIDATION.md](VALIDATION.md).

## 0.5b — Weather and background music

- Add the expandable Weather & music panel below the top bar, across app views.
- Add manual city search, saved/clearable location, C/F and a three-day Open-Meteo forecast. No automatic geolocation; attribution and free-API usage terms stay visible.
- Add original local Phone cord, Mushroom grove and Afterglow soundscapes with Play/Pause, Mute and volume. No autoplay; hiding pauses playback and page exit releases audio resources.
- Preserve creator identities, signed proof formats and garden accounting.
- Validation: 263 combined checks passed, including 14 weather and 11 music checks. Chrome verified live sample-city weather, saved/cleared state, music controls/preferences, app-view continuity and narrow/red-night layouts. Audible output, actual Coinbase signing and the Home Assistant 0.5b update remain unverified; see VALIDATION.md.

## 0.4b — Wallet-bound founder recipient

- Added a separate v2 recipient record that preserves the complete v1 founder proof and requires its original creator key plus the chosen wallet to sign. Fresh bounded GPU work commits both signatures.
- Added explicit injected-wallet discovery, account selection, recipient review and message signing. No payment, approval, network switch, delegation or deployment method is available in this flow.
- Ordinary wallet signatures verify offline; deployed ERC-1271 wallets need read-only verification against their declared chain and block. Unsupported wallet variants fail without granting a verified status.
- Preserved browser vaults, garden balances, Keeper state and v1 certificates. DVC remains prelaunch with zero spendable coins and no adopted issuance mechanism.
- Validation: 238 combined app checks and 10 offline EVM tests passed; the signature bundle reproduces. Chrome verified the full disposable-wallet flow with real WebGPU, public copy, reload and import. Actual Coinbase and live 0.4b installation remain deployment checks.

## 0.3b — Doodleverse direction, direct peers and GPU founder proof

- Removed the Tailscale runtime, peer HTTP bridge and Home Assistant tunnel/network privileges. Native WebRTC now carries signed game/file pairings with two-sided spirograph confirmation. No outside relay is configured; direct reachability remains network-dependent.
- Kept local garden/directory access and existing signed identities/ledgers. Room codes require the same Keeper. Old transient pairing codes must be recreated; remote garden data has not moved. Legacy VPN backup files remain inert for rollback.
- Added a separate Doodleverse Coin page for a disclosed, signed 1,000,000 DVC founder-allocation certificate, independent proof verification and bounded opt-in WebGPU work. It creates no spendable DVC balance or adopted genesis. Future network supply is unadopted.
- Added the public Doodleverse direction and invitation to human contributors, including communication, the proposed foundation and eventual food-day organizing goals.
- Validation: 182 combined app checks passed. Actual Chrome GPU proof, Stop and public proof copy/import checks passed; actual native signed peers delivered messages and a 65,537-byte licensed file on one computer. Physical multi-device/NAT and a live DVC chain remain untested/unimplemented respectively.

# Doodle Tick releases

## 0.2b

- Adds per-player private and public wallet garden modes with separate balances.
- Private mushroom hours can be minted from the site. Optional proof mining uses signed expiring challenges, ownership checks, persistent hourly limits and idempotent claims. Start/Stop controls never begin mining automatically.
- Public mode connects an existing wallet, deploys or verifies a compatible ERC20 garden, reserves/registers recipe fingerprints, claims earned tokens, mines proofs and transfers whole tokens. Every transaction needs the player's wallet confirmation. Public tokens are separate for each chain and garden; there is no private-coin bridge or promised value.
- Home Assistant reports browser HTTPS capability separately from private-network enrollment. Ingress authentication and signature requirements remain enforced.
- Supports verified offline migration into an empty repository installation, with no-overwrite checks, restart protection and an intact old installation for rollback. App backups now stop the app for a consistent snapshot.
- Includes the Solidity contract, exact compiler input, OpenZeppelin notice and reproducible verification tools with source packages.

Visible release labels use `0.2b`; Node metadata uses `0.2.0-beta.0`. Existing signed data formats and saved identities remain compatible. See the release validation record for actual deployment and test evidence; local EVM tests do not establish public-network transaction behavior.

## 0.1b

The initial public baseline uses the maintainer-designated number **0.1b**. It includes the exhaustive hourly RGB clock, private arcade and file sharing, creator vault, Dot Wave mushroom recipes, hourly Doodle Coins, player transfers, decorations and mushroom trades. Earlier internal development numbers are not the public release sequence.

Home Assistant's HTTP view supports decorative recipe previews and explains that planting and trading need HTTPS. No cryptographic check is bypassed. The standalone localhost app retains its normal signed operations.

Public labels and status endpoints use `0.1b`; Node package metadata uses `0.1.0-beta.0` with `release: 0.1b`. Saved identities, proofs, recipes and ledgers retain their existing data-format versions. See [VALIDATION.md](VALIDATION.md) for baseline evidence and limits; fresh publication checks are recorded separately.

Future releases must update visible labels, status endpoints, cache names, package metadata, installers and release notes together. Do not rewrite an already published release asset or change a signed data-format version merely to rename an app release.
