# Security reporting

This document describes **0.5b**. Earlier releases remain archived; separate backports are not promised. This is experimental software for trusted communities, with an optional public-wallet garden and a separate prelaunch DVC proof tool. It has not had a comprehensive independent security audit. Release and deployment evidence is recorded separately in [validation](keeper/VALIDATION.md).

Use **Security → Report a vulnerability** on the repository when available. Otherwise, request a private reporting channel without publishing exploitable details. Never post witness keys, private wallet/vault material, legacy VPN state, sign-in URLs, personal files or unredacted logs. Include the version, component, disposable reproduction and observed impact. No bounty or response-time guarantee is offered.

## Boundaries to preserve

- Keep the standalone service on loopback and Home Assistant behind authenticated HTTPS ingress. Do not publish its internal HTTP endpoints or disable origin/signature checks.
- Compare the full spirograph code through a trusted channel; both people must confirm. Signed invitations bind native transport descriptions. No outside relay is configured automatically; arbitrary remote HTTP bridges are removed.
- Protect browser backups separately from Keeper backups. Do not run restored clones concurrently. The offline importer accepts only verified state into an unused target and records completion; legacy VPN files stay inert.
- Mining must be explicit, bounded and cancellable. Never enable hidden mining, automatic proof submission or silent CPU fallback presented as GPU work.

## Coins and public proofs

Private gardens trust their Keeper operator and clock. Separate public DGT gardens require wallet confirmation and network fees; each address/chain has its own balance and cap. No bridge, redemption or promised value exists. Exact runtime matching and tests do not certify a wallet, network or economic system. See [the public garden guide](contracts/README.md).

DVC verifies a self-signed prelaunch proposal and a hash target for a disclosed 1,000,000 founder allocation. A valid certificate does not prove official project authority, which GPU ran, network adoption, live issuance or spendability. Anyone can make their own signed proposal. Compare full founder and manifest references with an independently trusted project publication. Future genesis, total supply, transactions and consensus remain unadopted.

## Wallet-recipient authorizations

The 0.4b recipient flow links an unchanged v1 proof to a new record approved by its original creator and the selected wallet, followed by fresh GPU work. It requests a fixed, purpose-specific message signature only. It must never request token approval, transfer authority, a deployment, a transaction, a session key or a delegation. This boundary is separate from optional DGT gardens, which do contain explicit transaction controls.

- Check the full recipient address, chain, creator fingerprint, linked proof and fixed allocation before signing. A provider's Coinbase name or icon is self-reported metadata, not an authenticity check. Never provide recovery words, private keys or an exchange API key.
- Account, chain, provider, source proof and vault changes must invalidate pending approvals. Cancel discards a late result; it cannot promise to close a wallet's own prompt. A new connection/signing prompt must wait for the earlier provider promise to settle. Do not silently retry a rejected request with another message or signing method.
- EOA verification checks the address's signature, not historical account code. Deployed ERC-1271 verification additionally relies on the declared chain and exact canonical block. Import/reverification requires the matching connected account/network and access to that block's state. A stored success flag is not proof. ERC-6492 signatures and EIP-7702 delegated accounts are unsupported by the connection flow; errors or missing chain access must not become a successful fallback.
- Preserve the original v1 proof and all signature domains. Do not relabel a v1 nonce as work for a wallet-bound record or treat another creator's public proof as authorization to assign its recipient.
- Export only the explicit public record. Exclude vault contents, passwords, private keys, local hosts, authenticated URLs and RPC credentials. Connection/signing does not automatically publish the recipient.

A signed proposal saved before GPU work is not a completed proof. Authorizations last at most 24 hours; new signing/work checks the current window, while archival verification reports its freshness separately. A valid signature does not make an expired authorization current, prove when it was made, or prevent conflicting allocations across independent copies. The recipient record cannot issue coins, prove official founder status or establish Coinbase listing/endorsement. See the [wallet-recipient guide](keeper/WALLET-RECIPIENT.md).

## Weather and audio

Weather is an optional external service. City searches and selected coordinates go directly from the browser to Open-Meteo; the provider also receives ordinary connection metadata. No geolocation permission or vault data is requested. The saved city and forecast are browser preferences outside the encrypted vault. Clear location removes that saved weather state; if storage refuses the change, the UI reports it. Retain provider attribution and respect the free API's non-commercial terms; see [the weather guide](keeper/README.md#weather-and-music).

Background music uses local synthesis and saved sound preferences, not recordings or streaming accounts. It requires Play, pauses when the tab is hidden and releases audio resources when leaving the page. It supplies no medical or sleep benefit claim. No wallet permission or identity access is needed for weather/music.

The 0.5b suite passed 263 checks, including weather/audio lifecycle fixtures and the precise same-origin/two-weather-host CSP boundary. Chrome weather and music-control observations are recorded in validation; audible output was not verified. The Home Assistant 0.5b update, actual Coinbase Wallet signing and a real smart-account state check remain pending. Real public-wallet transactions, physical cross-network operation, production consensus and sustained adversarial load remain outside current verification. Maintainer access is not automatically granted to contributors or AI agents.
