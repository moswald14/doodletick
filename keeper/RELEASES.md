# Doodle Tick releases

## 0.1b

The initial public baseline uses the maintainer-designated number **0.1b**. It includes the exhaustive hourly RGB clock, private arcade and file sharing, creator vault, Dot Wave mushroom recipes, hourly Doodle Coins, player transfers, decorations and mushroom trades. Earlier internal development numbers are not the public release sequence.

Home Assistant's HTTP view supports decorative recipe previews and explains that planting and trading need HTTPS. No cryptographic check is bypassed. The standalone localhost app retains its normal signed operations.

Public labels and status endpoints use `0.1b`; Node package metadata uses `0.1.0-beta.0` with `release: 0.1b`. Saved identities, proofs, recipes and ledgers retain their existing data-format versions. See [VALIDATION.md](VALIDATION.md) for baseline evidence and limits; fresh publication checks are recorded separately.

Future releases must update visible labels, status endpoints, cache names, package metadata, installers and release notes together. Do not rewrite an already published release asset or change a signed data-format version merely to rename an app release.
