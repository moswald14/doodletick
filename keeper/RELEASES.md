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
